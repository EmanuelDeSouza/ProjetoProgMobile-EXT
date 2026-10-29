import { describe, it, expect, beforeAll } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { eventosDispositivo, notificacoes, sosEventos } from "../db/schema";
import { handleMqttMessage } from "../src/mqtt-listener";
import { dispatchedPushNotifications } from "../src/services/push";
import {
  api,
  ate,
  conectarMqtt,
  dispositivoNoBanco,
  esperar,
  garantirListener,
  novaResidencia,
  novoCuidador,
  publicar,
  recarregarDispositivo,
} from "./helpers";
import { sincronizarCredencialDispositivo } from "../src/mqtt-listener";

/** Dispositivo com credencial no broker, pronto para publicar como um ESP32 pareado. */
async function dispositivoConectado(residenciaId: string, tipo: Parameters<typeof dispositivoNoBanco>[1]) {
  const d = await dispositivoNoBanco(residenciaId, tipo, { status: "offline", ultimoContatoEm: null });
  await sincronizarCredencialDispositivo(d);
  const cliente = await conectarMqtt({ username: d.id, password: d.deviceKey });
  return { d, cliente, topico: (acao: string) => `cuidalar/${residenciaId}/${d.id}/${acao}` };
}

describe("SPEC 6.3 · Listener MQTT", () => {
  let residenciaId: string;
  let token: string;

  beforeAll(async () => {
    await garantirListener();
    const c = await novoCuidador();
    token = c.token;
    residenciaId = await novaResidencia(c.token);
    await api("POST", "/usuarios/push-token", { token, body: { pushToken: "ExponentPushToken[teste_listener]" } });
  });

  it("Given tópico fora do padrão ou JSON corrompido, Then ignora sem lançar exceção", async () => {
    await handleMqttMessage("topico/invalido", Buffer.from("{}"));
    await handleMqttMessage("outro/prefixo/123/estado", Buffer.from("{}"));
    await handleMqttMessage("cuidalar/res-01/disp-01/estado", Buffer.from("invalid-json{"));
    expect(true).toBe(true);
  });

  it("Given estado válido publicado pelo dispositivo, Then grava evento, atualiza estado atual e fica online", async () => {
    const { d, cliente, topico } = await dispositivoConectado(residenciaId, "sensor_temperatura");
    await publicar(cliente, topico("estado"), { temperatura: 23.4, umidade: 55 });
    const atual = await ate(async () => {
      const x = await recarregarDispositivo(d.id);
      return x?.status === "online" ? x : null;
    });
    expect(atual.estadoAtual).toEqual({ temperatura: 23.4, umidade: 55 });
    expect(atual.ultimoContatoEm).not.toBeNull();
    const evs = await db.select().from(eventosDispositivo).where(eq(eventosDispositivo.dispositivoId, d.id));
    expect(evs.length).toBe(1);
    expect(evs[0]?.valor).toEqual({ temperatura: 23.4, umidade: 55 });
    cliente.end(true);
  });

  it("Given payload que não segue o contrato do tipo, Then é descartado", async () => {
    const { d, cliente, topico } = await dispositivoConectado(residenciaId, "sensor_contato");
    await publicar(cliente, topico("estado"), { contato: "talvez" });
    await publicar(cliente, topico("estado"), { temperatura: 99 });
    await esperar(700);
    const x = await recarregarDispositivo(d.id);
    expect(x?.estadoAtual).toEqual({});
    const evs = await db.select().from(eventosDispositivo).where(eq(eventosDispositivo.dispositivoId, d.id));
    expect(evs.length).toBe(0);
    cliente.end(true);
  });

  it("Given heartbeat, Then marca online mas NÃO grava evento (RF-18: heartbeat não vai para a UI)", async () => {
    const { d, cliente, topico } = await dispositivoConectado(residenciaId, "sensor_presenca");
    await publicar(cliente, topico("heartbeat"), {});
    await ate(async () => (await recarregarDispositivo(d.id))?.status === "online");
    const evs = await db.select().from(eventosDispositivo).where(eq(eventosDispositivo.dispositivoId, d.id));
    expect(evs.length).toBe(0);
    cliente.end(true);
  });

  it("Given residência no tópico diferente da do dispositivo, Then descarta", async () => {
    const outra = await novaResidencia(token, "Outra");
    const d = await dispositivoNoBanco(residenciaId, "sensor_contato", { status: "offline", ultimoContatoEm: null });
    await handleMqttMessage(`cuidalar/${outra}/${d.id}/estado`, Buffer.from(JSON.stringify({ contato: "aberto" })));
    const x = await recarregarDispositivo(d.id);
    expect(x?.status).toBe("offline");
    expect(x?.estadoAtual).toEqual({});
  });

  it("Given botão físico publica em .../sos, Then cria SOS de origem botao_fisico e notifica todos os cuidadores com push", async () => {
    const { d, cliente, topico } = await dispositivoConectado(residenciaId, "botao_sos");
    const antes = dispatchedPushNotifications.length;
    await publicar(cliente, topico("sos"), { emergencia: true });
    const [sos] = await ate(async () => {
      const rows = await db.select().from(sosEventos).where(eq(sosEventos.dispositivoId, d.id));
      return rows.length ? rows : null;
    });
    expect(sos?.origem).toBe("botao_fisico");
    expect(sos?.status).toBe("aberto");
    const notifs = await db
      .select()
      .from(notificacoes)
      .where(and(eq(notificacoes.alvoId, sos!.id), eq(notificacoes.tipo, "sos")));
    expect(notifs.length).toBe(1);
    expect(dispatchedPushNotifications.length).toBeGreaterThan(antes);
    expect(dispatchedPushNotifications.at(-1)?.data?.tipo).toBe("sos");
    cliente.end(true);
  });

  it("Given dispositivo que não é botao_sos publica em .../sos, Then descarta", async () => {
    const d = await dispositivoNoBanco(residenciaId, "sensor_contato");
    await handleMqttMessage(`cuidalar/${residenciaId}/${d.id}/sos`, Buffer.from(JSON.stringify({ emergencia: true })));
    const rows = await db.select().from(sosEventos).where(eq(sosEventos.dispositivoId, d.id));
    expect(rows.length).toBe(0);
  });
});
