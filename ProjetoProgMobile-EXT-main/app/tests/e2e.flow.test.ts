import { describe, it, expect, beforeEach } from "bun:test";
import { apiRepository, setAuthToken } from "../src/services/api";
import { setCacheItem, getCacheItem, clearCache } from "../src/services/cache";
import {
  getDevicePushTokenAsync,
  registerPushNotifications,
  addNotificationListener,
  notifyListeners,
  type NativePushPayload,
} from "../src/services/notifications";

describe("E2E Mobile Integration Flow · CuidaLar App", () => {
  beforeEach(async () => {
    await clearCache();
    setAuthToken(null);
  });

  describe("Push Notifications Nativas no Mobile", () => {
    it("Given dispositivo móvel, When solicita token push, Then retorna formato ExponentPushToken e salva em cache", async () => {
      const token = await getDevicePushTokenAsync();
      expect(token).toBeDefined();
      expect(token.startsWith("ExponentPushToken[")).toBe(true);

      const cachedToken = await getCacheItem<string>("device_push_token");
      expect(cachedToken).toBe(token);
    });

    it("Given listener de notificações registrado, When uma notificação em primeiro plano chega, Then o callback é acionado", () => {
      let receivedNotification: NativePushPayload | null = null;

      const unsubscribe = addNotificationListener((payload) => {
        receivedNotification = payload;
      });

      const samplePayload: NativePushPayload = {
        title: "🚨 SOS EMERGÊNCIA",
        body: "Botão de emergência acionado na sala.",
        priority: "high",
        channelId: "sos-critical",
        data: { tipo: "sos", residenciaId: "res-123" },
      };

      notifyListeners(samplePayload);

      expect(receivedNotification).not.toBeNull();
      expect(receivedNotification?.title).toBe(samplePayload.title);
      expect(receivedNotification?.priority).toBe("high");
      expect(receivedNotification?.channelId).toBe("sos-critical");

      // Limpeza do listener
      unsubscribe();
    });
  });

  describe("Operação Offline & Cache Local (RNF-05)", () => {
    it("Given dispositivos salvos em cache, When app fica sem conexão, Then recupera último estado salvo", async () => {
      const cacheKey = "cache_dispositivos_res-01";
      const mockDispositivos = [
        {
          id: "disp-01",
          residenciaId: "res-01",
          tipo: "atuador_tomada",
          nome: "Abajur Sala",
          comodo: "Sala",
          status: "online",
          estadoAtual: { tomada: "ligada" },
        },
        {
          id: "disp-02",
          residenciaId: "res-01",
          tipo: "sensor_temperatura",
          nome: "Sensor Clima",
          comodo: "Quarto",
          status: "offline",
          estadoAtual: { temperatura: 24, umidade: 55 },
        },
      ];

      await setCacheItem(cacheKey, mockDispositivos);

      const cached = await getCacheItem<typeof mockDispositivos>(cacheKey);
      expect(cached).toHaveLength(2);
      expect(cached?.[0].nome).toBe("Abajur Sala");
      expect(cached?.[1].status).toBe("offline");
    });
  });
});
