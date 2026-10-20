import mqtt from "mqtt";
import { config } from "../src/config";

interface DeviceSimulatorConfig {
  residenciaId: string;
  dispositivoId: string;
  tipo: "sensor_presenca" | "sensor_contato" | "sensor_temperatura" | "atuador_tomada" | "botao_sos";
  nome: string;
}

const DEFAULT_RESIDENCIA_ID = process.env.SIM_RESIDENCIA_ID || "00000000-0000-0000-0000-000000000001";

const devices: DeviceSimulatorConfig[] = [
  {
    residenciaId: DEFAULT_RESIDENCIA_ID,
    dispositivoId: "10000000-0000-0000-0000-000000000001",
    tipo: "sensor_presenca",
    nome: "Sensor de Movimento (Quarto)",
  },
  {
    residenciaId: DEFAULT_RESIDENCIA_ID,
    dispositivoId: "10000000-0000-0000-0000-000000000002",
    tipo: "sensor_contato",
    nome: "Sensor de Porta (Entrada)",
  },
  {
    residenciaId: DEFAULT_RESIDENCIA_ID,
    dispositivoId: "10000000-0000-0000-0000-000000000003",
    tipo: "sensor_temperatura",
    nome: "Sensor de Temperatura e Umidade (Sala)",
  },
  {
    residenciaId: DEFAULT_RESIDENCIA_ID,
    dispositivoId: "10000000-0000-0000-0000-000000000004",
    tipo: "atuador_tomada",
    nome: "Tomada do Abajur (Quarto)",
  },
  {
    residenciaId: DEFAULT_RESIDENCIA_ID,
    dispositivoId: "10000000-0000-0000-0000-000000000005",
    tipo: "botao_sos",
    nome: "Botão SOS Físico",
  },
];

console.log("[SIMULADOR IoT] Conectando ao broker:", config.MQTT_BROKER_URL);
const client = mqtt.connect(config.MQTT_BROKER_URL, {
  reconnectPeriod: 3000,
});

let tomadaEstado = "desligada";

client.on("connect", () => {
  console.log("[SIMULADOR IoT] Conectado ao Mosquitto com sucesso!");

  // Inscreve a tomada nos tópicos de comando
  const tomada = devices.find((d) => d.tipo === "atuador_tomada");
  if (tomada) {
    const comandoTopic = `cuidalar/${tomada.residenciaId}/${tomada.dispositivoId}/comando`;
    client.subscribe(comandoTopic, (err) => {
      if (!err) {
        console.log(`[SIMULADOR IoT] Atuador de tomada inscrito em: ${comandoTopic}`);
      }
    });
  }

  // 1. Envio inicial de heartbeats
  sendAllHeartbeats();

  // 2. Heartbeats periódicos a cada 60s
  setInterval(sendAllHeartbeats, 60000);

  // 3. Leituras periódicas dos sensores
  setInterval(simulateSensorReadings, 15000);
});

function sendAllHeartbeats() {
  const timestamp = Math.floor(Date.now() / 1000);
  for (const dev of devices) {
    const topic = `cuidalar/${dev.residenciaId}/${dev.dispositivoId}/heartbeat`;
    client.publish(topic, JSON.stringify({ heartbeat: true, timestamp }));
  }
  console.log(`[SIMULADOR IoT] Heartbeats enviados para ${devices.length} dispositivos.`);
}

function simulateSensorReadings() {
  // Sensor de temperatura
  const tempDev = devices.find((d) => d.tipo === "sensor_temperatura");
  if (tempDev) {
    const temp = +(22 + Math.random() * 3).toFixed(1);
    const umid = Math.round(50 + Math.random() * 15);
    const topic = `cuidalar/${tempDev.residenciaId}/${tempDev.dispositivoId}/estado`;
    client.publish(topic, JSON.stringify({ temperatura: temp, umidade: umid }));
  }

  // Sensor de presença alternando
  const presencaDev = devices.find((d) => d.tipo === "sensor_presenca");
  if (presencaDev) {
    const presenca = Math.random() > 0.6;
    const topic = `cuidalar/${presencaDev.residenciaId}/${presencaDev.dispositivoId}/estado`;
    client.publish(topic, JSON.stringify({ presenca }));
  }
}

// Resposta a comandos para atuador de tomada
client.on("message", (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    console.log(`[SIMULADOR IoT] Comando recebido em [${topic}]:`, payload);

    const parts = topic.split("/");
    const [, resId, dispId, action] = parts;

    if (action === "comando" && payload.acao) {
      tomadaEstado = payload.acao === "ligar" ? "ligada" : "desligada";
      console.log(`[SIMULADOR IoT] Tomada alterando para: ${tomadaEstado}`);

      // Simula pequeno delay de hardware (300ms) e confirma novo estado no tópico /estado
      setTimeout(() => {
        const estadoTopic = `cuidalar/${resId}/${dispId}/estado`;
        client.publish(estadoTopic, JSON.stringify({ tomada: tomadaEstado }));
        console.log(`[SIMULADOR IoT] Confirmação publicada em [${estadoTopic}]: { tomada: "${tomadaEstado}" }`);
      }, 300);
    }
  } catch (err) {
    console.error("[SIMULADOR IoT] Erro ao processar comando:", err);
  }
});

// Funções para teste manual ou acionamento programado
export function triggerSOSManual() {
  const sosDev = devices.find((d) => d.tipo === "botao_sos");
  if (!sosDev) return;
  const topic = `cuidalar/${sosDev.residenciaId}/${sosDev.dispositivoId}/sos`;
  const payload = { emergencia: true, timestamp: Math.floor(Date.now() / 1000) };
  client.publish(topic, JSON.stringify(payload), { qos: 1 });
  console.log(`[SIMULADOR IoT] Emergência SOS disparada em [${topic}] (QoS 1)`);
}

export function triggerPortaAberta() {
  const portaDev = devices.find((d) => d.tipo === "sensor_contato");
  if (!portaDev) return;
  const topic = `cuidalar/${portaDev.residenciaId}/${portaDev.dispositivoId}/estado`;
  client.publish(topic, JSON.stringify({ contato: "aberto" }));
  console.log(`[SIMULADOR IoT] Sensor de contato disparou: aberto`);
}
