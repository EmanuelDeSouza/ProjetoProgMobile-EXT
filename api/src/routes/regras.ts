import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { dispositivos, regrasAlerta, type RegraAlerta } from "../../db/schema";
import { formatZodError, parametrosPorCondicao, postRegraAlertaSchema, tipoPorCondicao } from "../schemas";
import { exigirCuidadorMembro } from "../authz";
import { HttpError, idDoPath, lerCorpo } from "../http";
import type { Contexto } from "../app";

function regraJson(r: RegraAlerta) {
  return { id: r.id, dispositivoId: r.dispositivoId, condicao: r.condicao, parametros: r.parametros, ativa: r.ativa };
}

const campo = (nome: string, msg: string) =>
  new HttpError(400, "VALIDATION_ERROR", "Corrija os campos destacados.", { [nome]: msg });

export async function handleListRegras(ctx: Contexto): Promise<Response> {
  const residenciaId = idDoPath(ctx.params[0], "Residência");
  await exigirCuidadorMembro(ctx.sessao, residenciaId);
  const lista = await db
    .select()
    .from(regrasAlerta)
    .where(eq(regrasAlerta.residenciaId, residenciaId))
    .orderBy(desc(regrasAlerta.createdAt));
  return Response.json(lista.map(regraJson));
}

/** RF-12 · condição tem de combinar com o tipo do dispositivo; parâmetros validados por condição. */
export async function handlePostRegra(ctx: Contexto): Promise<Response> {
  const residenciaId = idDoPath(ctx.params[0], "Residência");
  await exigirCuidadorMembro(ctx.sessao, residenciaId);
  const body = await lerCorpo(ctx.req, postRegraAlertaSchema);

  const [disp] = await db.select().from(dispositivos).where(eq(dispositivos.id, body.dispositivoId));
  if (!disp || disp.residenciaId !== residenciaId) {
    throw campo("dispositivoId", "Dispositivo não encontrado nesta residência.");
  }
  const tipoExigido = tipoPorCondicao[body.condicao];
  if (tipoExigido && disp.tipo !== tipoExigido) {
    throw campo("condicao", `Essa condição só vale para ${tipoExigido.replace("_", " de ")}.`);
  }
  const params = parametrosPorCondicao[body.condicao].safeParse(body.parametros);
  if (!params.success) {
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(formatZodError(params.error).error.fields ?? {})) fields[`parametros.${k}`] = v;
    throw new HttpError(400, "VALIDATION_ERROR", "Corrija os campos destacados.", fields);
  }

  const [regra] = await db
    .insert(regrasAlerta)
    .values({
      residenciaId,
      dispositivoId: disp.id,
      condicao: body.condicao,
      parametros: params.data as Record<string, unknown>,
      ativa: true,
    })
    .returning();
  if (!regra) throw new Error("falha ao criar regra");
  return Response.json(regraJson(regra), { status: 201 });
}
