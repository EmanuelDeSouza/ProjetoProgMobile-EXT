import { pgClient } from "../db";
import { mqttPronto } from "../mqtt-listener";

/** 200 só se Postgres e o broker respondem (AGENTS.md). */
export async function handleHealth(): Promise<Response> {
  let dbOk = false;
  try {
    const result = await pgClient`SELECT 1 as ok`;
    dbOk = result.length > 0;
  } catch {
    dbOk = false;
  }
  const mqttOk = mqttPronto();
  if (dbOk && mqttOk) return Response.json({ status: "ok" });
  return Response.json(
    { status: "unhealthy", details: { database: dbOk ? "ok" : "down", mqtt: mqttOk ? "ok" : "down" } },
    { status: 503 }
  );
}
