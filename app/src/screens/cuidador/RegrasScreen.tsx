import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { colors, typography, spacing, rounded } from "../../../theme/tokens";
import { useResidence } from "../../context/ResidenceContext";
import { apiRepository, mensagemDeErro } from "../../services/api";
import { parametrosRegra, primeiroErro } from "../../services/schemas";
import { type RegraAlerta, type CondicaoRegra, type TipoDispositivo } from "../../types";

// RF-12: cada condição vale para um tipo de sensor (null = qualquer dispositivo)
const TIPO_DA_CONDICAO: Record<CondicaoRegra, TipoDispositivo | null> = {
  sem_movimento_por: "sensor_presenca",
  contato_aberto_apos_horario: "sensor_contato",
  temperatura_fora_da_faixa: "sensor_temperatura",
  dispositivo_offline: null,
};

const numero = (t: string) => Number(t.replace(",", "."));

interface RegrasScreenProps {
  onBack: () => void;
}

const CONDICOES: { label: string; value: CondicaoRegra }[] = [
  { label: "Sem movimento por N horas", value: "sem_movimento_por" },
  { label: "Contato aberto após horário", value: "contato_aberto_apos_horario" },
  { label: "Temperatura fora da faixa", value: "temperatura_fora_da_faixa" },
  { label: "Dispositivo offline", value: "dispositivo_offline" },
];

export const RegrasScreen: React.FC<RegrasScreenProps> = ({ onBack }) => {
  const { selectedResidencia, dispositivos } = useResidence();
  const [regras, setRegras] = useState<RegraAlerta[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  // Form states
  const [dispositivoId, setDispositivoId] = useState("");
  const [condicao, setCondicao] = useState<CondicaoRegra>("sem_movimento_por");
  const [horasParam, setHorasParam] = useState("4");
  const [horarioParam, setHorarioParam] = useState("22:00");
  const [horarioFimParam, setHorarioFimParam] = useState("06:00");
  const [tempMin, setTempMin] = useState("18");
  const [tempMax, setTempMax] = useState("28");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRegras = async () => {
    if (!selectedResidencia) return;
    setLoading(true);
    try {
      const { dados } = await apiRepository.listRegras(selectedResidencia.id);
      setRegras(dados);
    } catch {
      // Offline/cached
    } finally {
      setLoading(false);
    }
  };

  const compativeis = useMemo(
    () => dispositivos.filter((d) => TIPO_DA_CONDICAO[condicao] === null || d.tipo === TIPO_DA_CONDICAO[condicao]),
    [dispositivos, condicao]
  );

  useEffect(() => {
    void loadRegras();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedResidencia?.id]);

  useEffect(() => {
    if (!compativeis.some((d) => d.id === dispositivoId)) setDispositivoId(compativeis[0]?.id ?? "");
  }, [compativeis, dispositivoId]);

  const handleCreate = async () => {
    if (!selectedResidencia || !dispositivoId) {
      setError("Escolha um dispositivo compatível com essa condição.");
      return;
    }
    const brutos: Record<CondicaoRegra, unknown> = {
      sem_movimento_por: { horas: numero(horasParam) },
      contato_aberto_apos_horario: { horario: horarioParam.trim(), horarioFim: horarioFimParam.trim() },
      temperatura_fora_da_faixa: { min: numero(tempMin), max: numero(tempMax) },
      dispositivo_offline: {},
    };
    const parsed = parametrosRegra[condicao].safeParse(brutos[condicao]);
    if (!parsed.success) {
      setError(primeiroErro(parsed.error));
      return;
    }
    const parametros = parsed.data as Record<string, unknown>;
    setSaving(true);
    setError(null);

    try {
      await apiRepository.postRegraAlerta(selectedResidencia.id, {
        dispositivoId,
        condicao,
        parametros,
      });
      await loadRegras();
      setShowCreate(false);
    } catch (err: unknown) {
      setError(mensagemDeErro(err, "Erro ao salvar regra."));
    } finally {
      setSaving(false);
    }
  };

  const renderParametros = (item: RegraAlerta) => {
    if (item.condicao === "sem_movimento_por") {
      return `Alerta após ${item.parametros?.horas ?? 4} horas sem movimento`;
    }
    if (item.condicao === "contato_aberto_apos_horario") {
      return `Alerta se ficar aberta entre ${String(item.parametros.horario ?? "22:00")} e ${String(item.parametros.horarioFim ?? "06:00")}`;
    }
    if (item.condicao === "temperatura_fora_da_faixa") {
      return `Faixa segura: ${item.parametros?.min ?? 18}°C a ${item.parametros?.max ?? 28}°C`;
    }
    if (item.condicao === "dispositivo_offline") {
      return "Alerta de sistema se ficar sem contato";
    }
    return "";
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.btnVoltar} onPress={onBack}>
        <Text style={styles.btnVoltarText}>← Voltar ao painel</Text>
      </TouchableOpacity>

      <View style={styles.headerRow}>
        <Text style={styles.title}>Regras de Alerta</Text>
        <TouchableOpacity
          style={styles.btnNova}
          onPress={() => setShowCreate(!showCreate)}
        >
          <Text style={styles.btnNovaText}>
            {showCreate ? "Cancelar" : "+ Nova Regra"}
          </Text>
        </TouchableOpacity>
      </View>

      {showCreate ? (
        <ScrollView style={styles.formCard}>
          <Text style={styles.formTitle}>Nova Regra de Alerta</Text>
          {error && <Text style={styles.errorText}>{error}</Text>}

          <Text style={styles.label}>1. O que vigiar</Text>
          <View style={styles.chipsRow}>
            {CONDICOES.map((c) => (
              <TouchableOpacity
                key={c.value}
                style={[
                  styles.condChip,
                  condicao === c.value && styles.condChipActive,
                ]}
                onPress={() => setCondicao(c.value)}
              >
                <Text
                  style={[
                    styles.condChipText,
                    condicao === c.value && styles.condChipTextActive,
                  ]}
                >
                  {c.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>2. Em qual dispositivo</Text>
          <View style={styles.chipsRow}>
            {compativeis.length === 0 && (
              <Text style={styles.errorText}>Nenhum dispositivo compatível com essa condição.</Text>
            )}
            {compativeis.map((d) => (
              <TouchableOpacity
                key={d.id}
                style={[
                  styles.dispChip,
                  dispositivoId === d.id && styles.dispChipActive,
                ]}
                onPress={() => setDispositivoId(d.id)}
              >
                <Text
                  style={[
                    styles.dispChipText,
                    dispositivoId === d.id && styles.dispChipTextActive,
                  ]}
                >
                  {d.nome}
                </Text>
              </TouchableOpacity>
            ))}
          </View>


          {condicao === "sem_movimento_por" && (
            <>
              <Text style={styles.label}>Horas sem movimento</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={horasParam}
                onChangeText={setHorasParam}
              />
            </>
          )}

          {condicao === "contato_aberto_apos_horario" && (
            <>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>A partir de (HH:MM)</Text>
                  <TextInput style={styles.input} placeholder="22:00" value={horarioParam} onChangeText={setHorarioParam} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Até (HH:MM)</Text>
                  <TextInput style={styles.input} placeholder="06:00" value={horarioFimParam} onChangeText={setHorarioFimParam} />
                </View>
              </View>
            </>
          )}

          {condicao === "temperatura_fora_da_faixa" && (
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Mínima (°C)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={tempMin}
                  onChangeText={setTempMin}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Máxima (°C)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={tempMax}
                  onChangeText={setTempMax}
                />
              </View>
            </View>
          )}

          <TouchableOpacity
            style={styles.btnSalvar}
            onPress={handleCreate}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={styles.btnSalvarText}>Salvar Regra</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      ) : loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : regras.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>Nenhuma regra configurada.</Text>
          <Text style={styles.emptyDesc}>
            Crie regras para receber alertas quando um sensor detectar ausência de movimento, temperatura anormal ou porta aberta.
          </Text>
        </View>
      ) : (
        <FlatList
          data={regras}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const disp = dispositivos.find((d) => d.id === item.dispositivoId);
            return (
              <View style={styles.regraCard}>
                <Text style={styles.regraNome}>
                  {disp ? disp.nome : "Dispositivo"}
                </Text>
                <Text style={styles.regraDesc}>{renderParametros(item)}</Text>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusBadgeText}>
                    {item.ativa ? "Regra Ativa" : "Inativa"}
                  </Text>
                </View>
              </View>
            );
          }}
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
  btnVoltar: {
    paddingVertical: spacing.xs,
    marginBottom: spacing.xs,
  },
  btnVoltarText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: "600",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  title: {
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
  formCard: {
    backgroundColor: colors.paperDeep,
    padding: spacing.md,
    borderRadius: rounded.md,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: spacing.lg,
  },
  formTitle: {
    ...typography.cuidadorHeadingCard,
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  label: {
    ...typography.caption,
    color: colors.ink,
    fontWeight: "600",
    marginBottom: spacing.xxs,
    marginTop: spacing.xs,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  dispChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: rounded.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
    minHeight: 48,
    justifyContent: "center",
  },
  dispChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  dispChipText: {
    ...typography.caption,
    color: colors.ink,
  },
  dispChipTextActive: {
    color: colors.primaryDeep,
    fontWeight: "600",
  },
  condChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: rounded.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
    minHeight: 48,
    justifyContent: "center",
  },
  condChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  condChipText: {
    ...typography.caption,
    color: colors.ink,
  },
  condChipTextActive: {
    color: colors.primaryDeep,
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
    marginBottom: spacing.sm,
  },
  btnSalvar: {
    height: 48,
    minHeight: 48,
    backgroundColor: colors.primary,
    borderRadius: rounded.sm,
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  btnSalvarText: {
    ...typography.buttonMd,
    color: colors.onPrimary,
  },
  regraCard: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: rounded.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  regraNome: {
    ...typography.cuidadorHeadingCard,
    color: colors.ink,
  },
  regraDesc: {
    ...typography.bodyMd,
    color: colors.muted,
    marginVertical: spacing.xxs,
  },
  statusBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.okSoft,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: rounded.sm,
    marginTop: spacing.xxs,
  },
  statusBadgeText: {
    ...typography.caption,
    color: colors.ok,
    fontWeight: "600",
  },
  emptyBox: {
    padding: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
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
