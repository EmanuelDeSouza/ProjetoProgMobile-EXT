import { describe, it, expect } from "bun:test";
import { handleRequest } from "../src/app";
import { signToken } from "../src/auth";

describe("RF-06 & RF-07 · Tipos de dispositivos e pareamento", () => {
  it("Given tentativa de parear tipo de dispositivo fora dos 5 suportados, Then retorna 400", async () => {
    const fakeToken = await signToken({
      sub: "00000000-0000-0000-0000-000000000001",
      email: "cuidador@teste.com",
      papel: "cuidador",
    });

    const req = new Request(
      "http://localhost:3000/v1/residencias/00000000-0000-0000-0000-000000000001/dispositivos/parear",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${fakeToken}`,
        },
        body: JSON.stringify({
          codigo: "123456",
          tipo: "camera_reconhecimento", // Inválido na V1 (RNF-12)
          nome: "Camera Sala",
          comodo: "Sala",
        }),
      }
    );

    const res = await handleRequest(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("RF-10 · Controlar atuador e proteção contra offline", () => {
  it("Given comando sem payload válido, When enviado à rota de comando, Then retorna 400", async () => {
    const fakeToken = await signToken({
      sub: "00000000-0000-0000-0000-000000000001",
      email: "cuidador@teste.com",
      papel: "cuidador",
    });

    const req = new Request(
      "http://localhost:3000/v1/dispositivos/00000000-0000-0000-0000-000000000002/comando",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${fakeToken}`,
        },
        body: JSON.stringify({}), // falta acao
      }
    );

    const res = await handleRequest(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});
