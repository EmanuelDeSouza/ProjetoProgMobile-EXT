import { describe, expect, it } from "bun:test";
import { colors, typography, spacing, rounded } from "../theme/tokens";

describe("DESIGN.md e RNF-01 · Design System e Acessibilidade", () => {
  it("Given tokens de cores, Then respeita os hexadecimais estipulados em DESIGN.md", () => {
    expect(colors.primary).toBe("#0F6B5C");
    expect(colors.primaryDeep).toBe("#0B4F44");
    expect(colors.paper).toBe("#FAFAF8");
    expect(colors.danger).toBe("#8A1F1F");
    expect(colors.sos).toBe("#B3261E");
    expect(colors.offline).toBe("#5C5A54");
  });

  it("Given tokens de tipografia do morador, Then atende ao RNF-01 (fonte >= 18px)", () => {
    expect(typography.moradorNumero.fontSize).toBeGreaterThanOrEqual(18);
    expect(typography.moradorTitulo.fontSize).toBeGreaterThanOrEqual(18);
    expect(typography.moradorBotao.fontSize).toBeGreaterThanOrEqual(18);
    expect(typography.moradorBotao.fontSize).toBe(22);
  });

  it("Given espaçamentos e raios de borda, Then define tamanhos padronizados", () => {
    expect(spacing.screenGutter).toBe(16);
    expect(rounded.md).toBe(12);
    expect(rounded.lg).toBe(16);
    expect(rounded.full).toBe(9999);
  });
});
