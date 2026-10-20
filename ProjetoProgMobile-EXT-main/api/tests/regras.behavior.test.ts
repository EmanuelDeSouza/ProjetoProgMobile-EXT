import { describe, it, expect } from "bun:test";
import { handleRequest } from "../src/app";
import { signToken } from "../src/auth";

describe("RF-12 & RF-13 · Regras de alerta e validação", () => {
  it("Given regra com condição desconhecida, Then rejeita com 400", async () => {
    const fakeToken = await signToken({
      sub: "00000000-0000-0000-0000-000000000001",
      email: "cuidador@teste.com",
      papel: "cuidador",
    });

    const req = new Request(
      "http://localhost:3000/v1/residencias/00000000-0000-0000-0000-000000000001/regras",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${fakeToken}`,
        },
        body: JSON.stringify({
          dispositivoId: "00000000-0000-0000-0000-000000000002",
          condicao: "condicao_inventada",
          parametros: {},
        }),
      }
    );

    const res = await handleRequest(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});
