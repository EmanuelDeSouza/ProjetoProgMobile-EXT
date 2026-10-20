import { apiRepository } from "./api";
import { getCacheItem, setCacheItem } from "./cache";

const getPlatformOS = (): string => {
  try {
    const RN = require("react-native");
    return RN?.Platform?.OS || "android";
  } catch {
    return typeof process !== "undefined" && process.platform === "darwin" ? "ios" : "android";
  }
};

export interface NativePushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  priority?: "default" | "normal" | "high";
  channelId?: string;
}

// In-memory listeners for push notifications received in foreground
type NotificationCallback = (notification: NativePushPayload) => void;
const notificationListeners: NotificationCallback[] = [];

export function addNotificationListener(callback: NotificationCallback): () => void {
  notificationListeners.push(callback);
  return () => {
    const idx = notificationListeners.indexOf(callback);
    if (idx !== -1) {
      notificationListeners.splice(idx, 1);
    }
  };
}

export function notifyListeners(notification: NativePushPayload) {
  for (const listener of notificationListeners) {
    try {
      listener(notification);
    } catch (err) {
      console.warn("Erro ao executar listener de notificação:", err);
    }
  }
}

/**
 * Obtém ou gera o token push para o dispositivo atual.
 * Suporta Expo push token e gera identificador único estável para emuladores e testes.
 */
export async function getDevicePushTokenAsync(): Promise<string> {
  const cached = await getCacheItem<string>("device_push_token");
  if (cached) {
    return cached;
  }

  // Se estiver em ambiente nativo com expo-notifications instalado dinamicamente
  try {
    const expoNotifications = require("expo-notifications");
    if (expoNotifications?.getExpoPushTokenAsync) {
      const response = await expoNotifications.getExpoPushTokenAsync();
      if (response?.data) {
        await setCacheItem("device_push_token", response.data);
        return response.data;
      }
    }
  } catch {
    // expo-notifications não carregado ou ambiente de testes/web/emulador
  }

  const generatedToken = `ExponentPushToken[cuidador_${getPlatformOS()}_${Date.now().toString(36)}]`;
  await setCacheItem("device_push_token", generatedToken);
  return generatedToken;
}

/**
 * Registra o token push do dispositivo no backend CuidaLar (RF-15, RF-17, RNF-02).
 */
export async function registerPushNotifications(): Promise<string | null> {
  try {
    const pushToken = await getDevicePushTokenAsync();
    await apiRepository.postPushToken(pushToken);
    return pushToken;
  } catch (error) {
    console.warn("[Push] Não foi possível registrar o push token no servidor:", error);
    return null;
  }
}

/**
 * Configura canais de notificação para Android (ex.: canal de emergência SOS e alertas de alta prioridade).
 */
export async function setupNotificationChannels(): Promise<void> {
  if (getPlatformOS() !== "android") return;

  try {
    const expoNotifications = require("expo-notifications");
    if (expoNotifications?.setNotificationChannelAsync) {
      // Canal de prioridade máxima para SOS (RF-15, RNF-02)
      await expoNotifications.setNotificationChannelAsync("sos-critical", {
        name: "Emergência SOS CuidaLar",
        importance: expoNotifications.AndroidImportance?.MAX || 5,
        vibrationPattern: [0, 500, 250, 500, 250, 500],
        lightColor: "#B3261E",
        sound: "default",
        bypassDnd: true, // Ignora Não Perturbe se permitido
      });

      // Canal para alertas de segurança do motor de regras
      await expoNotifications.setNotificationChannelAsync("alertas-alta", {
        name: "Alertas de Alta Prioridade CuidaLar",
        importance: expoNotifications.AndroidImportance?.HIGH || 4,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#7A5200",
        sound: "default",
      });
    }
  } catch {
    // Ignora se não for suportado no ambiente de execução
  }
}
