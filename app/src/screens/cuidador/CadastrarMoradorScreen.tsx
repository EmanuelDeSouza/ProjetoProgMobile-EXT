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

interface CadastrarMoradorScreenProps {
  onBack: () => void;
}

export const CadastrarMoradorScreen: React.FC<CadastrarMoradorScreenProps> = ({
  onBack,
}) => {
  const { selectedResidencia } = useResidence();
  const [nome, setNome] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);

  const handleRegister = async () => {
    if (!selectedResidencia) return;
    if (!nome.trim()) {
      setError("Informe o nome do morador.");
      return;
    }
    if (pin.trim().length !== 4 || !/^\d{4}$/.test(pin.trim())) {
      setError("O PIN deve conter exatamente 4 dígitos numéricos.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const created = await apiRepository.postMorador(selectedResidencia.id, {
        nome: nome.trim(),
        pin: pin.trim(),
      });
      setSuccessInfo(
        `Morador "${created.nome}" cadastrado com sucesso! ID do Morador para configuração: ${created.id}`
      );
      setNome("");
      setPin("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao cadastrar morador.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.btnVoltar} onPress={onBack}>
        <Text style={styles.btnVoltarText}>← Voltar ao painel</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Cadastrar Morador</Text>
      <Text style={styles.desc}>
        Crie o perfil para o morador (idoso ou PcD). Ele utilizará este PIN de 4 dígitos para acessar a tela simplificada no celular ou tablet da casa.
      </Text>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {successInfo && (
        <View style={styles.successBox}>
          <Text style={styles.successText}>{successInfo}</Text>
        </View>
      )}

      <Text style={styles.label}>Nome do Morador</Text>
      <TextInput
        style={styles.input}
        placeholder="Ex: Dona Maria"
        placeholderTextColor={colors.faint}
        value={nome}
        onChangeText={setNome}
      />

      <Text style={styles.label}>PIN de Acesso (4 dígitos)</Text>
      <TextInput
        style={styles.inputPin}
        placeholder="1234"
        placeholderTextColor={colors.faint}
        keyboardType="number-pad"
        maxLength={4}
        secureTextEntry
        value={pin}
        onChangeText={setPin}
      />

      <TouchableOpacity
        style={styles.btnSalvar}
        onPress={handleRegister}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <Text style={styles.btnSalvarText}>Salvar Morador</Text>
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
    ...typography.bodyMd,
    height: 48,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: rounded.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.paper,
    color: colors.ink,
    marginBottom: spacing.md,
  },
  inputPin: {
    ...typography.moradorNumero,
    height: 56,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: rounded.sm,
    textAlign: "center",
    letterSpacing: 12,
    backgroundColor: colors.paper,
    color: colors.ink,
    marginBottom: spacing.lg,
  },
  btnSalvar: {
    height: 48,
    backgroundColor: colors.primary,
    borderRadius: rounded.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  btnSalvarText: {
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
