import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { colors, typography, spacing, rounded } from "../../../theme/tokens";
import { useResidence } from "../../context/ResidenceContext";
import { apiRepository, mensagemDeErro } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { formResidencia, primeiroErro } from "../../services/schemas";
import { type ResidenciaComPapel } from "../../types";

interface ResidenciasScreenProps {
  onSelectResidencia: (r: ResidenciaComPapel) => void;
  onAbrirNotificacoes: () => void;
}

export const ResidenciasScreen: React.FC<ResidenciasScreenProps> = ({ onSelectResidencia, onAbrirNotificacoes }) => {
  const { residencias, loading, erro, loadResidencias, selectResidencia } = useResidence();
  const { logout, user } = useAuth();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [nome, setNome] = useState("");
  const [enderecoCurto, setEnderecoCurto] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    const parsed = formResidencia.safeParse({ nome, enderecoCurto });
    if (!parsed.success) {
      setError(primeiroErro(parsed.error));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const criada = await apiRepository.postResidencia({
        nome: parsed.data.nome,
        enderecoCurto: parsed.data.enderecoCurto || undefined,
      });
      await loadResidencias();
      selectResidencia({ ...criada, papel: "dono" });
      onSelectResidencia({ ...criada, papel: "dono" });
      setNome("");
      setEnderecoCurto("");
      setShowCreateModal(false);
    } catch (err: unknown) {
      setError(mensagemDeErro(err, "Erro ao criar residência."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Minhas residências</Text>
          {user && <Text style={styles.resEnd}>{user.nome}</Text>}
        </View>
        <TouchableOpacity
          style={styles.btnNova}
          onPress={() => setShowCreateModal(true)}
        >
          <Text style={styles.btnNovaText}>+ Nova</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.modalButtonsRow}>
        <TouchableOpacity style={styles.buttonSecondary} onPress={onAbrirNotificacoes} accessibilityRole="button">
          <Text style={styles.buttonSecondaryText}>🔔 Convites e avisos</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.buttonSecondary} onPress={() => void logout()} accessibilityRole="button">
          <Text style={styles.buttonSecondaryText}>Sair</Text>
        </TouchableOpacity>
      </View>

      {showCreateModal && (
        <View style={styles.createCard}>
          <Text style={styles.createTitle}>Criar Residência</Text>
          {error && <Text style={styles.errorText}>{error}</Text>}
          <TextInput
            style={styles.input}
            placeholder="Nome (ex: Casa da Vovó)"
            placeholderTextColor={colors.faint}
            value={nome}
            onChangeText={setNome}
          />
          <TextInput
            style={styles.input}
            placeholder="Endereço curto (ex: Centro, Três de Maio)"
            placeholderTextColor={colors.faint}
            value={enderecoCurto}
            onChangeText={setEnderecoCurto}
          />
          <View style={styles.modalButtonsRow}>
            <TouchableOpacity
              style={styles.buttonSecondary}
              onPress={() => setShowCreateModal(false)}
            >
              <Text style={styles.buttonSecondaryText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.buttonPrimary}
              onPress={handleCreate}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={styles.buttonPrimaryText}>Criar</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : residencias.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>Nenhuma residência encontrada.</Text>
          <Text style={styles.emptyDesc}>
            {erro ?? "Toque em \"+ Nova\" para cadastrar a casa que você acompanha. Se alguém te convidou, veja em \"Convites e avisos\"."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={residencias}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: spacing.lg }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.resCard}
              onPress={() => {
                selectResidencia(item);
                onSelectResidencia(item);
              }}
              accessibilityRole="button"
            >
              <View>
                <Text style={styles.resName}>{item.nome}</Text>
                {item.enderecoCurto && (
                  <Text style={styles.resEnd}>{item.enderecoCurto}</Text>
                )}
              </View>
              <View style={styles.papelBadge}>
                <Text style={styles.papelText}>{item.papel.toUpperCase()}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
    padding: spacing.screenGutter,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
    marginTop: spacing.sm,
  },
  headerTitle: {
    ...typography.cuidadorScreenTitle,
    color: colors.ink,
  },
  btnNova: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: rounded.sm,
    height: 48,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  btnNovaText: {
    ...typography.buttonMd,
    color: colors.onPrimary,
  },
  createCard: {
    backgroundColor: colors.paperDeep,
    padding: spacing.md,
    borderRadius: rounded.md,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: spacing.md,
  },
  createTitle: {
    ...typography.cuidadorHeadingCard,
    color: colors.ink,
    marginBottom: spacing.sm,
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
    marginBottom: spacing.sm,
  },
  modalButtonsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
  buttonPrimary: {
    height: 48,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: rounded.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonPrimaryText: {
    ...typography.buttonMd,
    color: colors.onPrimary,
  },
  buttonSecondary: {
    height: 48,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: rounded.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonSecondaryText: {
    ...typography.buttonMd,
    color: colors.ink,
  },
  resCard: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: rounded.md,
    padding: spacing.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  resName: {
    ...typography.cuidadorHeadingCard,
    color: colors.ink,
  },
  resEnd: {
    ...typography.caption,
    color: colors.muted,
    marginTop: spacing.xxs,
  },
  papelBadge: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: rounded.sm,
  },
  papelText: {
    ...typography.caption,
    color: colors.primaryDeep,
    fontWeight: "700",
  },
  emptyBox: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  emptyTitle: {
    ...typography.cuidadorHeadingCard,
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  emptyDesc: {
    ...typography.bodyMd,
    color: colors.muted,
    textAlign: "center",
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    marginBottom: spacing.xs,
  },
});
