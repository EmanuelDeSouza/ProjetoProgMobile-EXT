import { randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull, ne } from "drizzle-orm";
import { db } from "../db";
import { dispositivos, eventosDispositivo, pareamentos, type Dispositivo } from "../../db/schema";
import { postComandoSchema, postPareamentoSchema } from "../schemas";
import { carregarDispositivo, exigirAcessoResidencia, exigirCuidadorMembro } from "../authz";
import { HttpError, idDoPath, iso, lerCorpo } from "../http";
import {
  mqttPronto,
  publicarCredenciais,
  sendCommandToDevice,
  sincronizarCredencialDispositivo,
} from "../mqtt-listener";
import type { Contexto } from "../app";

export function dispositivoJson(d: Dispositivo) {
  return {
    id: d.id,
    tipo: d.tipo,
    nome: d.nome,
    comodo: d.comodo,
    estadoAtual: d.estadoAtual,
    status: d.status,
    ultimoContatoEm: iso(d.ultimoContatoEm),
  };
}

const brokerFora = () =>
  new HttpError(503, "BROKER_UNAVAILABLE", "Não foi possível falar com os dispositivos agora. Tente de novo.");

const codigoInvalido = () =>
  new HttpError(409, "PAIRING_CODE_INVALID", "Código expirado ou já usado. Gere um novo código no dispositivo.");

/** RF-07 · pareia com o código que o firmware anunciou pelo MQTT (SPEC 6.3). */
export async function handlePostPareamento(ctx: Contexto): Promise<Response> {
  const residenciaId = idDoPath(ctx.params[0], "Residência");
  await exigirCuidadorMembro(ctx.sessao, residenciaId);
  const body = await lerCorpo(ctx.req, postPareamentoSchema);
  if (!mqttPronto()) throw brokerFora();

  const agora = new Date();
  const [p] = await db
    .select()
    .from(pareamentos)
    .where(and(eq(pareamentos.codigo, body.codigo), isNull(pareamentos.usadoEm), gt(pareamentos.expiraEm, agora)))
    .orderBy(desc(pareamentos.createdAt))
    .limit(1);
  if (!p || p.conflito) throw codigoInvalido();
  if (p.tipo !== body.tipo) {
    throw new HttpError(400, "VALIDATION_ERROR", "Corrija os campos destacados.", {
      tipo: `Este dispositivo se apresentou como ${p.tipo.replace("_", " ")}.`,
    });
  }

  const deviceKey = randomBytes(24).toString("hex");
  const criado = await db.transaction(async (tx) => {
    // marca o código como usado primeiro: duas requisições simultâneas não pareiam duas vezes
    const [marcado] = await tx
      .update(pareamentos)
      .set({ usadoEm: agora })
      .where(and(eq(pareamentos.id, p.id), isNull(pareamentos.usadoEm)))
      .returning();
    if (!marcado) throw codigoInvalido();
    const [d] = await tx
      .insert(dispositivos)
      .values({
        residenciaId,
        tipo: body.tipo,
        nome: body.nome,
        comodo: body.comodo,
        deviceKey,
        status: "offline",
        estadoAtual: {},
      })
      .returning();
    if (!d) throw new Error("falha ao criar dispositivo");
    await tx.update(pareamentos).set({ dispositivoId: d.id }).where(eq(pareamentos.id, p.id));
    try {
      await sincronizarCredencialDispositivo(d); // usuário MQTT no broker antes de confirmar
    } catch {
      throw brokerFora(); // desfaz tudo: código continua válido para tentar de novo
    }
    return d;
  });

  const enviado = await publicarCredenciais(body.codigo, p.chave, {
    residenciaId,
    dispositivoId: criado.id,
    deviceKey,
  });
  if (!enviado) console.error(`[pareamento] credencial de ${criado.id} não publicada; o firmware vai reanunciar.`);
  return Response.json(dispositivoJson(criado), { status: 201 });
}

/** RF-09 · painel: cuidador membro ou morador da casa. */
export async function handleListDispositivos(ctx: Contexto): Promise<Response> {
  const residenciaId = idDoPath(ctx.params[0], "Residência");
  await exigirAcessoResidencia(ctx.sessao, residenciaId);
  const lista = await db
    .select()
    .from(dispositivos)
    .where(eq(dispositivos.residenciaId, residenciaId))
    .orderBy(dispositivos.comodo, dispositivos.nome);
  return Response.json(lista.map(dispositivoJson));
}

/** RF-10 · 202 = publicado. Sucesso para a pessoa só quando o estado confirmado chega. */
export async function handlePostComando(ctx: Contexto): Promise<Response> {
  const dispositivoId = idDoPath(ctx.params[0], "Dispositivo");
  const disp = await carregarDispositivo(dispositivoId);
  await exigirAcessoResidencia(ctx.sessao, disp.residenciaId);
  const { acao } = await lerCorpo(ctx.req, postComandoSchema);

  if (disp.tipo !== "atuador_tomada") {
    throw new HttpError(400, "DEVICE_NOT_ACTUATOR", "Este dispositivo não aceita comandos.");
  }
  if (disp.status === "offline") {
    throw new HttpError(409, "DEVICE_OFFLINE", "Dispositivo offline, comando recusado antes de enviar.");
  }
  if (!(await sendCommandToDevice(disp.residenciaId, disp.id, acao))) throw brokerFora();
  return new Response(null, { status: 202 });
}

/** RF-18 · últimos 7 dias, sem heartbeat (heartbeat nem é gravado como evento). */
export async function handleListEventosDispositivo(ctx: Contexto): Promise<Response> {
  const dispositivoId = idDoPath(ctx.params[0], "Dispositivo");
  const disp = await carregarDispositivo(dispositivoId);
  await exigirCuidadorMembro(ctx.sessao, disp.residenciaId);

  const seteDiasAtras = new Date(Date.now() - 7 * 24 * 3600_000);
  const eventos = await db
    .select()
    .from(eventosDispositivo)
    .where(
      and(
        eq(eventosDispositivo.dispositivoId, dispositivoId),
        gt(eventosDispositivo.createdAt, seteDiasAtras),
        ne(eventosDispositivo.tipo, "heartbeat")
      )
    )
    .orderBy(desc(eventosDispositivo.createdAt))
    .limit(200);

  return Response.json(
    eventos.map((e) => ({ id: e.id, tipo: e.tipo, valor: e.valor, createdAt: iso(e.createdAt) }))
  );
}
