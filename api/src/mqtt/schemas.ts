import { z } from "zod";

export const tipoDispositivoZod = z.enum([
  "sensor_presenca",
  "sensor_contato",
  "sensor_temperatura",
  "atuador_tomada",
  "botao_sos",
]);

export type TipoDispositivo = z.infer<typeof tipoDispositivoZod>;

export const sensorPresencaPayloadSchema = z.object({
  presenca: z.boolean(),
});

export const sensorContatoPayloadSchema = z.object({
  contato: z.enum(["aberto", "fechado"]),
});

export const sensorTemperaturaPayloadSchema = z.object({
  temperatura: z.number(),
  umidade: z.number().optional(),
});

export const atuadorTomadaPayloadSchema = z.object({
  tomada: z.enum(["ligada", "desligada"]),
});

export const botaoSosPayloadSchema = z.object({
  sos: z.literal(true),
});

export const heartbeatPayloadSchema = z.object({
  status: z.string().default("online"),
  bateria: z.number().optional(),
  uptime: z.number().optional(),
});

export const comandoPayloadSchema = z.object({
  comando: z.string(),
  valor: z.record(z.unknown()),
});
