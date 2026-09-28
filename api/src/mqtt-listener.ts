import mqtt, { type MqttClient } from "mqtt";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { config } from "./config";
import { dispositivos, eventosDispositivo, sosEventos } from "../db/schema";
import { evaluateDeviceEvent, notifyCaregivers, runPeriodicRuleChecks } from "./rules-engine";

let client: MqttClient | null = null;
let periodicTimer: ReturnType<typeof setInterval> | null = null;

export function getMqttClient(): MqttClient | null {
  return client;
}

export async function handleMqttMessage(topic: string, messageBuffer: Buffer) {
  const parts = topic.split("/");
  if (parts.length !== 4 || parts[0] !== "cuidalar") {
    return;
  }

  const [, residenciaId, dispositivoId, action] = parts;
  if (!residenciaId || !dispositivoId || !action) {
    return;
  }

  let payload: Record<string, unknown> = {};
  try {
    const raw = messageBuffer.toString("utf-8").trim();
    if (raw) {
      payload = JSON.parse(raw);
    }
  } catch (err) {
    console.error(`Payload inválido no tópico ${topic}:`, err);
    return;
  }

  const now = new Date();

  if (action === "heartbeat") {
    await db
      .update(dispositivos)
      .set({
        status: "online",
        ultimoContatoEm: now,
      })
      .where(eq(dispositivos.id, dispositivoId));
    return;
  }

  if (action === "estado") {
    // 1. Grava no histórico de eventos
    const tipoEvento = Object.keys(payload)[0] || "estado";
    await db.insert(eventosDispositivo).values({
      dispositivoId,
      tipo: tipoEvento,
      valor: payload,
    });

    // 2. Atualiza estado atual e status
    await db
      .update(dispositivos)
      .set({
        estadoAtual: payload,
        status: "online",
        ultimoContatoEm: now,
      })
      .where(eq(dispositivos.id, dispositivoId));

    // 3. Roda motor de regras
    await evaluateDeviceEvent(dispositivoId, residenciaId, payload);
    return;
  }

  if (action === "sos") {
    // SOS vindo de botão físico via MQTT (QoS 1)
    const [sosCreated] = await db
      .insert(sosEventos)
      .values({
        residenciaId,
        moradorId: null,
        origem: "botao_fisico",
        status: "aberto",
      })
      .returning();

    if (sosCreated) {
      await notifyCaregivers(residenciaId, "sos", sosCreated.id);
    }
  }
}

export function startMqttListener(): MqttClient {
  if (client) {
    return client;
  }

  client = mqtt.connect(config.MQTT_BROKER_URL, {
    reconnectPeriod: 3000,
    connectTimeout: 5000,
  });

  client.on("connect", () => {
    console.log("[MQTT] Conectado ao broker:", config.MQTT_BROKER_URL);
    client?.subscribe(
      ["cuidalar/+/+/estado", "cuidalar/+/+/heartbeat", "cuidalar/+/+/sos"],
      { qos: 1 },
      (err) => {
        if (err) {
          console.error("[MQTT] Erro ao assinar tópicos:", err);
        } else {
          console.log("[MQTT] Tópicos de telemetria assinados com sucesso.");
        }
      }
    );
  });

  client.on("message", (topic, message) => {
    handleMqttMessage(topic, message).catch((err) => {
      console.error(`[MQTT] Erro ao processar mensagem do tópico ${topic}:`, err);
    });
  });

  client.on("error", (err) => {
    console.error("[MQTT] Erro no cliente:", err);
  });

  // Background timer for offline detection & periodic rule evaluation (RF-08, RF-13, RNF-13)
  periodicTimer = setInterval(() => {
    runPeriodicRuleChecks().catch((err) => {
      console.error("[Rules] Erro no timer periódico de regras:", err);
    });
  }, 60 * 1000);

  return client;
}

export async function sendCommandToDevice(
  residenciaId: string,
  dispositivoId: string,
  acao: string
): Promise<boolean> {
  if (!client || !client.connected) {
    // If not connected, try to connect or return false
    return false;
  }

  const topic = `cuidalar/${residenciaId}/${dispositivoId}/comando`;
  const payload = JSON.stringify({ acao });

  return new Promise((resolve) => {
    client!.publish(topic, payload, { qos: 1 }, (err) => {
      if (err) {
        console.error(`[MQTT] Erro ao enviar comando para ${topic}:`, err);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

export function stopMqttListener() {
  if (periodicTimer) {
    clearInterval(periodicTimer);
    periodicTimer = null;
  }
  if (client) {
    client.end(true);
    client = null;
  }
}
