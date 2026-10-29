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
import { apiRepository, mensagemDeErro } from "../../services/api";
import { formPareamento, primeiroErro } from "../../services/schemas";
import { type TipoDispositivo } from "../../types";

interface ParearDispositivoScreenProps {
  onBack: () => void;
}

const TIPOS_DISPOSITIVOS: { label: string; value: TipoDispositivo }[] = [
  { label: "Sensor de Presença (Movimento)", value: "sensor_presenca" },
  { label: "Sensor de Contato (Porta/Janela)", value: "sensor_contato" },
  { label: "Sensor de Temperatura e Umidade", value: "sensor_temperatura" },
  { label: "Atuador de Tomada Inteligente", value: "atuador_tomada" },
  { label: "Botão Físico de Emergência (SOS)", value: "botao_sos" },
];

export const ParearDispositivoScreen: React.FC<ParearDispositivoScreenProps> = ({
  onBack,
}) => {
  const { selectedResidencia, refreshDispositivos } = useResidence();
  const [codigo, setCodigo] = useState("");
  const [tipo, setTipo] = useState<TipoDispositivo>("sensor_presenca");
  const [nome, setNome] = useState("");
  const [comodo, setComodo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePair = async () => {
    if (!selectedResidencia) return;
    const parsed = formPareamento.safeParse({ codigo: codigo.trim(), tipo, nome, comodo });
    if (!parsed.success) {
      setError(primeiroErro(parsed.error));
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await apiRepository.postPareamento(selectedResidencia.id, parsed.data);
      await refreshDispositivos();
      onBack();
    } catch (err: unknown) {
      setError(mensagemDeErro(err, "Erro ao parear dispositivo."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.btnVoltar} onPress={onBack}>
        <Text style={styles.btnVoltarText}>← Voltar ao painel</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Parear Dispositivo</Text>
      <Text style={styles.desc}>
        Ligue o dispositivo novo. Na primeira vez ele cria a rede Wi-Fi "CuidaLar-Setup": conecte o celular nela e informe o Wi-Fi da casa. Depois o dispositivo mostra um código de 6 números (no visor ou piscando o LED) — digite aqui em até 10 minutos.
      </Text>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <Text style={styles.label}>Código do Dispositivo (6 dígitos)</Text>
      <TextInput
        style={styles.inputCode}
        placeholder="123456"
        placeholderTextColor={colors.faint}
        keyboardType="number-pad"
        maxLength={6}
        value={codigo}
        onChangeText={(t) => setCodigo(t.replace(/[^0-9]/g, ""))}
      />

      <Text style={styles.label}>Tipo de Dispositivo</Text>
      <View style={styles.tipoContainer}>
        {TIPOS_DISPOSITIVOS.map((item) => {
          const isSelected = tipo === item.value;
          return (
            <TouchableOpacity
              key={item.value}
              style={[styles.tipoCard, isSelected && styles.tipoCardSelected]}
              onPress={() => setTipo(item.value)}
            >
              <Text
                style={[
                  styles.tipoCardText,
                  isSelected && styles.tipoCardTextSelected,
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>Nome Amigável</Text>
      <TextInput
        style={styles.input}
        placeholder="Ex: Sensor - Quarto Principal"
        placeholderTextColor={colors.faint}
        value={nome}
        onChangeText={setNome}
      />

      <Text style={styles.label}>Cômodo</Text>
      <TextInput
        style={styles.input}
        placeholder="Ex: Quarto, Sala, Cozinha, Banheiro"
        placeholderTextColor={colors.faint}
        value={comodo}
        onChangeText={setComodo}
      />

      <TouchableOpacity
        style={styles.btnConfirmar}
        onPress={handlePair}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <Text style={styles.btnConfirmarText}>Confirmar Pareamento</Text>
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
    paddingBottom: spacing.xxl,
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
  inputCode: {
    ...typography.moradorNumero,
    height: 56,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: rounded.sm,
    textAlign: "center",
    letterSpacing: 8,
    backgroundColor: colors.paper,
    color: colors.ink,
    marginBottom: spacing.md,
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
  tipoContainer: {
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  tipoCard: {
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: rounded.sm,
    backgroundColor: colors.paper,
    minHeight: 48, // DESIGN.md: alvo de toque >= 48px
    justifyContent: "center",
  },
  tipoCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  tipoCardText: {
    ...typography.bodyMd,
    color: colors.ink,
  },
  tipoCardTextSelected: {
    color: colors.primaryDeep,
    fontWeight: "600",
  },
  btnConfirmar: {
    height: 48,
    minHeight: 48,
    backgroundColor: colors.primary,
    borderRadius: rounded.sm,
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing.md,
  },
  btnConfirmarText: {
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
});
