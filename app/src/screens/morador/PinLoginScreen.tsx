import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { colors, typography, spacing, rounded } from "../../../theme/tokens";
import { useAuth } from "../../context/AuthContext";

interface PinLoginScreenProps {
  onSwitchToCuidador: () => void;
}

export const PinLoginScreen: React.FC<PinLoginScreenProps> = ({
  onSwitchToCuidador,
}) => {
  const { loginMorador } = useAuth();
  const [moradorId, setMoradorId] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleKeyPress = (num: string) => {
    if (pin.length < 4) {
      setPin((prev) => prev + num);
      setErrorMessage(null);
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
    setErrorMessage(null);
  };

  const handleEntrar = async () => {
    if (!moradorId.trim()) {
      setErrorMessage("Informe o identificador do morador.");
      return;
    }
    if (pin.length !== 4) {
      setErrorMessage("Digite os 4 números do seu PIN.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    try {
      await loginMorador(moradorId.trim(), pin);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "PIN incorreto. Tente de novo.";
      setErrorMessage(msg);
      setPin("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Olá! Digite seu PIN</Text>
      <Text style={styles.instrucao}>
        Use o teclado numérico para acessar sua casa
      </Text>

      {/* ID do Morador (geralmente fixado ou configurado uma vez no aparelho da casa) */}
      <TextInput
        style={styles.moradorIdInput}
        placeholder="Identificador do Morador (UUID)"
        placeholderTextColor={colors.faint}
        value={moradorId}
        onChangeText={setMoradorId}
      />

      {/* Visor do PIN */}
      <View style={styles.pinDisplay}>
        {[0, 1, 2, 3].map((index) => {
          const filled = index < pin.length;
          return (
            <View
              key={index}
              style={[styles.pinDot, filled && styles.pinDotFilled]}
            >
              {filled && <Text style={styles.pinDotText}>●</Text>}
            </View>
          );
        })}
      </View>

      {errorMessage && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      )}

      {/* Teclado numérico com botões grandes e acessíveis (RNF-01) */}
      <View style={styles.keypad}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
          <TouchableOpacity
            key={num}
            style={styles.keyButton}
            onPress={() => handleKeyPress(num)}
            accessibilityRole="button"
            accessibilityLabel={`Número ${num}`}
          >
            <Text style={styles.keyText}>{num}</Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={styles.keyButtonAux}
          onPress={handleBackspace}
          accessibilityRole="button"
          accessibilityLabel="Apagar dígito"
        >
          <Text style={styles.keyTextAux}>⌫</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.keyButton}
          onPress={() => handleKeyPress("0")}
          accessibilityRole="button"
          accessibilityLabel="Número zero"
        >
          <Text style={styles.keyText}>0</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.keyButtonConfirm}
          onPress={handleEntrar}
          disabled={loading || pin.length !== 4}
          accessibilityRole="button"
          accessibilityLabel="Confirmar PIN"
        >
          {loading ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={styles.keyTextConfirm}>OK</Text>
          )}
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.btnVoltarCuidador}
        onPress={onSwitchToCuidador}
      >
        <Text style={styles.btnVoltarCuidadorText}>
          Acesso do Cuidador (E-mail e Senha)
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
    padding: spacing.screenGutter,
    justifyContent: "center",
    alignItems: "center",
  },
  titulo: {
    ...typography.moradorTitulo,
    color: colors.ink,
    textAlign: "center",
  },
  instrucao: {
    ...typography.bodyLg,
    color: colors.muted,
    textAlign: "center",
    marginTop: spacing.xxs,
    marginBottom: spacing.md,
  },
  moradorIdInput: {
    ...typography.bodyLg,
    height: 52, // DESIGN.md: text-input height 52px
    width: "100%",
    maxWidth: 320,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: rounded.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.paper,
    color: colors.ink,
    marginBottom: spacing.md,
    textAlign: "center",
  },
  pinDisplay: {
    flexDirection: "row",
    gap: spacing.md,
    marginVertical: spacing.md,
  },
  pinDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  pinDotFilled: {
    backgroundColor: colors.primary,
  },
  pinDotText: {
    color: colors.onPrimary,
    fontSize: 14,
  },
  errorBox: {
    backgroundColor: colors.dangerSoft,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: rounded.sm,
    marginBottom: spacing.md,
  },
  errorText: {
    ...typography.bodyLg,
    color: colors.danger,
    fontWeight: "700",
    textAlign: "center",
  },
  keypad: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: 300,
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  keyButton: {
    width: 88,
    height: 72, // RNF-01: alvo de toque >= 72px
    backgroundColor: colors.paperDeep,
    borderRadius: rounded.lg,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  keyText: {
    ...typography.moradorNumero,
    color: colors.ink,
  },
  keyButtonAux: {
    width: 88,
    height: 72,
    backgroundColor: colors.offlineSoft,
    borderRadius: rounded.lg,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  keyTextAux: {
    fontSize: 24,
    color: colors.ink,
    fontWeight: "700",
  },
  keyButtonConfirm: {
    width: 88,
    height: 72,
    backgroundColor: colors.primary,
    borderRadius: rounded.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  keyTextConfirm: {
    ...typography.moradorBotao,
    color: colors.onPrimary,
  },
  btnVoltarCuidador: {
    marginTop: spacing.xl,
    padding: spacing.sm,
    minHeight: 52,
    justifyContent: "center",
  },
  btnVoltarCuidadorText: {
    ...typography.bodyLg,
    color: colors.primary,
    fontWeight: "600",
    textAlign: "center",
  },
});
