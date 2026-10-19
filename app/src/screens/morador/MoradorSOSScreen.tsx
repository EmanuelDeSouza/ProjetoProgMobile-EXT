import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { colors, typography, spacing, rounded } from "../../../theme/tokens";
import { useAuth } from "../../context/AuthContext";
import { apiRepository } from "../../services/api";
import { type SOSEvento } from "../../types";

interface MoradorSOSScreenProps {
  onDismiss: () => void;
}

export const MoradorSOSScreen: React.FC<MoradorSOSScreenProps> = ({ onDismiss }) => {
  const { morador } = useAuth();
  const [sosEvento, setSosEvento] = useState<SOSEvento | null>(null);
  const [loading, setLoading] = useState(true);
  const [falhou, setFalhou] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [cancelado, setCancelado] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(30);

  // Só mostra "enviado" depois que o servidor criou o evento (RNF-03): a hora vem do createdAt.
  const disparar = useCallback(async () => {
    setLoading(true);
    setFalhou(false);
    try {
      if (!morador?.residenciaId || !morador?.id) {
        throw new Error("Sessão do morador ausente.");
      }
      const evento = await apiRepository.postSOS(morador.residenciaId, morador.id);
      setSosEvento(evento);
    } catch (err) {
      console.error("Erro ao disparar SOS:", err);
      setFalhou(true);
    } finally {
      setLoading(false);
    }
  }, [morador?.residenciaId, morador?.id]);

  useEffect(() => {
    disparar();
  }, [disparar]);

  const horaEnvio = sosEvento
    ? new Date(sosEvento.createdAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  useEffect(() => {
    if (!sosEvento || cancelado) return;
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [sosEvento, cancelado]);

  const handleCancelar = async () => {
    if (!sosEvento || secondsRemaining <= 0) return;
    setCanceling(true);
    try {
      await apiRepository.patchSOS(sosEvento.id);
      setCancelado(true);
    } catch (err) {
      console.error("Erro ao cancelar SOS:", err);
    } finally {
      setCanceling(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.iconeEmergencia}>🚨</Text>
        <Text style={[styles.titulo, falhou && styles.tituloErro]}>
          {loading
            ? "Enviando pedido de ajuda..."
            : falhou
            ? "Pedido de ajuda não enviado"
            : cancelado
            ? "Ajuda Cancelada"
            : "Pedido de Ajuda Enviado!"}
        </Text>

        {loading ? (
          <ActivityIndicator size="large" color={colors.sos} style={{ marginVertical: 20 }} />
        ) : falhou ? (
          <>
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>
                Não foi possível avisar a família. Tente de novo ou use o botão de emergência da
                parede.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.btnVoltar}
              onPress={disparar}
              accessibilityRole="button"
              accessibilityLabel="Tentar enviar o pedido de ajuda de novo"
            >
              <Text style={styles.btnVoltarText}>Tentar de novo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.btnSecundario}
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel="Voltar ao painel"
            >
              <Text style={styles.btnSecundarioText}>Voltar ao Painel</Text>
            </TouchableOpacity>
          </>
        ) : cancelado ? (
          <>
            <Text style={styles.mensagem}>
              Você informou que foi sem querer. Seus cuidadores foram avisados do cancelamento.
            </Text>
            <TouchableOpacity style={styles.btnVoltar} onPress={onDismiss}>
              <Text style={styles.btnVoltarText}>Voltar ao Início</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.mensagem}>
              Pedido de ajuda enviado às {horaEnvio}. A família foi avisada.
            </Text>
            <Text style={styles.submensagem}>
              Fique calmo(a). Uma notificação urgente foi enviada para todos os cuidadores.
            </Text>

            {secondsRemaining > 0 ? (
              <View style={styles.cancelArea}>
                <TouchableOpacity
                  style={styles.btnCancelar}
                  onPress={handleCancelar}
                  disabled={canceling}
                >
                  {canceling ? (
                    <ActivityIndicator color={colors.ink} />
                  ) : (
                    <Text style={styles.btnCancelarText}>
                      Cancelar, foi sem querer ({secondsRemaining}s)
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.areaFinalizada}>
                <Text style={styles.tempoExpiradoText}>
                  Tempo para cancelamento expirado. Seus cuidadores estão a caminho.
                </Text>
                <TouchableOpacity style={styles.btnVoltar} onPress={onDismiss}>
                  <Text style={styles.btnVoltarText}>Voltar ao Painel</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.sosSoft,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.screenGutter,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: colors.paper,
    borderRadius: rounded.lg,
    padding: spacing.lg,
    alignItems: "center",
    borderWidth: 2,
    borderColor: colors.sos,
  },
  iconeEmergencia: {
    fontSize: 56,
    marginBottom: spacing.sm,
  },
  titulo: {
    ...typography.moradorTitulo,
    color: colors.sos,
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  tituloErro: {
    color: colors.danger,
  },
  errorBox: {
    width: "100%",
    backgroundColor: colors.dangerSoft,
    borderRadius: rounded.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  errorText: {
    ...typography.bodyLg,
    color: colors.danger,
    textAlign: "center",
  },
  btnSecundario: {
    minHeight: 72,
    width: "100%",
    marginTop: spacing.xl,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: rounded.md,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSecundarioText: {
    ...typography.moradorBotao,
    color: colors.ink,
  },
  mensagem: {
    ...typography.bodyLg,
    color: colors.ink,
    textAlign: "center",
    fontWeight: "600",
    marginBottom: spacing.xs,
  },
  submensagem: {
    ...typography.bodyLg,
    color: colors.muted,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  cancelArea: {
    width: "100%",
    marginTop: spacing.sm,
  },
  btnCancelar: {
    minHeight: 72,
    backgroundColor: colors.warnSoft,
    borderWidth: 2,
    borderColor: colors.warn,
    borderRadius: rounded.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  btnCancelarText: {
    ...typography.bodyLg,
    color: colors.warn,
    fontWeight: "700",
    textAlign: "center",
  },
  areaFinalizada: {
    width: "100%",
    alignItems: "center",
    marginTop: spacing.md,
  },
  tempoExpiradoText: {
    ...typography.bodyLg,
    color: colors.muted,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  btnVoltar: {
    minHeight: 72,
    width: "100%",
    backgroundColor: colors.primary,
    borderRadius: rounded.md,
    alignItems: "center",
    justifyContent: "center",
  },
  btnVoltarText: {
    ...typography.moradorBotao,
    color: colors.onPrimary,
  },
});
