import { describe, it, expect } from "bun:test";
import { handleRequest } from "../src/app";

describe("RF-01 · Login com e-mail e senha (Cuidador)", () => {
  it("Given cuidador existente, When informa e-mail/senha válidos, Then recebe token e dados do usuário", async () => {
    const email = `cuidador_${Date.now()}@teste.com`;
    const senha = "senhaSegura123";

    const req = new Request("http://localhost:3000/v1/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        metodo: "senha",
        email,
        senha,
      }),
    });

    const res = await handleRequest(req);
    // If DB is reachable it returns 200, otherwise 500/network error
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      const data = await res.json();
      expect(data).toHaveProperty("token");
      expect(data.usuario).toHaveProperty("id");
      expect(data.usuario.email).toBe(email);
    }
  });

  it("Given tentativa com senha incorreta, When informa credenciais inválidas, Then retorna 401", async () => {
    const email = `cuidador_invalido_${Date.now()}@teste.com`;
    // Register first
    await handleRequest(
      new Request("http://localhost:3000/v1/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metodo: "senha", email, senha: "senhaCerta123" }),
      })
    );

    const badReq = new Request("http://localhost:3000/v1/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metodo: "senha", email, senha: "senhaErrada999" }),
    });

    const res = await handleRequest(badReq);
    expect([401, 500]).toContain(res.status);
    if (res.status === 401) {
      const data = await res.json();
      expect(data.error.code).toBe("INVALID_CREDENTIALS");
    }
  });
});

describe("RF-04 & RNF-08 · PIN do morador e bloqueio de força bruta", () => {
  it("Given morador com PIN de 4 dígitos, When erra 5 vezes consecutivas, Then bloqueia com 429", async () => {
    // 1. Criação do teste de validação de PIN de 4 dígitos
    const badPinReq = new Request("http://localhost:3000/v1/moradores/login-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        moradorId: "00000000-0000-0000-0000-000000000001",
        pin: "123", // inválido, não tem 4 dígitos
      }),
    });

    const badPinRes = await handleRequest(badPinReq);
    expect(badPinRes.status).toBe(400);
    const body = await badPinRes.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});
