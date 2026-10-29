import { desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { moradores, sosEventos, usuarios, type SosEvento } from "../../db/schema";
import { patchSOSSchema, postSOSSchema } from "../schemas";
import { notifyCaregivers } from "../rules-engine";
import { exigirCuidadorMembro, exigirMorador } from "../authz";
import { HttpError, idDoPath, iso, lerCorpo, naoEncontrado, proibido } from "../http";
import type { Contexto } from "../app";

const JANELA_CANCELAMENTO_MS = 30_000; // RF-16

function sosJson(s: SosEvento, reconhecidoPor: string | null = null) {
  return {
    id: s.id,
    moradorId: s.moradorId,
    dispositivoId: s.dispositivoId,
    origem: s.origem,
    status: s.status,
    reconhecidoPor,
    reconhecidoEm: iso(s.reconhecidoEm),
    createdAt: iso(s.createdAt),
  };
}

async function comNome(s: SosEvento) {
  if (!s.reconhecidoPor) return sosJson(s);
  const [u] = await db.select({ nome: usuarios.nome }).from(usuarios).where(eq(usuarios.id, s.reconhecidoPor));
  return sosJson(s, u?.nome ?? null);
}

/** RF-15 · cuidador vê os SOS (abertos primeiro). */
export async function handleListSOS(ctx: Contexto): Promise<Response> {
  const residenciaId = idDoPath(ctx.params[0], "Residência");
  await exigirCuidadorMembro(ctx.sessao, residenciaId);
  const lista = await db
    .select({ sos: sosEventos, nome: usuarios.nome })
    .from(sosEventos)
    .leftJoin(usuarios, eq(sosEventos.reconhecidoPor, usuarios.id))
    .where(eq(sosEventos.residenciaId, residenciaId))
    .orderBy(sql`case when ${sosEventos.status} = 'aberto' then 0 else 1 end`, desc(sosEventos.createdAt))
    .limit(100);
  return Response.json(lista.map((l) => sosJson(l.sos, l.nome)));
}

/** RF-15 · só o aparelho do morador aciona pelo app, em nome dele mesmo. Direto, sem motor de regras. */
export async function handlePostSOS(ctx: Contexto): Promise<Response> {
  const residenciaId = idDoPath(ctx.params[0], "Residência");
  const sessao = exigirMorador(ctx.sessao);
  const body = await lerCorpo(ctx.req, postSOSSchema);
  if (sessao.residenciaId !== residenciaId || sessao.moradorId !== body.moradorId) throw proibido();

  const [morador] = await db.select().from(moradores).where(eq(moradores.id, sessao.moradorId));
  const [sos] = await db
    .insert(sosEventos)
    .values({ residenciaId, moradorId: sessao.moradorId, origem: "app", status: "aberto" })
    .returning();
  if (!sos) throw new Error("falha ao registrar SOS");

  await notifyCaregivers(residenciaId, "sos", sos.id, {
    severidade: "alta",
    titulo: "🚨 SOS — pedido de ajuda",
    mensagem: `${morador?.nome ?? "O morador"} pediu ajuda pelo aplicativo. Verifique imediatamente.`,
  });
  return Response.json(sosJson(sos), { status: 201 });
}

/** RF-16 · morador cancela em até 30s; cuidador reconhece. */
export async function handlePatchSOS(ctx: Contexto): Promise<Response> {
  const sosId = idDoPath(ctx.params[0], "SOS");
  const [sos] = await db.select().from(sosEventos).where(eq(sosEventos.id, sosId));
  if (!sos) throw naoEncontrado("SOS");
  const body = await lerCorpo(ctx.req, patchSOSSchema);

  if (body.status === "cancelado_pelo_morador") {
    const m = exigirMorador(ctx.sessao);
    if (sos.moradorId !== m.moradorId) throw proibido("Só quem pediu ajuda pode cancelar.");
    if (sos.status !== "aberto") throw new HttpError(409, "SOS_NOT_OPEN", "Este pedido de ajuda já foi encerrado.");
    if (Date.now() - sos.createdAt.getTime() > JANELA_CANCELAMENTO_MS) {
      throw new HttpError(409, "SOS_CANCEL_TIMEOUT", "Fora da janela de 30s para cancelamento do SOS.");
    }
    const [atualizado] = await db
      .update(sosEventos)
      .set({ status: "cancelado_pelo_morador" })
      .where(eq(sosEventos.id, sosId))
      .returning();
    const [morador] = await db.select().from(moradores).where(eq(moradores.id, m.moradorId));
    // Falso alarme também é informação de segurança: cuidadores são avisados, nada é apagado.
    await notifyCaregivers(sos.residenciaId, "sos_cancelado", sos.id, {
      severidade: "media",
      titulo: "SOS cancelado pelo morador",
      mensagem: `${morador?.nome ?? "O morador"} cancelou o pedido de ajuda: "foi sem querer".`,
    });
    return Response.json(sosJson(atualizado!));
  }

  const usuarioId = await exigirCuidadorMembro(ctx.sessao, sos.residenciaId);
  if (sos.status === "reconhecido") return Response.json(await comNome(sos));
  const [atualizado] = await db
    .update(sosEventos)
    .set({ status: "reconhecido", reconhecidoPor: usuarioId, reconhecidoEm: new Date() })
    .where(eq(sosEventos.id, sosId))
    .returning();
  return Response.json(await comNome(atualizado!));
}
