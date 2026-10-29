// Validação das respostas HTTP (AGENTS.md: Zod no app). Espelha contract/openapi.yaml —
// não compartilha pacote com a API de propósito: o contrato comum é o OpenAPI.
import { z } from "zod";

export const tipoDispositivo = z.enum([
  "sensor_presenca",
  "sensor_contato",
  "sensor_temperatura",
  "atuador_tomada",
  "botao_sos",
]);
export const condicaoRegra = z.enum([
  "sem_movimento_por",
  "contato_aberto_apos_horario",
  "temperatura_fora_da_faixa",
  "dispositivo_offline",
]);

export const usuario = z.object({ id: z.string(), nome: z.string(), email: z.string() });
export const sessaoCuidador = z.object({ token: z.string(), usuario });

export const residencia = z.object({
  id: z.string(),
  nome: z.string(),
  enderecoCurto: z.string().nullable().optional(),
});
export const residenciaComPapel = residencia.extend({ papel: z.enum(["dono", "cuidador"]) });

export const convite = z.object({
  id: z.string(),
  residenciaId: z.string(),
  email: z.string(),
  status: z.enum(["pendente", "aceito"]),
  createdAt: z.string(),
});

export const morador = z.object({ id: z.string(), nome: z.string(), residenciaId: z.string() });
export const sessaoMorador = z.object({ token: z.string(), morador });

export const dispositivo = z.object({
  id: z.string(),
  tipo: tipoDispositivo,
  nome: z.string(),
  comodo: z.string(),
  estadoAtual: z.record(z.unknown()),
  status: z.enum(["online", "offline"]),
  ultimoContatoEm: z.string().nullable().optional(),
});

export const eventoDispositivo = z.object({
  id: z.string(),
  tipo: z.string(),
  valor: z.record(z.unknown()),
  createdAt: z.string(),
});

export const regraAlerta = z.object({
  id: z.string(),
  dispositivoId: z.string(),
  condicao: condicaoRegra,
  parametros: z.record(z.unknown()),
  ativa: z.boolean(),
});

export const alerta = z.object({
  id: z.string(),
  dispositivoId: z.string().nullable(),
  regraId: z.string().nullable(),
  condicao: condicaoRegra.nullable(),
  severidade: z.enum(["baixa", "media", "alta"]),
  status: z.enum(["aberto", "reconhecido"]),
  nota: z.string().nullable(),
  reconhecidoPor: z.string().nullable(),
  reconhecidoEm: z.string().nullable(),
  createdAt: z.string(),
});

export const sosEvento = z.object({
  id: z.string(),
  moradorId: z.string().nullable(),
  dispositivoId: z.string().nullable().optional(),
  origem: z.enum(["app", "botao_fisico"]),
  status: z.enum(["aberto", "cancelado_pelo_morador", "reconhecido"]),
  reconhecidoPor: z.string().nullable().optional(),
  reconhecidoEm: z.string().nullable().optional(),
  createdAt: z.string(),
});

export const notificacao = z.object({
  id: z.string(),
  tipo: z.enum(["alerta", "sos", "sos_cancelado", "convite"]),
  alvoId: z.string(),
  residenciaId: z.string().nullable(),
  titulo: z.string(),
  mensagem: z.string(),
  lidaEm: z.string().nullable(),
  createdAt: z.string(),
});

export const apiErro = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    fields: z.record(z.string()).optional(),
  }),
});

// ---------- Formulários (validação antes de enviar) ----------

export const formLogin = z.object({
  email: z.string().trim().email("Informe um e-mail válido."),
  senha: z.string().min(6, "A senha tem pelo menos 6 caracteres."),
});

export const formCadastro = formLogin.extend({
  nome: z.string().trim().min(1, "Informe seu nome."),
});

export const formMorador = z.object({
  nome: z.string().trim().min(1, "Informe o nome do morador."),
  pin: z.string().regex(/^[0-9]{4}$/, "O PIN deve ter exatamente 4 números."),
});

export const formPareamento = z.object({
  codigo: z.string().regex(/^[0-9]{6}$/, "O código tem 6 números."),
  tipo: tipoDispositivo,
  nome: z.string().trim().min(1, "Dê um nome ao dispositivo."),
  comodo: z.string().trim().min(1, "Informe o cômodo."),
});

export const formResidencia = z.object({
  nome: z.string().trim().min(1, "Informe o nome da residência."),
  enderecoCurto: z.string().trim().optional(),
});

export const formConvite = z.object({
  email: z.string().trim().email("Informe um e-mail válido."),
});

const horaMinuto = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "Use o formato HH:MM.");
export const parametrosRegra = {
  sem_movimento_por: z.object({
    horas: z.number({ invalid_type_error: "Informe as horas." }).min(0.25, "Mínimo 0,25 h.").max(48, "Máximo 48 h."),
  }),
  contato_aberto_apos_horario: z
    .object({ horario: horaMinuto, horarioFim: horaMinuto })
    .refine((p) => p.horario !== p.horarioFim, "Início e fim não podem ser iguais."),
  temperatura_fora_da_faixa: z
    .object({
      min: z.number({ invalid_type_error: "Informe a mínima." }),
      max: z.number({ invalid_type_error: "Informe a máxima." }),
    })
    .refine((p) => p.min < p.max, "A mínima tem de ser menor que a máxima."),
  dispositivo_offline: z.object({}),
} as const;

/** Primeira mensagem de erro de um parse Zod, para mostrar no formulário. */
export function primeiroErro(e: z.ZodError): string {
  return e.issues[0]?.message ?? "Verifique os campos.";
}
