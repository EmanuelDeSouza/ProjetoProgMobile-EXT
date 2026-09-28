import { eq, desc } from "drizzle-orm";
import { db } from "../db";
import { alertas } from "../../db/schema";
import { patchAlertaSchema, formatErrorResponse, formatZodError } from "../schemas";

export async function handleListAlertas(residenciaId: string): Promise<Response> {
  const list = await db
    .select()
    .from(alertas)
    .where(eq(alertas.residenciaId, residenciaId))
    .orderBy(desc(alertas.createdAt));

  const mapped = list.map((a) => ({
    id: a.id,
    dispositivoId: a.dispositivoId,
    regraId: a.regraId,
    severidade: a.severidade,
    status: a.status,
    createdAt: a.createdAt.toISOString(),
  }));

  return Response.json(mapped);
}

export async function handlePatchAlerta(
  req: Request,
  alertaId: string,
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

  const parsed = patchAlertaSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(formatZodError(parsed.error), { status: 400 });
  }

  const [existing] = await db.select().from(alertas).where(eq(alertas.id, alertaId));
  if (!existing) {
    return Response.json(
      formatErrorResponse("NOT_FOUND", "Alerta não encontrado."),
      { status: 404 }
    );
  }

  await db
    .update(alertas)
    .set({
      status: "reconhecido",
      reconhecidoPor: userId,
      reconhecidoEm: new Date(),
      nota: parsed.data.nota ?? null,
    })
    .where(eq(alertas.id, alertaId));

  return Response.json({ status: "ok" });
}
