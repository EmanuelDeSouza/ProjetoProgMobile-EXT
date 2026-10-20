import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { colors, typography, spacing, rounded } from "../../../theme/tokens";
import { useResidence } from "../../context/ResidenceContext";
import { apiRepository } from "../../services/api";
import { type Alerta, type Notificacao } from "../../types";

interface AlertasNotificacoesScreenProps {
  onBack: () => void;
}

export const AlertasNotificacoesScreen: React.FC<AlertasNotificacoesScreenProps> = ({
  onBack,
}) => {
  const { selectedResidencia } = useResidence();
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [aba, setAba] = useState<"alertas" | "notificacoes">("alertas");
  const [loading, setLoading] = useState(false);
  const [reconhecendoId, setReconhecendoId] = useState<string | null>(null);
  const [nota, setNota] = useState("");

  const loadData = async () => {
    if (!selectedResidencia) return;
    setLoading(true);
    try {
      const [listaAlertas, listaNotifs] = await Promise.all([
        apiRepository.listAlertas(selectedResidencia.id),
        apiRepository.listNotificacoes(),
      ]);
      setAlertas(listaAlertas);
      setNotificacoes(listaNotifs);
    } catch {
      // offline fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedResidencia?.id]);

  const handleReconhecer = async (alertaId: string, resolucaoPadrao?: string) => {
    try {
      await apiRepository.patchAlerta(alertaId, {
        status: "reconhecido",
        nota: resolucaoPadrao || nota || "Verificado pelo cuidador.",
      });
      setReconhecendoId(null);
      setNota("");
      await loadData();
    } catch (err) {
      console.error("Erro ao reconhecer alerta:", err);
    }
  };

  const handleMarcarLida = async (notificacaoId: string) => {
    try {
      await apiRepository.patchNotificacao(notificacaoId, true);
      await loadData();
    } catch (err) {
      console.error("Erro ao marcar notificação:", err);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.btnVoltar} onPress={onBack}>
        <Text style={styles.btnVoltarText}>← Voltar ao painel</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Central de Segurança</Text>

      {/* Abas */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, aba === "alertas" && styles.tabActive]}
          onPress={() => setAba("alertas")}
        >
          <Text style={[styles.tabText, aba === "alertas" && styles.tabTextActive]}>
            Alertas Ativos
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, aba === "notificacoes" && styles.tabActive]}
          onPress={() => setAba("notificacoes")}
        >
          <Text
            style={[styles.tabText, aba === "notificacoes" && styles.tabTextActive]}
          >
            Notificações ({notificacoes.filter((n) => !n.lidaEm).length})
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : aba === "alertas" ? (
        alertas.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>Tudo em ordem!</Text>
            <Text style={styles.emptyDesc}>Nenhum alerta pendente no momento.</Text>
          </View>
        ) : (
          <FlatList
            data={alertas}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const isAberto = item.status === "aberto";
              const isHigh = item.severidade === "alta";

              return (
                <View
                  style={[
                    styles.cardAlerta,
                    isHigh ? styles.cardAlertaHigh : styles.cardAlertaWarn,
                  ]}
                >
                  <View style={styles.cardHeader}>
                    <Text
                      style={[
                        styles.severidadeBadge,
                        isHigh ? styles.severidadeHigh : styles.severidadeWarn,
                      ]}
                    >
                      SEVERIDADE {item.severidade.toUpperCase()}
                    </Text>
                    <Text style={styles.alertaData}>
                      {new Date(item.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                  </View>

                  <Text style={styles.alertaTitulo}>
                    {isHigh ? "Alerta Crítico / Emergência" : "Atenção Necessária"}
                  </Text>
                  <Text style={styles.alertaDesc}>
                    {isAberto
                      ? "Este alerta aguarda reconhecimento de um cuidador."
                      : "Alerta já verificado e reconhecido."}
                  </Text>

                  {isAberto && (
                    <View style={styles.actionsContainer}>
                      {reconhecendoId === item.id ? (
                        <View style={styles.reconhecerForm}>
                          <TextInput
                            style={styles.inputNota}
                            placeholder="Adicionar nota para outros cuidadores..."
                            placeholderTextColor={colors.faint}
                            value={nota}
                            onChangeText={setNota}
                          />
                          <View style={styles.actionButtonsRow}>
                            <TouchableOpacity
                              style={styles.btnActionSecondary}
                              onPress={() => setReconhecendoId(null)}
                            >
                              <Text style={styles.btnActionSecondaryText}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.btnActionPrimary}
                              onPress={() => handleReconhecer(item.id)}
                            >
                              <Text style={styles.btnActionPrimaryText}>Salvar</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : (
                        <View style={styles.actionButtonsRow}>
                          <TouchableOpacity
                            style={styles.btnTudoBem}
                            onPress={() =>
                              handleReconhecer(item.id, "Verifiquei, está tudo bem.")
                            }
                          >
                            <Text style={styles.btnTudoBemText}>
                              ✓ Verifiquei, está tudo bem
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.btnEscalar}
                            onPress={() => setReconhecendoId(item.id)}
                          >
                            <Text style={styles.btnEscalarText}>Anotar / Escalar</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            }}
          />
        )
      ) : (
        <FlatList
          data={notificacoes}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.cardNotif,
                !item.lidaEm && styles.cardNotifNaoLida,
              ]}
              onPress={() => handleMarcarLida(item.id)}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.notifTipo}>
                  {item.tipo === "sos" ? "🚨 SOS EMERGÊNCIA" : "⚠️ ALERTA"}
                </Text>
                <Text style={styles.alertaData}>
                  {new Date(item.createdAt).toLocaleDateString()}
                </Text>
              </View>
              <Text style={styles.notifMensagem}>
                {item.tipo === "sos"
                  ? "Botão de emergência foi acionado no imóvel."
                  : "Nova anomalia detectada pelas regras de monitoramento."}
              </Text>
              {!item.lidaEm && (
                <Text style={styles.marcarLidaText}>Toque para marcar como lida</Text>
              )}
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
    padding: spacing.screenGutter,
  },
  btnVoltar: {
    paddingVertical: spacing.xs,
    marginBottom: spacing.xs,
  },
  btnVoltarText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: "600",
  },
  title: {
    ...typography.cuidadorScreenTitle,
    color: colors.ink,
    marginBottom: spacing.md,
  },
  tabRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    marginBottom: spacing.md,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48, // DESIGN.md: alvo de toque >= 48px
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  tabText: {
    ...typography.buttonMd,
    color: colors.muted,
  },
  tabTextActive: {
    color: colors.primary,
  },
  cardAlerta: {
    padding: spacing.md,
    borderRadius: rounded.md,
    marginBottom: spacing.md,
  },
  cardAlertaWarn: {
    backgroundColor: colors.warnSoft,
  },
  cardAlertaHigh: {
    backgroundColor: colors.sosSoft,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xxs,
  },
  severidadeBadge: {
    fontSize: 12,
    fontWeight: "700",
  },
  severidadeHigh: {
    color: colors.sos,
  },
  severidadeWarn: {
    color: colors.warn,
  },
  alertaData: {
    ...typography.caption,
    color: colors.muted,
  },
  alertaTitulo: {
    ...typography.cuidadorHeadingCard,
    color: colors.ink,
    marginVertical: spacing.xxs,
  },
  alertaDesc: {
    ...typography.bodyMd,
    color: colors.muted,
    marginBottom: spacing.sm,
  },
  actionsContainer: {
    marginTop: spacing.xs,
  },
  actionButtonsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  btnTudoBem: {
    flex: 1,
    backgroundColor: colors.ok,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: rounded.sm,
    height: 48,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  btnTudoBemText: {
    ...typography.caption,
    color: colors.onPrimary,
    fontWeight: "700",
  },
  btnEscalar: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.lineStrong,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: rounded.sm,
    height: 48,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  btnEscalarText: {
    ...typography.caption,
    color: colors.ink,
    fontWeight: "600",
  },
  reconhecerForm: {
    gap: spacing.xs,
  },
  inputNota: {
    ...typography.bodyLg,
    height: 52, // DESIGN.md: text-input height 52px
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: rounded.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.paper,
    color: colors.ink,
  },
  btnActionPrimary: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: rounded.sm,
    height: 48,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  btnActionPrimaryText: {
    ...typography.buttonMd,
    color: colors.onPrimary,
  },
  btnActionSecondary: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    height: 48,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  btnActionSecondaryText: {
    ...typography.buttonMd,
    color: colors.muted,
  },
  cardNotif: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: rounded.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardNotifNaoLida: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  notifTipo: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.ink,
  },
  notifMensagem: {
    ...typography.bodyMd,
    color: colors.ink,
    marginVertical: spacing.xxs,
  },
  marcarLidaText: {
    ...typography.caption,
    color: colors.primaryDeep,
    fontWeight: "600",
    marginTop: spacing.xxs,
  },
  emptyBox: {
    padding: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    ...typography.cuidadorHeadingCard,
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  emptyDesc: {
    ...typography.bodyMd,
    color: colors.muted,
  },
});
