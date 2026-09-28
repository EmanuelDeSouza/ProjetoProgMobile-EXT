import { z } from "zod";

const configSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().default("postgres://cuidalar:cuidalar@localhost:5432/cuidalar"),
  MQTT_BROKER_URL: z.string().default("mqtt://localhost:1883"),
  JWT_SECRET: z.string().min(32).default("super-secret-jwt-key-cuidalar-dev-change-in-prod-min-32-chars"),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return configSchema.parse({
    PORT: env.PORT,
    DATABASE_URL: env.DATABASE_URL,
    MQTT_BROKER_URL: env.MQTT_BROKER_URL,
    JWT_SECRET: env.JWT_SECRET,
  });
}

export const config = loadConfig();
