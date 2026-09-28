import { eq, and } from "drizzle-orm";
import { db } from "../db";
import { residencias, residenciaMembros, convites } from "../../db/schema";
import {
  postResidenciaSchema,
  postConviteSchema,
  patchConviteSchema,
  formatErrorResponse,
  formatZodError,
} from "../schemas";

export async function handleGetMinhasResidencias(userId: string): Promise<Response> {
  const membros = await db
    .select({
      id: residencias.id,
      nome: residencias.nome,
      enderecoCurto: residencias.enderecoCurto,
      papel: residenciaMembros.papel,
    })
    .from(residenciaMembros)
    .innerJoin(residencias, eq(residenciaMembros.residenciaId, residencias.id))
    .where(eq(residenciaMembros.usuarioId, userId));

  return Response.json(membros);
}

export async function handlePostResidencia(req: Request, userId: string): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      formatErrorResponse("INVALID_JSON", "O corpo da requisição deve ser um JSON válido."),
      { status: 400 }
    );
  }

  const parsed = postResidenciaSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(formatZodError(parsed.error), { status: 400 });
  }

  const [residencia] = await db
    .insert(residencias)
    .values({
      nome: parsed.data.nome,
      enderecoCurto: parsed.data.enderecoCurto ?? null,
    })
    .returning();

  if (!residencia) {
    return Response.json(
      formatErrorResponse("INTERNAL_ERROR", "Falha ao criar residência."),
      { status: 500 }
    );
  }

  // Link creator as dono
  await db.insert(residenciaMembros).values({
    residenciaId: residencia.id,
    usuarioId: userId,
    papel: "dono",
  });

  return Response.json(
    {
      id: residencia.id,
      nome: residencia.nome,
      enderecoCurto: residencia.enderecoCurto,
    },
    { status: 201 }
  );
}

export async function handlePostConvite(
  req: Request,
  residenciaId: string,
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

  const parsed = postConviteSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(formatZodError(parsed.error), { status: 400 });
  }

  // Check if caller is member of residence
  const [membership] = await db
    .select()
    .from(residenciaMembros)
    .where(
      and(
        eq(residenciaMembros.residenciaId, residenciaId),
        eq(residenciaMembros.usuarioId, userId)
      )
    );

  if (!membership) {
    return Response.json(
      formatErrorResponse("FORBIDDEN", "Apenas membros da residência podem enviar convites."),
      { status: 403 }
    );
  }

  const [convite] = await db
    .insert(convites)
    .values({
      residenciaId,
      email: parsed.data.email.toLowerCase(),
      status: "pendente",
    })
    .returning();

  if (!convite) {
    return Response.json(
      formatErrorResponse("INTERNAL_ERROR", "Falha ao criar convite."),
      { status: 500 }
    );
  }

  return Response.json(
    {
      id: convite.id,
      residenciaId: convite.residenciaId,
      email: convite.email,
      status: convite.status,
      createdAt: convite.createdAt.toISOString(),
    },
    { status: 201 }
  );
}

export async function handlePatchConvite(
  req: Request,
  conviteId: string,
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

  const parsed = patchConviteSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(formatZodError(parsed.error), { status: 400 });
  }

  const [convite] = await db.select().from(convites).where(eq(convites.id, conviteId));
  if (!convite) {
    return Response.json(
      formatErrorResponse("NOT_FOUND", "Convite não encontrado."),
      { status: 404 }
    );
  }

  await db
    .update(convites)
    .set({ status: "aceito" })
    .where(eq(convites.id, conviteId));

  // Add to members if not already
  const [existing] = await db
    .select()
    .from(residenciaMembros)
    .where(
      and(
        eq(residenciaMembros.residenciaId, convite.residenciaId),
        eq(residenciaMembros.usuarioId, userId)
      )
    );

  if (!existing) {
    await db.insert(residenciaMembros).values({
      residenciaId: convite.residenciaId,
      usuarioId: userId,
      papel: "cuidador",
    });
  }

  return Response.json({ status: "ok" });
}
