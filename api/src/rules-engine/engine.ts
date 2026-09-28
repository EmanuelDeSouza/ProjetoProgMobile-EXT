import { randomUUID } from "node:crypto";
import type {
  DispositivoRecord,
  RegraAlertaRecord,
  AlertaRecord,
} from "../repositories/types";

export interface EvaluateRulesInput {
  dispositivo: DispositivoRecord;
  evento: Record<string, unknown>;
  regras: RegraAlertaRecord[];
  alertasAbertos: AlertaRecord[];
  agora?: Date;
}

export function evaluateRules({
  dispositivo,
  evento,
  regras,
  alertasAbertos,
  agora = new Date(),
}: EvaluateRulesInput): AlertaRecord[] {
  const novosAlertas: AlertaRecord[] = [];

  for (const regra of regras) {
    if (!regra.ativa) continue;

    // A regra deve se aplicar a este dispositivo (ou ser global da residência)
    if (regra.dispositivoId && regra.dispositivoId !== dispositivo.id) {
      continue;
    }

    // Regra: "a mesma condição não gera um segundo alerta enquanto o primeiro estiver aberto"
    const jaTemAlertaAberto = alertasAbertos.some(
      (a) => a.regraId === regra.id && a.status === "aberto"
    );
    if (jaTemAlertaAberto) {
      continue;
    }

    let disparou = false;
    let severidade: "baixa" | "media" | "alta" = "media";

    switch (regra.condicao) {
      case "temperatura_fora_da_faixa": {
        const temp = typeof evento.temperatura === "number" ? evento.temperatura : null;
        if (temp !== null) {
          const min = typeof regra.parametros.min === "number" ? regra.parametros.min : -Infinity;
          const max = typeof regra.parametros.max === "number" ? regra.parametros.max : Infinity;
          if (temp < min || temp > max) {
            disparou = true;
            severidade = temp > 35 || temp < 10 ? "alta" : "media";
          }
        }
        break;
      }

      case "contato_aberto_apos_horario": {
        const contato = evento.contato;
        if (contato === "aberto") {
          const aposHoraStr = typeof regra.parametros.aposHora === "string" ? regra.parametros.aposHora : "22:00";
          const [horaLimite, minutoLimite] = aposHoraStr.split(":").map(Number);
          const horaAtual = agora.getHours();
          const minutoAtual = agora.getMinutes();

          if (
            horaLimite !== undefined &&
            minutoLimite !== undefined &&
            (horaAtual > horaLimite || (horaAtual === horaLimite && minutoAtual >= minutoLimite))
          ) {
            disparou = true;
            severidade = "alta";
          }
        }
        break;
      }

      case "dispositivo_offline": {
        if (dispositivo.status === "offline") {
          disparou = true;
          severidade = "alta";
        }
        break;
      }

      case "sem_movimento_por": {
        if (evento.presenca === false) {
          disparou = true;
          severidade = "media";
        }
        break;
      }
    }

    if (disparou) {
      novosAlertas.push({
        id: randomUUID(),
        residenciaId: dispositivo.residenciaId,
        regraId: regra.id,
        dispositivoId: dispositivo.id,
        severidade,
        status: "aberto",
        reconhecidoPor: null,
        reconhecidoEm: null,
        createdAt: new Date(),
      });
    }
  }

  return novosAlertas;
}
