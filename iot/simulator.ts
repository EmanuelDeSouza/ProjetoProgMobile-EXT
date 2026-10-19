import mqtt from "mqtt";

// Configurações padrão
const BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://localhost:1883";
const RESIDENCIA_ID = process.env.SIMULATOR_RESIDENCIA_ID || "residencia-demo-01";

interface DispositivoSimulado {
  id: string;
  tipo: "sensor_presenca" | "sensor_contato" | "sensor_temperatura" | "atuador_tomada" | "botao_sos";
  nome: string;
  estado: Record<string, unknown>;
}

const dispositivos: DispositivoSimulado[] = [
  {
    id: "disp-presenca-sala",
    tipo: "sensor_presenca",
    nome: "Sensor Presença Sala",
    estado: { presenca: false },
  },
  {
    id: "disp-contato-porta",
    tipo: "sensor_contato",
    nome: "Sensor Porta Principal",
    estado: { contato: "fechado" },
  },
  {
    id: "disp-temp-quarto",
    tipo: "sensor_temperatura",
    nome: "Termômetro Quarto",
    estado: { temperatura: 23.5, umidade: 55.0 },
  },
  {
    id: "disp-tomada-abajur",
    tipo: "atuador_tomada",
    nome: "Tomada Abajur",
    estado: { tomada: "desligada" },
  },
  {
    id: "disp-botao-sos",
    tipo: "botao_sos",
    nome: "Botão SOS Banheiro",
    estado: {},
  },
];

console.log("==================================================");
console.log("🚀 CuidaLar · Simulador de Dispositivos IoT (ESP32)");
console.log(`📡 Broker: ${BROKER_URL}`);
console.log(`🏠 Residência ID: ${RESIDENCIA_ID}`);
console.log("==================================================");

const client = mqtt.connect(BROKER_URL);

client.on("connect", () => {
  console.log("✅ Conectado ao broker MQTT com sucesso!\n");

  // Inscreve atuadores nos tópicos de comando
  for (const disp of dispositivos) {
    if (disp.tipo === "atuador_tomada") {
      const comandoTopic = `cuidalar/${RESIDENCIA_ID}/${disp.id}/comando`;
      client.subscribe(comandoTopic, (err) => {
        if (!err) {
          console.log(`📥 Atuador [${disp.nome}] escutando comandos em: ${comandoTopic}`);
        }
      });
    }
  }

  // 1. Envia Heartbeat inicial para todos
  enviarHeartbeats();

  // 2. Loop de Heartbeat a cada 60 segundos (conforme SPEC.md)
  setInterval(() => {
    enviarHeartbeats();
  }, 60000);

  // 3. Simulação de leituras periódicas dos sensores
  iniciarSimulacaoLeituras();
});

function enviarHeartbeats() {
  console.log("\n💓 Enviando heartbeat para os dispositivos...");
  for (const disp of dispositivos) {
    const topic = `cuidalar/${RESIDENCIA_ID}/${disp.id}/heartbeat`;
    const payload = JSON.stringify({
      status: "online",
      bateria: 95,
      uptime: Math.floor(process.uptime()),
    });
    client.publish(topic, payload);
  }
}

function iniciarSimulacaoLeituras() {
  // Sensor de Presença: alterna presença aleatoriamente a cada 20s
  setInterval(() => {
    const disp = dispositivos.find((d) => d.tipo === "sensor_presenca");
    if (!disp) return;

    const presenca = Math.random() > 0.4;
    disp.estado = { presenca };
    const topic = `cuidalar/${RESIDENCIA_ID}/${disp.id}/estado`;
    client.publish(topic, JSON.stringify(disp.estado));
    console.log(`[Sensor Presença] ${disp.nome} -> ${presenca ? "MOVIMENTO DETECTADO!" : "Sem movimento"}`);
  }, 20000);

  // Sensor de Contato (Porta): abre e fecha a cada 35s
  setInterval(() => {
    const disp = dispositivos.find((d) => d.tipo === "sensor_contato");
    if (!disp) return;

    const contato = disp.estado.contato === "fechado" ? "aberto" : "fechado";
    disp.estado = { contato };
    const topic = `cuidalar/${RESIDENCIA_ID}/${disp.id}/estado`;
    client.publish(topic, JSON.stringify(disp.estado));
    console.log(`[Sensor Contato] ${disp.nome} -> Porta ${contato.toUpperCase()}`);
  }, 35000);

  // Sensor de Temperatura: varia levemente a cada 15s
  setInterval(() => {
    const disp = dispositivos.find((d) => d.tipo === "sensor_temperatura");
    if (!disp) return;

    const variacao = (Math.random() - 0.5) * 0.8;
    const tempAtual = (disp.estado.temperatura as number) + variacao;
    const temperatura = Math.round(tempAtual * 10) / 10;
    const umidade = Math.round(50 + Math.random() * 15);
    disp.estado = { temperatura, umidade };

    const topic = `cuidalar/${RESIDENCIA_ID}/${disp.id}/estado`;
    client.publish(topic, JSON.stringify(disp.estado));
    console.log(`[Sensor Temperatura] ${disp.nome} -> ${temperatura}°C | ${umidade}% UR`);
  }, 15000);
}

// Resposta a comandos do app (RF-10)
client.on("message", (topic, message) => {
  try {
    const payload = JSON.parse(message.toString("utf-8"));
    console.log(`\n⚡ Comando recebido no tópico [${topic}]:`, payload);

    for (const disp of dispositivos) {
      if (topic.includes(disp.id) && disp.tipo === "atuador_tomada") {
        const novaAcao = payload.acao || payload.comando || (payload.valor && payload.valor.tomada);
        const novoEstado = novaAcao === "ligar" || novaAcao === "ligada" ? "ligada" : "desligada";
        disp.estado = { tomada: novoEstado };

        // Confirma publicação em .../estado (RF-10: sucesso do app depende desta confirmação)
        const estadoTopic = `cuidalar/${RESIDENCIA_ID}/${disp.id}/estado`;
        client.publish(estadoTopic, JSON.stringify(disp.estado));
        console.log(`✅ [Atuador] ${disp.nome} confirmou novo estado: [${novoEstado}] no tópico ${estadoTopic}`);
      }
    }
  } catch (err) {
    console.error("Erro ao processar comando:", err);
  }
});

// Tratamento de saída limpa
process.on("SIGINT", () => {
  console.log("\n🔌 Desconectando simulador MQTT...");
  client.end(true, () => {
    console.log("Simulador encerrado.");
    process.exit(0);
  });
});
