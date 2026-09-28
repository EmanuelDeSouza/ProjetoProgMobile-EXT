import mqtt from "mqtt";
import { config } from "./config";
import { parseMqttTopicAndPayload } from "./mqtt/parser";
import { evaluateRules } from "./rules-engine/engine";
import type {
  DispositivoRepository,
  RegraAlertaRepository,
  AlertaRepository,
  SOSRepository,
  EventoDispositivoRepository,
} from "./repositories/types";
import {
  DrizzleDispositivoRepository,
  DrizzleRegraAlertaRepository,
  DrizzleAlertaRepository,
  DrizzleSOSRepository,
  DrizzleEventoDispositivoRepository,
} from "./repositories/drizzle";
import { getDb } from "./db";

export interface MqttListenerOptions {
  brokerUrl?: string;
  dispositivoRepo?: DispositivoRepository;
  regraRepo?: RegraAlertaRepository;
  alertaRepo?: AlertaRepository;
  sosRepo?: SOSRepository;
  eventoRepo?: EventoDispositivoRepository;
}

export function startMqttListener(options: MqttListenerOptions = {}) {
  const brokerUrl = options.brokerUrl ?? config.MQTT_BROKER_URL;
  const db = getDb();
  const dispositivoRepo = options.dispositivoRepo ?? new DrizzleDispositivoRepository(db);
  const regraRepo = options.regraRepo ?? new DrizzleRegraAlertaRepository(db);
  const alertaRepo = options.alertaRepo ?? new DrizzleAlertaRepository(db);
  const sosRepo = options.sosRepo ?? new DrizzleSOSRepository(db);
  const eventoRepo = options.eventoRepo ?? new DrizzleEventoDispositivoRepository(db);

  console.log(`[MQTT Listener] Conectando ao broker em ${brokerUrl}...`);
  const client = mqtt.connect(brokerUrl);

  client.on("connect", () => {
    console.log("[MQTT Listener] Conectado com sucesso!");
    const topics = [
      "cuidalar/+/+/estado",
      "cuidalar/+/+/heartbeat",
      "cuidalar/+/+/sos",
    ];
    client.subscribe(topics, { qos: 1 }, (err) => {
      if (err) {
        console.error("[MQTT Listener] Erro ao assinar tópicos:", err);
      } else {
        console.log("[MQTT Listener] Tópicos assinados:", topics.join(", "));
      }
    });
  });

  client.on("message", async (topic, payload) => {
    try {
      const parsed = parseMqttTopicAndPayload(topic, payload);
      if (!parsed) return;

      const { residenciaId, dispositivoId, tipoMensagem, data } = parsed;
      const dispositivo = await dispositivoRepo.findById(dispositivoId);

      if (tipoMensagem === "heartbeat") {
        if (dispositivo) {
          await dispositivoRepo.updateEstado(dispositivoId, {}, "online");
        }
        return;
      }

      if (tipoMensagem === "estado") {
        await eventoRepo.createEvento({
          dispositivoId,
          tipo: "estado",
          valor: data,
        });

        if (dispositivo) {
          await dispositivoRepo.updateEstado(dispositivoId, data, "online");

          // Executa motor de regras (RF-13)
          const regras = await regraRepo.listByResidenciaId(residenciaId);
          const alertasAbertos = await alertaRepo.listAbertos(residenciaId);

          const novosAlertas = evaluateRules({
            dispositivo: {
              ...dispositivo,
              estadoAtual: { ...dispositivo.estadoAtual, ...data },
              status: "online",
            },
            evento: data,
            regras,
            alertasAbertos,
          });

          for (const novoAlerta of novosAlertas) {
            await alertaRepo.createAlerta({
              residenciaId: novoAlerta.residenciaId,
              regraId: novoAlerta.regraId,
              dispositivoId: novoAlerta.dispositivoId,
              severidade: novoAlerta.severidade,
            });
            console.log(
              `[Motor de Regras] Alerta gerado: ${novoAlerta.severidade} para dispositivo ${dispositivoId}`
            );
          }
        }
        return;
      }

      if (tipoMensagem === "sos") {
        await eventoRepo.createEvento({
          dispositivoId,
          tipo: "sos",
          valor: data,
        });

        if (dispositivo) {
          await dispositivoRepo.updateEstado(dispositivoId, {}, "online");
        }

        // SOS físico direto (RF-15)
        await sosRepo.createSOS({
          residenciaId,
          moradorId: null,
          origem: "botao_fisico",
        });

        await alertaRepo.createAlerta({
          residenciaId,
          dispositivoId,
          regraId: null,
          severidade: "alta",
        });

        console.log(`[MQTT Listener] SOS físico registrado para residência ${residenciaId}!`);
      }
    } catch (err) {
      console.error("[MQTT Listener] Erro ao processar mensagem MQTT:", err);
    }
  });

  client.on("error", (err) => {
    console.error("[MQTT Listener] Erro de conexão MQTT:", err.message);
  });

  return client;
}

if (import.meta.main) {
  startMqttListener();
}
