import { createApp } from "./app";
import { config } from "./config";

const app = createApp();

console.log(`[CuidaLar API] Iniciando servidor na porta ${config.PORT}...`);

Bun.serve({
  port: config.PORT,
  fetch: app.fetch,
});

console.log(`[CuidaLar API] Servidor pronto em http://localhost:${config.PORT}/v1`);
