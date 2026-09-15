```
---
version: alpha
name: CuidaLar
description: Acessibilidade em primeiro lugar, não estética de app de automação genérico. Fundo claro e calmo ({colors.paper}), um azul-verde único como primário ({colors.primary}), contraste alto (AAA onde der, AA como piso). Duas superfícies visuais distintas na mesma paleta: o app do CUIDADOR (mais denso, mais informação por tela) e o app do MORADOR (poucos elementos, fonte grande, alvo de toque enorme). Sem serif decorativo — clareza vence estilo aqui.
colors:
  primary: "#0F6B5C"
  primary-deep: "#0B4F44"
  on-primary: "#FFFFFF"
  primary-soft: "#E3F1EE"
  paper: "#FAFAF8"
  paper-deep: "#EFEEE9"
  ink: "#161613"
  muted: "#4A4944"
  faint: "#726F68"
  line: "#DAD8D0"
  line-strong: "#B9B6AC"
  danger: "#8A1F1F"
  danger-soft: "#F7E6E6"
  on-danger: "#FFFFFF"
  ok: "#1F6B3A"
  ok-soft: "#E5F1E9"
  warn: "#7A5200"
  warn-soft: "#F6EDDA"
  offline: "#5C5A54"
  offline-soft: "#EDECE7"
  sos: "#B3261E"
  sos-soft: "#FBE6E4"
typography:
  morador-numero:
    fontFamily: System
    fontSize: 34px
    fontWeight: 700
    lineHeight: 1.15
  morador-titulo:
    fontFamily: System
    fontSize: 26px
    fontWeight: 700
    lineHeight: 1.20
  morador-botao:
    fontFamily: System
    fontSize: 22px
    fontWeight: 700
    lineHeight: 1.20
  cuidador-screen-title:
    fontFamily: System
    fontSize: 22px
    fontWeight: 700
    lineHeight: 1.25
  cuidador-heading-card:
    fontFamily: System
    fontSize: 17px
    fontWeight: 600
    lineHeight: 1.30
  body-md:
    fontFamily: System
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.45
  body-lg:
    fontFamily: System
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.45
  caption:
    fontFamily: System
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.40
  button-md:
    fontFamily: System
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.20
rounded:
  sm: 8px
  md: 12px
  lg: 16px
  full: 9999px
spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  screen-gutter: 16px
components:
  button-morador:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.morador-botao}"
    rounded: "{rounded.lg}"
    padding: "20px 24px"
    height: 72px
    minTouchTarget: 72px
  button-morador-pressed:
    backgroundColor: "{colors.primary-deep}"
  button-sos:
    backgroundColor: "{colors.sos}"
    textColor: "{colors.on-primary}"
    typography: "{typography.morador-titulo}"
    rounded: "{rounded.full}"
    height: 120px
    width: 120px
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-md}"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
    height: 48px
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.button-md}"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
    height: 48px
    border: "1px solid {colors.line}"
  button-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    typography: "{typography.button-md}"
    rounded: "{rounded.sm}"
    height: 48px
  card-dispositivo:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
    border: "1px solid {colors.line}"
  card-dispositivo-offline:
    backgroundColor: "{colors.offline-soft}"
    textColor: "{colors.offline}"
    border: "1px solid {colors.line}"
  card-alerta-aberto:
    backgroundColor: "{colors.warn-soft}"
    textColor: "{colors.warn}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  card-sos:
    backgroundColor: "{colors.sos-soft}"
    textColor: "{colors.sos}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  chip-status-online:
    backgroundColor: "{colors.ok-soft}"
    textColor: "{colors.ok}"
  chip-status-offline:
    backgroundColor: "{colors.offline-soft}"
    textColor: "{colors.offline}"
  banner-offline:
    backgroundColor: "{colors.offline-soft}"
    textColor: "{colors.muted}"
    typography: "{typography.body-md}"
    padding: "{spacing.sm} {spacing.md}"
  banner-error:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    typography: "{typography.body-md}"
    padding: "{spacing.sm} {spacing.md}"
  empty-state:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.muted}"
    typography: "{typography.body-lg}"
    padding: "{spacing.xl} {spacing.md}"
  skeleton-card:
    backgroundColor: "{colors.paper-deep}"
    rounded: "{rounded.md}"
    height: 96px
  text-input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm} {spacing.md}"
    border: "1px solid {colors.line-strong}"
    height: 52px
  text-input-focused:
    border: "2px solid {colors.primary}"
  text-input-error:
    border: "2px solid {colors.danger}"
  top-bar:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.cuidador-screen-title}"
    padding: "{spacing.sm} {spacing.md}"
    border: "0 0 1px {colors.line} solid"
    height: 56px
---
```

## Overview

O CuidaLar tem **duas vozes visuais na mesma paleta**, porque são dois públicos diferentes usando o mesmo produto:

**App do cuidador** — parece um painel de acompanhamento sério e legível: cards de dispositivo, chips de status, listas de alerta. Densidade moderada, porque o cuidador está acostumado a apps do dia a dia e precisa de informação (histórico, regras, múltiplos dispositivos).

**App do morador** — parece quase um controle remoto físico: 2 a 4 botões enormes por tela, número e texto grandes, um botão de SOS vermelho, redondo, sempre visível, sem depender de rolar a tela ou abrir menu.

As duas superfícies compartilham cor, mas **não** compartilham densidade nem tamanho de fonte. Nunca use `{typography.body-md}` numa tela do morador — o mínimo lá é `{typography.body-lg}` (18px), e ações usam `{typography.morador-botao}` (22px).

**Assinatura:**

- Fundo `{colors.paper}` em toda tela, nas duas superfícies
- Um `{colors.primary}` (verde-azulado) por ação principal — exceto o SOS, que é sempre `{colors.sos}` (vermelho), nunca reutilizado para outra coisa
- Alvo de toque mínimo: 48px no app do cuidador, **72px no app do morador**
- Offline é cinza (`{colors.offline}`), nunca vermelho — vermelho é reservado para SOS e erro real
- Card de dispositivo: borda 1px, raio 12, sem sombra pesada

## Colors

### Brand

- **Primary** (`{colors.primary}`): ação principal, chip de status online, foco de input
- **Primary soft** (`{colors.primary-soft}`): fundo de destaque leve

### Paper

- **Paper** (`{colors.paper}`): fundo de toda tela e card
- **Paper deep** (`{colors.paper-deep}`): esqueleto de loading

### Text

- **Ink** (`{colors.ink}`): título e corpo
- **Muted** (`{colors.muted}`): corpo secundário
- **Faint** (`{colors.faint}`): timestamp, meta

### Semantic — regra de ouro: cada cor tem um único significado em todo o app

- **Danger** (`{colors.danger}`): erro de formulário, ação destrutiva
- **Ok** (`{colors.ok}`): dispositivo online, alerta reconhecido
- **Warn** (`{colors.warn}`): alerta aberto, ainda não crítico
- **Offline** (`{colors.offline}`): dispositivo sem contato — **cinza, não vermelho**. Offline é "não sei", não é "perigo".
- **SOS** (`{colors.sos}`): reservado exclusivamente para emergência. Não reutilize em botão de excluir ou em erro comum.

Cor sozinha nunca carrega o significado: todo chip de status leva ícone ou texto junto (acessibilidade para daltonismo).

## Typography

### Hierarchy

| Token                          | Size | Weight | Uso                                                    |
| -------------------------------- | ---- | ------ | --------------------------------------------------------- |
| `{typography.morador-numero}`    | 34px | 700    | Temperatura, hora — números que o morador lê de longe      |
| `{typography.morador-titulo}`    | 26px | 700    | Título de tela no app do morador                          |
| `{typography.morador-botao}`     | 22px | 700    | Rótulo de botão grande do morador                          |
| `{typography.cuidador-screen-title}` | 22px | 700 | Top bar do app do cuidador                                 |
| `{typography.cuidador-heading-card}` | 17px | 600 | Título de card (nome do dispositivo, do alerta)             |
| `{typography.body-lg}`           | 18px | 400    | Corpo no app do morador; corpo de destaque no cuidador      |
| `{typography.body-md}`           | 16px | 400    | Corpo padrão no app do cuidador                             |
| `{typography.caption}`           | 14px | 400    | Meta, timestamp, ajuda de campo                             |
| `{typography.button-md}`         | 16px | 600    | Botão padrão no app do cuidador                             |

### Principles

- Sem serif decorativo. A prioridade aqui é legibilidade, não personalidade visual.
- Nenhum texto do app do morador é menor que 18px.
- Botão é sempre verbo + ícone: "Ligar luz", "Pedir ajuda", "Ver histórico".
- Números importantes (temperatura, hora, contagem) usam peso 700 — o olho encontra rápido.

## Layout

### Spacing

- Base 4px. Tokens: `{spacing.xxs}` 4 · `{spacing.xs}` 8 · `{spacing.sm}` 12 · `{spacing.md}` 16 · `{spacing.lg}` 24 · `{spacing.xl}` 32 · `{spacing.xxl}` 48
- No app do morador, use `{spacing.xl}` ou `{spacing.xxl}` entre botões — dedo trêmulo não pode acertar o botão errado.

### Grid

- Uma coluna nas duas superfícies. Painel do cuidador é lista de cards; painel do morador é uma grade de no máximo 2×2 botões grandes por tela.

## Elevation & Depth

Plano, sem sombra decorativa. Profundidade vem da borda (`1px {colors.line}`) e, no app do morador, do próprio tamanho do elemento — não precisa de sombra quando o botão já ocupa 1/4 da tela.

## Shapes

| Token          | Value  | Uso                                               |
| ---------------- | ------ | ---------------------------------------------------- |
| `{rounded.sm}`   | 8px    | Input, botão do cuidador, chip                       |
| `{rounded.md}`   | 12px   | Card de dispositivo, card de alerta                  |
| `{rounded.lg}`   | 16px   | Botão grande do morador                              |
| `{rounded.full}` | 9999px | Só o botão de SOS (círculo) — em nenhum outro lugar |

## Components

### Buttons

**`button-morador`** — ação do painel simplificado. Altura 72px, `{rounded.lg}`, texto 22px/700. Uma ação por botão, sem texto secundário embaixo.

**`button-sos`** — círculo vermelho de 120px, sempre no mesmo lugar da tela principal do morador. Pressionar (não deslizar) por padrão; confirmação de 1 segundo antes de disparar, para não acionar sem querer ao encostar.

**`button-primary`** — ação principal do app do cuidador. Altura 48px.

**`button-secondary`** / **`button-danger`** — como no app do cuidador convencional: cancelar, recusar, reconhecer com ressalva.

### Cards

**`card-dispositivo`** — nome, ícone do tipo, estado atual, chip de status. **`card-dispositivo-offline`** — mesmo layout, fundo `{colors.offline-soft}`, texto cinza, sem os controles de ação (não oferece um botão que não vai funcionar).

**`card-alerta-aberto`** — fundo `{colors.warn-soft}`. **`card-sos`** — fundo `{colors.sos-soft}`, sempre no topo da lista de alertas, nunca misturado por ordem cronológica com alertas comuns.

### Banners and empty

**`banner-offline`** — "Sem conexão. Mostrando o último estado salvo." Cinza, não vermelho — perder internet não é uma emergência.

**`empty-state`** — "Nenhum dispositivo pareado ainda." + `button-primary` "Parear dispositivo".

**`skeleton-card`** — altura 96px, 3 no painel.

## Do's and Don'ts

### Do

- Reserve `{colors.sos}` exclusivamente para emergência
- Use `{typography.body-lg}` como corpo mínimo no app do morador
- Toque mínimo 72px no morador, 48px no cuidador
- Pareie cor com ícone/texto sempre
- Dispositivo offline = cinza + sem oferecer controle que vai falhar

### Don't

- Não use vermelho para "offline" — só para SOS e erro real
- Não coloque texto abaixo de 18px em qualquer tela do morador
- Não empilhe mais de 4 botões por tela no app do morador
- Não use sombra pesada, gradiente ou glass
- Não mostre HTTP, hex ou JSON para o morador ou para o cuidador

## Responsive Behavior

| Name        | Width   | Key Changes                                           |
| ----------- | ------- | -------------------------------------------------------- |
| Phone       | 320–430 | Layout canônico                                            |
| Tablet fixo (morador) | ≥ 600 | Grade 2×2 de botões grandes ocupa a tela toda — é o formato esperado para o tablet fixado na parede da casa |

## Iteration Guide

1. Antes de montar qualquer tela do morador, pergunte: "uma pessoa com visão reduzida e pouca prática com celular acerta este botão de primeira?"
2. Cite o token: `{colors.sos}`, `{rounded.lg}`, `button-morador`
3. Hex só em `app/theme/tokens.ts`
4. Depois de mudar token, atualize este YAML e o código no mesmo PR

## Known Gaps

- Sem modo alto-contraste extra além do AA/AAA já embutido nos tokens — fica para V1.1 se usuário real pedir
- Sem suporte a leitor de tela detalhado documentado ainda (VoiceOver/TalkBack) — implementar com `accessibilityLabel` em todo componente, revisar antes do piloto com usuário real
- Ícone de marca não desenhado — wordmark "CuidaLar" em `{typography.morador-titulo}` basta por enquanto
