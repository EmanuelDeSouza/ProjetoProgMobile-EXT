import React, { useRef, useState } from "react";
import { View, Text, TouchableOpacity, Pressable, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import * as Haptics from "expo-haptics";
import { colors, typography, spacing, rounded } from "../../../theme/tokens";
import { useResidence } from "../../context/ResidenceContext";
import { useAuth } from "../../context/AuthContext";
import { type Dispositivo } from "../../types";

interface MoradorPainelScreenProps {
  onTriggerSOS: () => void;
}

const SEGURAR_SOS_MS = 1000; // DESIGN.md: confirmação de 1 segundo antes de disparar

/** RF-11 · Painel simplificado: poucos botões enormes, texto ≥ 18px, SOS sempre visível. */
export const MoradorPainelScreen: React.FC<MoradorPainelScreenProps> = ({ onTriggerSOS }) => {
  const { logout, morador } = useAuth();
  const { dispositivos, loading, isOffline, controlarTomada } = useResidence();
  const [controllingId, setControllingId] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [segurandoSOS, setSegurandoSOS] = useState(false);
  const disparou = useRef(false);

  const tomadas = dispositivos.filter((d) => d.tipo === "atuador_tomada").slice(0, 4);
  const termometro = dispositivos.find((d) => d.tipo === "sensor_temperatura" && d.status === "online");
  const temperatura = termometro?.estadoAtual.temperatura;

  const handleToggle = async (disp: Dispositivo) => {
    const ligar = disp.estadoAtual.tomada !== "ligada";
    setAviso(null);
    setControllingId(disp.id);
    try {
      const ok = await controlarTomada(disp.id, ligar);
      if (!ok) setAviso("Não foi possível confirmar. Verifique se o aparelho está ligado na tomada.");
    } catch {
      setAviso("Não foi possível falar com o aparelho agora. Tente de novo.");
    } finally {
      setControllingId(null);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.saudacao}>Olá, {morador?.nome ?? "bem-vindo(a)"}!</Text>
          {typeof temperatura === "number" && (
            <Text style={styles.temperatura} accessibilityLabel={`Temperatura da casa: ${temperatura} graus`}>
              🌡️ {temperatura.toFixed(0)}°C
            </Text>
          )}
        </View>
        <TouchableOpacity style={styles.btnSair} onPress={() => void logout()} accessibilityRole="button">
          <Text style={styles.btnSairText}>Sair</Text>
        </TouchableOpacity>
      </View>

      {isOffline && (
        <View style={styles.bannerOffline}>
          <Text style={styles.bannerOfflineText}>Sem conexão. Mostrando o último estado salvo.</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {aviso && (
          <View style={styles.aviso} accessibilityLiveRegion="polite">
            <Text style={styles.avisoText}>{aviso}</Text>
          </View>
        )}

        {loading && tomadas.length === 0 ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 20 }} />
        ) : tomadas.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>Nenhum aparelho para ligar ou desligar ainda.</Text>
          </View>
        ) : (
          tomadas.map((disp) => {
            const ligada = disp.estadoAtual.tomada === "ligada";
            const enviando = controllingId === disp.id;
            const semContato = disp.status === "offline" || isOffline;

            if (semContato) {
              // DESIGN.md: offline é cinza e não oferece controle que vai falhar
              return (
                <View key={disp.id} style={[styles.buttonMorador, styles.buttonMoradorOffline]} accessible>
                  <Text style={[styles.buttonNome, styles.buttonNomeOffline]}>🔌 {disp.nome}: sem contato</Text>
                </View>
              );
            }
            return (
              <TouchableOpacity
                key={disp.id}
                style={[styles.buttonMorador, ligada && styles.buttonMoradorLigada]}
                onPress={() => void handleToggle(disp)}
                disabled={enviando || controllingId !== null}
                accessibilityRole="button"
                accessibilityState={{ busy: enviando }}
                accessibilityLabel={`${ligada ? "Desligar" : "Ligar"} ${disp.nome}`}
              >
                <View style={styles.buttonContent}>
                  <Text style={styles.buttonNome}>
                    {enviando ? "Enviando…" : `${ligada ? "💡 Desligar" : "🔌 Ligar"} ${disp.nome}`}
                  </Text>
                  {enviando && <ActivityIndicator color={colors.onPrimary} size="large" />}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* SOS sempre visível, no mesmo lugar (RF-11). Segurar 1s evita disparo ao encostar. */}
      <View style={styles.sosContainer}>
        <Text style={styles.sosDica}>{segurandoSOS ? "Continue segurando…" : "Segure para pedir ajuda"}</Text>
        <Pressable
          style={[styles.buttonSOS, segurandoSOS && styles.buttonSOSSegurando]}
          delayLongPress={SEGURAR_SOS_MS}
          onPressIn={() => {
            disparou.current = false;
            setSegurandoSOS(true);
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          }}
          onPressOut={() => setSegurandoSOS(false)}
          onLongPress={() => {
            if (disparou.current) return;
            disparou.current = true;
            setSegurandoSOS(false);
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
            onTriggerSOS();
          }}
          accessibilityRole="button"
          accessibilityLabel="Pedir ajuda. Segure por um segundo para avisar a família."
          accessibilityActions={[{ name: "activate", label: "Pedir ajuda" }]}
          onAccessibilityAction={() => onTriggerSOS()}
        >
          <Text style={styles.buttonSOSText}>SOS</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.screenGutter,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  saudacao: {
    ...typography.moradorTitulo,
    color: colors.ink,
  },
  temperatura: {
    ...typography.moradorNumero,
    color: colors.ink,
    marginTop: spacing.xxs,
  },
  btnSair: {
    paddingHorizontal: spacing.md,
    minHeight: 72,
    justifyContent: "center",
  },
  btnSairText: {
    ...typography.bodyLg,
    color: colors.muted,
  },
  bannerOffline: {
    backgroundColor: colors.offlineSoft,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  bannerOfflineText: {
    ...typography.bodyLg,
    color: colors.muted,
  },
  scrollContent: {
    padding: spacing.screenGutter,
    paddingBottom: 220, // espaço do SOS fixo
  },
  aviso: {
    backgroundColor: colors.dangerSoft,
    borderRadius: rounded.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  avisoText: {
    ...typography.bodyLg,
    color: colors.danger,
    fontWeight: "700",
  },
  buttonMorador: {
    minHeight: 72, // DESIGN.md button-morador
    backgroundColor: colors.primary,
    borderRadius: rounded.lg,
    paddingVertical: 20,
    paddingHorizontal: 24,
    marginBottom: spacing.xl, // dedo trêmulo não acerta o botão errado
    justifyContent: "center",
  },
  buttonMoradorLigada: {
    backgroundColor: colors.primaryDeep,
  },
  buttonMoradorOffline: {
    backgroundColor: colors.offlineSoft,
    borderWidth: 1,
    borderColor: colors.line,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  buttonNome: {
    ...typography.moradorBotao,
    color: colors.onPrimary,
    flexShrink: 1,
  },
  buttonNomeOffline: {
    color: colors.offline,
  },
  emptyBox: {
    padding: spacing.xl,
    alignItems: "center",
  },
  emptyText: {
    ...typography.bodyLg,
    color: colors.muted,
    textAlign: "center",
  },
  sosContainer: {
    position: "absolute",
    bottom: spacing.lg,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  sosDica: {
    ...typography.bodyLg,
    color: colors.ink,
    fontWeight: "700",
    marginBottom: spacing.xs,
  },
  buttonSOS: {
    width: 120, // DESIGN.md button-sos
    height: 120,
    borderRadius: rounded.full,
    backgroundColor: colors.sos,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonSOSSegurando: {
    transform: [{ scale: 1.08 }],
  },
  buttonSOSText: {
    ...typography.moradorTitulo,
    color: colors.onDanger,
  },
});
