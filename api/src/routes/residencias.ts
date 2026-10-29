import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { convites, notificacoes, residenciaMembros, residencias, usuarios } from "../../db/schema";
import { patchConviteSchema, postConviteSchema, postResidenciaSchema } from "../schemas";
import { exigirCuidador, exigirCuidadorMembro } from "../authz";
import { HttpError, idDoPath, iso, lerCorpo, naoEncontrado, proibido } from "../http";
import type { Contexto } from "../app";

export async function handleGetMinhasResidencias(ctx: Contexto): Promise<Response> {
  const usuarioId = exigirCuidador(ctx.sessao);
  const lista = await db
    .select({
      id: residencias.id,
      nome: residencias.nome,
      enderecoCurto: residencias.enderecoCurto,
      papel: residenciaMembros.papel,
    })
    .from(residenciaMembros)
    .innerJoin(residencias, eq(residenciaMembros.residenciaId, residencias.id))
    .where(eq(residenciaMembros.usuarioId, usuarioId))
    .orderBy(residencias.createdAt);
  return Response.json(lista);
}

/** RF-03 · quem cria vira dono. */
export async function handlePostResidencia(ctx: Contexto): Promise<Response> {
  const usuarioId = exigirCuidador(ctx.sessao);
  const body = await lerCorpo(ctx.req, postResidenciaSchema);
  const residencia = await db.transaction(async (tx) => {
    const [r] = await tx
      .insert(residencias)
      .values({ nome: body.nome, enderecoCurto: body.enderecoCurto || null })
      .returning();
    if (!r) throw new Error("falha ao criar residência");
    await tx.insert(residenciaMembros).values({ residenciaId: r.id, usuarioId, papel: "dono" });
    return r;
  });
  return Response.json(
    { id: residencia.id, nome: residencia.nome, enderecoCurto: residencia.enderecoCurto },
    { status: 201 }
  );
}

function conviteJson(c: typeof convites.$inferSelect) {
  return { id: c.id, residenciaId: c.residenciaId, email: c.email, status: c.status, createdAt: iso(c.createdAt) };
}

/** RF-05 · qualquer cuidador da casa convida; quem já tem conta recebe notificação. */
export async function handlePostConvite(ctx: Contexto): Promise<Response> {
  const residenciaId = idDoPath(ctx.params[0], "Residência");
  const usuarioId = await exigirCuidadorMembro(ctx.sessao, residenciaId);
  const { email } = await lerCorpo(ctx.req, postConviteSchema);

  const [convidado] = await db.select().from(usuarios).where(eq(usuarios.email, email));
  if (convidado) {
    const [jaMembro] = await db
      .select()
      .from(residenciaMembros)
      .where(and(eq(residenciaMembros.residenciaId, residenciaId), eq(residenciaMembros.usuarioId, convidado.id)));
    if (jaMembro) throw new HttpError(409, "ALREADY_MEMBER", "Essa pessoa já é cuidadora desta casa.");
  }

  const [pendente] = await db
    .select()
    .from(convites)
    .where(and(eq(convites.residenciaId, residenciaId), eq(convites.email, email), eq(convites.status, "pendente")));
  if (pendente) return Response.json(conviteJson(pendente), { status: 201 });

  const [residencia] = await db.select().from(residencias).where(eq(residencias.id, residenciaId));
  const [quemConvida] = await db.select({ nome: usuarios.nome }).from(usuarios).where(eq(usuarios.id, usuarioId));

  const convite = await db.transaction(async (tx) => {
    const [c] = await tx.insert(convites).values({ residenciaId, email, status: "pendente" }).returning();
    if (!c) throw new Error("falha ao criar convite");
    if (convidado) {
      await tx.insert(notificacoes).values({
        usuarioId: convidado.id,
        residenciaId,
        tipo: "convite",
        alvoId: c.id,
        titulo: `Convite para cuidar de ${residencia?.nome ?? "uma residência"}`,
        mensagem: `${quemConvida?.nome ?? "Um cuidador"} convidou você para acompanhar esta casa.`,
      });
    }
    return c;
  });

  if (!convidado) {
    // Sem SMTP na V1: quem convidou avisa a pessoa; ao se cadastrar com este e-mail ela entra vinculada.
    console.info(`[convite] ${email} ainda não tem conta; será vinculado no cadastro.`);
  }
  return Response.json(conviteJson(convite), { status: 201 });
}

/** RF-05 · só o dono do e-mail convidado aceita. */
export async function handlePatchConvite(ctx: Contexto): Promise<Response> {
  const usuarioId = exigirCuidador(ctx.sessao);
  const conviteId = idDoPath(ctx.params[0], "Convite");
  await lerCorpo(ctx.req, patchConviteSchema);

  const [convite] = await db.select().from(convites).where(eq(convites.id, conviteId));
  if (!convite) throw naoEncontrado("Convite");
  const [user] = await db.select().from(usuarios).where(eq(usuarios.id, usuarioId));
  if (!user || user.email !== convite.email) throw proibido("Este convite foi enviado para outro e-mail.");
  if (convite.status !== "pendente") throw new HttpError(409, "INVITE_NOT_PENDING", "Este convite já foi aceito.");

  await vincular(usuarioId, convite.id, convite.residenciaId);
  const [r] = await db.select().from(residencias).where(eq(residencias.id, convite.residenciaId));
  return Response.json({ id: r!.id, nome: r!.nome, enderecoCurto: r!.enderecoCurto, papel: "cuidador" });
}

async function vincular(usuarioId: string, conviteId: string, residenciaId: string) {
  await db.transaction(async (tx) => {
    await tx.update(convites).set({ status: "aceito" }).where(eq(convites.id, conviteId));
    await tx
      .insert(residenciaMembros)
      .values({ residenciaId, usuarioId, papel: "cuidador" })
      .onConflictDoNothing();
    await tx
      .update(notificacoes)
      .set({ lidaEm: new Date() })
      .where(and(eq(notificacoes.alvoId, conviteId), eq(notificacoes.usuarioId, usuarioId)));
  });
}

/** Cadastro novo (ou primeiro login Google): todo convite pendente para o e-mail vira vínculo. */
export async function aceitarConvitesPendentes(usuarioId: string, email: string): Promise<void> {
  const pendentes = await db
    .select()
    .from(convites)
    .where(and(eq(convites.email, email), eq(convites.status, "pendente")));
  for (const c of pendentes) await vincular(usuarioId, c.id, c.residenciaId);
}
