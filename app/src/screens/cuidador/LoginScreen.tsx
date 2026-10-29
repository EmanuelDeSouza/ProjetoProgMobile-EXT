import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import { colors, typography, spacing, rounded } from "../../../theme/tokens";
import { useAuth } from "../../context/AuthContext";
import { mensagemDeErro } from "../../services/api";
import { formCadastro, formLogin, primeiroErro } from "../../services/schemas";

WebBrowser.maybeCompleteAuthSession();

const googleIds = {
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined,
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || undefined,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined,
};
const googleConfigurado = Boolean(
  Platform.OS === "android" ? googleIds.androidClientId : Platform.OS === "ios" ? googleIds.iosClientId : googleIds.webClientId
);

interface LoginScreenProps {
  /** Este aparelho já é o tablet de um morador (mostra o atalho de volta ao PIN). */
  aparelhoConfigurado: boolean;
  onSwitchToMorador: () => void;
}

/** Só montado quando há client id: o hook do Google exige configuração. */
const BotaoGoogle: React.FC<{ onErro: (m: string) => void; ocupado: boolean; setOcupado: (b: boolean) => void }> = ({
  onErro,
  ocupado,
  setOcupado,
}) => {
  const { loginGoogle } = useAuth();
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest(googleIds);

  useEffect(() => {
    if (response?.type !== "success") {
      if (response?.type === "error") onErro("Não foi possível entrar com o Google.");
      return;
    }
    const idToken = response.params.id_token;
    if (!idToken) return onErro("O Google não devolveu a identificação. Tente de novo.");
    setOcupado(true);
    loginGoogle(idToken)
      .catch((e: unknown) => onErro(mensagemDeErro(e, "Não foi possível entrar com o Google.")))
      .finally(() => setOcupado(false));
  }, [response, loginGoogle, onErro, setOcupado]);

  return (
    <TouchableOpacity
      style={styles.buttonSecondary}
      onPress={() => void promptAsync()}
      disabled={!request || ocupado}
      accessibilityRole="button"
    >
      <Text style={styles.buttonSecondaryText}>Continuar com Google</Text>
    </TouchableOpacity>
  );
};

export const LoginScreen: React.FC<LoginScreenProps> = ({ aparelhoConfigurado, onSwitchToMorador }) => {
  const { loginCuidador, cadastrarCuidador } = useAuth();
  const [modo, setModo] = useState<"entrar" | "cadastrar">("entrar");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const enviar = async () => {
    setErrorMessage(null);
    const parsed =
      modo === "entrar" ? formLogin.safeParse({ email, senha }) : formCadastro.safeParse({ nome, email, senha });
    if (!parsed.success) {
      setErrorMessage(primeiroErro(parsed.error));
      return;
    }
    setLoading(true);
    try {
      if (modo === "entrar") await loginCuidador(email, senha);
      else await cadastrarCuidador(nome, email, senha);
    } catch (err: unknown) {
      setErrorMessage(
        mensagemDeErro(err, modo === "entrar" ? "E-mail ou senha incorretos." : "Não foi possível criar a conta.")
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.container}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>CuidaLar</Text>
          <Text style={styles.subtitle}>
            {modo === "entrar" ? "Acompanhamento do cuidador" : "Criar conta de cuidador"}
          </Text>

          {errorMessage && (
            <View style={styles.errorBox} accessibilityLiveRegion="polite">
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          {modo === "cadastrar" && (
            <>
              <Text style={styles.label}>Seu nome</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex.: Ana Souza"
                placeholderTextColor={colors.faint}
                value={nome}
                onChangeText={setNome}
                autoComplete="name"
              />
            </>
          )}

          <Text style={styles.label}>E-mail</Text>
          <TextInput
            style={styles.input}
            placeholder="seu@email.com"
            placeholderTextColor={colors.faint}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
          />

          <Text style={styles.label}>Senha</Text>
          <TextInput
            style={styles.input}
            placeholder={modo === "cadastrar" ? "Mínimo de 6 caracteres" : "••••••••"}
            placeholderTextColor={colors.faint}
            secureTextEntry
            autoComplete={modo === "cadastrar" ? "new-password" : "password"}
            value={senha}
            onChangeText={setSenha}
            onSubmitEditing={enviar}
          />

          <TouchableOpacity style={styles.buttonPrimary} onPress={enviar} disabled={loading} accessibilityRole="button">
            {loading ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={styles.buttonPrimaryText}>{modo === "entrar" ? "Entrar" : "Criar conta e entrar"}</Text>
            )}
          </TouchableOpacity>

          {googleConfigurado && (
            <BotaoGoogle onErro={setErrorMessage} ocupado={loading} setOcupado={setLoading} />
          )}

          <TouchableOpacity
            style={styles.switchModo}
            onPress={() => {
              setErrorMessage(null);
              setModo(modo === "entrar" ? "cadastrar" : "entrar");
            }}
          >
            <Text style={styles.switchModoText}>
              {modo === "entrar" ? "Ainda não tem conta? Criar conta" : "Já tenho conta. Entrar"}
            </Text>
          </TouchableOpacity>

          {aparelhoConfigurado && (
            <>
              <View style={styles.divider} />
              <TouchableOpacity style={styles.moradorSwitchButton} onPress={onSwitchToMorador}>
                <Text style={styles.moradorSwitchText}>Voltar para a tela do morador (PIN)</Text>
              </TouchableOpacity>
            </>
          )}
          {!aparelhoConfigurado && (
            <Text style={styles.ajuda}>
              Tablet do morador? Entre como cuidador, cadastre o morador e toque em "Usar este aparelho".
            </Text>
          )}
        </View>
      </ScrollView>
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
  buttonPrimary: {
    height: 48,
    minHeight: 48,
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
    minHeight: 48,
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
    minHeight: 48, // DESIGN.md: alvo de toque >= 48px
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  moradorSwitchText: {
    ...typography.bodyLg,
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
    ...typography.bodyMd,
    color: colors.danger,
  },
  switchModo: {
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  switchModoText: {
    ...typography.bodyMd,
    color: colors.primary,
    fontWeight: "600",
  },
  ajuda: {
    ...typography.caption,
    color: colors.muted,
    textAlign: "center",
    marginTop: spacing.xs,
  },
});
