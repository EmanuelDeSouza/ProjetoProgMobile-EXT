import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { colors, typography, spacing, rounded } from "../../../theme/tokens";
import { useResidence } from "../../context/ResidenceContext";
import { useAuth } from "../../context/AuthContext";
import { type Dispositivo } from "../../types";

interface MoradorPainelScreenProps {
  onTriggerSOS: () => void;
}

export const MoradorPainelScreen: React.FC<MoradorPainelScreenProps> = ({
  onTriggerSOS,
}) => {
  const { logout, morador } = useAuth();
  const { dispositivos, loading, controlarTomada } = useResidence();
  const [controllingId, setControllingId] = useState<string | null>(null);

  const tomadas = dispositivos.filter((d) => d.tipo === "atuador_tomada");

  const handleToggle = async (disp: Dispositivo) => {
    if (disp.status === "offline") return;
    const isLigada = disp.estadoAtual?.tomada === "ligada";
    setControllingId(disp.id);
    try {
      await controlarTomada(disp.id, !isLigada);
    } catch {
      // erro tratado no contexto
    } finally {
      setControllingId(null);
    }
  };

  return (
    <View style={styles.container}>
      {/* Cabeçalho acolhedor */}
      <View style={styles.header}>
        <View>
          <Text style={styles.saudacao}>Olá, {morador?.nome || "Morador"}!</Text>
          <Text style={styles.statusCasa}>Sua casa está protegida</Text>
        </View>
        <TouchableOpacity style={styles.btnSair} onPress={logout}>
          <Text style={styles.btnSairText}>Sair</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Seção de Controles da Casa (Máximo 2 níveis, botões >= 72px) */}
        <Text style={styles.secaoTitulo}>Controles da Casa</Text>

        {loading && tomadas.length === 0 ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 20 }} />
        ) : tomadas.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>Nenhuma tomada instalada no momento.</Text>
          </View>
        ) : (
          tomadas.map((disp) => {
            const isLigada = disp.estadoAtual?.tomada === "ligada";
            const isControlling = controllingId === disp.id;
            const isOffline = disp.status === "offline";

            return (
              <TouchableOpacity
                key={disp.id}
                style={[
                  styles.buttonMorador,
                  isLigada && styles.buttonMoradorLigada,
                  isOffline && styles.buttonMoradorOffline,
                ]}
                onPress={() => handleToggle(disp)}
                disabled={isOffline || isControlling}
                accessibilityRole="button"
                accessibilityLabel={`${disp.nome}: ${isLigada ? "Ligada" : "Desligada"}`}
              >
                <View style={styles.buttonContent}>
                  <Text style={styles.iconeTexto}>
                    {isLigada ? "💡" : "🔌"}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.buttonNome}>{disp.nome}</Text>
                    <Text style={styles.buttonSubtexto}>
                      {isOffline
                        ? "Desconectado"
                        : isLigada
                        ? "Ligada • Toque para desligar"
                        : "Desligada • Toque para ligar"}
                    </Text>
                  </View>
                  {isControlling && (
                    <ActivityIndicator color={colors.onPrimary} size="small" />
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Botão de SOS SEMPRE visível na tela principal (RF-11: 120x120px) */}
      <View style={styles.sosContainer}>
        <TouchableOpacity
          style={styles.buttonSOS}
          onPress={onTriggerSOS}
          accessibilityRole="button"
          accessibilityLabel="Botão de emergência SOS. Toque para pedir ajuda imediata."
        >
          <Text style={styles.buttonSOSText}>SOS</Text>
          <Text style={styles.buttonSOSSubtext}>PEDIR AJUDA</Text>
        </TouchableOpacity>
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
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    backgroundColor: colors.paperDeep,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  saudacao: {
    ...typography.moradorTitulo,
    color: colors.ink,
  },
  statusCasa: {
    ...typography.bodyLg,
    color: colors.ok,
    fontWeight: "600",
  },
  btnSair: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    minHeight: 48,
    justifyContent: "center",
  },
  btnSairText: {
    ...typography.bodyLg,
    color: colors.muted,
  },
  scrollContent: {
    padding: spacing.screenGutter,
    paddingBottom: 160, // Espaço para o botão flutuante de SOS
  },
  secaoTitulo: {
    ...typography.moradorTitulo,
    color: colors.ink,
    marginBottom: spacing.md,
    marginTop: spacing.xs,
  },
  buttonMorador: {
    minHeight: 72, // RNF-01: Alvo de toque >= 72px
    backgroundColor: colors.primary,
    borderRadius: rounded.lg,
    paddingVertical: 18,
    paddingHorizontal: 24,
    marginBottom: spacing.md,
    justifyContent: "center",
  },
  buttonMoradorLigada: {
    backgroundColor: colors.primaryDeep,
  },
  buttonMoradorOffline: {
    backgroundColor: colors.offline,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  iconeTexto: {
    fontSize: 32,
  },
  buttonNome: {
    ...typography.moradorBotao,
    color: colors.onPrimary,
  },
  buttonSubtexto: {
    ...typography.bodyLg,
    color: colors.onPrimary,
    opacity: 0.95,
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
  buttonSOS: {
    width: 120, // Conforme DESIGN.md button-sos
    height: 120,
    borderRadius: rounded.full,
    backgroundColor: colors.sos,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.onPrimary,
  },
  buttonSOSText: {
    ...typography.moradorNumero,
    color: colors.onDanger,
  },
  buttonSOSSubtext: {
    ...typography.bodyLg,
    fontWeight: "700",
    color: colors.onDanger,
  },
});
