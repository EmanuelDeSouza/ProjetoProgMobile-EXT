import { z } from "zod";

const configSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().default("postgres://cuidalar:cuidalar@localhost:5432/cuidalar"),
  MQTT_BROKER_URL: z.string().default("mqtt://localhost:1883"),
  JWT_SECRET: z.string().min(32).default("super-secret-jwt-key-cuidalar-dev-change-in-prod-min-32-chars"),
});

export const config = configSchema.parse({
  PORT: process.env.PORT,
  DATABASE_URL: process.env.DATABASE_URL,
  MQTT_BROKER_URL: process.env.MQTT_BROKER_URL,
  JWT_SECRET: process.env.JWT_SECRET,
});

export type Config = z.infer<typeof configSchema>;
