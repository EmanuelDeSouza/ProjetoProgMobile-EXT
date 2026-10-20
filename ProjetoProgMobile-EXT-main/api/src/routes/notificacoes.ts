import { eq, desc } from "drizzle-orm";
import { db } from "../db";
import { notificacoes } from "../../db/schema";
import { patchNotificacaoSchema, formatErrorResponse, formatZodError } from "../schemas";

export async function handleListNotificacoes(userId: string): Promise<Response> {
  const list = await db
    .select()
    .from(notificacoes)
    .where(eq(notificacoes.usuarioId, userId))
    .orderBy(desc(notificacoes.createdAt));

  const mapped = list.map((n) => ({
    id: n.id,
    tipo: n.tipo,
    alvoId: n.alvoId,
    lidaEm: n.lidaEm?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  }));

  return Response.json(mapped);
}

export async function handlePatchNotificacao(
  req: Request,
  notificacaoId: string,
  userId: string
): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      formatErrorResponse("INVALID_JSON", "O corpo da requisição deve ser um JSON válido."),
      { status: 400 }
    );
  }

  const parsed = patchNotificacaoSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(formatZodError(parsed.error), { status: 400 });
  }

  const [notif] = await db
    .select()
    .from(notificacoes)
    .where(eq(notificacoes.id, notificacaoId));

  if (!notif || notif.usuarioId !== userId) {
    return Response.json(
      formatErrorResponse("NOT_FOUND", "Notificação não encontrada."),
      { status: 404 }
    );
  }

  const lidaEm = parsed.data.lida === false ? null : new Date();

  await db
    .update(notificacoes)
    .set({ lidaEm })
    .where(eq(notificacoes.id, notificacaoId));

  return Response.json({ status: "ok" });
}
