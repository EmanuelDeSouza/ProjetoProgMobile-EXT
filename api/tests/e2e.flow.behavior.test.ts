// SPEC §7 · Critério de pronto da V1, de ponta a ponta: HTTP de verdade + broker de verdade.
import { describe, it, expect, beforeAll } from "bun:test";
import { config } from "../src/config";
import { clearDispatchedPushNotifications, dispatchedPushNotifications } from "../src/services/push";
import {
  api,
  anunciarDispositivo,
  ate,
  conectarMqtt,
  decifrarCredenciais,
  emailUnico,
  garantirListener,
  primeiraMensagem,
  publicar,
} from "./helpers";

function horaLocal(deslocMin: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: config.APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(Date.now() + deslocMin * 60_000));
}

async function parear(token: string, residenciaId: string, tipo: "sensor_contato" | "atuador_tomada", nome: string) {
  const a = await anunciarDispositivo(tipo);
  await Bun.sleep(300);
  const r = await api("POST", `/residencias/${residenciaId}/dispositivos/parear`, {
    token,
    body: { codigo: a.codigo, tipo, nome, comodo: "Sala" },
  });
  expect(r.status).toBe(201);
  const msg = await primeiraMensagem(a.cliente, `cuidalar/pareamento/${a.codigo}/credenciais`);
  a.cliente.end(true);
  const cred = decifrarCredenciais(a.chave, JSON.parse(msg!.toString()));
  const cli = await conectarMqtt({ username: cred.dispositivoId, password: cred.deviceKey });
  return { id: r.body.id as string, cli, topico: (x: string) => `cuidalar/${residenciaId}/${cred.dispositivoId}/${x}` };
}

describe("SPEC §7 · Loop completo da V1", () => {
  beforeAll(async () => {
    await garantirListener();
    clearDispatchedPushNotifications();
  });

  it("cadastro → residência → convite → pareamento → painel → comando confirmado → regra → alerta → reconhecer → morador PIN → SOS", async () => {
    // 1. Cuidador cria conta e residência, convida segundo cuidador
    const emailA = emailUnico("ana");
    const a = await api("POST", "/usuarios", { body: { nome: "Ana", email: emailA, senha: "senha123" } });
    const tA = a.body.token as string;
    const res = await api("POST", "/residencias", { token: tA, body: { nome: "Casa da Vó Elza" } });
    const rid = res.body.id as string;
    const b = await api("POST", "/usuarios", { body: { nome: "Bruno", email: emailUnico("bruno"), senha: "senha123" } });
    const tB = b.body.token as string;
    await api("POST", "/usuarios/push-token", { token: tA, body: { pushToken: "ExponentPushToken[ana]" } });
    await api("POST", "/usuarios/push-token", { token: tB, body: { pushToken: "ExponentPushToken[bruno]" } });
    const conv = await api("POST", `/residencias/${rid}/convites`, { token: tA, body: { email: b.body.usuario.email } });
    expect((await api("PATCH", `/convites/${conv.body.id}`, { token: tB, body: { status: "aceito" } })).status).toBe(200);

    // 2. Pareia um sensor e um atuador
    const porta = await parear(tA, rid, "sensor_contato", "Porta");
    const abajur = await parear(tB, rid, "atuador_tomada", "Abajur");
    await publicar(porta.cli, porta.topico("heartbeat"), {});
    await publicar(abajur.cli, abajur.topico("estado"), { tomada: "desligada" });

    // 3. Painel mostra estado real
    const painel = await ate(async () => {
      const p = await api("GET", `/residencias/${rid}/dispositivos`, { token: tA });
      return p.body.every((d: { status: string }) => d.status === "online") ? p : null;
    });
    expect(painel.body.length).toBe(2);

    // 4. Comando com confirmação vinda do dispositivo
    abajur.cli.subscribe(abajur.topico("comando"), { qos: 1 });
    abajur.cli.on("message", (t, p) => {
      if (t === abajur.topico("comando")) {
        const { acao } = JSON.parse(p.toString()) as { acao: string };
        void publicar(abajur.cli, abajur.topico("estado"), { tomada: acao === "ligar" ? "ligada" : "desligada" });
      }
    });
    await Bun.sleep(200);
    expect((await api("POST", `/dispositivos/${abajur.id}/comando`, { token: tA, body: { acao: "ligar" } })).status).toBe(202);
    await ate(async () => {
      const p = await api("GET", `/residencias/${rid}/dispositivos`, { token: tA });
      return p.body.find((d: { id: string }) => d.id === abajur.id).estadoAtual.tomada === "ligada";
    }, 8000);

    // 5. Regra → evento → alerta → notificação → reconhecer
    const regra = await api("POST", `/residencias/${rid}/regras`, {
      token: tA,
      body: { dispositivoId: porta.id, condicao: "contato_aberto_apos_horario", parametros: { horario: horaLocal(-2), horarioFim: horaLocal(5) } },
    });
    expect(regra.status).toBe(201);
    await publicar(porta.cli, porta.topico("estado"), { contato: "aberto" });
    const alerta = await ate(async () => {
      const l = await api("GET", `/residencias/${rid}/alertas`, { token: tB });
      return l.body[0];
    });
    expect(alerta).toMatchObject({ status: "aberto", condicao: "contato_aberto_apos_horario", dispositivoId: porta.id });
    const notifB = await api("GET", "/notificacoes", { token: tB });
    expect(notifB.body.some((n: { tipo: string; alvoId: string }) => n.tipo === "alerta" && n.alvoId === alerta.id)).toBe(true);
    expect((await api("PATCH", `/alertas/${alerta.id}`, { token: tB, body: { status: "reconhecido" } })).body.reconhecidoPor).toBe("Bruno");

    // 6. Morador entra com PIN e aciona SOS; os dois cuidadores recebem push
    const m = await api("POST", `/residencias/${rid}/moradores`, { token: tA, body: { nome: "Vó Elza", pin: "2468" } });
    const lp = await api("POST", "/moradores/login-pin", { body: { moradorId: m.body.id, pin: "2468" } });
    clearDispatchedPushNotifications();
    const sos = await api("POST", `/residencias/${rid}/sos`, { token: lp.body.token, body: { moradorId: m.body.id } });
    expect(sos.status).toBe(201);
    expect(dispatchedPushNotifications.map((p) => p.token).sort()).toEqual(["ExponentPushToken[ana]", "ExponentPushToken[bruno]"]);

    porta.cli.end(true);
    abajur.cli.end(true);
  }, 30_000);
});
