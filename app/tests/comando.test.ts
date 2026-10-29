// RF-10 · Sucesso só com a confirmação do dispositivo; timeout de 8s vira "não foi possível confirmar".
import { describe, it, expect } from "bun:test";
import { aguardarConfirmacao, estadoAlvo } from "../src/services/comando";
import type { Dispositivo } from "../src/types";

const base: Dispositivo = {
  id: "d1",
  tipo: "atuador_tomada",
  nome: "Abajur",
  comodo: "Quarto",
  estadoAtual: { tomada: "desligada" },
  status: "online",
  ultimoContatoEm: null,
};

describe("RF-10 · Confirmação do comando", () => {
  it("Given o dispositivo confirma na 3ª leitura, Then true", async () => {
    let n = 0;
    const ok = await aguardarConfirmacao(
      async () => {
        n += 1;
        return [{ ...base, estadoAtual: { tomada: n >= 3 ? "ligada" : "desligada" } }];
      },
      "d1",
      estadoAlvo("ligar"),
      { intervaloMs: 5, timeoutMs: 1000 }
    );
    expect(ok).toBe(true);
    expect(n).toBe(3);
  });

  it("Given o dispositivo nunca confirma, Then false no timeout (não finge sucesso)", async () => {
    const ok = await aguardarConfirmacao(async () => [base], "d1", "ligada", { intervaloMs: 5, timeoutMs: 60 });
    expect(ok).toBe(false);
  });

  it("Given a rede oscila no meio, Then continua tentando até confirmar", async () => {
    let n = 0;
    const ok = await aguardarConfirmacao(
      async () => {
        n += 1;
        if (n === 1) throw new Error("rede");
        return [{ ...base, estadoAtual: { tomada: "desligada" } }];
      },
      "d1",
      estadoAlvo("desligar"),
      { intervaloMs: 5, timeoutMs: 1000 }
    );
    expect(ok).toBe(true);
  });
});
