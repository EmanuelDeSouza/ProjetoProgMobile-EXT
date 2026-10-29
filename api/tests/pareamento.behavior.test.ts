import { describe, it, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { pareamentos } from "../db/schema";
import {
  api,
  anunciarDispositivo,
  ate,
  codigoAleatorio,
  conectarMqtt,
  decifrarCredenciais,
  esperar,
  garantirListener,
  novaResidencia,
  novoCuidador,
  primeiraMensagem,
  publicar,
  recarregarDispositivo,
} from "./helpers";

async function pareamentoAnunciado(codigo: string) {
  return ate(async () => {
    const [p] = await db.select().from(pareamentos).where(eq(pareamentos.codigo, codigo));
    return p;
  });
}

describe("RF-07 · Pareamento pelo código anunciado via MQTT (SPEC 6.3)", () => {
  let token: string;
  let residenciaId: string;

  beforeAll(async () => {
    await garantirListener();
    const c = await novoCuidador();
    token = c.token;
    residenciaId = await novaResidencia(c.token);
  });

  it("Given dispositivo anunciou o código, When o cuidador pareia, Then 201, credencial chega cifrada pelo broker e o dispositivo passa a falar com ela", async () => {
    const { codigo, chave, cliente } = await anunciarDispositivo("sensor_contato");
    await pareamentoAnunciado(codigo);

    const r = await api("POST", `/residencias/${residenciaId}/dispositivos/parear`, {
      token,
      body: { codigo, tipo: "sensor_contato", nome: "Porta da frente", comodo: "Entrada" },
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ tipo: "sensor_contato", nome: "Porta da frente", comodo: "Entrada", status: "offline" });
    expect(r.body).not.toHaveProperty("deviceKey");

    const topicoCred = `cuidalar/pareamento/${codigo}/credenciais`;
    const msg = await primeiraMensagem(cliente, topicoCred);
    expect(msg).not.toBeNull();
    const cifrado = JSON.parse(msg!.toString());
    expect(JSON.stringify(cifrado)).not.toContain(r.body.id); // texto claro não vaza
    const cred = decifrarCredenciais(chave, cifrado);
    expect(cred.residenciaId).toBe(residenciaId);
    expect(cred.dispositivoId).toBe(r.body.id);
    cliente.end(true);

    // o "ESP32" reconecta com a credencial própria e manda o primeiro estado
    const disp = await conectarMqtt({ username: cred.dispositivoId, password: cred.deviceKey });
    await publicar(disp, `cuidalar/${residenciaId}/${cred.dispositivoId}/estado`, { contato: "fechado" });
    const d = await ate(async () => {
      const x = await recarregarDispositivo(cred.dispositivoId);
      return x?.status === "online" ? x : null;
    });
    expect(d.estadoAtual).toEqual({ contato: "fechado" });

    // credencial retida é apagada depois do primeiro contato
    const [p] = await ate(async () => {
      const rows = await db.select().from(pareamentos).where(eq(pareamentos.codigo, codigo));
      return rows[0]?.confirmadoEm ? rows : null;
    });
    expect(p?.confirmadoEm).not.toBeNull();
    const espiao = await anunciarDispositivo("sensor_contato", codigoAleatorio());
    const retida = await primeiraMensagem(espiao.cliente, topicoCred, 1500);
    expect(retida).toBeNull();
    espiao.cliente.end(true);
    disp.end(true);
  });

  it("Given credencial de um dispositivo, When tenta publicar como outro dispositivo, Then o broker descarta", async () => {
    const a = await anunciarDispositivo("sensor_temperatura");
    await pareamentoAnunciado(a.codigo);
    const r = await api("POST", `/residencias/${residenciaId}/dispositivos/parear`, {
      token,
      body: { codigo: a.codigo, tipo: "sensor_temperatura", nome: "Termômetro", comodo: "Quarto" },
    });
    const cred = decifrarCredenciais(a.chave, JSON.parse((await primeiraMensagem(a.cliente, `cuidalar/pareamento/${a.codigo}/credenciais`))!.toString()));
    a.cliente.end(true);

    const b = await anunciarDispositivo("sensor_contato");
    await pareamentoAnunciado(b.codigo);
    const rb = await api("POST", `/residencias/${residenciaId}/dispositivos/parear`, {
      token,
      body: { codigo: b.codigo, tipo: "sensor_contato", nome: "Janela", comodo: "Quarto" },
    });
    b.cliente.end(true);

    const cliente = await conectarMqtt({ username: cred.dispositivoId, password: cred.deviceKey });
    await publicar(cliente, `cuidalar/${residenciaId}/${rb.body.id}/estado`, { contato: "aberto" }, 0);
    await esperar(800);
    const vitima = await recarregarDispositivo(rb.body.id);
    expect(vitima?.estadoAtual).toEqual({});
    expect(r.status).toBe(201);
    cliente.end(true);
  });

  it("Given código usado, desconhecido ou expirado, Then 409 PAIRING_CODE_INVALID", async () => {
    const corpo = (codigo: string) => ({ codigo, tipo: "sensor_presenca", nome: "PIR", comodo: "Sala" });

    const desconhecido = await api("POST", `/residencias/${residenciaId}/dispositivos/parear`, { token, body: corpo(codigoAleatorio()) });
    expect(desconhecido.status).toBe(409);
    expect(desconhecido.body.error.code).toBe("PAIRING_CODE_INVALID");

    const a = await anunciarDispositivo("sensor_presenca");
    await pareamentoAnunciado(a.codigo);
    expect((await api("POST", `/residencias/${residenciaId}/dispositivos/parear`, { token, body: corpo(a.codigo) })).status).toBe(201);
    expect((await api("POST", `/residencias/${residenciaId}/dispositivos/parear`, { token, body: corpo(a.codigo) })).status).toBe(409);
    a.cliente.end(true);

    const b = await anunciarDispositivo("sensor_presenca");
    await pareamentoAnunciado(b.codigo);
    await db.update(pareamentos).set({ expiraEm: new Date(Date.now() - 1000) }).where(eq(pareamentos.codigo, b.codigo));
    expect((await api("POST", `/residencias/${residenciaId}/dispositivos/parear`, { token, body: corpo(b.codigo) })).status).toBe(409);
    b.cliente.end(true);
  });

  it("Given tipo diferente do anunciado pelo firmware, Then 400 com campo tipo", async () => {
    const a = await anunciarDispositivo("botao_sos");
    await pareamentoAnunciado(a.codigo);
    const r = await api("POST", `/residencias/${residenciaId}/dispositivos/parear`, {
      token,
      body: { codigo: a.codigo, tipo: "atuador_tomada", nome: "X", comodo: "Y" },
    });
    expect(r.status).toBe(400);
    expect(r.body.error.fields).toHaveProperty("tipo");
    a.cliente.end(true);
  });

  it("Given mesmo código anunciado com outra chave (tentativa de sequestro), Then o código é invalidado (409)", async () => {
    const a = await anunciarDispositivo("sensor_contato");
    await pareamentoAnunciado(a.codigo);
    const intruso = await anunciarDispositivo("sensor_contato", a.codigo);
    await ate(async () => {
      const [p] = await db.select().from(pareamentos).where(eq(pareamentos.codigo, a.codigo));
      return p?.conflito ? p : null;
    });
    const r = await api("POST", `/residencias/${residenciaId}/dispositivos/parear`, {
      token,
      body: { codigo: a.codigo, tipo: "sensor_contato", nome: "X", comodo: "Y" },
    });
    expect(r.status).toBe(409);
    a.cliente.end(true);
    intruso.cliente.end(true);
  });

  it("Given tipo fora dos 5 da V1, Then 400 (RF-06)", async () => {
    const r = await api("POST", `/residencias/${residenciaId}/dispositivos/parear`, {
      token,
      body: { codigo: "123456", tipo: "camera", nome: "X", comodo: "Y" },
    });
    expect(r.status).toBe(400);
  });
});
