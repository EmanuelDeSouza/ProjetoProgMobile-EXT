import { eq } from "drizzle-orm";
import { db } from "../db";
import { sosEventos } from "../../db/schema";
import { postSOSSchema, patchSOSSchema, formatErrorResponse, formatZodError } from "../schemas";
import { notifyCaregivers } from "../rules-engine";

export async function handlePostSOS(
  req: Request,
  residenciaId: string
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

  const parsed = postSOSSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(formatZodError(parsed.error), { status: 400 });
  }

  const [sos] = await db
    .insert(sosEventos)
    .values({
      residenciaId,
      moradorId: parsed.data.moradorId,
      origem: "app",
      status: "aberto",
    })
    .returning();

  if (!sos) {
    return Response.json(
      formatErrorResponse("INTERNAL_ERROR", "Falha ao registrar SOS."),
      { status: 500 }
    );
  }

  // Dispara notificação imediata a todos os cuidadores (RF-15: notificação de prioridade máxima por push)
  await notifyCaregivers(residenciaId, "sos", sos.id, {
    severidade: "alta",
    titulo: "🚨 ALERTA SOS - Emergência!",
    mensagem: "Pedido de ajuda acionado via aplicativo pelo morador.",
  });

  return Response.json(
    {
      id: sos.id,
      moradorId: sos.moradorId,
      origem: sos.origem,
      status: sos.status,
      createdAt: sos.createdAt.toISOString(),
    },
    { status: 201 }
  );
}

export async function handlePatchSOS(
  req: Request,
  sosId: string
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

  const parsed = patchSOSSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(formatZodError(parsed.error), { status: 400 });
  }

  const [existing] = await db.select().from(sosEventos).where(eq(sosEventos.id, sosId));
  if (!existing) {
    return Response.json(
      formatErrorResponse("NOT_FOUND", "Evento SOS não encontrado."),
      { status: 404 }
    );
  }

  // RF-16: Cancela se acionado há menos de 30 segundos
  const diffSeconds = (Date.now() - new Date(existing.createdAt).getTime()) / 1000;
  if (diffSeconds > 30) {
    return Response.json(
      formatErrorResponse(
        "SOS_CANCEL_TIMEOUT",
        "Fora da janela de 30s para cancelamento do SOS."
      ),
      { status: 409 }
    );
  }

  await db
    .update(sosEventos)
    .set({
      status: "cancelado_pelo_morador",
    })
    .where(eq(sosEventos.id, sosId));

  return Response.json({ status: "ok" });
}
