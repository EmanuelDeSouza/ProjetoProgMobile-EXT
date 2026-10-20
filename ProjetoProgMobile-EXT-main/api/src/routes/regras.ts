import { eq } from "drizzle-orm";
import { db } from "../db";
import { regrasAlerta } from "../../db/schema";
import {
  postRegraAlertaSchema,
  formatErrorResponse,
  formatZodError,
} from "../schemas";

export async function handleListRegras(residenciaId: string): Promise<Response> {
  const list = await db
    .select()
    .from(regrasAlerta)
    .where(eq(regrasAlerta.residenciaId, residenciaId));

  const mapped = list.map((r) => ({
    id: r.id,
    dispositivoId: r.dispositivoId,
    condicao: r.condicao,
    parametros: r.parametros,
    ativa: r.ativa,
  }));

  return Response.json(mapped);
}

export async function handlePostRegra(
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

  const parsed = postRegraAlertaSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(formatZodError(parsed.error), { status: 400 });
  }

  const [regra] = await db
    .insert(regrasAlerta)
    .values({
      residenciaId,
      dispositivoId: parsed.data.dispositivoId,
      condicao: parsed.data.condicao,
      parametros: parsed.data.parametros,
      ativa: true,
    })
    .returning();

  if (!regra) {
    return Response.json(
      formatErrorResponse("INTERNAL_ERROR", "Falha ao criar regra."),
      { status: 500 }
    );
  }

  return Response.json(
    {
      id: regra.id,
      dispositivoId: regra.dispositivoId,
      condicao: regra.condicao,
      parametros: regra.parametros,
      ativa: regra.ativa,
    },
    { status: 201 }
  );
}
