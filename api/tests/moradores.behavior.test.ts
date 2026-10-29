import { describe, it, expect } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { moradores } from "../db/schema";
import { api, novoCuidador, novaResidencia } from "./helpers";

async function cenario() {
  const c = await novoCuidador();
  const residenciaId = await novaResidencia(c.token);
  const m = await api("POST", `/residencias/${residenciaId}/moradores`, {
    token: c.token,
    body: { nome: "Dona Elza", pin: "4321" },
  });
  return { c, residenciaId, moradorId: m.body.id as string, criado: m };
}

async function tentar(moradorId: string, pin: string) {
  return api("POST", "/moradores/login-pin", { body: { moradorId, pin } });
}

describe("RF-04 · Morador com PIN", () => {
  it("Given cuidador, When cadastra morador, Then 201 e o PIN não fica em texto puro", async () => {
    const { criado, residenciaId, moradorId } = await cenario();
    expect(criado.status).toBe(201);
    expect(criado.body).toEqual({ id: moradorId, nome: "Dona Elza", residenciaId });
    const [row] = await db.select().from(moradores).where(eq(moradores.id, moradorId));
    expect(row?.pinHash).not.toContain("4321");
  });

  it("Given PIN com formato errado, Then 400", async () => {
    const { c, residenciaId } = await cenario();
    const r = await api("POST", `/residencias/${residenciaId}/moradores`, { token: c.token, body: { nome: "X", pin: "12a4" } });
    expect(r.status).toBe(400);
    const r2 = await tentar("00000000-0000-0000-0000-000000000001", "123");
    expect(r2.status).toBe(400);
  });

  it("Given cuidador, When lista moradores (para configurar o aparelho), Then vê só os da casa", async () => {
    const { c, residenciaId, moradorId } = await cenario();
    const r = await api("GET", `/residencias/${residenciaId}/moradores`, { token: c.token });
    expect(r.status).toBe(200);
    expect(r.body).toEqual([{ id: moradorId, nome: "Dona Elza", residenciaId }]);
  });

  it("Given PIN certo, Then 200 com token de sessão do morador", async () => {
    const { moradorId, residenciaId } = await cenario();
    const r = await tentar(moradorId, "4321");
    expect(r.status).toBe(200);
    expect(r.body.morador).toEqual({ id: moradorId, nome: "Dona Elza", residenciaId });
    expect(typeof r.body.token).toBe("string");
  });

  it("Given PIN errado, Then 401 'PIN incorreto. Tente de novo.'", async () => {
    const { moradorId } = await cenario();
    const r = await tentar(moradorId, "0000");
    expect(r.status).toBe(401);
    expect(r.body.error.message).toBe("PIN incorreto. Tente de novo.");
  });
});

describe("RNF-08 · Bloqueio após 5 tentativas erradas em 10 minutos", () => {
  it("Given 5 erros seguidos, Then 429 — e nem o PIN certo entra durante o bloqueio", async () => {
    const { moradorId } = await cenario();
    for (let i = 0; i < 4; i++) expect((await tentar(moradorId, "0000")).status).toBe(401);
    expect((await tentar(moradorId, "0000")).status).toBe(429);
    expect((await tentar(moradorId, "4321")).status).toBe(429);
  });

  it("Given erros espalhados por mais de 10 minutos, Then a contagem recomeça (não bloqueia)", async () => {
    const { moradorId } = await cenario();
    for (let i = 0; i < 4; i++) await tentar(moradorId, "0000");
    // simula que a primeira tentativa errada foi há 11 minutos
    await db
      .update(moradores)
      .set({ primeiraTentativaErradaEm: new Date(Date.now() - 11 * 60_000) })
      .where(eq(moradores.id, moradorId));
    expect((await tentar(moradorId, "0000")).status).toBe(401);
    expect((await tentar(moradorId, "4321")).status).toBe(200);
  });

  it("Given bloqueio vencido, Then volta a aceitar o PIN certo", async () => {
    const { moradorId } = await cenario();
    for (let i = 0; i < 5; i++) await tentar(moradorId, "0000");
    await db
      .update(moradores)
      .set({ bloqueadoAte: new Date(Date.now() - 1000) })
      .where(eq(moradores.id, moradorId));
    expect((await tentar(moradorId, "4321")).status).toBe(200);
  });

  it("Given morador inexistente, Then 401 (sem revelar se existe)", async () => {
    const r = await tentar("00000000-0000-0000-0000-000000000009", "1234");
    expect(r.status).toBe(401);
  });
});
