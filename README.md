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
| `api/`                                                         | Servidor: Bun + TypeScript + Zod + Drizzle (Postgres) + MQTT    |
| `app/`                                                          | Mobile: React Native (Expo SDK 58) + TypeScript + Zod          |
| `iot/`                                                          | Firmware dos dispositivos (ESP32) — ver [iot/README.md](iot/README.md) |

## Loop

cuidador cria conta e residência → convida outro cuidador (opcional) → cadastra morador com PIN e configura o tablet da casa → pareia dispositivo → painel mostra estado dos ambientes → cuidador configura regra de alerta → evento do sensor dispara alerta → cuidador é notificado e reconhece → morador aciona SOS quando precisa

## Rodar tudo local

Pré-requisitos: Docker, [Bun](https://bun.sh) e Node 20+.

```bash
# 1. Banco + broker MQTT (Mosquitto com autenticação)
docker compose up -d

# 2. API
cd api
cp .env.example .env
bun install
bun run db:migrate        # cria/atualiza as tabelas (migrations em api/db/migrations)
bun run db:seed           # opcional: casa de exemplo, cuidador e 5 dispositivos
bun --watch src/index.ts  # http://localhost:3000/v1  (GET /v1/health → {"status":"ok"})

# 3. Dispositivos sem hardware (outro terminal, com a API rodando)
cd api && bun run iot:simulate

# 4. App (outro terminal)
cd app
cp .env.example .env      # troque pelo IP do seu PC na rede Wi-Fi
npm install
npx expo run:android      # build de desenvolvimento (push e armazenamento seguro precisam dele)
```

Login do seed: `cuidador@cuidalar.app` / `cuidador123`. Morador: Dona Elza, PIN `1234` — no app do cuidador, em **+ Morador**, toque em **Usar este aparelho para Dona Elza** para transformar o celular/tablet no painel dela.

> **Windows com Postgres ou Mosquitto já instalados?** Eles ocupam as portas 5432/1883 e a API conecta no serviço errado (erro de senha do Postgres em português, ou `timeout esperando resposta do broker`). Copie `.env.example` para `.env` na raiz, use `POSTGRES_PORT=5433` e `MQTT_PORT=1884`, ajuste `DATABASE_URL` e `MQTT_BROKER_URL` no `api/.env` e rode `docker compose up -d` de novo. No Prompt do Windows use `copy` no lugar de `cp`.

> **Windows: erro `ninja: error: mkdir ... No such file or directory` no build Android** é o limite de 260 caracteres de caminho. Deixe o projeto num caminho curto (ex.: `C:\cl\cuidalar`), ative `LongPathsEnabled` no registro e troque o `ninja.exe` de `Android\Sdk\cmake\3.22.1\bin` pela versão 1.12+.

> Já tinha o banco de antes? `bun run db:migrate` aplica só a migration nova (0002) sem perder dados. O broker passa a exigir usuário e senha: rode `docker compose up -d --force-recreate mosquitto` uma vez para ele subir com a configuração nova.

> Já tinha a pasta `app/android` gerada? Depois de puxar este branch rode `npx expo prebuild --clean` (entraram módulos nativos novos: notificações, armazenamento seguro, haptics).

## Testes

```bash
cd api && bun test   # 84 testes de comportamento contra Postgres e Mosquitto reais (banco separado: cuidalar_test)
cd app && bun test   # repositório HTTP, confirmação de comando, formulários, cache
cd app && npx tsc --noEmit
```

## Push nativo

O app pede permissão e registra o token Expo do aparelho na API (`postPushToken`). Para isso o projeto precisa de um `projectId` do EAS em `app/app.json` → `expo.extra.eas.projectId` (rode `npx eas init` uma vez). Em emulador não existe push real; a central de notificações dentro do app funciona igual.

## Login com Google (opcional)

Crie os client IDs OAuth no Google Cloud e preencha `EXPO_PUBLIC_GOOGLE_*` em `app/.env` e `GOOGLE_CLIENT_IDS` em `api/.env`. Sem isso o botão não aparece e o login por e-mail/senha segue normal.
