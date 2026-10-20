import { pgClient } from "../db";
import { getMqttClient } from "../mqtt-listener";

export async function handleHealth(): Promise<Response> {
  let dbOk = false;
  try {
    const result = await pgClient`SELECT 1 as ok`;
    if (result && result.length > 0) {
      dbOk = true;
    }
  } catch {
    dbOk = false;
  }

  const mqttClient = getMqttClient();
  const mqttOk = mqttClient ? mqttClient.connected : false;

  if (dbOk && mqttOk) {
    return Response.json({ status: "ok" }, { status: 200 });
  }

  return Response.json(
    {
      status: "unhealthy",
      details: {
        database: dbOk ? "ok" : "down",
        mqtt: mqttOk ? "ok" : "down",
      },
    },
    { status: 503 }
  );
}
