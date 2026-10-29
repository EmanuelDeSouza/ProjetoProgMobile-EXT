// Push nativo (RF-15, RF-17, RNF-02). Só roda no app (expo-notifications); os testes não importam este arquivo.
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { apiRepository } from "./api";
import { colors } from "../../theme/tokens";

export type DestinoNotificacao = { tipo: "alerta" | "sos" | "sos_cancelado" | "convite"; residenciaId?: string };

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/** Canais Android: SOS ignora "não perturbe" quando o sistema permite (RF-15). */
export async function configurarCanais(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("sos-critical", {
    name: "Emergência (SOS)",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 250, 500, 250, 500],
    lightColor: colors.sos,
    sound: "default",
    bypassDnd: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  await Notifications.setNotificationChannelAsync("alertas-alta", {
    name: "Alertas importantes",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    sound: "default",
  });
  await Notifications.setNotificationChannelAsync("alertas-geral", {
    name: "Avisos da casa",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId || Constants.easConfig?.projectId || undefined;
}

/**
 * Pede permissão, obtém o token Expo e registra na API. Sem aparelho físico ou sem
 * projectId do EAS não existe token real — nesse caso não registra nada (nunca token falso).
 */
export async function registrarPush(): Promise<string | null> {
  try {
    await configurarCanais();
    if (!Device.isDevice) {
      console.info("[push] emulador/simulador: push nativo indisponível.");
      return null;
    }
    const atual = await Notifications.getPermissionsAsync();
    let status = atual.status;
    if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== "granted") {
      console.info("[push] permissão negada pelo usuário.");
      return null;
    }
    const id = projectId();
    if (!id) {
      console.warn("[push] defina expo.extra.eas.projectId em app.json (eas init) para receber push.");
      return null;
    }
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    await apiRepository.postPushToken(token);
    return token;
  } catch (err) {
    console.warn("[push] não foi possível registrar:", err);
    return null;
  }
}

function destinoDe(data: unknown): DestinoNotificacao | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const tipo = d.tipo;
  if (tipo !== "alerta" && tipo !== "sos" && tipo !== "sos_cancelado" && tipo !== "convite") return null;
  return { tipo, residenciaId: typeof d.residenciaId === "string" ? d.residenciaId : undefined };
}

/** Toque numa notificação (app aberto, em segundo plano ou fechado) → abre a central. */
export function ouvirToques(aoTocar: (d: DestinoNotificacao) => void): () => void {
  void Notifications.getLastNotificationResponseAsync().then((r) => {
    const d = destinoDe(r?.notification.request.content.data);
    if (d) aoTocar(d);
  });
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    const d = destinoDe(r.notification.request.content.data);
    if (d) aoTocar(d);
  });
  return () => sub.remove();
}

/** Notificação chegando com o app aberto → recarregar a central/painel. */
export function ouvirChegada(aoChegar: (d: DestinoNotificacao) => void): () => void {
  const sub = Notifications.addNotificationReceivedListener((n) => {
    const d = destinoDe(n.request.content.data);
    if (d) aoChegar(d);
  });
  return () => sub.remove();
}
