import { eq, and } from "drizzle-orm";
import { db } from "./db";
import {
  alertas,
  dispositivos,
  notificacoes,
  regrasAlerta,
  residenciaMembros,
  usuarios,
  type RegraAlerta,
} from "../db/schema";
import { sendNativePushNotification } from "./services/push";

export interface NotifyCaregiversOptions {
  severidade?: "baixa" | "media" | "alta";
  titulo?: string;
  mensagem?: string;
}

export async function notifyCaregivers(
  residenciaId: string,
  tipo: "alerta" | "sos",
  alvoId: string,
  options?: NotifyCaregiversOptions
) {
  const membros = await db
    .select({
      usuarioId: residenciaMembros.usuarioId,
      pushToken: usuarios.pushToken,
    })
    .from(residenciaMembros)
    .leftJoin(usuarios, eq(residenciaMembros.usuarioId, usuarios.id))
    .where(eq(residenciaMembros.residenciaId, residenciaId));

  const recordsToInsert = membros.map((membro) => ({
    usuarioId: membro.usuarioId,
    tipo,
    alvoId,
  }));

  if (recordsToInsert.length > 0) {
    await db.insert(notificacoes).values(recordsToInsert);
  }

  // Push Nativo Obrigatório para SOS e Alertas de Alta Severidade (RF-15, RF-17, RNF-02)
  const isSos = tipo === "sos";
  const isHighAlert = tipo === "alerta" && options?.severidade === "alta";
  const isMediumAlert = tipo === "alerta" && options?.severidade === "media";

  if (isSos || isHighAlert || isMediumAlert) {
    const tokens = membros
      .map((m) => m.pushToken)
      .filter((t): t is string => Boolean(t && t.trim().length > 0));

    if (tokens.length > 0) {
      const title =
        options?.titulo ||
        (isSos
          ? "🚨 ALERTA SOS - Emergência!"
          : isHighAlert
          ? "⚠️ Alerta de Segurança"
          : "Aviso de Monitoramento");

      const body =
        options?.mensagem ||
        (isSos
          ? "Pedido de socorro acionado na residência. Verifique imediatamente."
          : isHighAlert
          ? "Alerta crítico disparado pelos sensores da residência."
          : "Notificação de evento na residência.");

      await sendNativePushNotification({
        to: tokens,
        title,
        body,
        priority: isSos || isHighAlert ? "high" : "normal",
        channelId: isSos ? "sos-critical" : isHighAlert ? "alertas-alta" : "alertas-geral",
        data: {
          tipo,
          alvoId,
          residenciaId,
          severidade: options?.severidade || (isSos ? "alta" : "media"),
        },
      });
    }
  }
}

export async function evaluateDeviceEvent(
  dispositivoId: string,
  residenciaId: string,
  payload: Record<string, unknown>
) {
  // Find all active rules for this device
  const activeRules = await db
    .select()
    .from(regrasAlerta)
    .where(
      and(
        eq(regrasAlerta.dispositivoId, dispositivoId),
        eq(regrasAlerta.ativa, true)
      )
    );

  for (const regra of activeRules) {
    await checkRule(regra, residenciaId, payload);
  }
}

export async function checkRule(
  regra: typeof regrasAlerta.$inferSelect,
  residenciaId: string,
  eventValue?: Record<string, unknown>
) {
  let shouldTrigger = false;
  let severidade: "baixa" | "media" | "alta" = "media";

  const params = (regra.parametros as Record<string, unknown>) || {};

  switch (regra.condicao) {
    case "contato_aberto_apos_horario": {
      // payload ex: { contato: "aberto" }
      const contato = eventValue?.contato;
      if (contato === "aberto") {
        const horarioLimite = (params.horario as string) || "22:00";
        const horarioFim = (params.horarioFim as string) || "06:00";
        const now = new Date();
        const currentHours = now.getHours().toString().padStart(2, "0");
        const currentMinutes = now.getMinutes().toString().padStart(2, "0");
        const currentTime = `${currentHours}:${currentMinutes}`;

        const isTriggerTime =
          horarioLimite > horarioFim
            ? currentTime >= horarioLimite || currentTime < horarioFim
            : currentTime >= horarioLimite && currentTime < horarioFim;

        if (isTriggerTime) {
          shouldTrigger = true;
          severidade = "media";
        }
      }
      break;
    }

    case "temperatura_fora_da_faixa": {
      // payload ex: { temperatura: 32 }
      const temp = typeof eventValue?.temperatura === "number" ? eventValue.temperatura : null;
      if (temp !== null) {
        const min = typeof params.min === "number" ? params.min : 18;
        const max = typeof params.max === "number" ? params.max : 28;
        if (temp < min || temp > max) {
          shouldTrigger = true;
          severidade = (temp > max + 5 || temp < min - 5) ? "alta" : "baixa";
        }
      }
      break;
    }

    case "sem_movimento_por": {
      // Evaluated either on periodic check or check absence of motion
      const horas = typeof params.horas === "number" ? params.horas : 4;
      const thresholdMs = horas * 60 * 60 * 1000;
      const [disp] = await db
        .select()
        .from(dispositivos)
        .where(eq(dispositivos.id, regra.dispositivoId!));

      if (disp && disp.ultimoContatoEm) {
        const diff = Date.now() - new Date(disp.ultimoContatoEm).getTime();
        if (diff >= thresholdMs) {
          shouldTrigger = true;
          severidade = "alta";
        }
      }
      break;
    }

    case "dispositivo_offline": {
      const [disp] = await db
        .select()
        .from(dispositivos)
        .where(eq(dispositivos.id, regra.dispositivoId!));

      if (disp && disp.status === "offline") {
        shouldTrigger = true;
        severidade = "alta";
      }
      break;
    }
  }

  if (shouldTrigger) {
    // Check if there is already an open alert for this rule
    const existingOpenAlert = await db
      .select()
      .from(alertas)
      .where(
        and(
          eq(alertas.regraId, regra.id),
          eq(alertas.status, "aberto")
        )
      );

    if (existingOpenAlert.length === 0) {
      const [createdAlerta] = await db
        .insert(alertas)
        .values({
          residenciaId,
          regraId: regra.id,
          dispositivoId: regra.dispositivoId,
          severidade,
          status: "aberto",
        })
        .returning();

      if (createdAlerta) {
        await notifyCaregivers(residenciaId, "alerta", createdAlerta.id, { severidade });
      }
    }
  }
}

// Background evaluation routine for RF-13 (sem movimento) and RNF-13 (dispositivo sem contato > 15min)
export async function runPeriodicRuleChecks() {
  try {
    const allDispositivos = await db.select().from(dispositivos);
    const now = Date.now();

    for (const disp of allDispositivos) {
      if (!disp.ultimoContatoEm) continue;
      const lastContactMs = new Date(disp.ultimoContatoEm).getTime();
      const elapsedMs = now - lastContactMs;

      // RF-08: Dispositivo sem heartbeat por mais de 5 minutos -> offline
      if (elapsedMs > 5 * 60 * 1000 && disp.status === "online") {
        await db
          .update(dispositivos)
          .set({ status: "offline" })
          .where(eq(dispositivos.id, disp.id));
      }

      // RNF-13 / RF-08: Dispositivo crítico offline > 15min gera alerta de sistema
      const isCritical = disp.tipo === "botao_sos" || disp.tipo === "sensor_presenca";
      if (isCritical && elapsedMs > 15 * 60 * 1000) {
        // Check if open alert already exists
        const [existingAlert] = await db
          .select()
          .from(alertas)
          .where(
            and(
              eq(alertas.dispositivoId, disp.id),
              eq(alertas.status, "aberto")
            )
          );

        if (!existingAlert) {
          const [created] = await db
            .insert(alertas)
            .values({
              residenciaId: disp.residenciaId,
              dispositivoId: disp.id,
              severidade: "alta",
              status: "aberto",
              nota: "Dispositivo crítico sem contato há mais de 15 minutos.",
            })
            .returning();

          if (created) {
            await notifyCaregivers(disp.residenciaId, "alerta", created.id, {
              severidade: "alta",
              titulo: "⚠️ Dispositivo Crítico Offline",
              mensagem: "Dispositivo crítico sem contato há mais de 15 minutos.",
            });
          }
        }
      }
    }

    // Evaluate active 'sem_movimento_por' and 'dispositivo_offline' rules
    const rules = await db
      .select()
      .from(regrasAlerta)
      .where(eq(regrasAlerta.ativa, true));

    for (const regra of rules) {
      if (regra.condicao === "sem_movimento_por" || regra.condicao === "dispositivo_offline") {
        await checkRule(regra, regra.residenciaId);
      }
    }
  } catch (err) {
    console.error("Erro ao rodar checagens periódicas de regras:", err);
  }
}
