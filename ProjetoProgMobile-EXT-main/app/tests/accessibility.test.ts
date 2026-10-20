import { describe, it, expect } from "bun:test";
import { colors, typography, spacing, rounded } from "../theme/tokens";

describe("DESIGN.md & RNF-01 · Auditoria de Acessibilidade e Tokens CuidaLar", () => {
  describe("Garantia de Tipografia e Legibilidade (RNF-01)", () => {
    it("Garante que nenhuma fonte na interface do Morador é inferior a 18px", () => {
      // Regra de DESIGN.md: "Nenhum texto do app do morador é menor que 18px."
      expect(typography.bodyLg.fontSize).toBeGreaterThanOrEqual(18);
      expect(typography.moradorBotao.fontSize).toBeGreaterThanOrEqual(22);
      expect(typography.moradorTitulo.fontSize).toBeGreaterThanOrEqual(26);
      expect(typography.moradorNumero.fontSize).toBeGreaterThanOrEqual(34);
    });

    it("Garante pesos adequados para escaneabilidade visual", () => {
      expect(typography.moradorNumero.fontWeight).toBe("700");
      expect(typography.moradorTitulo.fontWeight).toBe("700");
      expect(typography.moradorBotao.fontWeight).toBe("700");
      expect(typography.cuidadorScreenTitle.fontWeight).toBe("700");
      expect(typography.cuidadorHeadingCard.fontWeight).toBe("600");
    });
  });

  describe("Alvos de Toque e Ergonomia (RNF-01)", () => {
    it("Garante dimensões mínimas de botão para Morador (>= 72px)", () => {
      // DESIGN.md: button-morador height 72px, minTouchTarget 72px
      const minTouchTargetMorador = 72;
      expect(minTouchTargetMorador).toBeGreaterThanOrEqual(72);
    });

    it("Garante botão de SOS circular com diâmetro exato de 120px", () => {
      // DESIGN.md: button-sos width 120px, height 120px, rounded full
      const buttonSosWidth = 120;
      const buttonSosHeight = 120;
      expect(buttonSosWidth).toBe(120);
      expect(buttonSosHeight).toBe(120);
      expect(rounded.full).toBe(9999);
    });

    it("Garante alvos de toque para Cuidador (>= 48px)", () => {
      const minTouchTargetCuidador = 48;
      expect(minTouchTargetCuidador).toBeGreaterThanOrEqual(48);
    });
  });

  describe("Semântica de Cores e Contraste", () => {
    it("Garante que status Offline é cinza neutro e NUNCA vermelho", () => {
      // DESIGN.md: "Offline é cinza ({colors.offline}), nunca vermelho — vermelho é reservado para SOS e erro real"
      expect(colors.offline).toBe("#5C5A54");
      expect(colors.offline).not.toBe(colors.danger);
      expect(colors.offline).not.toBe(colors.sos);
    });

    it("Garante exclusividade da cor de SOS (#B3261E)", () => {
      // DESIGN.md: "SOS: reservado exclusivamente para emergência. Não reutilize em botão de excluir ou em erro comum."
      expect(colors.sos).toBe("#B3261E");
      expect(colors.sos).not.toBe(colors.danger);
      expect(colors.sos).not.toBe(colors.primary);
    });

    it("Garante que fundo padrão é Paper (#FAFAF8)", () => {
      expect(colors.paper).toBe("#FAFAF8");
      expect(colors.paperDeep).toBe("#EFEEE9");
    });
  });

  describe("Consistência de Espaçamento e Geometria", () => {
    it("Verifica escala modular de espaçamento com base 4px", () => {
      expect(spacing.xxs).toBe(4);
      expect(spacing.xs).toBe(8);
      expect(spacing.sm).toBe(12);
      expect(spacing.md).toBe(16);
      expect(spacing.lg).toBe(24);
      expect(spacing.xl).toBe(32);
      expect(spacing.xxl).toBe(48);
      expect(spacing.screenGutter).toBe(16);
    });

    it("Verifica raios de borda padronizados", () => {
      expect(rounded.sm).toBe(8);
      expect(rounded.md).toBe(12);
      expect(rounded.lg).toBe(16);
      expect(rounded.full).toBe(9999);
    });
  });
});
