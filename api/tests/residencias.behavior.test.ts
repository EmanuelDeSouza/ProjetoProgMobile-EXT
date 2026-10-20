import { describe, it, expect } from "bun:test";
import { handleRequest } from "../src/app";
import { signToken } from "../src/auth";

describe("RF-03 · Criar residência", () => {
  it("Given tentativa de criar residência sem autenticação, Then retorna 401", async () => {
    const req = new Request("http://localhost:3000/v1/residencias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: "Casa Vovó Maria" }),
    });

    const res = await handleRequest(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("Given cuidador autenticado, When envia payload sem nome, Then retorna 400", async () => {
    const fakeToken = await signToken({
      sub: "00000000-0000-0000-0000-000000000001",
      email: "cuidador@teste.com",
      papel: "cuidador",
    });

    const req = new Request("http://localhost:3000/v1/residencias", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${fakeToken}`,
      },
      body: JSON.stringify({ enderecoCurto: "Bairro Jardim" }), // falta nome
    });

    const res = await handleRequest(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("RF-05 · Convidar outro cuidador", () => {
  it("Given tentativa de convite com e-mail inválido, Then retorna 400", async () => {
    const fakeToken = await signToken({
      sub: "00000000-0000-0000-0000-000000000001",
      email: "cuidador@teste.com",
      papel: "cuidador",
    });

    const req = new Request(
      "http://localhost:3000/v1/residencias/00000000-0000-0000-0000-000000000001/convites",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${fakeToken}`,
        },
        body: JSON.stringify({ email: "email_invalido" }),
      }
    );

    const res = await handleRequest(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});
