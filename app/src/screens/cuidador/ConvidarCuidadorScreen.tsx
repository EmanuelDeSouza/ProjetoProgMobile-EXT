import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { colors, typography, spacing, rounded } from "../../../theme/tokens";
import { useResidence } from "../../context/ResidenceContext";
import { apiRepository } from "../../services/api";

interface ConvidarCuidadorScreenProps {
  onBack: () => void;
}

export const ConvidarCuidadorScreen: React.FC<ConvidarCuidadorScreenProps> = ({
  onBack,
}) => {
  const { selectedResidencia } = useResidence();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleInvite = async () => {
    if (!selectedResidencia) return;
    if (!email.trim() || !email.includes("@")) {
      setError("Informe um e-mail válido.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      await apiRepository.postConvite(selectedResidencia.id, email.trim().toLowerCase());
      setSuccess(true);
      setEmail("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao enviar convite.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.btnVoltar} onPress={onBack}>
        <Text style={styles.btnVoltarText}>← Voltar ao painel</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Convidar Cuidador</Text>
      <Text style={styles.desc}>
        Convide outro familiar ou cuidador para acompanhar esta residência. O convidado receberá acesso ao painel e alertas.
      </Text>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {success && (
        <View style={styles.successBox}>
          <Text style={styles.successText}>
            Convite enviado com sucesso! Quando o cuidador entrar no app, o acesso será liberado.
          </Text>
        </View>
      )}

      <Text style={styles.label}>E-mail do Cuidador Convidado</Text>
      <TextInput
        style={styles.input}
        placeholder="cuidador@exemplo.com"
        placeholderTextColor={colors.faint}
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />

      <TouchableOpacity
        style={styles.btnEnviar}
        onPress={handleInvite}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <Text style={styles.btnEnviarText}>Enviar Convite</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  content: {
    padding: spacing.screenGutter,
  },
  btnVoltar: {
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  btnVoltarText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: "600",
  },
  title: {
    ...typography.cuidadorScreenTitle,
    color: colors.ink,
    marginBottom: spacing.xxs,
  },
  desc: {
    ...typography.caption,
    color: colors.muted,
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.caption,
    color: colors.ink,
    fontWeight: "600",
    marginBottom: spacing.xxs,
  },
  input: {
    ...typography.bodyLg,
    height: 52, // DESIGN.md: text-input height 52px
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: rounded.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.paper,
    color: colors.ink,
    marginBottom: spacing.lg,
  },
  btnEnviar: {
    height: 48,
    minHeight: 48,
    backgroundColor: colors.primary,
    borderRadius: rounded.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  btnEnviarText: {
    ...typography.buttonMd,
    color: colors.onPrimary,
  },
  errorBox: {
    backgroundColor: colors.dangerSoft,
    padding: spacing.sm,
    borderRadius: rounded.sm,
    marginBottom: spacing.md,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
  },
  successBox: {
    backgroundColor: colors.okSoft,
    padding: spacing.sm,
    borderRadius: rounded.sm,
    marginBottom: spacing.md,
  },
  successText: {
    ...typography.caption,
    color: colors.ok,
  },
});
