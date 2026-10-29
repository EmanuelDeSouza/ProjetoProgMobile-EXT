import { z } from "zod";
import { tipoDispositivoEnum, condicaoRegraEnum, type CondicaoRegra, type TipoDispositivo } from "../db/schema";

const email = z
  .string({ required_error: "obrigatório" })
  .trim()
  .email("E-mail inválido")
  .transform((v) => v.toLowerCase());
const senha = z.string({ required_error: "obrigatório" }).min(6, "Mínimo de 6 caracteres");
const nome = z.string({ required_error: "obrigatório" }).trim().min(1, "Nome é obrigatório").max(120);

export const postAuthSchema = z.discriminatedUnion("metodo", [
  z.object({ metodo: z.literal("senha"), email, senha }),
  z.object({ metodo: z.literal("google"), idToken: z.string().min(10, "idToken é obrigatório") }),
]);

export const postUsuarioSchema = z.object({ nome, email, senha });

export const postResidenciaSchema = z.object({
  nome,
  enderecoCurto: z.string().trim().max(120).optional(),
});

export const postConviteSchema = z.object({ email });

export const patchConviteSchema = z.object({
  status: z.literal("aceito"),
});

const pin = z.string({ required_error: "obrigatório" }).regex(/^[0-9]{4}$/, "PIN deve conter exatamente 4 dígitos");

export const postMoradorSchema = z.object({ nome, pin });

export const postLoginPinSchema = z.object({
  moradorId: z.string().uuid("ID de morador inválido"),
  pin,
});

export const postPareamentoSchema = z.object({
  codigo: z.string().regex(/^[0-9]{6}$/, "Código deve conter 6 dígitos"),
  tipo: z.enum(tipoDispositivoEnum, { errorMap: () => ({ message: "Tipo de dispositivo não suportado na V1" }) }),
  nome,
  comodo: z.string().trim().min(1, "Cômodo é obrigatório").max(60),
});

export const postComandoSchema = z.object({
  acao: z.enum(["ligar", "desligar"], { errorMap: () => ({ message: "Ação deve ser ligar ou desligar" }) }),
});

export const postRegraAlertaSchema = z.object({
  dispositivoId: z.string().uuid("ID de dispositivo inválido"),
  condicao: z.enum(condicaoRegraEnum),
  parametros: z.record(z.unknown()),
});

const horaMinuto = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "Use HH:MM (00:00 a 23:59)");

/** Parâmetros aceitos por condição (RF-12). */
export const parametrosPorCondicao = {
  sem_movimento_por: z.object({ horas: z.number().min(0.25, "Mínimo 0,25 h").max(48, "Máximo 48 h") }).strict(),
  contato_aberto_apos_horario: z
    .object({ horario: horaMinuto, horarioFim: horaMinuto.default("06:00") })
    .strict()
    .refine((p) => p.horario !== p.horarioFim, { message: "Início e fim não podem ser iguais", path: ["horarioFim"] }),
  temperatura_fora_da_faixa: z
    .object({ min: z.number().min(-20).max(60), max: z.number().min(-20).max(60) })
    .strict()
    .refine((p) => p.min < p.max, { message: "min deve ser menor que max", path: ["max"] }),
  dispositivo_offline: z.object({}).strict(),
} satisfies Record<CondicaoRegra, z.ZodTypeAny>;

/** Tipo de dispositivo exigido por condição (null = qualquer tipo). */
export const tipoPorCondicao: Record<CondicaoRegra, TipoDispositivo | null> = {
  sem_movimento_por: "sensor_presenca",
  contato_aberto_apos_horario: "sensor_contato",
  temperatura_fora_da_faixa: "sensor_temperatura",
  dispositivo_offline: null,
};

export const patchAlertaSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("reconhecido"), nota: z.string().trim().max(500).optional() }),
  z.object({ status: z.literal("aberto"), nota: z.string().trim().min(1, "Descreva o que precisa").max(500) }),
]);

export const postSOSSchema = z.object({
  moradorId: z.string().uuid("ID de morador inválido"),
});

export const patchSOSSchema = z.object({
  status: z.enum(["cancelado_pelo_morador", "reconhecido"]),
});

export const patchNotificacaoSchema = z.object({
  lida: z.boolean(),
});

export const listNotificacoesQuery = z.object({
  limite: z.coerce.number().int().min(1).max(100).default(30),
  antes: z.string().datetime({ offset: true }).optional(),
});

export const postPushTokenSchema = z.object({
  pushToken: z.string().trim().min(1, "pushToken é obrigatório").max(200),
});

// ---------- Payloads MQTT (SPEC 6.3) ----------

export const estadoPorTipo = {
  sensor_presenca: z.object({ presenca: z.boolean() }).strict(),
  sensor_contato: z.object({ contato: z.enum(["aberto", "fechado"]) }).strict(),
  sensor_temperatura: z
    .object({ temperatura: z.number().min(-40).max(85), umidade: z.number().min(0).max(100).optional() })
    .strict(),
  atuador_tomada: z.object({ tomada: z.enum(["ligada", "desligada"]) }).strict(),
  botao_sos: z.object({ emergencia: z.boolean() }).passthrough(),
} satisfies Record<TipoDispositivo, z.ZodTypeAny>;

export const sosPayloadSchema = z.object({ emergencia: z.literal(true) }).passthrough();

export const anuncioPareamentoSchema = z.object({
  tipo: z.enum(tipoDispositivoEnum),
  chave: z.string().regex(/^[0-9a-f]{64}$/i, "chave = 32 bytes em hex"),
});

// ---------- Erro padrão (SPEC 5.2) ----------

export function formatErrorResponse(code: string, message: string, fields?: Record<string, string>) {
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
    if (!fields[fieldName]) fields[fieldName] = issue.message;
  }
  return formatErrorResponse("VALIDATION_ERROR", "Corrija os campos destacados.", fields);
}
