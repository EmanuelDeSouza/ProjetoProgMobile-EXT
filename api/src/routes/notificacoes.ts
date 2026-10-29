import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "../db";
import { notificacoes, type Notificacao } from "../../db/schema";
import { listNotificacoesQuery, patchNotificacaoSchema } from "../schemas";
import { exigirCuidador } from "../authz";
import { idDoPath, iso, lerCorpo, lerQuery, naoEncontrado } from "../http";
import type { Contexto } from "../app";

function notificacaoJson(n: Notificacao) {
  return {
    id: n.id,
    tipo: n.tipo,
    alvoId: n.alvoId,
    residenciaId: n.residenciaId,
    titulo: n.titulo,
    mensagem: n.mensagem,
    lidaEm: iso(n.lidaEm),
    createdAt: iso(n.createdAt),
  };
}

/** RF-17 · paginada por cursor (createdAt do último item). */
export async function handleListNotificacoes(ctx: Contexto): Promise<Response> {
  const usuarioId = exigirCuidador(ctx.sessao);
  const { limite, antes } = lerQuery(ctx.url, listNotificacoesQuery);
  const filtros = [eq(notificacoes.usuarioId, usuarioId)];
  if (antes) filtros.push(lt(notificacoes.createdAt, new Date(antes)));
  const lista = await db
    .select()
    .from(notificacoes)
    .where(and(...filtros))
    .orderBy(desc(notificacoes.createdAt))
    .limit(limite);
  return Response.json(lista.map(notificacaoJson));
}

export async function handlePatchNotificacao(ctx: Contexto): Promise<Response> {
  const usuarioId = exigirCuidador(ctx.sessao);
  const id = idDoPath(ctx.params[0], "Notificação");
  const { lida } = await lerCorpo(ctx.req, patchNotificacaoSchema);
  const [n] = await db
    .update(notificacoes)
    .set({ lidaEm: lida ? new Date() : null })
    .where(and(eq(notificacoes.id, id), eq(notificacoes.usuarioId, usuarioId)))
    .returning();
  if (!n) throw naoEncontrado("Notificação");
  return Response.json(notificacaoJson(n));
}
