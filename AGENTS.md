# CuidaLar

App de automação residencial acessível para idosos e PcD: sensores e atuadores IoT + painel simplificado para o morador + acompanhamento remoto para o cuidador.

## Stack

- Linguagem: **TypeScript** em `api/` e `app/`. Sem `any`.
- API: **Bun** (`Bun.serve`).
- App: **React Native** via **Expo**.
- Validação: **Zod** na API (body e query) e no app (formulário e resposta HTTP).
- Banco: **PostgreSQL** via **Drizzle** (`drizzle-kit`).
- Comunicação com dispositivos: **MQTT** (broker Mosquitto), não HTTP.
- Firmware: **ESP32**, C++ (Arduino framework) ou MicroPython — ver `iot/README.md`.

## Onde ler o quê

| Arquivo                 | Para quê                                                        |
| ------------------------ | ------------------------------------------------------------------ |
| `AGENTS.md`               | Como trabalhar neste repositório (este arquivo)                   |
| `DESIGN.md`               | Decisões visuais: paleta, tipo, espaço, tokens do app do morador e do cuidador |
| `docs/SPEC.md`             | O que o produto faz (Given / When / Then, estados, RNF, tópicos MQTT) |
| `contract/openapi.yaml`   | HTTP: paths, JSON, erros (app ↔ API)                              |
| `api/`                     | Servidor Bun                                                       |
| `app/`                     | Cliente Expo (duas superfícies: cuidador e morador)                |
| `iot/`                     | Firmware dos dispositivos (sensores e atuadores)                   |

Não compartilhe um pacote de Zod entre `api/` e `app/`. O OpenAPI é o contrato comum entre app e API. O contrato entre `iot/` e a API é a seção 6.3 de `docs/SPEC.md` (tópicos e payload MQTT) — não o OpenAPI, porque não é HTTP.

Não invente cor, tipo ou botão fora de `DESIGN.md`. Hex e espaço no código: `app/theme/tokens.ts`.

## Comandos

```
docker compose up -d              # Postgres + broker MQTT (Mosquitto)
cp api/.env.example api/.env
cd api && bun install && bun run db:migrate && bun --watch src/index.ts
cd api && bun test
cd api && bun run db:generate     # depois de mudar api/db/schema.ts
```

Health: `GET http://localhost:3000/v1/health` (200 só se Postgres e o broker respondem).

Env: `api/.env` (gitignored). Modelo: `api/.env.example`. Sem device key nem client secret no git.

## API

Postgres e Mosquitto locais via Docker na raiz. Schema TypeScript em `api/db/schema.ts`. Migration gerada: `bun run db:generate`. Aplicar: `bun run db:migrate`. Não edite SQL já aplicado: mude o schema e gere a próxima.

Rotas públicas: `GET /v1/health`, `POST /v1/auth`, `POST /v1/moradores/login-pin`. O resto exige `Authorization: Bearer` (cuidador) ou o token de sessão do morador emitido pelo login-pin.

Um serviço separado (`api/src/mqtt-listener.ts`) assina os tópicos `cuidalar/+/+/estado`, `cuidalar/+/+/heartbeat` e `cuidalar/+/+/sos`, grava em `eventos_dispositivo`, atualiza `dispositivos.estado_atual`/`status` e roda o motor de regras (RF-13 no SPEC). Não duplique essa lógica dentro de uma rota HTTP.

Não crie `/login`, `/signin`, `/oauth/callback` fora do padrão do SPEC. Não use e-mail/senha de teste como PIN válido em produção — PIN do morador é hash, nunca texto puro no banco.

## Testes

`api/tests/*.behavior.test.ts` trava o contrato (Given / When / Then do SPEC, via `bun test`).

- Rota nova: escreva o teste primeiro. Ele tem de falhar. Depois o código.
- Para regras de alerta, teste o motor com eventos simulados publicados no broker de teste — não mocke o MQTT client inteiro, ou o teste não prova nada sobre o parsing do payload real.
- Não altere teste para ficar verde. Altere o código.
- Se o SPEC mudar, o teste muda no mesmo PR.

## Como escrever código

- Tipar parâmetros, retorno e JSON. Campo novo: primeiro o OpenAPI (ou a seção 6.3 do SPEC, se for payload MQTT), depois o código.
- Na API, parse com Zod antes de gravar — tanto nas rotas HTTP quanto no listener MQTT.
- No app: UI → estado → repositório. A tela não chama a rede nem o MQTT direto.
- Qualquer tela: leia `DESIGN.md` antes de gerar UI — e confirme se é tela do **cuidador** ou do **morador**, porque os tokens de tamanho mudam.
- Ação de comandar um dispositivo (RF-10) só mostra sucesso depois da confirmação que volta pelo tópico `.../estado`, nunca no momento do envio.
- Sem câmera, sem visão computacional, sem chat — fora da V1 (ver seção 7 do SPEC).

## Se os docs discordarem

1. `contract/openapi.yaml` (HTTP app ↔ API)
2. `docs/SPEC.md` (comportamento de produto e contrato MQTT)
3. `DESIGN.md` (visual)
4. este arquivo (pastas, stack, comandos)
