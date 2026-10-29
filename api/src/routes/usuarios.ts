import { eq } from "drizzle-orm";
import { db } from "../db";
import { usuarios } from "../../db/schema";
import { postPushTokenSchema } from "../schemas";
import { exigirCuidador } from "../authz";
import { lerCorpo } from "../http";
import type { Contexto } from "../app";

/** postPushToken · guarda o token Expo do aparelho do cuidador (RF-15/RF-17). */
export async function handlePostPushToken(ctx: Contexto): Promise<Response> {
  const usuarioId = exigirCuidador(ctx.sessao);
  const { pushToken } = await lerCorpo(ctx.req, postPushTokenSchema);
  await db.update(usuarios).set({ pushToken }).where(eq(usuarios.id, usuarioId));
  return Response.json({ status: "ok" });
}
