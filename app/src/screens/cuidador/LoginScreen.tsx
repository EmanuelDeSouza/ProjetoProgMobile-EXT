import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { colors, typography, spacing, rounded } from "../../../theme/tokens";
import { useAuth } from "../../context/AuthContext";

interface LoginScreenProps {
  onSwitchToMorador: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onSwitchToMorador }) => {
  const { loginCuidador, loginGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!email || !senha) {
      setErrorMessage("Informe o e-mail e a senha.");
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      await loginCuidador(email, senha);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha ao autenticar.";
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      await loginGoogle("mock_google_id_token_12345");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha ao autenticar com Google.";
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      <View style={styles.card}>
        <Text style={styles.title}>CuidaLar</Text>
        <Text style={styles.subtitle}>Acompanhamento cuidador</Text>

        {errorMessage && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        <Text style={styles.label}>E-mail</Text>
        <TextInput
          style={styles.input}
          placeholder="seu@email.com"
          placeholderTextColor={colors.faint}
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />

        <Text style={styles.label}>Senha</Text>
        <TextInput
          style={styles.input}
          placeholder="••••••••"
          placeholderTextColor={colors.faint}
          secureTextEntry
          value={senha}
          onChangeText={setSenha}
        />

        <TouchableOpacity
          style={styles.buttonPrimary}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={styles.buttonPrimaryText}>Entrar</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.buttonSecondary}
          onPress={handleGoogleLogin}
          disabled={loading}
        >
          <Text style={styles.buttonSecondaryText}>Continuar com Google</Text>
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.moradorSwitchButton}
          onPress={onSwitchToMorador}
        >
          <Text style={styles.moradorSwitchText}>Modo Morador (Entrar com PIN)</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
    justifyContent: "center",
    padding: spacing.screenGutter,
  },
  card: {
    backgroundColor: colors.paper,
    padding: spacing.lg,
    borderRadius: rounded.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  title: {
    ...typography.cuidadorScreenTitle,
    color: colors.primary,
    textAlign: "center",
  },
  subtitle: {
    ...typography.caption,
    color: colors.muted,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.caption,
    color: colors.ink,
    marginBottom: spacing.xxs,
    fontWeight: "600",
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
  buttonPrimary: {
    height: 48,
    backgroundColor: colors.primary,
    borderRadius: rounded.sm,
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing.xs,
  },
  buttonPrimaryText: {
    ...typography.buttonMd,
    color: colors.onPrimary,
  },
  buttonSecondary: {
    height: 48,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: rounded.sm,
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  buttonSecondaryText: {
    ...typography.buttonMd,
    color: colors.ink,
  },
  divider: {
    height: 1,
    backgroundColor: colors.line,
    marginVertical: spacing.lg,
  },
  moradorSwitchButton: {
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  moradorSwitchText: {
    ...typography.bodyMd,
    color: colors.primary,
    fontWeight: "600",
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
});
