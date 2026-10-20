import { describe, it, expect } from "bun:test";
import { colors, typography, spacing, rounded } from "../theme/tokens";

describe("DESIGN.md · Tokens e Regras de Acessibilidade", () => {
  it("Valida paleta canônica (fundo paper, primário verde-azulado, sos exclusivo)", () => {
    expect(colors.paper).toBe("#FAFAF8");
    expect(colors.primary).toBe("#0F6B5C");
    expect(colors.sos).toBe("#B3261E");
    // Offline é cinza, NUNCA vermelho
    expect(colors.offline).toBe("#5C5A54");
    expect(colors.offline).not.toBe(colors.sos);
    expect(colors.offline).not.toBe(colors.danger);
  });

  it("Garante tipografia mínima para o morador (>= 18px)", () => {
    expect(typography.bodyLg.fontSize).toBeGreaterThanOrEqual(18);
    expect(typography.moradorBotao.fontSize).toBeGreaterThanOrEqual(22);
    expect(typography.moradorTitulo.fontSize).toBeGreaterThanOrEqual(26);
    expect(typography.moradorNumero.fontSize).toBe(34);
  });

  it("Garante consistência de raios e espaçamento", () => {
    expect(spacing.xxs).toBe(4);
    expect(spacing.screenGutter).toBe(16);
    expect(rounded.full).toBe(9999);
  });
});
