import { z } from "zod";
import { tipoDispositivoEnum, condicaoRegraEnum } from "../db/schema";

export const postAuthSchema = z
  .object({
    metodo: z.enum(["senha", "google"]),
    email: z.string().email().optional(),
    senha: z.string().min(6).optional(),
    idToken: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.metodo === "senha") {
        return Boolean(data.email && data.senha);
      }
      if (data.metodo === "google") {
        return Boolean(data.idToken);
      }
      return false;
    },
    {
      message: "Campos obrigatórios não fornecidos para o método de login escolhido.",
      path: ["metodo"],
    }
  );

export const postResidenciaSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  enderecoCurto: z.string().optional(),
});

export const postConviteSchema = z.object({
  email: z.string().email("E-mail inválido"),
});

export const patchConviteSchema = z.object({
  status: z.enum(["aceito"]),
});

export const postMoradorSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  pin: z.string().regex(/^[0-9]{4}$/, "PIN deve conter exatamente 4 dígitos"),
});

export const postLoginPinSchema = z.object({
  moradorId: z.string().uuid("ID de morador inválido"),
  pin: z.string().regex(/^[0-9]{4}$/, "PIN deve conter exatamente 4 dígitos"),
});

export const postPareamentoSchema = z.object({
  codigo: z.string().min(6).max(6, "Código deve conter 6 dígitos"),
  tipo: z.enum(tipoDispositivoEnum),
  nome: z.string().min(1, "Nome é obrigatório"),
  comodo: z.string().min(1, "Cômodo é obrigatório"),
});

export const postComandoSchema = z.object({
  acao: z.string().min(1, "Ação é obrigatória"),
});

export const postRegraAlertaSchema = z.object({
  dispositivoId: z.string().uuid("ID de dispositivo inválido"),
  condicao: z.enum(condicaoRegraEnum),
  parametros: z.record(z.unknown()),
});

export const patchAlertaSchema = z.object({
  status: z.enum(["reconhecido"]),
  nota: z.string().optional(),
});

export const postSOSSchema = z.object({
  moradorId: z.string().uuid("ID de morador inválido"),
});

export const patchSOSSchema = z.object({
  status: z.enum(["cancelado_pelo_morador"]),
});

export const patchNotificacaoSchema = z.object({
  lida: z.boolean().optional(),
});

// Helper for formatting standard errors according to Section 5.2
export function formatErrorResponse(
  code: string,
  message: string,
  fields?: Record<string, string>
) {
  return {
    error: {
      code,
      message,
      ...(fields ? { fields } : {}),
    },
  };
}

export function formatZodError(error: z.ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const fieldName = issue.path.join(".") || "geral";
    fields[fieldName] = issue.message;
  }
  return formatErrorResponse("VALIDATION_ERROR", "Corrija os campos destacados.", fields);
}
