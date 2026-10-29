// RF-10 · O app só mostra sucesso quando o estado confirmado pelo dispositivo chega
// (tópico .../estado → API → estadoAtual). Nunca no envio.
import type { Dispositivo } from "../types";

export const TIMEOUT_CONFIRMACAO_MS = 8000;

export function estadoAlvo(acao: "ligar" | "desligar"): "ligada" | "desligada" {
  return acao === "ligar" ? "ligada" : "desligada";
}

/**
 * Consulta a lista até o dispositivo reportar o estado esperado ou o tempo acabar.
 * `aoAtualizar` recebe cada lista lida (para o painel refletir o que chegou).
 */
export async function aguardarConfirmacao(
  buscar: () => Promise<Dispositivo[]>,
  dispositivoId: string,
  alvo: "ligada" | "desligada",
  opts: { timeoutMs?: number; intervaloMs?: number; aoAtualizar?: (l: Dispositivo[]) => void } = {}
): Promise<boolean> {
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_CONFIRMACAO_MS;
  const intervaloMs = opts.intervaloMs ?? 700;
  const fim = Date.now() + timeoutMs;
  while (Date.now() < fim) {
    await new Promise((r) => setTimeout(r, intervaloMs));
    try {
      const lista = await buscar();
      opts.aoAtualizar?.(lista);
      const d = lista.find((x) => x.id === dispositivoId);
      if (d?.estadoAtual.tomada === alvo) return true;
    } catch {
      // rede oscilou: continua tentando até o timeout
    }
  }
  return false;
}
