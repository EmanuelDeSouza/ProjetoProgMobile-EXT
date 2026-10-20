import { config } from "./config";
import { handleRequest } from "./app";
import { startMqttListener } from "./mqtt-listener";

console.log(`[CuidaLar API] Inicializando na porta ${config.PORT}...`);

// Inicia escuta MQTT para telemetria dos dispositivos IoT
startMqttListener();

// Inicia servidor HTTP Bun
const server = Bun.serve({
  port: config.PORT,
  fetch(req) {
    return handleRequest(req);
  },
});

console.log(`[CuidaLar API] Servidor rodando em http://localhost:${server.port}/v1`);
