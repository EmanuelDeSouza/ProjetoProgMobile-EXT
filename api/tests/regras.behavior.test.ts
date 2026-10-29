import { describe, it, expect, beforeAll } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { config } from "../src/config";
import { alertas, dispositivos, eventosDispositivo, notificacoes } from "../db/schema";
import { runPeriodicRuleChecks } from "../src/rules-engine";
import { sincronizarCredencialDispositivo } from "../src/mqtt-listener";
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
  type Cuidador,
} from "./helpers";

function horaLocal(deslocMin: number): string {
  const d = new Date(Date.now() + deslocMin * 60_000);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: config.APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}

async function alertasDaRegra(regraId: string) {
  return db.select().from(alertas).where(eq(alertas.regraId, regraId));
}

describe("RF-12 · Configurar regra de alerta", () => {
  let c: Cuidador;
  let residenciaId: string;
  let presencaId: string;
  let contatoId: string;
  let tempId: string;

  beforeAll(async () => {
    c = await novoCuidador();
    residenciaId = await novaResidencia(c.token);
    presencaId = (await dispositivoNoBanco(residenciaId, "sensor_presenca")).id;
    contatoId = (await dispositivoNoBanco(residenciaId, "sensor_contato")).id;
    tempId = (await dispositivoNoBanco(residenciaId, "sensor_temperatura")).id;
  });

  const criar = (dispositivoId: string, condicao: string, parametros: unknown) =>
    api("POST", `/residencias/${residenciaId}/regras`, { token: c.token, body: { dispositivoId, condicao, parametros } });

  it("Given parâmetros válidos, Then 201 e regra ativa aparece na lista", async () => {
    const r = await criar(tempId, "temperatura_fora_da_faixa", { min: 18, max: 28 });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ dispositivoId: tempId, condicao: "temperatura_fora_da_faixa", ativa: true, parametros: { min: 18, max: 28 } });
    const l = await api("GET", `/residencias/${residenciaId}/regras`, { token: c.token });
    expect(l.body.map((x: { id: string }) => x.id)).toContain(r.body.id);
  });

  it("Given condição que não combina com o tipo do dispositivo, Then 400", async () => {
    expect((await criar(contatoId, "sem_movimento_por", { horas: 2 })).status).toBe(400);
    expect((await criar(presencaId, "temperatura_fora_da_faixa", { min: 10, max: 20 })).status).toBe(400);
  });

  it("Given parâmetros inválidos para a condição, Then 400 com campo", async () => {
    const r1 = await criar(tempId, "temperatura_fora_da_faixa", { min: 30, max: 20 });
    expect(r1.status).toBe(400);
    const r2 = await criar(contatoId, "contato_aberto_apos_horario", { horario: "25:00" });
    expect(r2.status).toBe(400);
    const r3 = await criar(presencaId, "sem_movimento_por", { horas: 0 });
    expect(r3.status).toBe(400);
  });

  it("Given dispositivo de outra residência, Then 400 (não 201)", async () => {
    const outro = await novoCuidador();
    const outraCasa = await novaResidencia(outro.token);
    const alheio = await dispositivoNoBanco(outraCasa, "sensor_contato");
    const r = await criar(alheio.id, "dispositivo_offline", {});
    expect(r.status).toBe(400);
  });
});

describe("RF-13 · Motor de avaliação (eventos reais pelo broker)", () => {
  let c: Cuidador;
  let c2: Cuidador;
  let residenciaId: string;

  beforeAll(async () => {
    await garantirListener();
    c = await novoCuidador("Cuidador 1");
    c2 = await novoCuidador("Cuidador 2");
    residenciaId = await novaResidencia(c.token);
    const conv = await api("POST", `/residencias/${residenciaId}/convites`, { token: c.token, body: { email: c2.email } });
    await api("PATCH", `/convites/${conv.body.id}`, { token: c2.token, body: { status: "aceito" } });
  });

  async function conectado(tipo: Parameters<typeof dispositivoNoBanco>[1]) {
    const d = await dispositivoNoBanco(residenciaId, tipo);
    await sincronizarCredencialDispositivo(d);
    const cli = await conectarMqtt({ username: d.id, password: d.deviceKey });
    return { d, cli, estado: (p: unknown) => publicar(cli, `cuidalar/${residenciaId}/${d.id}/estado`, p) };
  }

  it("Given regra de contato após horário, When porta abre dentro da janela, Then alerta + notificação para todos os cuidadores; sem duplicar enquanto aberto", async () => {
    const { d, cli, estado } = await conectado("sensor_contato");
    const regra = await api("POST", `/residencias/${residenciaId}/regras`, {
      token: c.token,
      body: { dispositivoId: d.id, condicao: "contato_aberto_apos_horario", parametros: { horario: horaLocal(-2), horarioFim: horaLocal(5) } },
    });
    expect(regra.status).toBe(201);

    await estado({ contato: "fechado" });
    await esperar(400);
    expect((await alertasDaRegra(regra.body.id)).length).toBe(0);

    await estado({ contato: "aberto" });
    const [alerta] = await ate(async () => {
      const a = await alertasDaRegra(regra.body.id);
      return a.length ? a : null;
    });
    expect(alerta?.status).toBe("aberto");
    expect(alerta?.dispositivoId).toBe(d.id);

    const notifs = await db.select().from(notificacoes).where(eq(notificacoes.alvoId, alerta!.id));
    expect(notifs.map((n) => n.usuarioId).sort()).toEqual([c.id, c2.id].sort());

    await estado({ contato: "aberto" });
    await esperar(400);
    await runPeriodicRuleChecks();
    expect((await alertasDaRegra(regra.body.id)).length).toBe(1);

    // reconhecido → próxima abertura gera novo alerta
    await api("PATCH", `/alertas/${alerta!.id}`, { token: c2.token, body: { status: "reconhecido" } });
    await estado({ contato: "aberto" });
    await ate(async () => (await alertasDaRegra(regra.body.id)).length === 2);
    cli.end(true);
  });

  it("Given porta aberta ANTES do horário e ainda aberta quando a janela começa, Then a reavaliação periódica dispara", async () => {
    const { d, cli, estado } = await conectado("sensor_contato");
    await estado({ contato: "aberto" });
    await ate(async () => {
      const [x] = await db.select().from(dispositivos).where(eq(dispositivos.id, d.id));
      return (x?.estadoAtual as { contato?: string }).contato === "aberto";
    });
    const regra = await api("POST", `/residencias/${residenciaId}/regras`, {
      token: c.token,
      body: { dispositivoId: d.id, condicao: "contato_aberto_apos_horario", parametros: { horario: horaLocal(-1), horarioFim: horaLocal(3) } },
    });
    await runPeriodicRuleChecks();
    expect((await alertasDaRegra(regra.body.id)).length).toBe(1);
    cli.end(true);
  });

  it("Given regra de temperatura, When leitura sai da faixa, Then alerta (alta se passar 5°C da faixa)", async () => {
    const { d, cli, estado } = await conectado("sensor_temperatura");
    const regra = await api("POST", `/residencias/${residenciaId}/regras`, {
      token: c.token,
      body: { dispositivoId: d.id, condicao: "temperatura_fora_da_faixa", parametros: { min: 18, max: 28 } },
    });
    await estado({ temperatura: 24, umidade: 50 });
    await esperar(400);
    expect((await alertasDaRegra(regra.body.id)).length).toBe(0);
    await estado({ temperatura: 35.5, umidade: 40 });
    const [a] = await ate(async () => {
      const x = await alertasDaRegra(regra.body.id);
      return x.length ? x : null;
    });
    expect(a?.severidade).toBe("alta");
    cli.end(true);
  });

  it("Given sem_movimento_por, When última presença é antiga mesmo com heartbeat recente, Then alerta alto", async () => {
    const { d, cli } = await conectado("sensor_presenca");
    const regra = await api("POST", `/residencias/${residenciaId}/regras`, {
      token: c.token,
      body: { dispositivoId: d.id, condicao: "sem_movimento_por", parametros: { horas: 0.25 } },
    });
    await db.update(dispositivos).set({ createdAt: new Date(Date.now() - 3 * 3600_000) }).where(eq(dispositivos.id, d.id));
    await db.insert(eventosDispositivo).values({
      dispositivoId: d.id,
      tipo: "presenca",
      valor: { presenca: true },
      createdAt: new Date(Date.now() - 20 * 60_000),
    });
    await publicar(cli, `cuidalar/${residenciaId}/${d.id}/heartbeat`, {});
    await esperar(300);
    await runPeriodicRuleChecks();
    const a = await alertasDaRegra(regra.body.id);
    expect(a.length).toBe(1);
    expect(a[0]?.severidade).toBe("alta");
    cli.end(true);
  });

  it("Given sem_movimento_por, When houve presença recente, Then não alerta", async () => {
    const { d, cli, estado } = await conectado("sensor_presenca");
    const regra = await api("POST", `/residencias/${residenciaId}/regras`, {
      token: c.token,
      body: { dispositivoId: d.id, condicao: "sem_movimento_por", parametros: { horas: 0.25 } },
    });
    await db.update(dispositivos).set({ createdAt: new Date(Date.now() - 3 * 3600_000) }).where(eq(dispositivos.id, d.id));
    await estado({ presenca: true });
    await esperar(400);
    await runPeriodicRuleChecks();
    expect((await alertasDaRegra(regra.body.id)).length).toBe(0);
    cli.end(true);
  });
});

describe("RF-08 / RNF-13 · Offline e alerta de sistema", () => {
  it("Given sem heartbeat há mais de 5 min, Then status vira offline", async () => {
    const c = await novoCuidador();
    const res = await novaResidencia(c.token);
    const d = await dispositivoNoBanco(res, "sensor_contato", { ultimoContatoEm: new Date(Date.now() - 6 * 60_000) });
    await runPeriodicRuleChecks();
    const [x] = await db.select().from(dispositivos).where(eq(dispositivos.id, d.id));
    expect(x?.status).toBe("offline");
    const l = await api("GET", `/residencias/${res}/dispositivos`, { token: c.token });
    expect(l.body[0]).toMatchObject({ id: d.id, status: "offline" });
    expect(l.body[0].ultimoContatoEm).not.toBeNull();
  });

  it("Given botão SOS sem contato há mais de 15 min, Then alerta de sistema (sem regra) — uma vez só", async () => {
    const c = await novoCuidador();
    const res = await novaResidencia(c.token);
    const d = await dispositivoNoBanco(res, "botao_sos", { ultimoContatoEm: new Date(Date.now() - 16 * 60_000) });
    await runPeriodicRuleChecks();
    await runPeriodicRuleChecks();
    const a = await db.select().from(alertas).where(and(eq(alertas.dispositivoId, d.id)));
    expect(a.length).toBe(1);
    expect(a[0]?.regraId).toBeNull();
    expect(a[0]?.severidade).toBe("alta");
    const l = await api("GET", `/residencias/${res}/alertas`, { token: c.token });
    expect(l.body[0]).toMatchObject({ id: a[0]!.id, regraId: null, condicao: null });
  });

  it("Given sensor de presença SEM regra ativa offline há 16 min, Then não é crítico (sem alerta de sistema)", async () => {
    const c = await novoCuidador();
    const res = await novaResidencia(c.token);
    const d = await dispositivoNoBanco(res, "sensor_presenca", { ultimoContatoEm: new Date(Date.now() - 16 * 60_000) });
    await runPeriodicRuleChecks();
    const a = await db.select().from(alertas).where(eq(alertas.dispositivoId, d.id));
    expect(a.length).toBe(0);
  });

  it("Given sensor de presença COM regra ativa offline há 16 min, Then alerta de sistema", async () => {
    const c = await novoCuidador();
    const res = await novaResidencia(c.token);
    const d = await dispositivoNoBanco(res, "sensor_presenca", { ultimoContatoEm: new Date(Date.now() - 16 * 60_000) });
    await api("POST", `/residencias/${res}/regras`, {
      token: c.token,
      body: { dispositivoId: d.id, condicao: "sem_movimento_por", parametros: { horas: 4 } },
    });
    await runPeriodicRuleChecks();
    const a = await db.select().from(alertas).where(eq(alertas.dispositivoId, d.id));
    expect(a.filter((x) => x.regraId === null).length).toBe(1);
  });
});
