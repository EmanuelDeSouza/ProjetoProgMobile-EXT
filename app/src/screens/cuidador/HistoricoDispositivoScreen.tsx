import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { colors, typography, spacing, rounded } from "../../../theme/tokens";
import { useResidence } from "../../context/ResidenceContext";
import { apiRepository, mensagemDeErro } from "../../services/api";
import { dataHora, descreverLeitura } from "../../services/descricao";
import { type EventoDispositivo } from "../../types";

interface HistoricoDispositivoScreenProps {
  dispositivoId: string;
  onBack: () => void;
}

export const HistoricoDispositivoScreen: React.FC<HistoricoDispositivoScreenProps> = ({
  dispositivoId,
  onBack,
}) => {
  const { dispositivos } = useResidence();
  const [eventos, setEventos] = useState<EventoDispositivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);

  const disp = dispositivos.find((d) => d.id === dispositivoId);

  useEffect(() => {
    async function loadEventos() {
      setLoading(true);
      try {
        const { dados, offline } = await apiRepository.listEventosDispositivo(dispositivoId);
        setEventos(dados);
        setAviso(offline ? "Sem conexão. Mostrando o último histórico salvo." : null);
      } catch (err) {
        setAviso(mensagemDeErro(err, "Não foi possível carregar o histórico."));
      } finally {
        setLoading(false);
      }
    }
    loadEventos();
  }, [dispositivoId]);

  
  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.btnVoltar} onPress={onBack}>
        <Text style={styles.btnVoltarText}>← Voltar ao painel</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Histórico de Leituras</Text>
      <Text style={styles.subtitle}>
        {disp ? `${disp.nome} (${disp.comodo})` : "Dispositivo"} — últimos 7 dias
      </Text>

      {aviso && <Text style={styles.emptyDesc}>{aviso}</Text>}

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : eventos.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>Sem histórico recente</Text>
          <Text style={styles.emptyDesc}>
            Nenhuma alteração de estado registrada nos últimos 7 dias.
          </Text>
        </View>
      ) : (
        <FlatList
          data={eventos}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.timelineItem}>
              <View style={styles.dot} />
              <View style={styles.cardEvento}>
                <View style={styles.eventoHeader}>
                  <Text style={styles.eventoTipo}>{descreverLeitura(item.valor)}</Text>
                  <Text style={styles.eventoHora}>{dataHora(item.createdAt)}</Text>
                </View>
                
              </View>
            </View>
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
  btnVoltar: {
    paddingVertical: spacing.xs,
    marginBottom: spacing.xs,
    minHeight: 48,
    justifyContent: "center",
  },
  btnVoltarText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: "600",
  },
  title: {
    ...typography.cuidadorScreenTitle,
    color: colors.ink,
  },
  subtitle: {
    ...typography.caption,
    color: colors.muted,
    marginBottom: spacing.lg,
  },
  timelineItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: spacing.md,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    marginTop: 6,
    marginRight: spacing.sm,
  },
  cardEvento: {
    flex: 1,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: rounded.md,
    padding: spacing.sm,
  },
  eventoHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xxs,
  },
  eventoTipo: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primaryDeep,
  },
  eventoHora: {
    ...typography.caption,
    color: colors.muted,
  },
  eventoValor: {
    ...typography.bodyMd,
    color: colors.ink,
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
  },
});
