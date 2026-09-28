import { eq, and, gt, desc } from "drizzle-orm";
import { db } from "../db";
import { dispositivos, eventosDispositivo } from "../../db/schema";
import {
  postPareamentoSchema,
  postComandoSchema,
  formatErrorResponse,
  formatZodError,
} from "../schemas";
import { sendCommandToDevice } from "../mqtt-listener";

export async function handlePostPareamento(
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

  const parsed = postPareamentoSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(formatZodError(parsed.error), { status: 400 });
  }

  const { codigo, tipo, nome, comodo } = parsed.data;
  const now = new Date();

  // Check if there is an existing pre-registered or active device with this pairing code
  const [existingWithCode] = await db
    .select()
    .from(dispositivos)
    .where(eq(dispositivos.codigoPareamento, codigo));

  if (existingWithCode) {
    // Check if expired (> 10 minutes)
    if (
      existingWithCode.codigoPareamentoExpiraEm &&
      existingWithCode.codigoPareamentoExpiraEm < now
    ) {
      return Response.json(
        formatErrorResponse(
          "PAIRING_CODE_EXPIRED",
          "Código expirado ou já usado. Gere um novo código no dispositivo."
        ),
        { status: 409 }
      );
    }

    // Pair this device
    const [updated] = await db
      .update(dispositivos)
      .set({
        residenciaId,
        nome,
        comodo,
        tipo,
        codigoPareamento: null,
        codigoPareamentoExpiraEm: null,
      })
      .where(eq(dispositivos.id, existingWithCode.id))
      .returning();

    if (!updated) {
      return Response.json(
        formatErrorResponse("INTERNAL_ERROR", "Falha ao atualizar dispositivo."),
        { status: 500 }
      );
    }

    return Response.json(
      {
        id: updated.id,
        tipo: updated.tipo,
        nome: updated.nome,
        comodo: updated.comodo,
        estadoAtual: updated.estadoAtual,
        status: updated.status,
        ultimoContatoEm: updated.ultimoContatoEm?.toISOString() ?? null,
      },
      { status: 201 }
    );
  }

  // Create new paired device with generated deviceKey
  const deviceKey = `dev_${crypto.randomUUID()}`;
  const [created] = await db
    .insert(dispositivos)
    .values({
      residenciaId,
      tipo,
      nome,
      comodo,
      deviceKey,
      status: "offline",
      estadoAtual: {},
      ultimoContatoEm: null,
    })
    .returning();

  if (!created) {
    return Response.json(
      formatErrorResponse("INTERNAL_ERROR", "Falha ao criar dispositivo."),
      { status: 500 }
    );
  }

  return Response.json(
    {
      id: created.id,
      tipo: created.tipo,
      nome: created.nome,
      comodo: created.comodo,
      estadoAtual: created.estadoAtual,
      status: created.status,
      ultimoContatoEm: null,
    },
    { status: 201 }
  );
}

export async function handleListDispositivos(residenciaId: string): Promise<Response> {
  const list = await db
    .select()
    .from(dispositivos)
    .where(eq(dispositivos.residenciaId, residenciaId));

  const mapped = list.map((d) => ({
    id: d.id,
    tipo: d.tipo,
    nome: d.nome,
    comodo: d.comodo,
    estadoAtual: d.estadoAtual,
    status: d.status,
    ultimoContatoEm: d.ultimoContatoEm?.toISOString() ?? null,
  }));

  return Response.json(mapped);
}

export async function handlePostComando(
  req: Request,
  dispositivoId: string
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

  const parsed = postComandoSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(formatZodError(parsed.error), { status: 400 });
  }

  const [disp] = await db
    .select()
    .from(dispositivos)
    .where(eq(dispositivos.id, dispositivoId));

  if (!disp) {
    return Response.json(
      formatErrorResponse("NOT_FOUND", "Dispositivo não encontrado."),
      { status: 404 }
    );
  }

  // RF-10: "comando para dispositivo offline é recusado antes de sair do app"
  if (disp.status === "offline") {
    return Response.json(
      formatErrorResponse(
        "DEVICE_OFFLINE",
        "Dispositivo offline, comando recusado antes de enviar."
      ),
      { status: 409 }
    );
  }

  // Publish to MQTT topic
  await sendCommandToDevice(disp.residenciaId, disp.id, parsed.data.acao);

  return new Response(null, { status: 202 });
}

export async function handleListEventosDispositivo(
  dispositivoId: string
): Promise<Response> {
  const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const eventos = await db
    .select()
    .from(eventosDispositivo)
    .where(
      and(
        eq(eventosDispositivo.dispositivoId, dispositivoId),
        gt(eventosDispositivo.createdAt, seteDiasAtras)
      )
    )
    .orderBy(desc(eventosDispositivo.createdAt))
    .limit(100);

  const mapped = eventos.map((e) => ({
    id: e.id,
    tipo: e.tipo,
    valor: e.valor,
    createdAt: e.createdAt.toISOString(),
  }));

  return Response.json(mapped);
}
