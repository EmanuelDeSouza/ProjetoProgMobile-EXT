// Serviço MQTT (SPEC 6.3): assina telemetria e anúncios de pareamento, valida com Zod,
// grava eventos, atualiza estado/status e roda o motor de regras (RF-13).
import { createCipheriv, randomBytes } from "node:crypto";
import mqtt, { type MqttClient } from "mqtt";
import { and, desc, eq, gt, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { config } from "./config";
import { dispositivos, eventosDispositivo, pareamentos, sosEventos, type Dispositivo } from "../db/schema";
import { anuncioPareamentoSchema, estadoPorTipo, sosPayloadSchema } from "./schemas";
import { evaluateDeviceEvent, notifyCaregivers, runPeriodicRuleChecks } from "./rules-engine";
import { Dynsec, topicosDispositivo } from "./dynsec";

let client: MqttClient | null = null;
let dynsec: Dynsec | null = null;
let pronto = false;
let periodicTimer: ReturnType<typeof setInterval> | null = null;
const esperandoPronto: Array<() => void> = [];

const PAREAMENTO_VALIDADE_MS = 10 * 60_000; // RF-07
const uuid = z.string().uuid();

export function getMqttClient(): MqttClient | null {
  return client;
}

export function mqttPronto(): boolean {
  return Boolean(client?.connected && pronto);
}

export function aguardarMqttPronto(timeoutMs = 10_000): Promise<void> {
  if (mqttPronto()) return Promise.resolve();
  return new Promise((ok, falha) => {
    const t = setTimeout(() => falha(new Error("broker MQTT não ficou pronto a tempo")), timeoutMs);
    esperandoPronto.push(() => {
      clearTimeout(t);
      ok();
    });
  });
}

function log(...args: unknown[]) {
  if (config.NODE_ENV !== "test") console.log("[MQTT]", ...args);
}

// ---------- Pareamento (RF-07) ----------

const topicoCredenciais = (codigo: string) => `cuidalar/pareamento/${codigo}/credenciais`;

async function handleAnuncio(codigo: string, payload: unknown): Promise<void> {
  if (!/^[0-9]{6}$/.test(codigo)) return;
  const parsed = anuncioPareamentoSchema.safeParse(payload);
  if (!parsed.success) return;
  const { tipo } = parsed.data;
  const chave = parsed.data.chave.toLowerCase();
  const agora = new Date();

  const [ativo] = await db
    .select()
    .from(pareamentos)
    .where(and(eq(pareamentos.codigo, codigo), isNull(pareamentos.usadoEm), gt(pareamentos.expiraEm, agora)))
    .orderBy(desc(pareamentos.createdAt))
    .limit(1);

  if (!ativo) {
    await db.insert(pareamentos).values({
      codigo,
      tipo,
      chave,
      expiraEm: new Date(agora.getTime() + PAREAMENTO_VALIDADE_MS),
    });
    log(`código ${codigo} anunciado (${tipo})`);
    return;
  }
  // Mesmo código com outra chave ou outro tipo: alguém tentando sequestrar o pareamento.
  if (ativo.chave !== chave || ativo.tipo !== tipo) {
    await db.update(pareamentos).set({ conflito: true }).where(eq(pareamentos.id, ativo.id));
  }
}

/** AES-256-GCM com a chave que o próprio dispositivo anunciou. Formato em SPEC 6.3. */
export function cifrarCredenciais(chaveHex: string, dados: object): { iv: string; dados: string; tag: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(chaveHex, "hex"), iv);
  const cifrado = Buffer.concat([cipher.update(JSON.stringify(dados), "utf-8"), cipher.final()]);
  return { iv: iv.toString("hex"), dados: cifrado.toString("hex"), tag: cipher.getAuthTag().toString("hex") };
}

function publicar(topic: string, payload: string, opts: { qos: 0 | 1; retain?: boolean }): Promise<boolean> {
  const c = client;
  if (!c || !c.connected) return Promise.resolve(false);
  return new Promise((ok) => {
    c.publish(topic, payload, { qos: opts.qos, retain: opts.retain ?? false }, (err) => {
      if (err) console.error(`[MQTT] falha ao publicar em ${topic}:`, err.message);
      ok(!err);
    });
  });
}

export async function publicarCredenciais(
  codigo: string,
  chaveHex: string,
  cred: { residenciaId: string; dispositivoId: string; deviceKey: string }
): Promise<boolean> {
  return publicar(topicoCredenciais(codigo), JSON.stringify(cifrarCredenciais(chaveHex, cred)), {
    qos: 1,
    retain: true,
  });
}

async function apagarCredencialRetida(codigo: string): Promise<void> {
  await publicar(topicoCredenciais(codigo), "", { qos: 1, retain: true });
}

/** Cria/atualiza o usuário MQTT do dispositivo no broker. Lança se o broker não responder. */
export async function sincronizarCredencialDispositivo(d: Pick<Dispositivo, "id" | "residenciaId" | "deviceKey">) {
  if (!config.MQTT_DYNSEC) return;
  if (!dynsec || !mqttPronto()) throw new Error("broker MQTT indisponível");
  await dynsec.garantirDispositivo(d);
}

// ---------- Telemetria ----------

async function confirmarPrimeiroContato(dispositivoId: string): Promise<void> {
  const [p] = await db
    .select()
    .from(pareamentos)
    .where(and(eq(pareamentos.dispositivoId, dispositivoId), isNull(pareamentos.confirmadoEm)));
  if (!p) return;
  await db.update(pareamentos).set({ confirmadoEm: new Date() }).where(eq(pareamentos.id, p.id));
  await apagarCredencialRetida(p.codigo);
}

export async function handleMqttMessage(topic: string, messageBuffer: Buffer): Promise<void> {
  const parts = topic.split("/");
  if (parts.length !== 4 || parts[0] !== "cuidalar") return;
  const [, a, b, acao] = parts as [string, string, string, string];

  let payload: unknown = {};
  const raw = messageBuffer.toString("utf-8").trim();
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      log(`payload não é JSON em ${topic}, descartado`);
      return;
    }
  }

  if (a === "pareamento") {
    if (acao === "anuncio") await handleAnuncio(b, payload);
    return;
  }

  const residenciaId = a;
  const dispositivoId = b;
  if (!uuid.safeParse(residenciaId).success || !uuid.safeParse(dispositivoId).success) return;
  if (acao !== "estado" && acao !== "heartbeat" && acao !== "sos") return;

  const [disp] = await db.select().from(dispositivos).where(eq(dispositivos.id, dispositivoId));
  if (!disp || disp.residenciaId !== residenciaId) {
    log(`mensagem de dispositivo desconhecido ou residência errada em ${topic}, descartada`);
    return;
  }

  const agora = new Date();

  if (acao === "heartbeat") {
    await db.update(dispositivos).set({ status: "online", ultimoContatoEm: agora }).where(eq(dispositivos.id, disp.id));
    await confirmarPrimeiroContato(disp.id);
    return;
  }

  if (acao === "estado") {
    const parsed = estadoPorTipo[disp.tipo].safeParse(payload);
    if (!parsed.success) {
      log(`estado inválido para ${disp.tipo} em ${topic}, descartado`);
      return;
    }
    const valor = parsed.data as Record<string, unknown>;
    await db.insert(eventosDispositivo).values({ dispositivoId: disp.id, tipo: Object.keys(valor)[0] ?? "estado", valor });
    await db
      .update(dispositivos)
      .set({ estadoAtual: valor, status: "online", ultimoContatoEm: agora })
      .where(eq(dispositivos.id, disp.id));
    await confirmarPrimeiroContato(disp.id);
    await evaluateDeviceEvent(disp.id, residenciaId, valor);
    return;
  }

  // acao === "sos": só botão físico (RF-15). QoS 1 pode entregar duplicado: ignora repetição em 30s.
  if (disp.tipo !== "botao_sos" || !sosPayloadSchema.safeParse(payload).success) return;
  await db.update(dispositivos).set({ status: "online", ultimoContatoEm: agora }).where(eq(dispositivos.id, disp.id));
  await confirmarPrimeiroContato(disp.id);
  const [recente] = await db
    .select({ id: sosEventos.id })
    .from(sosEventos)
    .where(
      and(
        eq(sosEventos.dispositivoId, disp.id),
        eq(sosEventos.status, "aberto"),
        gt(sosEventos.createdAt, new Date(agora.getTime() - 30_000))
      )
    );
  if (recente) return;
  await db.insert(eventosDispositivo).values({ dispositivoId: disp.id, tipo: "sos", valor: { emergencia: true } });
  const [sos] = await db
    .insert(sosEventos)
    .values({ residenciaId, dispositivoId: disp.id, origem: "botao_fisico", status: "aberto" })
    .returning();
  if (sos) {
    await notifyCaregivers(residenciaId, "sos", sos.id, {
      severidade: "alta",
      titulo: "🚨 SOS — botão de emergência",
      mensagem: `O botão "${disp.nome}" (${disp.comodo}) foi pressionado. Verifique imediatamente.`,
    });
  }
}

// ---------- Ciclo de vida ----------

async function aoConectar(c: MqttClient): Promise<void> {
  pronto = false;
  try {
    if (config.MQTT_DYNSEC) {
      dynsec ??= new Dynsec(c);
      await dynsec.iniciar();
      await dynsec.garantirPapeisBase();
    }
    await new Promise<void>((ok, falha) =>
      c.subscribe(
        ["cuidalar/+/+/estado", "cuidalar/+/+/heartbeat", "cuidalar/+/+/sos", "cuidalar/pareamento/+/anuncio"],
        { qos: 1 },
        (err, granted) => {
          if (err) return falha(err);
          const negado = granted?.find((g) => g.qos === 128);
          if (negado) return falha(new Error(`assinatura negada pelo broker: ${negado.topic}`));
          ok();
        }
      )
    );
    pronto = true;
    log("pronto: tópicos assinados");
    while (esperandoPronto.length) esperandoPronto.shift()?.();
    if (dynsec) {
      // Dispositivos já cadastrados (seed, ou broker recriado) ganham/recuperam o usuário MQTT.
      const todos = await db.select().from(dispositivos);
      await dynsec.garantirDispositivos(todos);
      log(`credenciais de ${todos.length} dispositivo(s) sincronizadas no broker`);
    }
  } catch (err) {
    console.error("[MQTT] falha ao preparar a conexão:", (err as Error).message);
  }
}

export function startMqttListener(): MqttClient {
  if (client) return client;

  const c = mqtt.connect(config.MQTT_BROKER_URL, {
    username: config.MQTT_USERNAME || undefined,
    password: config.MQTT_PASSWORD || undefined,
    clientId: `cuidalar-api-${randomBytes(4).toString("hex")}`,
    reconnectPeriod: 3000,
    connectTimeout: 5000,
  });
  client = c;
  dynsec = null;

  c.on("connect", () => {
    log("conectado ao broker", config.MQTT_BROKER_URL);
    void aoConectar(c);
  });
  c.on("close", () => {
    pronto = false;
  });
  c.on("message", (topic, message) => {
    if (topic.startsWith("$CONTROL/")) return;
    handleMqttMessage(topic, message).catch((err) => {
      console.error(`[MQTT] erro ao processar ${topic}:`, err);
    });
  });
  c.on("error", (err) => {
    console.error("[MQTT] erro no cliente:", err.message);
  });

  // RF-08, RF-13, RNF-13: offline, "sem movimento", contato após horário e limpeza de pareamentos.
  if (config.NODE_ENV !== "test") {
    periodicTimer = setInterval(() => {
      runPeriodicRuleChecks()
        .then(limparPareamentosVencidos)
        .catch((err) => console.error("[Regras] erro no ciclo periódico:", err));
    }, 60_000);
  }

  return c;
}

/** Credencial retida que nunca foi usada não fica no broker depois que o código expira. */
export async function limparPareamentosVencidos(): Promise<void> {
  const vencidos = await db
    .select()
    .from(pareamentos)
    .where(and(isNull(pareamentos.confirmadoEm), lt(pareamentos.expiraEm, new Date())));
  for (const p of vencidos) {
    if (p.dispositivoId) await apagarCredencialRetida(p.codigo);
    await db.update(pareamentos).set({ confirmadoEm: new Date() }).where(eq(pareamentos.id, p.id));
  }
}

export async function sendCommandToDevice(
  residenciaId: string,
  dispositivoId: string,
  acao: "ligar" | "desligar"
): Promise<boolean> {
  if (!mqttPronto()) return false;
  // RNF-07: comando crítico usa QoS 1
  return publicar(topicosDispositivo(residenciaId, dispositivoId).comando, JSON.stringify({ acao }), { qos: 1 });
}

export function stopMqttListener(): void {
  if (periodicTimer) {
    clearInterval(periodicTimer);
    periodicTimer = null;
  }
  if (client) {
    client.end(true);
    client = null;
  }
  dynsec = null;
  pronto = false;
}
