export interface PushNotificationMessage {
  to: string | string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
  priority?: "default" | "normal" | "high";
  sound?: "default" | null;
  channelId?: string;
}

// In-memory record for testing and auditing push deliveries
export const dispatchedPushNotifications: Array<{
  token: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  timestamp: string;
}> = [];

export function clearDispatchedPushNotifications() {
  dispatchedPushNotifications.length = 0;
}

/**
 * Dispara notificação push nativa para dispositivos móveis via Expo Push API.
 * Em conformidade com RF-15, RF-17 e RNF-02 do CuidaLar (docs/SPEC.md).
 */
export async function sendNativePushNotification(
  message: PushNotificationMessage
): Promise<{ success: boolean; count: number }> {
  const tokens = Array.isArray(message.to) ? message.to : [message.to];
  const validTokens = tokens.filter((t) => t && typeof t === "string" && t.trim().length > 0);

  if (validTokens.length === 0) {
    return { success: true, count: 0 };
  }

  const messagesPayload = validTokens.map((token) => ({
    to: token,
    sound: message.sound !== undefined ? message.sound : "default",
    title: message.title,
    body: message.body,
    data: message.data || {},
    priority: message.priority || "high",
    channelId: message.channelId || "sos-critical",
  }));

  // Grava para auditoria / testes
  for (const item of messagesPayload) {
    dispatchedPushNotifications.push({
      token: item.to,
      title: item.title,
      body: item.body,
      data: item.data,
      timestamp: new Date().toISOString(),
    });
  }

  // Se estivermos em ambiente de teste ou se não houver conexão externa permitida
  if (process.env.NODE_ENV === "test" || process.env.MOCK_PUSH === "true") {
    return { success: true, count: messagesPayload.length };
  }

  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messagesPayload),
    });

    if (!response.ok) {
      console.warn("Expo Push API retornou status não-200:", response.status);
      return { success: false, count: messagesPayload.length };
    }

    return { success: true, count: messagesPayload.length };
  } catch (error) {
    console.error("Falha ao comunicar com Expo Push API:", error);
    return { success: false, count: messagesPayload.length };
  }
}
