import { z } from "zod";

const DEV_JWT = "dev-only-jwt-secret-cuidalar-troque-em-producao-32+";

const configSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.string().default("postgres://cuidalar:cuidalar@localhost:5432/cuidalar"),
    JWT_SECRET: z.string().min(32).default(DEV_JWT),

    MQTT_BROKER_URL: z.string().default("mqtt://localhost:1883"),
    // Usuário da API no broker (admin do plugin dynamic security). Ver mosquitto/README.md.
    MQTT_USERNAME: z.string().default("cuidalar-api"),
    MQTT_PASSWORD: z.string().default("cuidalar-dev"),
    // Usuário compartilhado que o firmware usa só para anunciar o código de pareamento.
    MQTT_PROVISIONING_USERNAME: z.string().default("provisionamento"),
    MQTT_PROVISIONING_PASSWORD: z.string().default("provisionamento-dev"),
    // "true" (padrão): API cria/atualiza usuários e ACLs no broker (Mosquitto dynamic security).
    MQTT_DYNSEC: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),

    // Client IDs OAuth do Google aceitos como "aud" do ID token, separados por vírgula.
    GOOGLE_CLIENT_IDS: z
      .string()
      .default("")
      .transform((v) =>
        v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      ),

    // Fuso usado nas regras de horário (RF-12).
    APP_TIMEZONE: z.string().default("America/Sao_Paulo"),
    MOCK_PUSH: z.string().optional(),
  })
  .superRefine((c, ctx) => {
    if (c.NODE_ENV === "production" && c.JWT_SECRET === DEV_JWT) {
      ctx.addIssue({ code: "custom", path: ["JWT_SECRET"], message: "defina JWT_SECRET em produção" });
    }
    try {
      new Intl.DateTimeFormat("en-GB", { timeZone: c.APP_TIMEZONE });
    } catch {
      ctx.addIssue({ code: "custom", path: ["APP_TIMEZONE"], message: "fuso horário inválido" });
    }
  });

export const config = configSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  MQTT_BROKER_URL: process.env.MQTT_BROKER_URL,
  MQTT_USERNAME: process.env.MQTT_USERNAME,
  MQTT_PASSWORD: process.env.MQTT_PASSWORD,
  MQTT_PROVISIONING_USERNAME: process.env.MQTT_PROVISIONING_USERNAME,
  MQTT_PROVISIONING_PASSWORD: process.env.MQTT_PROVISIONING_PASSWORD,
  MQTT_DYNSEC: process.env.MQTT_DYNSEC,
  GOOGLE_CLIENT_IDS: process.env.GOOGLE_CLIENT_IDS,
  APP_TIMEZONE: process.env.APP_TIMEZONE,
  MOCK_PUSH: process.env.MOCK_PUSH,
});

export type Config = z.infer<typeof configSchema>;
