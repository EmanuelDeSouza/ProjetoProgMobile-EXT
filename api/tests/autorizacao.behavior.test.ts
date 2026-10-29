import { describe, it, expect, beforeAll } from "bun:test";
import { api, novoCuidador, novaResidencia, novoMorador, dispositivoNoBanco, type Cuidador } from "./helpers";

// RF-02: o papel vem do vínculo na residência. Ninguém mexe em casa alheia,
// e a sessão do morador (PIN) só alcança a interface simplificada (RF-04, RF-11).
describe("RF-02 · Autorização por residência e por papel", () => {
  let dono: Cuidador;
  let intruso: Cuidador;
  let residenciaId: string;
  let outraResidenciaId: string;
  let morador: { id: string; token: string };
  let sensorId: string;
  let tomadaId: string;
  let tomadaOutraCasaId: string;

  beforeAll(async () => {
    dono = await novoCuidador("Dono");
    intruso = await novoCuidador("Intruso");
    residenciaId = await novaResidencia(dono.token, "Casa A");
    outraResidenciaId = await novaResidencia(intruso.token, "Casa B");
    morador = await novoMorador(dono.token, residenciaId);
    sensorId = (await dispositivoNoBanco(residenciaId, "sensor_contato")).id;
    tomadaId = (await dispositivoNoBanco(residenciaId, "atuador_tomada")).id;
    tomadaOutraCasaId = (await dispositivoNoBanco(outraResidenciaId, "atuador_tomada")).id;
  });

  it("Given sem token, Then 401", async () => {
    const r = await api("GET", `/residencias/${residenciaId}/dispositivos`);
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe("UNAUTHORIZED");
  });

  it("Given cuidador de outra casa, When acessa qualquer recurso desta residência, Then 403", async () => {
    const t = intruso.token;
    const chamadas: Array<[string, string, unknown?]> = [
      ["GET", `/residencias/${residenciaId}/dispositivos`],
      ["GET", `/residencias/${residenciaId}/moradores`],
      ["POST", `/residencias/${residenciaId}/moradores`, { nome: "x", pin: "0000" }],
      ["POST", `/residencias/${residenciaId}/convites`, { email: "a@b.com" }],
      ["POST", `/residencias/${residenciaId}/dispositivos/parear`, { codigo: "123456", tipo: "sensor_contato", nome: "x", comodo: "y" }],
      ["GET", `/residencias/${residenciaId}/regras`],
      ["POST", `/residencias/${residenciaId}/regras`, { dispositivoId: sensorId, condicao: "dispositivo_offline", parametros: {} }],
      ["GET", `/residencias/${residenciaId}/alertas`],
      ["GET", `/residencias/${residenciaId}/sos`],
      ["GET", `/dispositivos/${sensorId}/eventos`],
      ["POST", `/dispositivos/${tomadaId}/comando`, { acao: "ligar" }],
    ];
    for (const [m, p, b] of chamadas) {
      const r = await api(m, p, { token: t, body: b });
      expect({ rota: `${m} ${p}`, status: r.status }).toEqual({ rota: `${m} ${p}`, status: 403 });
    }
  });

  it("Given sessão do morador, When chama rota de cuidador, Then 403", async () => {
    const t = morador.token;
    const chamadas: Array<[string, string, unknown?]> = [
      ["GET", "/me"],
      ["GET", "/residencias"],
      ["POST", "/residencias", { nome: "x" }],
      ["GET", `/residencias/${residenciaId}/moradores`],
      ["POST", `/residencias/${residenciaId}/moradores`, { nome: "x", pin: "0000" }],
      ["POST", `/residencias/${residenciaId}/dispositivos/parear`, { codigo: "123456", tipo: "sensor_contato", nome: "x", comodo: "y" }],
      ["GET", `/residencias/${residenciaId}/regras`],
      ["POST", `/residencias/${residenciaId}/regras`, { dispositivoId: sensorId, condicao: "dispositivo_offline", parametros: {} }],
      ["GET", `/residencias/${residenciaId}/alertas`],
      ["GET", `/residencias/${residenciaId}/sos`],
      ["GET", "/notificacoes"],
      ["POST", "/usuarios/push-token", { pushToken: "ExponentPushToken[x]" }],
    ];
    for (const [m, p, b] of chamadas) {
      const r = await api(m, p, { token: t, body: b });
      expect({ rota: `${m} ${p}`, status: r.status }).toEqual({ rota: `${m} ${p}`, status: 403 });
    }
  });

  it("Given sessão do morador, When lê o painel da própria casa, Then 200", async () => {
    const r = await api("GET", `/residencias/${residenciaId}/dispositivos`, { token: morador.token });
    expect(r.status).toBe(200);
    expect(r.body.length).toBe(2);
  });

  it("Given sessão do morador, When lê painel ou comanda dispositivo de outra casa, Then 403", async () => {
    const r1 = await api("GET", `/residencias/${outraResidenciaId}/dispositivos`, { token: morador.token });
    expect(r1.status).toBe(403);
    const r2 = await api("POST", `/dispositivos/${tomadaOutraCasaId}/comando`, {
      token: morador.token,
      body: { acao: "ligar" },
    });
    expect(r2.status).toBe(403);
  });

  it("Given id que não é UUID ou não existe, Then 404 (nunca 500)", async () => {
    const r1 = await api("GET", "/residencias/abc/dispositivos", { token: dono.token });
    expect(r1.status).toBe(404);
    const r2 = await api("GET", "/residencias/00000000-0000-0000-0000-000000000000/dispositivos", { token: dono.token });
    expect(r2.status).toBe(404);
    const r3 = await api("PATCH", "/alertas/xyz", { token: dono.token, body: { status: "reconhecido" } });
    expect(r3.status).toBe(404);
  });

  it("Given rota inexistente, Then 404 NOT_FOUND", async () => {
    const r = await api("GET", "/nada-aqui", { token: dono.token });
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe("NOT_FOUND");
  });
});
