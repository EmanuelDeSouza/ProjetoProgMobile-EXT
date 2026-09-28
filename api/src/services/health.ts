import mqtt from "mqtt";
import postgres from "postgres";
import { config } from "../config";

export interface HealthStatus {
  postgres: boolean;
  mqtt: boolean;
}

export async function checkPostgresHealth(databaseUrl: string = config.DATABASE_URL): Promise<boolean> {
  let sql: postgres.Sql | null = null;
  try {
    sql = postgres(databaseUrl, {
      max: 1,
      connect_timeout: 2,
    });
    const result = await sql`SELECT 1 as ok`;
    return result.length > 0;
  } catch {
    return false;
  } finally {
    if (sql) {
      await sql.end({ timeout: 1 }).catch(() => {});
    }
  }
}

export async function checkMqttHealth(brokerUrl: string = config.MQTT_BROKER_URL): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let client: mqtt.MqttClient | null = null;
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        if (client) {
          client.end(true);
        }
        resolve(false);
      }
    }, 2000);

    try {
      client = mqtt.connect(brokerUrl, {
        connectTimeout: 2000,
        reconnectPeriod: 0,
      });

      client.on("connect", () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          client?.end(false, () => resolve(true));
        }
      });

      client.on("error", () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          client?.end(true);
          resolve(false);
        }
      });
    } catch {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve(false);
      }
    }
  });
}

export async function checkSystemHealth(
  databaseUrl: string = config.DATABASE_URL,
  brokerUrl: string = config.MQTT_BROKER_URL
): Promise<HealthStatus> {
  const [postgresOk, mqttOk] = await Promise.all([
    checkPostgresHealth(databaseUrl),
    checkMqttHealth(brokerUrl),
  ]);

  return {
    postgres: postgresOk,
    mqtt: mqttOk,
  };
}
