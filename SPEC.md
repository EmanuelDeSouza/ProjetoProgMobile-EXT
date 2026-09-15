# CuidaLar · SPEC.md (V1)

O que o produto faz: requisitos funcionais (Given / When / Then), estados de tela e requisitos não funcionais.

Visual: [`../DESIGN.md`](../DESIGN.md). HTTP: [`../contract/openapi.yaml`](../contract/openapi.yaml).

Se este SPEC e o OpenAPI discordarem, **o OpenAPI ganha em path/JSON/código HTTP**. Este SPEC ganha em comportamento de produto. Corrija o perdedor no mesmo commit.

---

## Como usar este documento (humano e agente)

1. Leia o **loop da V1**. Só implemente o que está neste arquivo e no OpenAPI.
2. Cada requisito funcional tem **Given / When / Then**, a **operação OpenAPI** (quando aplicável) e os **estados de tela**.
3. Não invente campo, path, tipo de dispositivo ou status que não existam no OpenAPI ou na seção 6.
4. Requisitos não funcionais (seção 4) fazem parte deste SPEC.
5. Prompt curto: "implemente RF-09 (controlar tomada) conforme docs/SPEC.md e `postComandoDispositivo` no OpenAPI".

**Vocabulário da V1:** **residência** (uma casa monitorada). **Morador** (idoso/PcD que mora lá). **Cuidador** (familiar/responsável, pode não morar na casa). **Dispositivo** (sensor ou atuador IoT). **Regra** (condição que gera alerta). **Alerta** (evento que exige atenção do cuidador). **SOS** (emergência disparada manualmente).

**Loop:** cuidador cria conta e residência → convida outro cuidador (opcional) → vincula morador → pareia dispositivo → painel mostra estado dos ambientes → cuidador configura regras de alerta → sensor gera evento → regra dispara alerta → cuidador é notificado e reconhece → (a qualquer momento) morador aciona SOS → cuidador recebe alerta de prioridade máxima.

---

## 1. Problema e contexto

### 1.1 Proposta de valor

Idosos e pessoas com deficiência que moram sozinhos, ou passam parte do dia sem supervisão, ficam expostos a riscos que a família só descobre tarde: queda sem ninguém por perto, porta destrancada à noite, fogão esquecido ligado, ausência de movimento por horas. Sistemas de automação residencial de mercado são pensados para quem já domina tecnologia — não para o próprio morador operar.

O CuidaLar é um app mobile que conecta sensores e atuadores IoT de baixo custo (ESP32) a um painel simples para o morador e um painel de acompanhamento remoto para o cuidador. O morador toca poucos botões grandes para controlar a casa e pedir ajuda. O cuidador configura regras e recebe alerta quando algo foge do padrão.

### 1.2 Usuários e papéis

| Papel        | O que precisa                                  | O que faz na V1                                              |
| ------------ | ----------------------------------------------- | -------------------------------------------------------------- |
| **Morador**  | Controlar a casa e pedir ajuda sem complicação  | Vê o painel simplificado, aciona atuadores, aperta o SOS       |
| **Cuidador** | Acompanhar remotamente e ser avisado de risco   | Cria residência, convida outro cuidador, pareia dispositivo, configura regras, reconhece alertas |

O papel vem do **vínculo na residência** (`residencia_membros.papel`), não de autodeclaração no cadastro. Uma pessoa pode ser cuidador em mais de uma residência (ex.: cuida dos dois pais em casas diferentes). Um morador pertence a exatamente uma residência na V1.

### 1.3 Contexto de uso mobile + IoT

O morador pode ter baixa familiaridade com celular, dedos menos precisos, visão reduzida. O cuidador usa o app em trânsito, com internet instável, e precisa que um alerta crítico chegue mesmo assim. Os dispositivos ficam em Wi-Fi doméstico que cai (queda de energia, reinício de roteador) — o app precisa deixar claro quando um sensor está "sem falar com a gente" em vez de fingir que está tudo bem.

---

## 2. Requisitos funcionais (V1)

Cada RF abaixo tem **Given / When / Then** (rótulos em inglês, frases em português). Isso é o requisito.

```
ID · nome curto
O que é (uma ou duas frases)
Given: mundo antes
When: ação da pessoa ou do dispositivo
Then: resultado observável
Regras: limites e recusas
Falhas: o que a tela faz quando quebra
API: operationId no OpenAPI
Estados: se a tela tiver lista, controle ou envio
```

### 2.1 Autenticação e papéis

**RF-01 · Login com e-mail e senha, ou Google**

O cuidador entra com e-mail/senha ou conta Google. O morador **não** faz esse login — ele acessa por um modo simplificado (RF-04).

Given: cuidador com conta criada.
When: informa e-mail/senha (ou completa o Google Sign-In).
Then: recebe `token` e o `usuario` (id, nome, email).

Regras: sem confirmação de e-mail bloqueante na V1 (fora de escopo: recuperação de senha completa fica para V1.1, mas o endpoint existe).
Falhas: 401 credenciais inválidas.
API: `postAuth` · `getMe`

**RF-02 · Papel por residência**

Ninguém se marca "cuidador" ou "morador" num checkbox solto. O papel é o vínculo salvo em `residencia_membros`.

Given: usuário autenticado.
When: o app lê `getMinhasResidencias`.
Then: para cada residência, vem o papel (`cuidador`) e a UI mostra só o que esse papel permite. Se o usuário não tiver residência, mostra a tela "Criar residência".

Regras: transformar um cuidador em morador (ou vice-versa) é fora de escopo da V1.
API: `getMinhasResidencias`

### 2.2 Residências e membros

**RF-03 · Criar residência**

O primeiro cuidador que cria a residência vira o dono por padrão.

Given: cuidador autenticado sem residência (ou querendo criar outra).
When: envia nome da residência e endereço curto (bairro/cidade, sem rua exata na V1).
Then: 201, residência criada, cuidador vinculado como `dono`.

Regras: sem CEP/geolocalização exata na V1 (dado sensível, sem necessidade real pro loop).
API: `postResidencia`

**RF-04 · Vincular morador (perfil simplificado)**

O morador normalmente não cria a própria conta. O cuidador cadastra um perfil simplificado e define um PIN de 4 dígitos para acesso no aparelho da casa.

Given: cuidador dono ou vinculado à residência.
When: cadastra nome do morador e um PIN de 4 dígitos.
Then: 201, perfil de morador criado, vinculado à residência. O tablet/celular fixado na casa entra nesse perfil com o PIN — não com e-mail e senha.

Regras: PIN não é o mesmo mecanismo de autenticação do cuidador (RF-01); ele autoriza só a interface simplificada, sem acesso a configuração de regras ou dados de outra residência.
Falhas: PIN incorreto → mensagem simples, sem contagem de tentativas visível na V1 (mitigação de força bruta fica documentada como risco conhecido, ver RNF-08).
API: `postMorador` · `postLoginPin`

**RF-05 · Convidar outro cuidador**

Mais de um filho cuidando do mesmo pai/mãe é o caso comum, não a exceção.

Given: cuidador vinculado à residência.
When: envia convite por e-mail.
Then: 201, convite pendente. Se o convidado já tem conta, aparece notificação para aceitar; se não tem, recebe e-mail para se cadastrar e já entra vinculado.

Regras: só cuidadores existentes da residência podem convidar. Sem limite de cuidadores por residência na V1.
API: `postConvite` · `patchConvite`

### 2.3 Dispositivos e pareamento

**RF-06 · Tipos de dispositivo suportados na V1**

A V1 cobre cinco tipos. Câmera e reconhecimento de imagem ficam fora — decisão explícita de privacidade e custo.

```
sensor_presenca      — detecta movimento num cômodo
sensor_contato        — porta/janela aberta ou fechada
sensor_temperatura    — temperatura e umidade
atuador_tomada        — liga/desliga uma tomada
botao_sos              — botão físico dedicado de emergência
```

Regras: qualquer outro `tipo` é rejeitado pelo servidor no pareamento (400).

**RF-07 · Parear dispositivo**

O ESP32 gera um código curto ao ligar pela primeira vez (modo AP local). O cuidador digita esse código no app para vincular o dispositivo à residência.

Given: cuidador na residência, dispositivo em modo de pareamento exibindo um código de 6 dígitos.
When: o cuidador informa o código, o cômodo e um nome amigável ("Sensor - Quarto").
Then: 201, dispositivo vinculado à residência, credencial MQTT (device key) gerada e enviada ao firmware via o próprio fluxo de pareamento local (não pelo app).

Regras: código de pareamento expira em 10 minutos. Um dispositivo pertence a uma única residência.
Falhas: código expirado ou já usado → 409, "Gere um novo código no dispositivo".
API: `postPareamento`

**RF-08 · Estado online/offline**

Sensor calado não é sensor "tudo bem". A UI precisa dizer a verdade.

Given: dispositivo pareado.
When: o dispositivo não publica heartbeat MQTT por mais de 5 minutos.
Then: o app marca o dispositivo como `offline` com o timestamp da última leitura válida.

Regras: dispositivo crítico (`botao_sos`, `sensor_presenca` usado em regra ativa) offline por mais de 15 minutos gera um alerta de sistema (RF-12) — porque "sensor sumiu" também é risco.
API: `listDispositivos` (campo `status`, `ultimoContatoEm`)

### 2.4 Painel doméstico e controle remoto

**RF-09 · Painel por cômodo**

Given: cuidador (ou morador, versão simplificada) na residência com dispositivos pareados.
When: abre o painel.
Then: vê os dispositivos agrupados por cômodo, com o estado atual de cada um (ligado/desligado, aberto/fechado, temperatura, presença detectada nos últimos N minutos).

Estados: loading (esqueleto), vazio ("Nenhum dispositivo pareado ainda" + botão parear), offline com cache (mostra último estado conhecido + aviso).
API: `listDispositivos`

**RF-10 · Controlar atuador (tomada)**

Given: `atuador_tomada` online.
When: a pessoa toca o botão grande de ligar/desligar.
Then: o app envia o comando; enquanto aguarda confirmação do dispositivo, o botão mostra estado "enviando"; ao confirmar, atualiza para o novo estado.

Regras: comando para dispositivo offline é recusado antes de sair do app (sem fingir sucesso). Timeout de confirmação: 8 segundos.
Falhas: dispositivo não confirma → "Não foi possível confirmar. Verifique se o dispositivo está ligado." + tentar de novo.
API: `postComandoDispositivo`

**RF-11 · Interface simplificada do morador**

Given: perfil de morador autenticado via PIN.
When: usa o app.
Then: vê no máximo 2 níveis de navegação, botões com no mínimo 64px de altura de toque, ícone + texto (nunca só ícone), e o botão de SOS sempre visível na tela principal.

Regras: sem lista de "regras de alerta", sem configuração de dispositivo — isso é só do cuidador.
Ver [`../DESIGN.md`](../DESIGN.md) para os tokens de acessibilidade.

### 2.5 Regras e alertas

**RF-12 · Configurar regra de alerta**

Given: cuidador vinculado à residência, com pelo menos um sensor pareado.
When: cria uma regra escolhendo o dispositivo (ou "qualquer sensor de presença da casa"), a condição (`sem_movimento_por`, `contato_aberto_apos_horario`, `temperatura_fora_da_faixa`, `dispositivo_offline`) e o parâmetro (horas, horário, faixa de temperatura).
Then: 201, regra `ativa`.

Regras: uma regra pertence a um dispositivo específico ou a um tipo dentro da residência. Sem regras compostas (E/OU) na V1.
API: `postRegraAlerta` · `listRegras`

**RF-13 · Motor de avaliação**

Todo evento que chega do dispositivo é comparado contra as regras ativas daquele dispositivo.

Given: evento de sensor recebido pelo servidor (via MQTT → backend).
When: o evento (ou a ausência de evento, no caso de `sem_movimento_por`) satisfaz a condição de uma regra ativa.
Then: o servidor cria um `alerta` com severidade e dispara notificação (RF-14) para todos os cuidadores da residência.

Regras: a mesma condição não gera um segundo alerta enquanto o primeiro estiver `aberto` (evita spam do mesmo evento). Reavaliação de "sem movimento" roda a cada 5 minutos no servidor, não por evento (não há evento para "nada aconteceu").
API: processamento interno; alertas aparecem em `listAlertas`

**RF-14 · Notificar e reconhecer alerta**

Given: alerta `aberto`.
When: cuidador abre a notificação e toca "Verifiquei, está tudo bem" ou "Preciso de ajuda / escalar".
Then: alerta muda para `reconhecido` (com quem reconheceu e quando) ou permanece aberto com uma nota, visível aos outros cuidadores da residência.

Regras: qualquer cuidador da residência pode reconhecer, não só quem recebeu primeiro — evita que duas pessoas fiquem endereçando o mesmo risco sem saber uma da outra depois que uma já resolveu.
API: `listAlertas` · `patchAlerta`

### 2.6 Emergência (SOS)

**RF-15 · Acionar SOS**

Given: morador em casa (perfil simplificado) ou botão físico `botao_sos` instalado.
When: toca o botão grande de emergência no app, ou pressiona o botão físico.
Then: 201, evento SOS criado com severidade máxima; notificação enviada **imediatamente** a todos os cuidadores da residência, por push, ignorando qualquer preferência de "não perturbar".

Regras: SOS não passa pelo motor de regras — é direto. Confirmação de envio aparece na tela do morador ("Pedido de ajuda enviado às 14:32").
Falhas: se o app estiver offline no celular do morador, o botão físico (`botao_sos`, que conecta direto por Wi-Fi ao broker) ainda funciona, porque não depende do app estar aberto.
API: `postSOS`

**RF-16 · Cancelar SOS acidental**

Given: SOS acionado há menos de 30 segundos.
When: o morador toca "Cancelar, foi sem querer".
Then: o evento muda para `cancelado_pelo_morador`; os cuidadores ainda recebem a notificação, mas com essa marcação — não é apagado (falso alarme também é informação de segurança).
API: `patchSOS`

### 2.7 Histórico e notificações

**RF-17 · Central de notificações**

Given: cuidador autenticado.
When: abre o sino.
Then: lista paginada, lida/não lida. Toque abre o alerta ou o SOS relacionado.

Regras: push nativo (fora do app) é obrigatório para SOS e para alertas de severidade alta; para severidade baixa, a V1 usa só a central dentro do app.
API: `listNotificacoes` · `patchNotificacao`

**RF-18 · Histórico de eventos por dispositivo**

Given: cuidador vendo o detalhe de um dispositivo.
When: abre "Histórico".
Then: linha do tempo dos últimos 7 dias (leituras relevantes, não todo heartbeat).

Regras: eventos brutos de alta frequência (heartbeat) não aparecem na UI, só nos logs internos.
API: `listEventosDispositivo`

---

## 3. Estados de produto e falhas

Valem em **toda** tela de lista, controle ou envio.

| Estado                          | O que a pessoa vê                                          | Ação                                   |
| -------------------------------- | ------------------------------------------------------------ | ----------------------------------------- |
| **Loading**                      | Esqueleto de cards no primeiro load                          | Esperar                                   |
| **Vazio real**                   | "Nenhum dispositivo pareado ainda."                          | Botão parear dispositivo                  |
| **Dispositivo offline**          | Card com selo cinza + "sem contato desde 14:20"              | Ver último estado; sem ação de controle   |
| **Comando não confirmado**       | "Não foi possível confirmar." no card do dispositivo         | Tentar novamente                          |
| **Erro 5xx / timeout**           | Mensagem na seção que falhou, sem código HTTP                | Tentar novamente (só aquela chamada)      |
| **400 validação**                | Erro no campo do formulário                                  | Corrigir e reenviar                       |
| **401**                          | Sessão inválida (só afeta cuidador — morador usa PIN)        | Entrar de novo                            |
| **403 / 404**                    | Ação indisponível ou residência/dispositivo sumiu            | Sem retry em loop                         |
| **Offline com cache (app)**      | Último painel + aviso "Sem conexão"                          | Ler; controle remoto fica desabilitado    |
| **PIN incorreto (morador)**      | "PIN incorreto. Tente de novo."                               | Tentar de novo                            |

Cópia de exemplo:

- Vazio: "Nenhum dispositivo pareado ainda. Toque em Parear para começar."
- Offline app: "Sem conexão. Mostrando o último estado salvo."
- Dispositivo offline: "Sem contato com este dispositivo desde [hora]."
- SOS enviado: "Pedido de ajuda enviado. A família foi avisada."

---

## 4. Requisitos não funcionais

| ID         | Regra                                                                                   | Como saber que passou                                          |
| ---------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| **RNF-01** | Acessibilidade: fonte mínima 18px no perfil morador, alvo de toque ≥ 56px, contraste AA.  | Auditoria com checador de contraste; teste com fonte do sistema ampliada. |
| **RNF-02** | Latência de alerta crítico (SOS): do toque/pressão até a notificação chegar, < 10s em rede normal. | Medir ponta a ponta em teste manual e com o broker MQTT.           |
| **RNF-03** | Servidor é a fonte da verdade: id, timestamps, status, papel, estado de dispositivo.      | Cliente não assume "ligado" sem confirmação do dispositivo.        |
| **RNF-04** | Validação de negócio repete no servidor.                                                   | Request sem campo obrigatório via curl ainda toma 400.             |
| **RNF-05** | Nenhuma tela crítica (painel, SOS) termina em branco, mesmo offline.                       | Airplane mode: painel mostra último estado em cache.               |
| **RNF-06** | Privacidade / LGPD: dados de rotina (presença, horários) e saúde não saem do escopo da residência; sem venda ou análise de terceiro. | Revisão do schema; sem endpoint de exportação em massa na V1.      |
| **RNF-07** | Comunicação dispositivo → servidor via MQTT com TLS; comando crítico usa QoS 1 (pelo menos uma entrega). | Configuração do broker revisada em code review.                    |
| **RNF-08** | PIN do morador: 4 dígitos, mas com bloqueio temporário após 5 tentativas erradas em 10 minutos. | Teste automatizado de força bruta.                                  |
| **RNF-09** | HTTPS na API. Sem prontuário médico ou dado de terceiro fora do necessário no payload.      | Revisão do schema OpenAPI.                                          |
| **RNF-10** | API `/v1`. App antigo não quebra por path novo.                                            | Prefixos versionados.                                                |
| **RNF-11** | Banco **PostgreSQL**.                                                                       | Ver seção 6.                                                         |
| **RNF-12** | Sem câmera, sem reconhecimento facial, sem detecção de queda por visão computacional na V1. | Revisão de escopo — RF-06 lista só os 5 tipos aceitos.               |
| **RNF-13** | Dispositivo sem contato por mais de 15 min gera alerta de sistema (sensor "sumiu" é risco). | Teste: desligar sensor, checar alerta em até 16 min.                |

---

## 5. Contrato de API

Arquivo: [`../contract/openapi.yaml`](../contract/openapi.yaml).

Protocolo entre **app e servidor**: REST JSON. Protocolo entre **dispositivo e servidor**: MQTT (ver seção 6.3) — não entra no OpenAPI, porque não é HTTP.

### 5.1 Mapa (tela → operação)

| Tela / ação                     | Método e path                                  | operationId              |
| --------------------------------- | ------------------------------------------------- | --------------------------- |
| Saúde                              | `GET /v1/health`                                   | `getHealth`                 |
| Entrar (cuidador)                  | `POST /v1/auth`                                    | `postAuth`                  |
| Eu                                  | `GET /v1/me`                                       | `getMe`                     |
| Minhas residências                 | `GET /v1/residencias`                              | `getMinhasResidencias`      |
| Criar residência                   | `POST /v1/residencias`                             | `postResidencia`            |
| Convidar cuidador                  | `POST /v1/residencias/{id}/convites`               | `postConvite`                |
| Aceitar convite                    | `PATCH /v1/convites/{id}`                          | `patchConvite`               |
| Cadastrar morador                  | `POST /v1/residencias/{id}/moradores`              | `postMorador`                 |
| Login PIN (morador)                | `POST /v1/moradores/login-pin`                     | `postLoginPin`               |
| Parear dispositivo                 | `POST /v1/residencias/{id}/dispositivos/parear`    | `postPareamento`             |
| Painel / lista de dispositivos     | `GET /v1/residencias/{id}/dispositivos`            | `listDispositivos`           |
| Comandar dispositivo               | `POST /v1/dispositivos/{id}/comando`               | `postComandoDispositivo`     |
| Histórico do dispositivo           | `GET /v1/dispositivos/{id}/eventos`                | `listEventosDispositivo`     |
| Criar regra de alerta              | `POST /v1/residencias/{id}/regras`                 | `postRegraAlerta`            |
| Listar regras                      | `GET /v1/residencias/{id}/regras`                  | `listRegras`                 |
| Listar alertas                     | `GET /v1/residencias/{id}/alertas`                 | `listAlertas`                |
| Reconhecer alerta                  | `PATCH /v1/alertas/{id}`                           | `patchAlerta`                |
| Acionar SOS                        | `POST /v1/residencias/{id}/sos`                    | `postSOS`                    |
| Cancelar SOS                       | `PATCH /v1/sos/{id}`                               | `patchSOS`                   |
| Central de notificações            | `GET /v1/notificacoes`                             | `listNotificacoes`           |
| Marcar notificação lida            | `PATCH /v1/notificacoes/{id}`                      | `patchNotificacao`           |

### 5.2 Erro padrão (todo 4xx/5xx)

```
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Corrija os campos destacados.",
    "fields": { "nome": "obrigatório" }
  }
}
```

O app mapeia `code` + HTTP para a tabela da seção 3. Nunca mostra o JSON cru — nem para o cuidador, e muito menos na interface do morador.

### 5.3 Como mudar o contrato

1. Editar `contract/openapi.yaml`.
2. Ajustar API.
3. Ajustar o cliente (repositório, não a tela direto).
4. Atualizar a linha RF ↔ operationId neste SPEC se o comportamento mudar.

---

## 6. Dados e arquitetura

### 6.1 Por que SQL (PostgreSQL)

A V1 é relacional: uma residência tem muitos dispositivos e muitos cuidadores; um dispositivo tem muitas regras e muitos eventos; um alerta referencia uma regra e um dispositivo; toda mudança de estado de alerta precisa ser consistente (não pode "sumir" um alerta entre criar e notificar). PostgreSQL cobre isso nativamente com transação; um banco documento exigiria reconstruir essas garantias na aplicação.

### 6.2 Tabelas

```
usuarios              id, nome, email, senha_hash, created_at
residencias           id, nome, endereco_curto, created_at
residencia_membros    residencia_id, usuario_id, papel (dono|cuidador), created_at
moradores             id, residencia_id, nome, pin_hash, created_at
convites              id, residencia_id, email, status (pendente|aceito), created_at
dispositivos          id, residencia_id, tipo, nome, comodo, device_key,
                      estado_atual (jsonb), status (online|offline),
                      ultimo_contato_em, created_at
regras_alerta         id, dispositivo_id, condicao, parametros (jsonb),
                      ativa, created_at
alertas               id, residencia_id, regra_id, dispositivo_id,
                      severidade, status (aberto|reconhecido),
                      reconhecido_por, reconhecido_em, created_at
sos_eventos           id, residencia_id, morador_id, origem (app|botao_fisico),
                      status (aberto|cancelado_pelo_morador|reconhecido),
                      created_at
eventos_dispositivo   id, dispositivo_id, tipo, valor (jsonb), created_at
notificacoes          id, usuario_id, tipo, alvo_id, lida_em, created_at
```

O banco não guarda imagem nem áudio — nenhum dispositivo da V1 produz mídia (RNF-12).

### 6.3 Comunicação com os dispositivos (MQTT)

Cada dispositivo recebe, no pareamento, uma `device_key` usada como credencial MQTT (TLS obrigatório, RNF-07).

```
Tópicos (por dispositivo):
cuidalar/{residencia_id}/{dispositivo_id}/estado      — dispositivo publica leitura/estado
cuidalar/{residencia_id}/{dispositivo_id}/heartbeat   — dispositivo publica a cada 60s
cuidalar/{residencia_id}/{dispositivo_id}/comando     — servidor publica, dispositivo assina
cuidalar/{residencia_id}/{dispositivo_id}/sos         — só para botao_sos, QoS 1
```

Um serviço no backend assina `.../estado` e `.../sos` de todos os dispositivos, grava em `eventos_dispositivo`, atualiza `dispositivos.estado_atual` e roda o motor de regras (RF-13). Comandos do app (RF-10) viram uma publicação em `.../comando`; o dispositivo confirma publicando o novo estado em `.../estado`, e é essa confirmação — não o envio do comando — que o app mostra como sucesso.

### 6.4 Camadas no cliente mobile

```
UI  →  state holder  →  repository  →  cache local
                                   →  cliente HTTP (OpenAPI)
```

A tela não chama a rede direto. O servidor é dono de id, status e estado do dispositivo — o app nunca assume "comando aceito" sem confirmação.

### 6.5 Firmware (ESP32)

Fora do escopo deste SPEC (que cobre app + API), mas a referência de contrato para quem escreve o firmware é a seção 6.3: payload de `.../estado` deve ser um JSON pequeno e estável por tipo de dispositivo (ex.: `{"presenca": true}`, `{"temperatura": 23.4, "umidade": 55}`, `{"contato": "aberto"}`, `{"tomada": "ligada"}`). Mudança de payload é mudança de contrato — atualizar esta seção no mesmo commit do firmware.

---

## 7. Critério de pronto da V1

1. Cuidador cria conta, cria residência, convida um segundo cuidador.
2. Cuidador pareia pelo menos um sensor e um atuador.
3. Painel mostra o estado real dos dispositivos, com offline tratado (não tela branca, não estado inventado).
4. Cuidador controla o atuador remotamente e vê a confirmação vinda do dispositivo, não um "sucesso" fingido pelo app.
5. Cuidador cria uma regra; o evento certo do dispositivo gera alerta; a notificação chega.
6. Morador aciona o SOS (pelo app simplificado ou pelo botão físico) e todos os cuidadores da residência são notificados em menos de 10s em rede normal.
7. Wi-Fi da casa cai: app mostra dispositivo offline com honestidade, nunca finge estado atual.
8. Câmera, detecção de queda por visão computacional e chat entre cuidadores **não** existem na V1.

Se um agente entregar câmera, IA de visão, chat ou qualquer tela que este arquivo não descreva, o trabalho está fora do combinado.
