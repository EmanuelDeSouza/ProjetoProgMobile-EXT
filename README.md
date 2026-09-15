# CuidaLar

Automação residencial acessível para idosos e pessoas com deficiência: sensores e atuadores IoT, painel simplificado para o morador, acompanhamento remoto para o cuidador.

Projeto de extensão — Engenharia de Computação, SETREM.

## Por onde começar

| Arquivo                                                   | Para quê                                                  |
| ------------------------------------------------------------ | -------------------------------------------------------------- |
| [docs/SPEC.md](docs/SPEC.md)                                  | O que o produto faz                                            |
| [DESIGN.md](DESIGN.md)                                        | Visual: cores, tipo, botões — e por que o app do morador é diferente do app do cuidador |
| [contract/openapi.yaml](contract/openapi.yaml)                | Paths, JSON, erros (app ↔ API)                                 |
| [AGENTS.md](AGENTS.md)                                        | Instruções para qualquer agente (Codex, Cursor, Claude Code)   |
| [CLAUDE.md](CLAUDE.md)                                        | Ponte para o Claude Code (`@AGENTS.md`)                        |
| `api/`                                                         | Servidor: Bun + TypeScript + Zod + Drizzle (Postgres)           |
| `app/`                                                          | Mobile: React Native (Expo) + TypeScript + Zod                 |
| `iot/`                                                          | Firmware dos dispositivos (ESP32)                               |

## Loop

cuidador cria conta e residência → convida outro cuidador (opcional) → cadastra morador com PIN → pareia dispositivo → painel mostra estado dos ambientes → cuidador configura regra de alerta → evento do sensor dispara alerta → cuidador é notificado e reconhece → morador aciona SOS quando precisa

## Como pedir algo ao agente

O agente lê `AGENTS.md` sozinho. No chat, cite o RF e o `operationId`:

```
Implemente RF-10 (comandar dispositivo) conforme docs/SPEC.md.
Use só postComandoDispositivo no contract/openapi.yaml.
Visual conforme DESIGN.md — esta é uma tela do CUIDADOR, não do morador.
Card = DispositivoCard. Sucesso só depois da confirmação MQTT, nunca no envio do comando.
Estados: esqueleto, vazio, offline com cache.
Não crie path novo.
```

Ruim: "faz o painel". O modelo inventa campo, ícone e comportamento de offline.

## Ambiente local

```
docker compose up -d
cp api/.env.example api/.env
cd api && bun install && bun run db:migrate && bun --watch src/index.ts
```

Sem app mobile rodando ainda: use uma coleção HTTP (Insomnia/curl) contra `http://localhost:3000/v1`.
