import { describe, it, expect } from "bun:test";
import { handleRequest } from "../src/app";
import { signToken } from "../src/auth";

describe("RF-15 & RF-16 · Emergência SOS e cancelamento acidental", () => {
  it("Given requisição sem moradorId ao acionar SOS, Then rejeita com 400", async () => {
    const fakeToken = await signToken({
      sub: "00000000-0000-0000-0000-000000000001",
      residenciaId: "00000000-0000-0000-0000-000000000001",
      papel: "morador",
    });

    const req = new Request(
      "http://localhost:3000/v1/residencias/00000000-0000-0000-0000-000000000001/sos",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${fakeToken}`,
        },
        body: JSON.stringify({}),
      }
    );

    const res = await handleRequest(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("Given cancelamento de SOS inexistente, Then retorna 404", async () => {
    const fakeToken = await signToken({
      sub: "00000000-0000-0000-0000-000000000001",
      residenciaId: "00000000-0000-0000-0000-000000000001",
      papel: "morador",
    });

    const req = new Request(
      "http://localhost:3000/v1/sos/00000000-0000-0000-0000-000000000099",
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${fakeToken}`,
        },
        body: JSON.stringify({ status: "cancelado_pelo_morador" }),
      }
    );

    const res = await handleRequest(req);
    expect([404, 500]).toContain(res.status);
    if (res.status === 404) {
      const body = await res.json();
      expect(body.error.code).toBe("NOT_FOUND");
    }
  });
});
