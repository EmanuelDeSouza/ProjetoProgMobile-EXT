import { describe, it, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { eventosDispositivo } from "../db/schema";
import { sincronizarCredencialDispositivo, stopMqttListener, startMqttListener } from "../src/mqtt-listener";
import {
  api,
  ate,
  conectarMqtt,
  dispositivoNoBanco,
  garantirListener,
  novaResidencia,
  novoCuidador,
  novoMorador,
  publicar,
  type Cuidador,
} from "./helpers";
import { aguardarMqttPronto } from "../src/mqtt-listener";

describe("RF-09 · Painel", () => {
  it("Given residência sem dispositivos, Then lista vazia (estado 'vazio' do app)", async () => {
    const c = await novoCuidador();
    const id = await novaResidencia(c.token);
    const r = await api("GET", `/residencias/${id}/dispositivos`, { token: c.token });
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
  });
});

describe("RF-10 · Controlar atuador (confirmação vem do dispositivo)", () => {
  let c: Cuidador;
  let residenciaId: string;

  beforeAll(async () => {
    await garantirListener();
    c = await novoCuidador();
    residenciaId = await novaResidencia(c.token);
  });

  it("Given tomada online, When cuidador manda ligar, Then 202, o ESP32 recebe o comando e o estado só muda quando ele confirma", async () => {
    const d = await dispositivoNoBanco(residenciaId, "atuador_tomada", { estadoAtual: { tomada: "desligada" } });
    await sincronizarCredencialDispositivo(d);
    const esp = await conectarMqtt({ username: d.id, password: d.deviceKey });
    const comandos: string[] = [];
    esp.on("message", (_t, p) => comandos.push(p.toString()));
    await new Promise<void>((ok) => esp.subscribe(`cuidalar/${residenciaId}/${d.id}/comando`, { qos: 1 }, () => ok()));

    const r = await api("POST", `/dispositivos/${d.id}/comando`, { token: c.token, body: { acao: "ligar" } });
    expect(r.status).toBe(202);
    await ate(async () => comandos.length > 0);
    expect(JSON.parse(comandos[0]!)).toEqual({ acao: "ligar" });

    // antes da confirmação o servidor NÃO finge que ligou (RNF-03)
    const antes = await api("GET", `/residencias/${residenciaId}/dispositivos`, { token: c.token });
    expect(antes.body.find((x: { id: string }) => x.id === d.id).estadoAtual).toEqual({ tomada: "desligada" });

    await publicar(esp, `cuidalar/${residenciaId}/${d.id}/estado`, { tomada: "ligada" });
    await ate(async () => {
      const l = await api("GET", `/residencias/${residenciaId}/dispositivos`, { token: c.token });
      return l.body.find((x: { id: string }) => x.id === d.id).estadoAtual.tomada === "ligada";
    });
    esp.end(true);
  });

  it("Given morador da casa, When aperta o botão grande da tomada, Then 202", async () => {
    const d = await dispositivoNoBanco(residenciaId, "atuador_tomada");
    const m = await novoMorador(c.token, residenciaId);
    const r = await api("POST", `/dispositivos/${d.id}/comando`, { token: m.token, body: { acao: "desligar" } });
    expect(r.status).toBe(202);
  });

  it("Given dispositivo offline, Then 409 DEVICE_OFFLINE sem publicar", async () => {
    const d = await dispositivoNoBanco(residenciaId, "atuador_tomada", { status: "offline" });
    const r = await api("POST", `/dispositivos/${d.id}/comando`, { token: c.token, body: { acao: "ligar" } });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("DEVICE_OFFLINE");
  });

  it("Given sensor (não atuador) ou ação desconhecida, Then 400", async () => {
    const s = await dispositivoNoBanco(residenciaId, "sensor_contato");
    const r1 = await api("POST", `/dispositivos/${s.id}/comando`, { token: c.token, body: { acao: "ligar" } });
    expect(r1.status).toBe(400);
    expect(r1.body.error.code).toBe("DEVICE_NOT_ACTUATOR");
    const t = await dispositivoNoBanco(residenciaId, "atuador_tomada");
    const r2 = await api("POST", `/dispositivos/${t.id}/comando`, { token: c.token, body: { acao: "explodir" } });
    expect(r2.status).toBe(400);
  });

  it("Given broker fora do ar, Then 503 BROKER_UNAVAILABLE (nunca 202 falso)", async () => {
    const d = await dispositivoNoBanco(residenciaId, "atuador_tomada");
    stopMqttListener();
    try {
      const r = await api("POST", `/dispositivos/${d.id}/comando`, { token: c.token, body: { acao: "ligar" } });
      expect(r.status).toBe(503);
      expect(r.body.error.code).toBe("BROKER_UNAVAILABLE");
    } finally {
      startMqttListener();
      await aguardarMqttPronto(10_000);
    }
  });
});

describe("RF-18 · Histórico de eventos", () => {
  it("Given eventos de 10 dias atrás e de hoje, Then mostra só os últimos 7 dias, mais recente primeiro", async () => {
    const c = await novoCuidador();
    const res = await novaResidencia(c.token);
    const d = await dispositivoNoBanco(res, "sensor_contato");
    await db.insert(eventosDispositivo).values([
      { dispositivoId: d.id, tipo: "contato", valor: { contato: "aberto" }, createdAt: new Date(Date.now() - 10 * 86400_000) },
      { dispositivoId: d.id, tipo: "contato", valor: { contato: "aberto" }, createdAt: new Date(Date.now() - 3600_000) },
      { dispositivoId: d.id, tipo: "contato", valor: { contato: "fechado" }, createdAt: new Date() },
    ]);
    const r = await api("GET", `/dispositivos/${d.id}/eventos`, { token: c.token });
    expect(r.status).toBe(200);
    expect(r.body.map((e: { valor: { contato: string } }) => e.valor.contato)).toEqual(["fechado", "aberto"]);
  });
});
