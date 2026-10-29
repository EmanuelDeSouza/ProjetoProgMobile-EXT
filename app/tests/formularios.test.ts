import { describe, it, expect } from "bun:test";
import { formCadastro, formMorador, formPareamento, parametrosRegra } from "../src/services/schemas";
import { descreverEstado, descreverLeitura } from "../src/services/descricao";

describe("Validação de formulário antes de enviar (Zod no app)", () => {
  it("PIN tem exatamente 4 números", () => {
    expect(formMorador.safeParse({ nome: "Elza", pin: "1234" }).success).toBe(true);
    expect(formMorador.safeParse({ nome: "Elza", pin: "12a4" }).success).toBe(false);
    expect(formMorador.safeParse({ nome: "Elza", pin: "123" }).success).toBe(false);
  });

  it("Código de pareamento tem 6 números e tipo dos 5 da V1", () => {
    expect(formPareamento.safeParse({ codigo: "123456", tipo: "sensor_contato", nome: "a", comodo: "b" }).success).toBe(true);
    expect(formPareamento.safeParse({ codigo: "12345", tipo: "sensor_contato", nome: "a", comodo: "b" }).success).toBe(false);
    expect(formPareamento.safeParse({ codigo: "123456", tipo: "camera", nome: "a", comodo: "b" }).success).toBe(false);
  });

  it("Cadastro exige nome, e-mail e senha de 6+", () => {
    expect(formCadastro.safeParse({ nome: "Ana", email: "a@b.com", senha: "123456" }).success).toBe(true);
    expect(formCadastro.safeParse({ nome: "", email: "a@b.com", senha: "123456" }).success).toBe(false);
    expect(formCadastro.safeParse({ nome: "Ana", email: "a@b.com", senha: "123" }).success).toBe(false);
  });

  it("Parâmetros de regra seguem o contrato do servidor", () => {
    expect(parametrosRegra.temperatura_fora_da_faixa.safeParse({ min: 18, max: 28 }).success).toBe(true);
    expect(parametrosRegra.temperatura_fora_da_faixa.safeParse({ min: 30, max: 20 }).success).toBe(false);
    expect(parametrosRegra.contato_aberto_apos_horario.safeParse({ horario: "22:00", horarioFim: "06:00" }).success).toBe(true);
    expect(parametrosRegra.contato_aberto_apos_horario.safeParse({ horario: "25:00", horarioFim: "06:00" }).success).toBe(false);
    expect(parametrosRegra.sem_movimento_por.safeParse({ horas: 0 }).success).toBe(false);
  });
});

describe("Texto humano, nunca JSON na tela (DESIGN.md)", () => {
  it("descreve leituras de cada tipo", () => {
    expect(descreverLeitura({ presenca: true })).toBe("Movimento detectado");
    expect(descreverLeitura({ contato: "aberto" })).toBe("Aberta");
    expect(descreverLeitura({ temperatura: 23.44, umidade: 55 })).toBe("23.4 °C · umidade 55%");
    expect(descreverLeitura({ tomada: "ligada" })).toBe("Ligada");
  });

  it("dispositivo recém-pareado sem leitura não finge estado", () => {
    expect(
      descreverEstado({ id: "x", tipo: "sensor_contato", nome: "P", comodo: "S", estadoAtual: {}, status: "offline", ultimoContatoEm: null })
    ).toBe("Aguardando primeira leitura");
  });
});
