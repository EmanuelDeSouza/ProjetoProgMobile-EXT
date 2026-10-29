import { describe, it, expect, beforeAll } from "bun:test";
import { db } from "../src/db";
import { alertas } from "../db/schema";
import { notifyCaregivers } from "../src/rules-engine";
import { api, dispositivoNoBanco, novaResidencia, novoCuidador, type Cuidador } from "./helpers";

describe("RF-14 · Reconhecer ou escalar alerta", () => {
  let c1: Cuidador;
  let c2: Cuidador;
  let residenciaId: string;
  let dispositivoId: string;

  beforeAll(async () => {
    c1 = await novoCuidador("Primeiro");
    c2 = await novoCuidador("Segundo");
    residenciaId = await novaResidencia(c1.token);
    const conv = await api("POST", `/residencias/${residenciaId}/convites`, { token: c1.token, body: { email: c2.email } });
    await api("PATCH", `/convites/${conv.body.id}`, { token: c2.token, body: { status: "aceito" } });
    dispositivoId = (await dispositivoNoBanco(residenciaId, "sensor_contato")).id;
  });

  async function novoAlerta() {
    const [a] = await db.insert(alertas).values({ residenciaId, dispositivoId, severidade: "media" }).returning();
    return a!;
  }

  it("Given alerta aberto, When qualquer cuidador reconhece, Then reconhecido com quem e quando, visível ao outro", async () => {
    const a = await novoAlerta();
    const r = await api("PATCH", `/alertas/${a.id}`, { token: c2.token, body: { status: "reconhecido", nota: "Liguei, está tudo bem" } });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: a.id, status: "reconhecido", reconhecidoPor: "Segundo", nota: "Liguei, está tudo bem" });
    const l = await api("GET", `/residencias/${residenciaId}/alertas`, { token: c1.token });
    expect(l.body.find((x: { id: string }) => x.id === a.id)).toMatchObject({ status: "reconhecido", reconhecidoPor: "Segundo" });
  });

  it("Given alerta aberto, When escala sem nota, Then 400; com nota, continua aberto com a nota", async () => {
    const a = await novoAlerta();
    expect((await api("PATCH", `/alertas/${a.id}`, { token: c1.token, body: { status: "aberto" } })).status).toBe(400);
    const r = await api("PATCH", `/alertas/${a.id}`, { token: c1.token, body: { status: "aberto", nota: "Preciso de ajuda, não atende" } });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: "aberto", nota: "Preciso de ajuda, não atende", reconhecidoPor: null });
  });

  it("Given lista de alertas, Then abertos primeiro", async () => {
    const l = await api("GET", `/residencias/${residenciaId}/alertas`, { token: c1.token });
    const status = l.body.map((x: { status: string }) => x.status);
    const primeiroReconhecido = status.indexOf("reconhecido");
    expect(status.slice(primeiroReconhecido).includes("aberto")).toBe(false);
  });
});

describe("RF-17 · Central de notificações", () => {
  it("Given várias notificações, Then paginação por limite + cursor 'antes', e marcar lida só a própria", async () => {
    const c = await novoCuidador();
    const outro = await novoCuidador();
    const res = await novaResidencia(c.token);
    for (let i = 0; i < 5; i++) {
      await notifyCaregivers(res, "alerta", crypto.randomUUID(), { severidade: "baixa", titulo: `Alerta ${i}`, mensagem: "m" });
      await Bun.sleep(5);
    }
    const p1 = await api("GET", "/notificacoes?limite=2", { token: c.token });
    expect(p1.status).toBe(200);
    expect(p1.body.map((n: { titulo: string }) => n.titulo)).toEqual(["Alerta 4", "Alerta 3"]);
    const cursor = encodeURIComponent(p1.body[1].createdAt);
    const p2 = await api("GET", `/notificacoes?limite=2&antes=${cursor}`, { token: c.token });
    expect(p2.body.map((n: { titulo: string }) => n.titulo)).toEqual(["Alerta 2", "Alerta 1"]);
    expect(p1.body[0]).toMatchObject({ tipo: "alerta", residenciaId: res, lidaEm: null });

    const lida = await api("PATCH", `/notificacoes/${p1.body[0].id}`, { token: c.token, body: { lida: true } });
    expect(lida.status).toBe(200);
    expect(lida.body.lidaEm).not.toBeNull();
    const naoLida = await api("PATCH", `/notificacoes/${p1.body[0].id}`, { token: c.token, body: { lida: false } });
    expect(naoLida.body.lidaEm).toBeNull();

    const alheia = await api("PATCH", `/notificacoes/${p1.body[0].id}`, { token: outro.token, body: { lida: true } });
    expect(alheia.status).toBe(404);

    const ruim = await api("GET", "/notificacoes?limite=500", { token: c.token });
    expect(ruim.status).toBe(400);
  });
});
