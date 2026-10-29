import { eq } from "drizzle-orm";
import { db } from "../db";
import { moradores } from "../../db/schema";
import { postLoginPinSchema, postMoradorSchema } from "../schemas";
import { hashPassword, hashPin, verifyPassword, verifyPin, signToken } from "../auth";
import { exigirCuidadorMembro } from "../authz";
import { HttpError, idDoPath, lerCorpo } from "../http";
import type { Contexto } from "../app";

const JANELA_MS = 10 * 60_000; // RNF-08: 5 tentativas erradas em 10 minutos
const BLOQUEIO_MS = 10 * 60_000;
const MAX_TENTATIVAS = 5;

const pinIncorreto = () => new HttpError(401, "INVALID_PIN", "PIN incorreto. Tente de novo.");
const bloqueado = () =>
  new HttpError(429, "RATE_LIMITED", "Muitas tentativas. Espere alguns minutos e tente de novo.");

function moradorJson(m: typeof moradores.$inferSelect) {
  return { id: m.id, nome: m.nome, residenciaId: m.residenciaId };
}

export async function handleListMoradores(ctx: Contexto): Promise<Response> {
  const residenciaId = idDoPath(ctx.params[0], "Residência");
  await exigirCuidadorMembro(ctx.sessao, residenciaId);
  const lista = await db
    .select()
    .from(moradores)
    .where(eq(moradores.residenciaId, residenciaId))
    .orderBy(moradores.createdAt);
  return Response.json(lista.map(moradorJson));
}

/** RF-04 · cuidador cadastra morador com PIN (guardado como hash). */
export async function handlePostMorador(ctx: Contexto): Promise<Response> {
  const residenciaId = idDoPath(ctx.params[0], "Residência");
  await exigirCuidadorMembro(ctx.sessao, residenciaId);
  const body = await lerCorpo(ctx.req, postMoradorSchema);
  const [morador] = await db
    .insert(moradores)
    .values({ residenciaId, nome: body.nome, pinHash: await hashPin(body.pin) })
    .returning();
  if (!morador) throw new Error("falha ao criar morador");
  return Response.json(moradorJson(morador), { status: 201 });
}

const hashFantasma = hashPassword("pin:0000-fantasma");

/** RF-04 + RNF-08 · login por PIN com bloqueio de 10 min após 5 erros em 10 min. */
export async function handlePostLoginPin(req: Request): Promise<Response> {
  const { moradorId, pin } = await lerCorpo(req, postLoginPinSchema);
  const [morador] = await db.select().from(moradores).where(eq(moradores.id, moradorId));
  if (!morador) {
    await verifyPassword(pin, await hashFantasma);
    throw pinIncorreto();
  }

  const agora = Date.now();
  if (morador.bloqueadoAte && morador.bloqueadoAte.getTime() > agora) throw bloqueado();

  if (await verifyPin(pin, morador.pinHash)) {
    await db
      .update(moradores)
      .set({ tentativasErradas: 0, primeiraTentativaErradaEm: null, bloqueadoAte: null })
      .where(eq(moradores.id, morador.id));
    const token = await signToken(
      { sub: morador.id, residenciaId: morador.residenciaId, papel: "morador" },
      "30d"
    );
    return Response.json({ token, morador: moradorJson(morador) });
  }

  const janelaAtiva =
    morador.primeiraTentativaErradaEm !== null &&
    agora - morador.primeiraTentativaErradaEm.getTime() <= JANELA_MS &&
    !(morador.bloqueadoAte && morador.bloqueadoAte.getTime() <= agora);
  const tentativas = janelaAtiva ? morador.tentativasErradas + 1 : 1;
  const inicio = janelaAtiva ? morador.primeiraTentativaErradaEm : new Date(agora);

  if (tentativas >= MAX_TENTATIVAS) {
    await db
      .update(moradores)
      .set({ tentativasErradas: 0, primeiraTentativaErradaEm: null, bloqueadoAte: new Date(agora + BLOQUEIO_MS) })
      .where(eq(moradores.id, morador.id));
    throw bloqueado();
  }
  await db
    .update(moradores)
    .set({ tentativasErradas: tentativas, primeiraTentativaErradaEm: inicio })
    .where(eq(moradores.id, morador.id));
  throw pinIncorreto();
}
