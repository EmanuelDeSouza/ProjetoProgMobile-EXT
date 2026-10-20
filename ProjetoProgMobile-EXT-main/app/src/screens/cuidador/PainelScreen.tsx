import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { colors, typography, spacing, rounded } from "../../../theme/tokens";
import { useResidence } from "../../context/ResidenceContext";
import { useAuth } from "../../context/AuthContext";
import { type Dispositivo } from "../../types";

interface PainelScreenProps {
  onNavigateToParear: () => void;
  onNavigateToMorador: () => void;
  onNavigateToConvite: () => void;
  onNavigateToRegras: () => void;
  onNavigateToAlertas: () => void;
  onNavigateToHistorico: (dispositivoId: string) => void;
  onChangeResidencia: () => void;
}

export const PainelScreen: React.FC<PainelScreenProps> = ({
  onNavigateToParear,
  onNavigateToMorador,
  onNavigateToConvite,
  onNavigateToRegras,
  onNavigateToAlertas,
  onNavigateToHistorico,
  onChangeResidencia,
}) => {
  const { logout } = useAuth();
  const {
    selectedResidencia,
    dispositivos,
    loading,
    isOffline,
    refreshDispositivos,
    controlarTomada,
  } = useResidence();

  const [controllingId, setControllingId] = useState<string | null>(null);
  const [commandFeedback, setCommandFeedback] = useState<Record<string, string>>({});

  // Group devices by room (cômodo)
  const groupedByComodo = dispositivos.reduce<Record<string, Dispositivo[]>>(
    (acc, disp) => {
      const comodo = disp.comodo || "Geral";
      if (!acc[comodo]) acc[comodo] = [];
      acc[comodo].push(disp);
      return acc;
    },
    {}
  );

  const handleToggleTomada = async (disp: Dispositivo) => {
    if (disp.status === "offline") return;
    const isCurrentlyLigada = disp.estadoAtual?.tomada === "ligada";
    const nextState = !isCurrentlyLigada;

    setControllingId(disp.id);
    setCommandFeedback((prev) => ({ ...prev, [disp.id]: "Enviando comando..." }));

    try {
      const confirmed = await controlarTomada(disp.id, nextState);
      if (confirmed) {
        setCommandFeedback((prev) => {
          const copy = { ...prev };
          delete copy[disp.id];
          return copy;
        });
      } else {
        setCommandFeedback((prev) => ({
          ...prev,
          [disp.id]: "Não foi possível confirmar. Verifique se o dispositivo está ligado.",
        }));
      }
    } catch (err: unknown) {
      setCommandFeedback((prev) => ({
        ...prev,
        [disp.id]: err instanceof Error ? err.message : "Erro ao comandar.",
      }));
    } finally {
      setControllingId(null);
    }
  };

  const renderDispositivoCard = (disp: Dispositivo) => {
    const isDispOffline = disp.status === "offline";
    const isControlling = controllingId === disp.id;
    const feedback = commandFeedback[disp.id];

    let estadoTexto = "Sem leitura recente";
    if (disp.tipo === "atuador_tomada") {
      const ligada = disp.estadoAtual?.tomada === "ligada";
      estadoTexto = ligada ? "Tomada Ligada" : "Tomada Desligada";
    } else if (disp.tipo === "sensor_presenca") {
      estadoTexto = disp.estadoAtual?.presenca ? "Movimento detectado" : "Sem movimento";
    } else if (disp.tipo === "sensor_contato") {
      estadoTexto = disp.estadoAtual?.contato === "aberto" ? "Aberto" : "Fechado";
    } else if (disp.tipo === "sensor_temperatura") {
      const t = disp.estadoAtual?.temperatura;
      const u = disp.estadoAtual?.umidade;
      estadoTexto = t !== undefined ? `${t}°C • ${u}% umidade` : "Aguardando leitura";
    } else if (disp.tipo === "botao_sos") {
      estadoTexto = "Botão de emergência ativo";
    }

    return (
      <View
        key={disp.id}
        style={[
          styles.cardDispositivo,
          isDispOffline && styles.cardDispositivoOffline,
        ]}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardNome}>{disp.nome}</Text>
          <View
            style={[
              styles.chipStatus,
              isDispOffline ? styles.chipOffline : styles.chipOnline,
            ]}
          >
            <Text
              style={[
                styles.chipText,
                isDispOffline ? styles.chipTextOffline : styles.chipTextOnline,
              ]}
            >
              {isDispOffline ? "Offline" : "Online"}
            </Text>
          </View>
        </View>

        <Text style={styles.cardEstado}>{estadoTexto}</Text>

        {isDispOffline && disp.ultimoContatoEm && (
          <Text style={styles.cardOfflineAviso}>
            Sem contato com este dispositivo desde{" "}
            {new Date(disp.ultimoContatoEm).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        )}

        {feedback && (
          <Text style={styles.cardFeedbackText}>{feedback}</Text>
        )}

        <View style={styles.cardActionsRow}>
          {disp.tipo === "atuador_tomada" && (
            <TouchableOpacity
              style={[
                styles.btnControle,
                isDispOffline && styles.btnControleDisabled,
              ]}
              onPress={() => handleToggleTomada(disp)}
              disabled={isDispOffline || isControlling}
            >
              {isControlling ? (
                <ActivityIndicator color={colors.onPrimary} size="small" />
              ) : (
                <Text style={styles.btnControleText}>
                  {disp.estadoAtual?.tomada === "ligada" ? "Desligar" : "Ligar"}
                </Text>
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.btnHistorico}
            onPress={() => onNavigateToHistorico(disp.id)}
          >
            <Text style={styles.btnHistoricoText}>Histórico</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Barra de navegação do cuidador */}
      <View style={styles.navBar}>
        <View>
          <Text style={styles.residenciaTitle}>
            {selectedResidencia?.nome || "Residência"}
          </Text>
          <TouchableOpacity onPress={onChangeResidencia}>
            <Text style={styles.trocarResidenciaText}>Trocar residência</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.navActions}>
          <TouchableOpacity style={styles.iconButton} onPress={onNavigateToAlertas}>
            <Text style={styles.iconButtonText}>🔔 Alertas</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={logout}>
            <Text style={styles.logoutText}>Sair</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* RNF-05: Aviso de aplicativo offline */}
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>
            Sem conexão. Mostrando o último estado salvo.
          </Text>
        </View>
      )}

      {/* Ações rápidas */}
      <View style={styles.quickActions}>
        <TouchableOpacity style={styles.quickBtn} onPress={onNavigateToParear}>
          <Text style={styles.quickBtnText}>+ Parear</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickBtn} onPress={onNavigateToMorador}>
          <Text style={styles.quickBtnText}>+ Morador</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickBtn} onPress={onNavigateToConvite}>
          <Text style={styles.quickBtnText}>+ Convidar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickBtn} onPress={onNavigateToRegras}>
          <Text style={styles.quickBtnText}>⚙ Regras</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={refreshDispositivos}
            colors={[colors.primary]}
          />
        }
      >
        {loading && dispositivos.length === 0 ? (
          <View style={styles.skeletonContainer}>
            <View style={styles.skeletonCard} />
            <View style={styles.skeletonCard} />
          </View>
        ) : dispositivos.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>Nenhum dispositivo pareado ainda.</Text>
            <Text style={styles.emptySubtitle}>
              Toque em Parear para começar a monitorar a casa.
            </Text>
            <TouchableOpacity style={styles.btnParearEmpty} onPress={onNavigateToParear}>
              <Text style={styles.btnParearEmptyText}>Parear Dispositivo</Text>
            </TouchableOpacity>
          </View>
        ) : (
          Object.entries(groupedByComodo).map(([comodo, disps]) => (
            <View key={comodo} style={styles.comodoSection}>
              <Text style={styles.comodoTitle}>{comodo}</Text>
              {disps.map(renderDispositivoCard)}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  navBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.screenGutter,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.paper,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  residenciaTitle: {
    ...typography.cuidadorScreenTitle,
    color: colors.ink,
  },
  trocarResidenciaText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: "600",
  },
  navActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  iconButton: {
    paddingVertical: spacing.xxs,
    paddingHorizontal: spacing.xs,
  },
  iconButtonText: {
    ...typography.buttonMd,
    color: colors.ink,
  },
  logoutText: {
    ...typography.caption,
    color: colors.danger,
    fontWeight: "600",
  },
  offlineBanner: {
    backgroundColor: colors.offlineSoft,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.screenGutter,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  offlineBannerText: {
    ...typography.caption,
    color: colors.offline,
    textAlign: "center",
  },
  quickActions: {
    flexDirection: "row",
    paddingHorizontal: spacing.screenGutter,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    backgroundColor: colors.paperDeep,
  },
  quickBtn: {
    flex: 1,
    backgroundColor: colors.paper,
    paddingVertical: spacing.xs,
    borderRadius: rounded.sm,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48, // DESIGN.md: alvo de toque >= 48px
  },
  quickBtnText: {
    ...typography.caption,
    color: colors.ink,
    fontWeight: "600",
  },
  scrollContent: {
    padding: spacing.screenGutter,
    paddingBottom: spacing.xxl,
  },
  comodoSection: {
    marginBottom: spacing.lg,
  },
  comodoTitle: {
    ...typography.cuidadorHeadingCard,
    color: colors.muted,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
    fontSize: 14,
    letterSpacing: 0.5,
  },
  cardDispositivo: {
    backgroundColor: colors.paper,
    borderRadius: rounded.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: spacing.sm,
  },
  cardDispositivoOffline: {
    backgroundColor: colors.offlineSoft,
    borderColor: colors.line,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xxs,
  },
  cardNome: {
    ...typography.cuidadorHeadingCard,
    color: colors.ink,
  },
  chipStatus: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: rounded.full,
  },
  chipOnline: {
    backgroundColor: colors.okSoft,
  },
  chipOffline: {
    backgroundColor: colors.offlineSoft,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  chipTextOnline: {
    color: colors.ok,
  },
  chipTextOffline: {
    color: colors.offline,
  },
  cardEstado: {
    ...typography.bodyMd,
    color: colors.ink,
    marginVertical: spacing.xs,
  },
  cardOfflineAviso: {
    ...typography.caption,
    color: colors.offline,
    fontStyle: "italic",
    marginBottom: spacing.xs,
  },
  cardFeedbackText: {
    ...typography.caption,
    color: colors.danger,
    marginBottom: spacing.xs,
  },
  cardActionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  btnControle: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: rounded.sm,
    minWidth: 88,
    height: 48,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  btnControleDisabled: {
    backgroundColor: colors.lineStrong,
  },
  btnControleText: {
    ...typography.buttonMd,
    color: colors.onPrimary,
  },
  btnHistorico: {
    backgroundColor: "transparent",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: rounded.sm,
    height: 48,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  btnHistoricoText: {
    ...typography.caption,
    color: colors.ink,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xxl,
  },
  emptyTitle: {
    ...typography.cuidadorHeadingCard,
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    ...typography.bodyMd,
    color: colors.muted,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  btnParearEmpty: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: rounded.sm,
    height: 48,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  btnParearEmptyText: {
    ...typography.buttonMd,
    color: colors.onPrimary,
  },
  skeletonContainer: {
    gap: spacing.md,
  },
  skeletonCard: {
    height: 96, // DESIGN.md: skeleton-card height 96px
    backgroundColor: colors.paperDeep,
    borderRadius: rounded.md,
  },
});
