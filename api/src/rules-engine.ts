// RF-13 · Motor de avaliação. RF-08/RNF-13 · offline e alerta de sistema. RF-14/RF-17 · notificação.
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { db } from "./db";
import { config } from "./config";
import {
  alertas,
  dispositivos,
  eventosDispositivo,
  notificacoes,
  regrasAlerta,
  residenciaMembros,
  usuarios,
  type Dispositivo,
  type RegraAlerta,
} from "../db/schema";
import { parametrosPorCondicao } from "./schemas";
import { sendNativePushNotification } from "./services/push";

export type Severidade = "baixa" | "media" | "alta";
export type TipoNotificacao = "alerta" | "sos" | "sos_cancelado" | "convite";

export interface NotifyCaregiversOptions {
  severidade?: Severidade;
  titulo?: string;
  mensagem?: string;
}

const OFFLINE_APOS_MS = 5 * 60_000; // RF-08
const ALERTA_SISTEMA_APOS_MS = 15 * 60_000; // RNF-13

/** Grava notificação para todos os cuidadores da residência e dispara push quando o SPEC exige. */
export async function notifyCaregivers(
  residenciaId: string,
  tipo: Exclude<TipoNotificacao, "convite">,
  alvoId: string,
  options: NotifyCaregiversOptions = {}
): Promise<void> {
  const membros = await db
    .select({ usuarioId: residenciaMembros.usuarioId, pushToken: usuarios.pushToken })
    .from(residenciaMembros)
    .innerJoin(usuarios, eq(residenciaMembros.usuarioId, usuarios.id))
    .where(eq(residenciaMembros.residenciaId, residenciaId));
  if (membros.length === 0) return;

  const severidade: Severidade = options.severidade ?? (tipo === "alerta" ? "media" : "alta");
  const titulo =
    options.titulo ??
    (tipo === "sos"
      ? "🚨 SOS — pedido de ajuda"
      : tipo === "sos_cancelado"
        ? "SOS cancelado pelo morador"
        : "Alerta na residência");
  const mensagem = options.mensagem ?? "Abra o CuidaLar para ver os detalhes.";

  await db.insert(notificacoes).values(
    membros.map((m) => ({ usuarioId: m.usuarioId, residenciaId, tipo, alvoId, titulo, mensagem }))
  );

  // RF-17: push obrigatório para SOS e alerta alto; baixa fica só na central do app.
  const critico = tipo === "sos" || (tipo === "alerta" && severidade === "alta");
  const comPush = critico || tipo === "sos_cancelado" || (tipo === "alerta" && severidade === "media");
  if (!comPush) return;

  const tokens = membros.map((m) => m.pushToken).filter((t): t is string => Boolean(t && t.trim()));
  if (tokens.length === 0) return;
  await sendNativePushNotification({
    to: tokens,
    title: titulo,
    body: mensagem,
    priority: critico ? "high" : "normal",
    channelId: tipo === "sos" ? "sos-critical" : critico ? "alertas-alta" : "alertas-geral",
    data: { tipo, alvoId, residenciaId, severidade },
  });
}

// ---------- Horário local (RF-12) ----------

export function horaLocalAgora(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: config.APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(agora);
}

/** Janela [inicio, fim) em HH:MM; se inicio > fim, atravessa a meia-noite (ex.: 22:00 → 06:00). */
export function dentroDaJanela(agora: string, inicio: string, fim: string): boolean {
  return inicio > fim ? agora >= inicio || agora < fim : agora >= inicio && agora < fim;
}

// ---------- Avaliação ----------

interface Disparo {
  severidade: Severidade;
  mensagem: string;
}

async function ultimaPresenca(d: Dispositivo): Promise<Date> {
  const [ev] = await db
    .select({ createdAt: eventosDispositivo.createdAt })
    .from(eventosDispositivo)
    .where(
      and(
        eq(eventosDispositivo.dispositivoId, d.id),
        sql`${eventosDispositivo.valor} ->> 'presenca' = 'true'`
      )
    )
    .orderBy(desc(eventosDispositivo.createdAt))
    .limit(1);
  return ev?.createdAt ?? d.createdAt;
}

async function avaliar(regra: RegraAlerta, d: Dispositivo, evento?: Record<string, unknown>): Promise<Disparo | null> {
  switch (regra.condicao) {
    case "contato_aberto_apos_horario": {
      const p = parametrosPorCondicao.contato_aberto_apos_horario.safeParse(regra.parametros);
      if (!p.success) return null;
      const contato = (evento ?? d.estadoAtual).contato;
      if (contato !== "aberto" || d.status !== "online") return null;
      if (!dentroDaJanela(horaLocalAgora(), p.data.horario, p.data.horarioFim)) return null;
      return { severidade: "media", mensagem: `${d.nome} (${d.comodo}) está aberta fora do horário.` };
    }
    case "temperatura_fora_da_faixa": {
      if (!evento) return null; // só reage a leitura nova
      const p = parametrosPorCondicao.temperatura_fora_da_faixa.safeParse(regra.parametros);
      const temp = evento.temperatura;
      if (!p.success || typeof temp !== "number") return null;
      const { min, max } = p.data;
      if (temp >= min && temp <= max) return null;
      return {
        severidade: temp > max + 5 || temp < min - 5 ? "alta" : "baixa",
        mensagem: `${d.nome} (${d.comodo}) marcou ${temp.toFixed(1)} °C (faixa ${min}–${max} °C).`,
      };
    }
    case "sem_movimento_por": {
      if (evento) return null; // não há evento para "nada aconteceu": só no ciclo periódico
      const p = parametrosPorCondicao.sem_movimento_por.safeParse(regra.parametros);
      if (!p.success || d.status !== "online") return null; // offline gera alerta de sistema (RF-08)
      const desde = await ultimaPresenca(d);
      if (Date.now() - desde.getTime() < p.data.horas * 3600_000) return null;
      return { severidade: "alta", mensagem: `Nenhum movimento em ${d.comodo} há mais de ${p.data.horas} h.` };
    }
    case "dispositivo_offline": {
      if (d.status !== "offline") return null;
      return { severidade: "alta", mensagem: `${d.nome} (${d.comodo}) está sem contato.` };
    }
  }
}

async function dispararSeNovo(regra: RegraAlerta, d: Dispositivo, disparo: Disparo): Promise<void> {
  // A mesma regra não gera segundo alerta enquanto o primeiro estiver aberto (RF-13).
  const criado = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${regra.id}))`);
    const [aberto] = await tx
      .select({ id: alertas.id })
      .from(alertas)
      .where(and(eq(alertas.regraId, regra.id), eq(alertas.status, "aberto")));
    if (aberto) return null;
    const [a] = await tx
      .insert(alertas)
      .values({ residenciaId: d.residenciaId, regraId: regra.id, dispositivoId: d.id, severidade: disparo.severidade })
      .returning();
    return a ?? null;
  });
  if (!criado) return;
  await notifyCaregivers(d.residenciaId, "alerta", criado.id, {
    severidade: disparo.severidade,
    titulo: disparo.severidade === "alta" ? "⚠️ Alerta importante" : "Alerta na residência",
    mensagem: disparo.mensagem,
  });
}

/** Chamado pelo listener MQTT a cada estado novo. */
export async function evaluateDeviceEvent(
  dispositivoId: string,
  _residenciaId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const [d] = await db.select().from(dispositivos).where(eq(dispositivos.id, dispositivoId));
  if (!d) return;
  const regras = await db
    .select()
    .from(regrasAlerta)
    .where(and(eq(regrasAlerta.dispositivoId, dispositivoId), eq(regrasAlerta.ativa, true)));
  for (const regra of regras) {
    const disparo = await avaliar(regra, d, payload);
    if (disparo) await dispararSeNovo(regra, d, disparo);
  }
}

/** Ciclo periódico (a cada minuto): offline, alerta de sistema, "sem movimento", contato fora do horário. */
export async function runPeriodicRuleChecks(): Promise<void> {
  const agora = Date.now();

  // RF-08: sem heartbeat por mais de 5 min → offline
  await db
    .update(dispositivos)
    .set({ status: "offline" })
    .where(
      and(
        eq(dispositivos.status, "online"),
        lt(dispositivos.ultimoContatoEm, new Date(agora - OFFLINE_APOS_MS))
      )
    );

  // RNF-13: dispositivo crítico (botao_sos, ou sensor de presença usado em regra ativa) sem contato > 15 min
  const semContato = await db
    .select()
    .from(dispositivos)
    .where(lt(dispositivos.ultimoContatoEm, new Date(agora - ALERTA_SISTEMA_APOS_MS)));
  for (const d of semContato) {
    let critico = d.tipo === "botao_sos";
    if (d.tipo === "sensor_presenca") {
      const [r] = await db
        .select({ id: regrasAlerta.id })
        .from(regrasAlerta)
        .where(and(eq(regrasAlerta.dispositivoId, d.id), eq(regrasAlerta.ativa, true)))
        .limit(1);
      critico = Boolean(r);
    }
    if (!critico) continue;

    const criado = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"sistema:" + d.id}))`);
      const [aberto] = await tx
        .select({ id: alertas.id })
        .from(alertas)
        .where(and(eq(alertas.dispositivoId, d.id), isNull(alertas.regraId), eq(alertas.status, "aberto")));
      if (aberto) return null;
      const [a] = await tx
        .insert(alertas)
        .values({
          residenciaId: d.residenciaId,
          dispositivoId: d.id,
          severidade: "alta",
          nota: "Dispositivo crítico sem contato há mais de 15 minutos.",
        })
        .returning();
      return a ?? null;
    });
    if (criado) {
      await notifyCaregivers(d.residenciaId, "alerta", criado.id, {
        severidade: "alta",
        titulo: "⚠️ Dispositivo sem contato",
        mensagem: `${d.nome} (${d.comodo}) não fala com a gente há mais de 15 minutos.`,
      });
    }
  }

  // Regras que dependem do tempo, não de evento novo
  const regras = await db
    .select({ regra: regrasAlerta, disp: dispositivos })
    .from(regrasAlerta)
    .innerJoin(dispositivos, eq(regrasAlerta.dispositivoId, dispositivos.id))
    .where(
      and(
        eq(regrasAlerta.ativa, true),
        sql`${regrasAlerta.condicao} in ('sem_movimento_por', 'contato_aberto_apos_horario', 'dispositivo_offline')`
      )
    );
  for (const { regra, disp } of regras) {
    const disparo = await avaliar(regra, disp);
    if (disparo) await dispararSeNovo(regra, disp, disparo);
  }
}
