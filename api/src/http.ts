import { z } from "zod";
import { formatErrorResponse, formatZodError } from "./schemas";

/** Erro que vira resposta HTTP no formato padrão do SPEC 5.2. */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>
  ) {
    super(message);
  }

  toResponse(): Response {
    return Response.json(formatErrorResponse(this.code, this.message, this.fields), { status: this.status });
  }
}

export const naoEncontrado = (o = "Recurso") => new HttpError(404, "NOT_FOUND", `${o} não encontrado.`);
export const proibido = (msg = "Você não tem acesso a este recurso.") => new HttpError(403, "FORBIDDEN", msg);

/** Lê o corpo JSON e valida com Zod. Lança 400 INVALID_JSON ou VALIDATION_ERROR. */
export async function lerCorpo<S extends z.ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "INVALID_JSON", "O corpo da requisição deve ser um JSON válido.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const err = formatZodError(parsed.error).error;
    throw new HttpError(400, err.code, err.message, err.fields);
  }
  return parsed.data;
}

export function lerQuery<S extends z.ZodTypeAny>(url: URL, schema: S): z.infer<S> {
  const parsed = schema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    const err = formatZodError(parsed.error).error;
    throw new HttpError(400, err.code, err.message, err.fields);
  }
  return parsed.data;
}

const uuidSchema = z.string().uuid();

/** Id de path malformado é tratado como inexistente (404), nunca 500. */
export function idDoPath(valor: string | undefined, oQue = "Recurso"): string {
  if (!valor || !uuidSchema.safeParse(valor).success) throw naoEncontrado(oQue);
  return valor;
}

export function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}
