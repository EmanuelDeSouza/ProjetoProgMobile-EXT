import { eq } from "drizzle-orm";
import { db } from "../db";
import { usuarios, type Usuario } from "../../db/schema";
import { postAuthSchema, postUsuarioSchema } from "../schemas";
import { hashPassword, verifyPassword, signToken, verificarGoogleIdToken } from "../auth";
import { exigirCuidador } from "../authz";
import { HttpError, lerCorpo } from "../http";
import { aceitarConvitesPendentes } from "./residencias";
import type { Contexto } from "../app";

const credenciaisInvalidas = () => new HttpError(401, "INVALID_CREDENTIALS", "Credenciais inválidas.");

async function sessaoCuidador(user: Usuario) {
  const token = await signToken({ sub: user.id, email: user.email, papel: "cuidador" });
  return { token, usuario: { id: user.id, nome: user.nome, email: user.email } };
}

// Hash fixo para gastar o mesmo tempo quando o e-mail não existe (não revela quem tem conta).
const hashFantasma = hashPassword("senha-que-ninguem-usa");

/** RF-01 · postAuth. E-mail sem conta é 401 — cadastro é só em postUsuario. */
export async function handleAuth(req: Request): Promise<Response> {
  const body = await lerCorpo(req, postAuthSchema);

  if (body.metodo === "senha") {
    const [user] = await db.select().from(usuarios).where(eq(usuarios.email, body.email));
    if (!user || !user.senhaHash) {
      await verifyPassword(body.senha, await hashFantasma);
      throw credenciaisInvalidas();
    }
    if (!(await verifyPassword(body.senha, user.senhaHash))) throw credenciaisInvalidas();
    return Response.json(await sessaoCuidador(user));
  }

  const google = await verificarGoogleIdToken(body.idToken);
  if (!google) {
    throw new HttpError(401, "INVALID_CREDENTIALS", "Não foi possível confirmar sua conta Google.");
  }
  let [user] = await db.select().from(usuarios).where(eq(usuarios.email, google.email));
  if (!user) {
    [user] = await db.insert(usuarios).values({ nome: google.nome, email: google.email }).returning();
    if (!user) throw new Error("falha ao criar usuário Google");
    await aceitarConvitesPendentes(user.id, user.email);
  }
  return Response.json(await sessaoCuidador(user));
}

/** RF-01 · postUsuario: cria conta e já entra; convites pendentes viram vínculo (RF-05). */
export async function handlePostUsuario(req: Request): Promise<Response> {
  const body = await lerCorpo(req, postUsuarioSchema);
  const [existente] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, body.email));
  if (existente) throw new HttpError(409, "EMAIL_IN_USE", "Este e-mail já tem conta. Entre com ele.");

  const [user] = await db
    .insert(usuarios)
    .values({ nome: body.nome, email: body.email, senhaHash: await hashPassword(body.senha) })
    .onConflictDoNothing({ target: usuarios.email })
    .returning();
  if (!user) throw new HttpError(409, "EMAIL_IN_USE", "Este e-mail já tem conta. Entre com ele.");

  await aceitarConvitesPendentes(user.id, user.email);
  return Response.json(await sessaoCuidador(user), { status: 201 });
}

export async function handleMe(ctx: Contexto): Promise<Response> {
  const usuarioId = exigirCuidador(ctx.sessao);
  const [user] = await db.select().from(usuarios).where(eq(usuarios.id, usuarioId));
  if (!user) throw new HttpError(401, "UNAUTHORIZED", "Sessão inválida.");
  return Response.json({ id: user.id, nome: user.nome, email: user.email });
}
