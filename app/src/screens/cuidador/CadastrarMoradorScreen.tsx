import React, { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { colors, typography, spacing, rounded } from "../../../theme/tokens";
import { useResidence } from "../../context/ResidenceContext";
import { useAuth } from "../../context/AuthContext";
import { apiRepository, mensagemDeErro } from "../../services/api";
import { formMorador, primeiroErro } from "../../services/schemas";
import type { Morador } from "../../types";

interface CadastrarMoradorScreenProps {
  onBack: () => void;
}

/** RF-04 · Cadastrar morador com PIN e configurar o aparelho da casa para ele. */
export const CadastrarMoradorScreen: React.FC<CadastrarMoradorScreenProps> = ({ onBack }) => {
  const { selectedResidencia } = useResidence();
  const { vincularAparelho } = useAuth();
  const [moradores, setMoradores] = useState<Morador[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [nome, setNome] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);
  const [confirmarAparelho, setConfirmarAparelho] = useState<Morador | null>(null);

  const carregar = useCallback(async () => {
    if (!selectedResidencia) return;
    setCarregando(true);
    try {
      setMoradores(await apiRepository.listMoradores(selectedResidencia.id));
    } catch (err) {
      setError(mensagemDeErro(err, "Não foi possível carregar os moradores."));
    } finally {
      setCarregando(false);
    }
  }, [selectedResidencia]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const handleRegister = async () => {
    if (!selectedResidencia) return;
    setError(null);
    setSuccessInfo(null);
    const parsed = formMorador.safeParse({ nome, pin: pin.trim() });
    if (!parsed.success) {
      setError(primeiroErro(parsed.error));
      return;
    }
    setLoading(true);
    try {
      const created = await apiRepository.postMorador(selectedResidencia.id, parsed.data);
      setSuccessInfo(`${created.nome} cadastrado(a). Agora configure o tablet ou celular da casa abaixo.`);
      setNome("");
      setPin("");
      await carregar();
    } catch (err: unknown) {
      setError(mensagemDeErro(err, "Erro ao cadastrar morador."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <TouchableOpacity style={styles.btnVoltar} onPress={onBack} accessibilityRole="button">
        <Text style={styles.btnVoltarText}>← Voltar ao painel</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Moradores</Text>
      <Text style={styles.desc}>
        O morador não usa e-mail nem senha. Cadastre o nome e um PIN de 4 números, depois configure o
        aparelho da casa para ele: a tela inicial vira só o teclado de PIN.
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

      <Text style={styles.secao}>Moradores desta casa</Text>
      {carregando ? (
        <ActivityIndicator color={colors.primary} />
      ) : moradores.length === 0 ? (
        <Text style={styles.desc}>Nenhum morador cadastrado ainda.</Text>
      ) : (
        moradores.map((m) => (
          <View key={m.id} style={styles.moradorCard}>
            <Text style={styles.moradorNome}>{m.nome}</Text>
            {confirmarAparelho?.id === m.id ? (
              <View style={styles.confirmBox}>
                <Text style={styles.confirmText}>
                  Este aparelho vai virar o painel de {m.nome}. Você vai sair da sua conta aqui e a tela
                  inicial passa a pedir só o PIN. Para voltar, toque em "Sou cuidador".
                </Text>
                <View style={styles.linhaBotoes}>
                  <TouchableOpacity style={styles.btnSecundario} onPress={() => setConfirmarAparelho(null)}>
                    <Text style={styles.btnSecundarioText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.btnPrimario} onPress={() => void vincularAparelho(m)}>
                    <Text style={styles.btnPrimarioText}>Confirmar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <>
                <Text style={styles.moradorAjuda}>Faça isto no tablet ou celular que fica na casa.</Text>
                <TouchableOpacity
                  style={styles.btnAparelho}
                  onPress={() => setConfirmarAparelho(m)}
                  accessibilityRole="button"
                >
                  <Text style={styles.btnAparelhoText}>Usar este aparelho para {m.nome}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ))
      )}

      <Text style={styles.secao}>Cadastrar novo morador</Text>
      <Text style={styles.label}>Nome do morador</Text>
      <TextInput
        style={styles.input}
        placeholder="Ex.: Dona Maria"
        placeholderTextColor={colors.faint}
        value={nome}
        onChangeText={setNome}
      />

      <Text style={styles.label}>PIN de acesso (4 números)</Text>
      <TextInput
        style={styles.inputPin}
        placeholder="1234"
        placeholderTextColor={colors.faint}
        keyboardType="number-pad"
        maxLength={4}
        secureTextEntry
        value={pin}
        onChangeText={(t) => setPin(t.replace(/[^0-9]/g, ""))}
      />

      <TouchableOpacity style={styles.btnSalvar} onPress={() => void handleRegister()} disabled={loading} accessibilityRole="button">
        {loading ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.btnSalvarText}>Salvar morador</Text>}
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
    minHeight: 48,
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
  secao: {
    ...typography.cuidadorHeadingCard,
    color: colors.ink,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  moradorCard: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: rounded.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.paper,
  },
  moradorNome: {
    ...typography.cuidadorHeadingCard,
    color: colors.ink,
  },
  moradorAjuda: {
    ...typography.caption,
    color: colors.muted,
    marginTop: spacing.xxs,
  },
  btnAparelho: {
    marginTop: spacing.sm,
    minHeight: 48,
    borderRadius: rounded.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  btnAparelhoText: {
    ...typography.buttonMd,
    color: colors.primary,
  },
  confirmBox: {
    backgroundColor: colors.warnSoft,
    borderRadius: rounded.sm,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  confirmText: {
    ...typography.bodyMd,
    color: colors.warn,
  },
  linhaBotoes: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  btnSecundario: {
    flex: 1,
    minHeight: 48,
    borderRadius: rounded.sm,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSecundarioText: {
    ...typography.buttonMd,
    color: colors.ink,
  },
  btnPrimario: {
    flex: 1,
    minHeight: 48,
    borderRadius: rounded.sm,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimarioText: {
    ...typography.buttonMd,
    color: colors.onPrimary,
  },
});
