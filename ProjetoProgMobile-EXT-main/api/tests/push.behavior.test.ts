import { describe, it, expect, beforeEach } from "bun:test";
import { handleRequest } from "../src/app";
import { signToken } from "../src/auth";
import {
  sendNativePushNotification,
  dispatchedPushNotifications,
  clearDispatchedPushNotifications,
} from "../src/services/push";

describe("RF-15, RF-17 & RNF-02 · Push Notifications Nativas", () => {
  beforeEach(() => {
    clearDispatchedPushNotifications();
  });

  describe("Endpoint POST /v1/usuarios/push-token", () => {
    it("Given requisição sem autenticação Bearer, When tenta registrar token, Then retorna 401", async () => {
      const req = new Request("http://localhost:3000/v1/usuarios/push-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pushToken: "ExponentPushToken[abc123xyz]" }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.error.code).toBe("UNAUTHORIZED");
    });

    it("Given cuidador autenticado, When envia payload sem pushToken ou vazio, Then retorna 400", async () => {
      const token = await signToken({
        sub: "user-cuidador-001",
        email: "cuidador@exemplo.com",
        papel: "cuidador",
      });

      const reqEmpty = new Request("http://localhost:3000/v1/usuarios/push-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ pushToken: "" }),
      });

      const resEmpty = await handleRequest(reqEmpty);
      expect(resEmpty.status).toBe(400);

      const jsonEmpty = await resEmpty.json();
      expect(jsonEmpty.error.code).toBe("VALIDATION_ERROR");
      expect(jsonEmpty.error.fields).toBeDefined();
    });

    it("Given cuidador autenticado, When envia body não JSON, Then retorna 400", async () => {
      const token = await signToken({
        sub: "user-cuidador-001",
        email: "cuidador@exemplo.com",
        papel: "cuidador",
      });

      const reqInvalid = new Request("http://localhost:3000/v1/usuarios/push-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: "invalid-json-content",
      });

      const resInvalid = await handleRequest(reqInvalid);
      expect(resInvalid.status).toBe(400);
      const json = await resInvalid.json();
      expect(json.error.code).toBe("INVALID_JSON");
    });
  });

  describe("Serviço de Envio Push (sendNativePushNotification)", () => {
    it("Given lista vazia ou tokens inválidos, When tenta disparar push, Then não envia e retorna count 0", async () => {
      const result = await sendNativePushNotification({
        to: ["", "   "],
        title: "Teste",
        body: "Corpo do teste",
      });

      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
      expect(dispatchedPushNotifications.length).toBe(0);
    });

    it("Given alerta de emergência SOS (RF-15, RNF-02), When disparado, Then registra notificação push com prioridade high e canal sos-critical", async () => {
      const token = "ExponentPushToken[cuidador_device_1]";
      const result = await sendNativePushNotification({
        to: token,
        title: "🚨 ALERTA SOS - Emergência!",
        body: "Pedido de socorro acionado na residência. Verifique imediatamente.",
        priority: "high",
        channelId: "sos-critical",
        data: {
          tipo: "sos",
          residenciaId: "res-001",
          alvoId: "sos-999",
        },
      });

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      expect(dispatchedPushNotifications.length).toBe(1);

      const sent = dispatchedPushNotifications[0];
      expect(sent.token).toBe(token);
      expect(sent.title).toContain("SOS");
      expect(sent.data?.tipo).toBe("sos");
      expect(sent.data?.alvoId).toBe("sos-999");
      expect(sent.timestamp).toBeDefined();
    });

    it("Given múltiplos cuidadores vinculados à mesma residência, When ocorre alerta de alta severidade, Then despacha para todos os tokens", async () => {
      const tokens = [
        "ExponentPushToken[cuidador_filho_1]",
        "ExponentPushToken[cuidador_filha_2]",
      ];

      const result = await sendNativePushNotification({
        to: tokens,
        title: "⚠️ Alerta Crítico",
        body: "Sensor de porta aberta após horário limite.",
        priority: "high",
        channelId: "alertas-alta",
        data: {
          tipo: "alerta",
          severidade: "alta",
        },
      });

      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
      expect(dispatchedPushNotifications.length).toBe(2);
      expect(dispatchedPushNotifications.map((d) => d.token)).toEqual(tokens);
    });
  });
});
