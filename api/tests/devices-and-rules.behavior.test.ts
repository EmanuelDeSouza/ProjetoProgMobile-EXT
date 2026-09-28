import { describe, expect, it } from "bun:test";
import { createApp } from "../src/app";
import { evaluateRules } from "../src/rules-engine/engine";
import { parseMqttTopicAndPayload } from "../src/mqtt/parser";
import type { DispositivoRecord, RegraAlertaRecord, AlertaRecord } from "../src/repositories/types";

describe("RF-06 e RF-07 · Pareamento e Tipos de Dispositivo", () => {
  it("Given cuidador autenticado, When pareia dispositivo com tipo válido, Then retorna 201 com dados do dispositivo", async () => {
    const app = createApp();

    // Login cuidador
    const authRes = await app.fetch(
      new Request("http://localhost:3000/v1/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metodo: "senha",
          email: "cuidador.dispositivo@exemplo.com",
          senha: "senhaSegura123",
          nome: "Cuidador Dispositivos",
        }),
      })
    );
    const { token } = await authRes.json();

    // Cria residência
    const casaRes = await app.fetch(
      new Request("http://localhost:3000/v1/residencias", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ nome: "Casa Automação" }),
      })
    );
    const casa = await casaRes.json();

    // Parear tomada (RF-07)
    const pairRes = await app.fetch(
      new Request(`http://localhost:3000/v1/residencias/${casa.id}/dispositivos/parear`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          codigo: "123456",
          tipo: "atuador_tomada",
          nome: "Abajur Sala",
          comodo: "Sala de Estar",
        }),
      })
    );

    expect(pairRes.status).toBe(201);
    const disp = await pairRes.json();
    expect(disp.id).toBeDefined();
    expect(disp.tipo).toBe("atuador_tomada");
    expect(disp.nome).toBe("Abajur Sala");
    expect(disp.comodo).toBe("Sala de Estar");
    expect(disp.status).toBe("offline");
  });

  it("Given tipo de dispositivo inválido (fora dos 5 suportados, ex.: camera), When tenta parear, Then retorna 400", async () => {
    const app = createApp();

    const authRes = await app.fetch(
      new Request("http://localhost:3000/v1/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metodo: "senha",
          email: "cuidador.camera@exemplo.com",
          senha: "senhaSegura123",
          nome: "Cuidador Camera",
        }),
      })
    );
    const { token } = await authRes.json();

    const casaRes = await app.fetch(
      new Request("http://localhost:3000/v1/residencias", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ nome: "Casa Proibida Camera" }),
      })
    );
    const casa = await casaRes.json();

    // Tentativa de parear câmera (RF-06 proíbe câmera na V1)
    const pairRes = await app.fetch(
      new Request(`http://localhost:3000/v1/residencias/${casa.id}/dispositivos/parear`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          codigo: "999888",
          tipo: "camera_seguranca",
          nome: "Camera Quarto",
          comodo: "Quarto",
        }),
      })
    );

    expect(pairRes.status).toBe(400);
  });
});

describe("RF-10 · Controle de Atuador", () => {
  it("Given dispositivo offline, When tenta enviar comando, Then recusa com erro e não finge sucesso", async () => {
    const app = createApp();

    const authRes = await app.fetch(
      new Request("http://localhost:3000/v1/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metodo: "senha",
          email: "cuidador.offline@exemplo.com",
          senha: "senhaSegura123",
        }),
      })
    );
    const { token } = await authRes.json();

    const casaRes = await app.fetch(
      new Request("http://localhost:3000/v1/residencias", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ nome: "Casa Offline Test" }),
      })
    );
    const casa = await casaRes.json();

    const pairRes = await app.fetch(
      new Request(`http://localhost:3000/v1/residencias/${casa.id}/dispositivos/parear`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          codigo: "333222",
          tipo: "atuador_tomada",
          nome: "Ventilador",
          comodo: "Quarto",
        }),
      })
    );
    const disp = await pairRes.json();

    // Tenta comandar dispositivo que está offline
    const cmdRes = await app.fetch(
      new Request(`http://localhost:3000/v1/dispositivos/${disp.id}/comando`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          comando: "ligar",
          valor: { tomada: "ligada" },
        }),
      })
    );

    expect(cmdRes.status).toBe(400);
    const body = await cmdRes.json();
    expect(body.error).toBeDefined();
  });
});

describe("RF-13 · Motor de Regras e Parsing MQTT", () => {
  it("Given tópico e payload MQTT válidos, When faz parsing, Then extrai os identificadores e dados tipados", () => {
    const topic = "cuidalar/res-123/disp-456/estado";
    const payload = JSON.stringify({ temperatura: 31.5, umidade: 60 });

    const parsed = parseMqttTopicAndPayload(topic, payload);
    expect(parsed).not.toBeNull();
    expect(parsed?.residenciaId).toBe("res-123");
    expect(parsed?.dispositivoId).toBe("disp-456");
    expect(parsed?.tipoMensagem).toBe("estado");
    expect(parsed?.data).toEqual({ temperatura: 31.5, umidade: 60 });
  });

  it("Given regra de temperatura fora da faixa, When temperatura excede limite, Then gera alerta", () => {
    const dispositivo: DispositivoRecord = {
      id: "disp-temp-1",
      residenciaId: "res-1",
      tipo: "sensor_temperatura",
      nome: "Termômetro Quarto",
      comodo: "Quarto",
      deviceKey: "key-123",
      estadoAtual: { temperatura: 32.0, umidade: 50 },
      status: "online",
      ultimoContatoEm: new Date(),
      createdAt: new Date(),
    };

    const regra: RegraAlertaRecord = {
      id: "regra-temp-1",
      residenciaId: "res-1",
      dispositivoId: "disp-temp-1",
      condicao: "temperatura_fora_da_faixa",
      parametros: { min: 18, max: 28 },
      ativa: true,
      createdAt: new Date(),
    };

    const alertasAbertos: AlertaRecord[] = [];

    const novosAlertas = evaluateRules({
      dispositivo,
      evento: { temperatura: 32.0, umidade: 50 },
      regras: [regra],
      alertasAbertos,
    });

    expect(novosAlertas.length).toBe(1);
    expect(novosAlertas[0]?.severidade).toBe("media");
    expect(novosAlertas[0]?.regraId).toBe("regra-temp-1");
  });

  it("Given alerta já aberto para a mesma regra, When nova leitura excede limite, Then não gera alerta duplicado", () => {
    const dispositivo: DispositivoRecord = {
      id: "disp-temp-1",
      residenciaId: "res-1",
      tipo: "sensor_temperatura",
      nome: "Termômetro Quarto",
      comodo: "Quarto",
      deviceKey: "key-123",
      estadoAtual: { temperatura: 33.0, umidade: 50 },
      status: "online",
      ultimoContatoEm: new Date(),
      createdAt: new Date(),
    };

    const regra: RegraAlertaRecord = {
      id: "regra-temp-1",
      residenciaId: "res-1",
      dispositivoId: "disp-temp-1",
      condicao: "temperatura_fora_da_faixa",
      parametros: { min: 18, max: 28 },
      ativa: true,
      createdAt: new Date(),
    };

    const alertasAbertos: AlertaRecord[] = [
      {
        id: "alerta-existente-1",
        residenciaId: "res-1",
        regraId: "regra-temp-1",
        dispositivoId: "disp-temp-1",
        severidade: "media",
        status: "aberto",
        reconhecidoPor: null,
        reconhecidoEm: null,
        createdAt: new Date(),
      },
    ];

    const novosAlertas = evaluateRules({
      dispositivo,
      evento: { temperatura: 33.0, umidade: 50 },
      regras: [regra],
      alertasAbertos,
    });

    expect(novosAlertas.length).toBe(0);
  });
});

describe("RF-15 e RF-16 · Emergência SOS", () => {
  it("Given morador, When aciona SOS via POST /v1/residencias/:id/sos, Then cria evento SOS aberto", async () => {
    const app = createApp();

    // Login cuidador
    const authRes = await app.fetch(
      new Request("http://localhost:3000/v1/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metodo: "senha",
          email: "cuidador.sos@exemplo.com",
          senha: "senhaSegura123",
        }),
      })
    );
    const { token } = await authRes.json();

    // Cria casa
    const casaRes = await app.fetch(
      new Request("http://localhost:3000/v1/residencias", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ nome: "Casa SOS Test" }),
      })
    );
    const casa = await casaRes.json();

    // Cadastra morador
    const moradorRes = await app.fetch(
      new Request(`http://localhost:3000/v1/residencias/${casa.id}/moradores`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          nome: "Dona Benta",
          pin: "5555",
        }),
      })
    );
    const morador = await moradorRes.json();

    // Login morador
    const loginMorador = await app.fetch(
      new Request("http://localhost:3000/v1/moradores/login-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moradorId: morador.id,
          pin: "5555",
        }),
      })
    );
    const { token: moradorToken } = await loginMorador.json();

    // Morador aciona SOS (RF-15)
    const sosRes = await app.fetch(
      new Request(`http://localhost:3000/v1/residencias/${casa.id}/sos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${moradorToken}`,
        },
        body: JSON.stringify({
          origem: "app",
        }),
      })
    );

    expect(sosRes.status).toBe(201);
    const sos = await sosRes.json();
    expect(sos.id).toBeDefined();
    expect(sos.status).toBe("aberto");
    expect(sos.moradorId).toBe(morador.id);

    // Cancelar SOS acidental (RF-16)
    const cancelRes = await app.fetch(
      new Request(`http://localhost:3000/v1/sos/${sos.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${moradorToken}`,
        },
        body: JSON.stringify({
          status: "cancelado_pelo_morador",
        }),
      })
    );

    expect(cancelRes.status).toBe(200);
    const cancelled = await cancelRes.json();
    expect(cancelled.status).toBe("cancelado_pelo_morador");
  });
});
