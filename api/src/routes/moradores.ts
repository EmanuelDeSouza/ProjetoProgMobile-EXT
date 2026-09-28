import { eq } from "drizzle-orm";
import { db } from "../db";
import { moradores } from "../../db/schema";
import {
  postMoradorSchema,
  postLoginPinSchema,
  formatErrorResponse,
  formatZodError,
} from "../schemas";
import { hashPin, verifyPin, signToken, type TokenPayloadMorador } from "../auth";

export async function handlePostMorador(
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

  const parsed = postMoradorSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(formatZodError(parsed.error), { status: 400 });
  }

  const hashedPin = await hashPin(parsed.data.pin);

  const [morador] = await db
    .insert(moradores)
    .values({
      residenciaId,
      nome: parsed.data.nome,
      pinHash: hashedPin,
    })
    .returning();

  if (!morador) {
    return Response.json(
      formatErrorResponse("INTERNAL_ERROR", "Falha ao criar morador."),
      { status: 500 }
    );
  }

  return Response.json(
    {
      id: morador.id,
      nome: morador.nome,
      residenciaId: morador.residenciaId,
    },
    { status: 201 }
  );
}

export async function handlePostLoginPin(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      formatErrorResponse("INVALID_JSON", "O corpo da requisição deve ser um JSON válido."),
      { status: 400 }
    );
  }

  const parsed = postLoginPinSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(formatZodError(parsed.error), { status: 400 });
  }

  const { moradorId, pin } = parsed.data;

  const [morador] = await db.select().from(moradores).where(eq(moradores.id, moradorId));
  if (!morador) {
    return Response.json(
      formatErrorResponse("INVALID_PIN", "PIN incorreto. Tente de novo."),
      { status: 401 }
    );
  }

  const now = new Date();

  // RNF-08: Check temporary block
  if (morador.bloqueadoAte && morador.bloqueadoAte > now) {
    return Response.json(
      formatErrorResponse(
        "RATE_LIMITED",
        "Bloqueado temporariamente por tentativas erradas. Tente novamente mais tarde."
      ),
      { status: 429 }
    );
  }

  const pinMatches = await verifyPin(pin, morador.pinHash);

  if (!pinMatches) {
    const novasTentativas = morador.tentativasErradas + 1;
    if (novasTentativas >= 5) {
      // Bloqueio por 10 minutos
      const bloqueio = new Date(now.getTime() + 10 * 60 * 1000);
      await db
        .update(moradores)
        .set({
          tentativasErradas: novasTentativas,
          bloqueadoAte: bloqueio,
        })
        .where(eq(moradores.id, moradorId));

      return Response.json(
        formatErrorResponse(
          "RATE_LIMITED",
          "Bloqueado temporariamente por tentativas erradas."
        ),
        { status: 429 }
      );
    }

    await db
      .update(moradores)
      .set({
        tentativasErradas: novasTentativas,
      })
      .where(eq(moradores.id, moradorId));

    return Response.json(
      formatErrorResponse("INVALID_PIN", "PIN incorreto. Tente de novo."),
      { status: 401 }
    );
  }

  // Success - reset attempts
  await db
    .update(moradores)
    .set({
      tentativasErradas: 0,
      bloqueadoAte: null,
    })
    .where(eq(moradores.id, moradorId));

  const tokenPayload: TokenPayloadMorador = {
    sub: morador.id,
    residenciaId: morador.residenciaId,
    papel: "morador",
  };
  const token = await signToken(tokenPayload);

  return Response.json({
    token,
    morador: {
      id: morador.id,
      nome: morador.nome,
      residenciaId: morador.residenciaId,
    },
  });
}
