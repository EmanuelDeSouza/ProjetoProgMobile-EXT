// Texto humano para estados e eventos — nunca JSON na tela (DESIGN.md "Don't").
import type { Dispositivo } from "../types";

export function descreverLeitura(valor: Record<string, unknown>): string {
  if (typeof valor.presenca === "boolean") return valor.presenca ? "Movimento detectado" : "Sem movimento";
  if (valor.contato === "aberto") return "Aberta";
  if (valor.contato === "fechado") return "Fechada";
  if (typeof valor.temperatura === "number") {
    const u = typeof valor.umidade === "number" ? ` · umidade ${Math.round(valor.umidade)}%` : "";
    return `${valor.temperatura.toFixed(1)} °C${u}`;
  }
  if (valor.tomada === "ligada") return "Ligada";
  if (valor.tomada === "desligada") return "Desligada";
  if (valor.emergencia === true) return "Botão de emergência pressionado";
  return "Leitura recebida";
}

export function descreverEstado(d: Dispositivo): string {
  if (Object.keys(d.estadoAtual).length === 0) {
    return d.tipo === "botao_sos" ? "Pronto para uso" : "Aguardando primeira leitura";
  }
  if (d.tipo === "botao_sos") return "Pronto para uso";
  return descreverLeitura(d.estadoAtual);
}

export function horaCurta(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function dataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
