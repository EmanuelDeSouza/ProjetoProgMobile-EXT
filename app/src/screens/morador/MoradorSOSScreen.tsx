import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { colors, typography, spacing, rounded } from "../../../theme/tokens";
import { useAuth } from "../../context/AuthContext";
import { ApiException, apiRepository } from "../../services/api";
import { type SOSEvento } from "../../types";

interface MoradorSOSScreenProps {
  onDismiss: () => void;
}

// RF-16: o servidor aceita cancelar até 30s; o app oferece 28s para sobrar margem de rede.
const JANELA_CANCELAR_S = 28;

type Estado = "enviando" | "enviado" | "falhou" | "cancelando" | "cancelado";

/** RF-15/RF-16 · Confirma o envio só quando o servidor registrou. Se falhar, diz a verdade e tenta de novo. */
export const MoradorSOSScreen: React.FC<MoradorSOSScreenProps> = ({ onDismiss }) => {
  const { morador } = useAuth();
  const [estado, setEstado] = useState<Estado>("enviando");
  const [sos, setSos] = useState<SOSEvento | null>(null);
  const [restante, setRestante] = useState(JANELA_CANCELAR_S);
  const [horaEnvio, setHoraEnvio] = useState("");
  const [erroCancelar, setErroCancelar] = useState<string | null>(null);
  const tentativa = useRef(0);

  const enviar = useCallback(async () => {
    if (!morador) return;
    tentativa.current += 1;
    setEstado("enviando");
    try {
      const evento = await apiRepository.postSOS(morador.residenciaId, morador.id);
      setSos(evento);
      setHoraEnvio(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
      setRestante(JANELA_CANCELAR_S);
      setEstado("enviado");
    } catch {
      setEstado("falhou");
    }
  }, [morador]);

  useEffect(() => {
    void enviar();
  }, [enviar]);

  // Sem rede: tenta de novo sozinho a cada 5s enquanto a tela estiver aberta.
  useEffect(() => {
    if (estado !== "falhou") return;
    const t = setTimeout(() => void enviar(), 5000);
    return () => clearTimeout(t);
  }, [estado, enviar]);

  useEffect(() => {
    if (estado !== "enviado") return;
    const t = setInterval(() => setRestante((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [estado]);

  const cancelar = async () => {
    if (!sos || restante <= 0) return;
    setErroCancelar(null);
    setEstado("cancelando");
    try {
      await apiRepository.cancelarSOS(sos.id);
      setEstado("cancelado");
    } catch (err) {
      setEstado("enviado");
      setErroCancelar(
        err instanceof ApiException && err.status === 409
          ? "O tempo para cancelar acabou. A família já foi avisada."
          : "Não foi possível cancelar agora. A família foi avisada do pedido."
      );
      if (err instanceof ApiException && err.status === 409) setRestante(0);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card} accessibilityLiveRegion="assertive">
        <Text style={styles.iconeEmergencia}>{estado === "cancelado" ? "✅" : "🚨"}</Text>

        {estado === "enviando" && (
          <>
            <Text style={styles.titulo}>Enviando pedido de ajuda…</Text>
            <ActivityIndicator size="large" color={colors.sos} style={{ marginVertical: spacing.lg }} />
          </>
        )}

        {estado === "falhou" && (
          <>
            <Text style={styles.titulo}>Ainda não conseguimos enviar</Text>
            <Text style={styles.mensagem}>Sem conexão com a internet. Estamos tentando de novo.</Text>
            <Text style={styles.submensagem}>
              Se tiver o botão de emergência da casa, aperte ele também. Ou ligue para alguém.
            </Text>
            <TouchableOpacity style={styles.btnVoltar} onPress={() => void enviar()} accessibilityRole="button">
              <Text style={styles.btnVoltarText}>Tentar de novo agora</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnCancelar} onPress={onDismiss} accessibilityRole="button">
              <Text style={styles.btnCancelarText}>Voltar</Text>
            </TouchableOpacity>
          </>
        )}

        {(estado === "enviado" || estado === "cancelando") && (
          <>
            <Text style={styles.titulo}>Pedido de ajuda enviado</Text>
            <Text style={styles.mensagem}>Enviado às {horaEnvio}. A família foi avisada.</Text>
            {erroCancelar && <Text style={styles.submensagem}>{erroCancelar}</Text>}
            {restante > 0 ? (
              <View style={styles.cancelArea}>
                <TouchableOpacity
                  style={styles.btnCancelar}
                  onPress={() => void cancelar()}
                  disabled={estado === "cancelando"}
                  accessibilityRole="button"
                  accessibilityLabel={`Cancelar, foi sem querer. ${restante} segundos`}
                >
                  {estado === "cancelando" ? (
                    <ActivityIndicator color={colors.ink} />
                  ) : (
                    <Text style={styles.btnCancelarText}>Cancelar, foi sem querer ({restante}s)</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.areaFinalizada}>
                <Text style={styles.tempoExpiradoText}>Fique tranquilo(a). A família já sabe e vai entrar em contato.</Text>
                <TouchableOpacity style={styles.btnVoltar} onPress={onDismiss} accessibilityRole="button">
                  <Text style={styles.btnVoltarText}>Voltar ao início</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {estado === "cancelado" && (
          <>
            <Text style={styles.titulo}>Pedido cancelado</Text>
            <Text style={styles.mensagem}>A família foi avisada de que foi sem querer.</Text>
            <TouchableOpacity style={styles.btnVoltar} onPress={onDismiss} accessibilityRole="button">
              <Text style={styles.btnVoltarText}>Voltar ao início</Text>
            </TouchableOpacity>
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
