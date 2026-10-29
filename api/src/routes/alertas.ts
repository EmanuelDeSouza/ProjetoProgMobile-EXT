import { desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db";
import { alertas, regrasAlerta, usuarios } from "../../db/schema";
import { patchAlertaSchema } from "../schemas";
import { exigirCuidadorMembro } from "../authz";
import { idDoPath, iso, lerCorpo, naoEncontrado } from "../http";
import type { Contexto } from "../app";

const quemReconheceu = alias(usuarios, "quem_reconheceu");

function consulta() {
  return db
    .select({
      alerta: alertas,
      condicao: regrasAlerta.condicao,
      reconhecidoPorNome: quemReconheceu.nome,
    })
    .from(alertas)
    .leftJoin(regrasAlerta, eq(alertas.regraId, regrasAlerta.id))
    .leftJoin(quemReconheceu, eq(alertas.reconhecidoPor, quemReconheceu.id));
}

type Linha = Awaited<ReturnType<ReturnType<typeof consulta>["execute"]>>[number];

function alertaJson({ alerta: a, condicao, reconhecidoPorNome }: Linha) {
  return {
    id: a.id,
    dispositivoId: a.dispositivoId,
    regraId: a.regraId,
    condicao: condicao ?? null,
    severidade: a.severidade,
    status: a.status,
    nota: a.nota,
    reconhecidoPor: reconhecidoPorNome ?? null,
    reconhecidoEm: iso(a.reconhecidoEm),
    createdAt: iso(a.createdAt),
  };
}

export async function handleListAlertas(ctx: Contexto): Promise<Response> {
  const residenciaId = idDoPath(ctx.params[0], "Residência");
  await exigirCuidadorMembro(ctx.sessao, residenciaId);
  const lista = await consulta()
    .where(eq(alertas.residenciaId, residenciaId))
    .orderBy(sql`case when ${alertas.status} = 'aberto' then 0 else 1 end`, desc(alertas.createdAt))
    .limit(200);
  return Response.json(lista.map(alertaJson));
}

/** RF-14 · reconhecer ("tudo bem") ou manter aberto com nota ("preciso de ajuda"). */
export async function handlePatchAlerta(ctx: Contexto): Promise<Response> {
  const alertaId = idDoPath(ctx.params[0], "Alerta");
  const [existente] = await db.select().from(alertas).where(eq(alertas.id, alertaId));
  if (!existente) throw naoEncontrado("Alerta");
  const usuarioId = await exigirCuidadorMembro(ctx.sessao, existente.residenciaId);
  const body = await lerCorpo(ctx.req, patchAlertaSchema);

  if (body.status === "reconhecido") {
    await db
      .update(alertas)
      .set({ status: "reconhecido", reconhecidoPor: usuarioId, reconhecidoEm: new Date(), nota: body.nota ?? existente.nota })
      .where(eq(alertas.id, alertaId));
  } else {
    await db.update(alertas).set({ nota: body.nota }).where(eq(alertas.id, alertaId));
  }
  const [linha] = await consulta().where(eq(alertas.id, alertaId));
  return Response.json(alertaJson(linha!));
}
