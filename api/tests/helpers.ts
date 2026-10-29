// Utilitários compartilhados pelos testes de comportamento.
// Os testes rodam contra Postgres e Mosquitto de verdade (docker compose up -d),
// sem mock de banco nem de cliente MQTT.
import { createDecipheriv, randomBytes } from "node:crypto";
import mqtt, { type MqttClient } from "mqtt";
import { eq } from "drizzle-orm";
import { handleRequest } from "../src/app";
import { db } from "../src/db";
import { config } from "../src/config";
import { dispositivos, type TipoDispositivo } from "../db/schema";
import { aguardarMqttPronto, startMqttListener } from "../src/mqtt-listener";

export interface Resposta<T = unknown> {
  status: number;
  body: T;
}

// Corpo de resposta genérico para inspecionar nos testes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any;

export async function api(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; rawBody?: string } = {}
): Promise<Resposta<Json>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await handleRequest(
    new Request(`http://localhost:3000/v1${path}`, {
      method,
      headers,
      body:
        opts.rawBody !== undefined
          ? opts.rawBody
          : opts.body !== undefined
            ? JSON.stringify(opts.body)
            : undefined,
    })
  );
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

let contador = 0;
export function emailUnico(prefixo = "cuidador"): string {
  contador += 1;
  return `${prefixo}_${Date.now()}_${contador}_${Math.floor(Math.random() * 1e6)}@teste.com`;
}

export interface Cuidador {
  token: string;
  id: string;
  email: string;
  nome: string;
}

export async function novoCuidador(nome = "Cuidador Teste", email = emailUnico()): Promise<Cuidador> {
  const r = await api("POST", "/usuarios", { body: { nome, email, senha: "senha123" } });
  if (r.status !== 201) throw new Error(`cadastro falhou: ${r.status} ${JSON.stringify(r.body)}`);
  return { token: r.body.token, id: r.body.usuario.id, email, nome };
}

export async function novaResidencia(token: string, nome = "Casa Teste"): Promise<string> {
  const r = await api("POST", "/residencias", { token, body: { nome, enderecoCurto: "Centro, Três de Maio" } });
  if (r.status !== 201) throw new Error(`residência falhou: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.id as string;
}

export async function novoMorador(
  tokenCuidador: string,
  residenciaId: string,
  pin = "1234"
): Promise<{ id: string; token: string }> {
  const c = await api("POST", `/residencias/${residenciaId}/moradores`, {
    token: tokenCuidador,
    body: { nome: "Dona Teste", pin },
  });
  if (c.status !== 201) throw new Error(`morador falhou: ${c.status} ${JSON.stringify(c.body)}`);
  const l = await api("POST", "/moradores/login-pin", { body: { moradorId: c.body.id, pin } });
  if (l.status !== 200) throw new Error(`login pin falhou: ${l.status}`);
  return { id: c.body.id as string, token: l.body.token as string };
}

/** Cria dispositivo direto no banco (para testes que não são sobre pareamento). */
export async function dispositivoNoBanco(
  residenciaId: string,
  tipo: TipoDispositivo,
  extra: Partial<typeof dispositivos.$inferInsert> = {}
) {
  const [d] = await db
    .insert(dispositivos)
    .values({
      residenciaId,
      tipo,
      nome: `${tipo} teste`,
      comodo: "Sala",
      deviceKey: `dev_${randomBytes(16).toString("hex")}`,
      status: "online",
      ultimoContatoEm: new Date(),
      ...extra,
    })
    .returning();
  if (!d) throw new Error("falha ao inserir dispositivo");
  return d;
}

export async function recarregarDispositivo(id: string) {
  const [d] = await db.select().from(dispositivos).where(eq(dispositivos.id, id));
  return d;
}

// ---------- MQTT ----------

let listenerIniciado = false;
export async function garantirListener(): Promise<void> {
  if (!listenerIniciado) {
    startMqttListener();
    listenerIniciado = true;
  }
  await aguardarMqttPronto(10_000);
}

export function conectarMqtt(opts: {
  username: string;
  password: string;
  clientId?: string;
}): Promise<MqttClient> {
  return new Promise((resolve, reject) => {
    const c = mqtt.connect(config.MQTT_BROKER_URL, {
      username: opts.username,
      password: opts.password,
      clientId: opts.clientId,
      reconnectPeriod: 0,
      connectTimeout: 5000,
    });
    c.once("connect", () => resolve(c));
    c.once("error", (e) => {
      c.end(true);
      reject(e);
    });
  });
}

export function publicar(c: MqttClient, topic: string, payload: unknown, qos: 0 | 1 = 1): Promise<void> {
  return new Promise((resolve, reject) => {
    c.publish(topic, typeof payload === "string" ? payload : JSON.stringify(payload), { qos }, (err) =>
      err ? reject(err) : resolve()
    );
  });
}

/** Assina um tópico e devolve a primeira mensagem (ou null no timeout). */
export function primeiraMensagem(c: MqttClient, topic: string, timeoutMs = 5000): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      c.removeListener("message", onMsg);
      resolve(null);
    }, timeoutMs);
    function onMsg(t: string, payload: Buffer) {
      if (t === topic && payload.length > 0) {
        clearTimeout(timer);
        c.removeListener("message", onMsg);
        resolve(payload);
      }
    }
    c.on("message", onMsg);
    c.subscribe(topic, { qos: 1 });
  });
}

export function esperar(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Espera até a condição ficar verdadeira (polling), como o app faz com a confirmação. */
export async function ate<T>(fn: () => Promise<T | null | undefined | false>, timeoutMs = 5000): Promise<T> {
  const fim = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > fim) throw new Error("condição não satisfeita a tempo");
    await esperar(100);
  }
}

/** Decifra as credenciais do pareamento exatamente como o firmware faz (AES-256-GCM). */
export function decifrarCredenciais(
  chaveHex: string,
  msg: { iv: string; dados: string; tag: string }
): { residenciaId: string; dispositivoId: string; deviceKey: string } {
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(chaveHex, "hex"), Buffer.from(msg.iv, "hex"));
  decipher.setAuthTag(Buffer.from(msg.tag, "hex"));
  const claro = Buffer.concat([decipher.update(Buffer.from(msg.dados, "hex")), decipher.final()]);
  return JSON.parse(claro.toString("utf-8"));
}

export function codigoAleatorio(): string {
  return String(100000 + Math.floor(Math.random() * 900000));
}

/** Simula um ESP32 em modo de pareamento: conecta com o usuário de provisionamento e anuncia o código. */
export async function anunciarDispositivo(tipo: TipoDispositivo, codigo = codigoAleatorio()) {
  const chave = randomBytes(32).toString("hex");
  const c = await conectarMqtt({
    username: config.MQTT_PROVISIONING_USERNAME,
    password: config.MQTT_PROVISIONING_PASSWORD,
    clientId: `setup-${codigo}-${randomBytes(3).toString("hex")}`,
  });
  await publicar(c, `cuidalar/pareamento/${codigo}/anuncio`, { tipo, chave });
  return { codigo, chave, cliente: c };
}
