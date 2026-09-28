import React, { useState, useEffect } from "react";
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
  const [canceling, setCanceling] = useState(false);
  const [cancelado, setCancelado] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(30);
  const [horaEnvio, setHoraEnvio] = useState("");

  useEffect(() => {
    async function disparar() {
      if (!morador?.residenciaId || !morador?.id) return;
      try {
        const now = new Date();
        const horaFormatada = now.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        setHoraEnvio(horaFormatada);

        const evento = await apiRepository.postSOS(morador.residenciaId, morador.id);
        setSosEvento(evento);
      } catch (err) {
        console.error("Erro ao disparar SOS:", err);
      } finally {
        setLoading(false);
      }
    }
    disparar();
  }, [morador?.residenciaId, morador?.id]);

  useEffect(() => {
    if (loading || cancelado) return;
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
  }, [loading, cancelado]);

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
        <Text style={styles.titulo}>
          {cancelado ? "Ajuda Cancelada" : "Pedido de Ajuda Enviado!"}
        </Text>

        {loading ? (
          <ActivityIndicator size="large" color={colors.sos} style={{ marginVertical: 20 }} />
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
