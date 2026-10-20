import { eq } from "drizzle-orm";
import { db } from "../db";
import { usuarios } from "../../db/schema";
import { postPushTokenSchema, formatErrorResponse, formatZodError } from "../schemas";

export async function handlePostPushToken(req: Request, userId: string): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      formatErrorResponse("INVALID_JSON", "O corpo da requisição deve ser um JSON válido."),
      { status: 400 }
    );
  }

  const parsed = postPushTokenSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(formatZodError(parsed.error), { status: 400 });
  }

  try {
    await db
      .update(usuarios)
      .set({ pushToken: parsed.data.pushToken })
      .where(eq(usuarios.id, userId));

    return Response.json({ status: "ok" }, { status: 200 });
  } catch (error) {
    console.error("Erro ao registrar push token:", error);
    return Response.json(
      formatErrorResponse("INTERNAL_ERROR", "Falha ao registrar token push."),
      { status: 500 }
    );
  }
}
