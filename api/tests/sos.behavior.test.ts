import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { notificacoes, sosEventos } from "../db/schema";
import { clearDispatchedPushNotifications, dispatchedPushNotifications } from "../src/services/push";
import { api, novaResidencia, novoCuidador, novoMorador, type Cuidador } from "./helpers";

describe("RF-15/RF-16 · SOS", () => {
  let c1: Cuidador;
  let c2: Cuidador;
  let residenciaId: string;
  let morador: { id: string; token: string };

  beforeAll(async () => {
    c1 = await novoCuidador("Filho");
    c2 = await novoCuidador("Filha");
    residenciaId = await novaResidencia(c1.token);
    const conv = await api("POST", `/residencias/${residenciaId}/convites`, { token: c1.token, body: { email: c2.email } });
    await api("PATCH", `/convites/${conv.body.id}`, { token: c2.token, body: { status: "aceito" } });
    await api("POST", "/usuarios/push-token", { token: c1.token, body: { pushToken: "ExponentPushToken[filho]" } });
    await api("POST", "/usuarios/push-token", { token: c2.token, body: { pushToken: "ExponentPushToken[filha]" } });
    morador = await novoMorador(c1.token, residenciaId);
  });

  beforeEach(() => clearDispatchedPushNotifications());

  it("Given morador, When aperta SOS, Then 201 e TODOS os cuidadores recebem push de prioridade alta na hora", async () => {
    const t0 = Date.now();
    const r = await api("POST", `/residencias/${residenciaId}/sos`, { token: morador.token, body: { moradorId: morador.id } });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ moradorId: morador.id, origem: "app", status: "aberto" });
    expect(Date.now() - t0).toBeLessThan(10_000); // RNF-02
    const tokens = dispatchedPushNotifications.map((p) => p.token).sort();
    expect(tokens).toEqual(["ExponentPushToken[filha]", "ExponentPushToken[filho]"]);
    const notifs = await db.select().from(notificacoes).where(eq(notificacoes.alvoId, r.body.id));
    expect(notifs.length).toBe(2);
  });

  it("Given morador, When tenta SOS em nome de outro morador, Then 403", async () => {
    const outro = await novoMorador(c1.token, residenciaId, "5555");
    const r = await api("POST", `/residencias/${residenciaId}/sos`, { token: morador.token, body: { moradorId: outro.id } });
    expect(r.status).toBe(403);
  });

  it("Given cuidador, When tenta acionar SOS pelo app do morador, Then 403", async () => {
    const r = await api("POST", `/residencias/${residenciaId}/sos`, { token: c1.token, body: { moradorId: morador.id } });
    expect(r.status).toBe(403);
  });

  it("Given SOS há menos de 30s, When morador cancela, Then cancelado_pelo_morador e cuidadores avisados (não some)", async () => {
    const s = await api("POST", `/residencias/${residenciaId}/sos`, { token: morador.token, body: { moradorId: morador.id } });
    clearDispatchedPushNotifications();
    const r = await api("PATCH", `/sos/${s.body.id}`, { token: morador.token, body: { status: "cancelado_pelo_morador" } });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("cancelado_pelo_morador");
    const n = await db
      .select()
      .from(notificacoes)
      .where(and(eq(notificacoes.alvoId, s.body.id), eq(notificacoes.tipo, "sos_cancelado")));
    expect(n.length).toBe(2);
    expect(dispatchedPushNotifications.length).toBe(2);
    const lista = await api("GET", `/residencias/${residenciaId}/sos`, { token: c2.token });
    expect(lista.body.find((x: { id: string }) => x.id === s.body.id).status).toBe("cancelado_pelo_morador");
  });

  it("Given SOS há mais de 30s, When morador cancela, Then 409", async () => {
    const s = await api("POST", `/residencias/${residenciaId}/sos`, { token: morador.token, body: { moradorId: morador.id } });
    await db.update(sosEventos).set({ createdAt: new Date(Date.now() - 31_000) }).where(eq(sosEventos.id, s.body.id));
    const r = await api("PATCH", `/sos/${s.body.id}`, { token: morador.token, body: { status: "cancelado_pelo_morador" } });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("SOS_CANCEL_TIMEOUT");
  });

  it("Given cuidador, When reconhece o SOS, Then reconhecido com quem e quando; e SOS abertos vêm primeiro na lista", async () => {
    const s = await api("POST", `/residencias/${residenciaId}/sos`, { token: morador.token, body: { moradorId: morador.id } });
    const r = await api("PATCH", `/sos/${s.body.id}`, { token: c2.token, body: { status: "reconhecido" } });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: "reconhecido", reconhecidoPor: "Filha" });
    expect(r.body.reconhecidoEm).not.toBeNull();

    const aberto = await api("POST", `/residencias/${residenciaId}/sos`, { token: morador.token, body: { moradorId: morador.id } });
    const lista = await api("GET", `/residencias/${residenciaId}/sos`, { token: c1.token });
    expect(lista.body[0].id).toBe(aberto.body.id);
    expect(lista.body.every((x: { status: string }, i: number, arr: Array<{ status: string }>) =>
      i === 0 || arr[i - 1]!.status === "aberto" || x.status !== "aberto")).toBe(true);
  });

  it("Given morador, When tenta 'reconhecer' o próprio SOS, Then 403; cuidador não 'cancela pelo morador'", async () => {
    const s = await api("POST", `/residencias/${residenciaId}/sos`, { token: morador.token, body: { moradorId: morador.id } });
    expect((await api("PATCH", `/sos/${s.body.id}`, { token: morador.token, body: { status: "reconhecido" } })).status).toBe(403);
    expect((await api("PATCH", `/sos/${s.body.id}`, { token: c1.token, body: { status: "cancelado_pelo_morador" } })).status).toBe(403);
  });
});
