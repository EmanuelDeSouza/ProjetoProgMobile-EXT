import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { colors, typography, spacing, rounded } from "../../../theme/tokens";
import { useResidence } from "../../context/ResidenceContext";
import { apiRepository, mensagemDeErro } from "../../services/api";
import { ouvirChegada } from "../../services/notifications";
import type { Alerta, CondicaoRegra, Dispositivo, Notificacao, SOSEvento } from "../../types";

interface Props {
  abaInicial?: "seguranca" | "notificacoes";
  onBack: () => void;
}

const DESCRICAO_CONDICAO: Record<CondicaoRegra, string> = {
  sem_movimento_por: "Sem movimento por tempo demais",
  contato_aberto_apos_horario: "Porta ou janela aberta fora do horário",
  temperatura_fora_da_faixa: "Temperatura fora da faixa segura",
  dispositivo_offline: "Dispositivo sem contato",
};

const hora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function tituloAlerta(a: Alerta): string {
  if (!a.condicao) return "Dispositivo importante sem contato";
  return DESCRICAO_CONDICAO[a.condicao];
}

function nomeDispositivo(id: string | null | undefined, lista: Dispositivo[]): string | null {
  const d = lista.find((x) => x.id === id);
  return d ? `${d.nome} · ${d.comodo}` : null;
}

/** RF-14, RF-15, RF-17 · SOS sempre no topo, alertas, notificações e convites. */
export const AlertasNotificacoesScreen: React.FC<Props> = ({ abaInicial = "seguranca", onBack }) => {
  const { selectedResidencia, dispositivos, loadResidencias } = useResidence();
  const temCasa = Boolean(selectedResidencia);
  const [aba, setAba] = useState<"seguranca" | "notificacoes">(temCasa ? abaInicial : "notificacoes");
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [sos, setSos] = useState<SOSEvento[]>([]);
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [fimNotificacoes, setFimNotificacoes] = useState(false);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [escalandoId, setEscalandoId] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const tarefas: Array<Promise<void>> = [
        apiRepository.listNotificacoes({ limite: 30 }).then((n) => {
          setNotificacoes(n);
          setFimNotificacoes(n.length < 30);
        }),
      ];
      if (selectedResidencia) {
        tarefas.push(
          apiRepository.listAlertas(selectedResidencia.id).then((r) => {
            setAlertas(r.dados);
            setOffline((o) => o || r.offline);
          }),
          apiRepository.listSOS(selectedResidencia.id).then((r) => {
            setSos(r.dados);
            setOffline((o) => o || r.offline);
          })
        );
      }
      setOffline(false);
      await Promise.all(tarefas);
    } catch (e) {
      setErro(mensagemDeErro(e, "Não foi possível carregar. Tente de novo."));
    } finally {
      setLoading(false);
    }
  }, [selectedResidencia]);

  useEffect(() => {
    void carregar();
    const parar = ouvirChegada(() => void carregar());
    const t = setInterval(() => void carregar(), 20_000);
    return () => {
      parar();
      clearInterval(t);
    };
  }, [carregar]);

  const maisNotificacoes = async () => {
    const ultima = notificacoes[notificacoes.length - 1];
    if (!ultima) return;
    try {
      const mais = await apiRepository.listNotificacoes({ limite: 30, antes: ultima.createdAt });
      setNotificacoes((n) => [...n, ...mais]);
      setFimNotificacoes(mais.length < 30);
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  };

  const executar = async (id: string, fn: () => Promise<unknown>) => {
    setOcupadoId(id);
    setErro(null);
    try {
      await fn();
      await carregar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setOcupadoId(null);
    }
  };

  const reconhecerAlerta = (a: Alerta) =>
    executar(a.id, () => apiRepository.patchAlerta(a.id, { status: "reconhecido", nota: "Verifiquei, está tudo bem." }));

  const escalarAlerta = (a: Alerta) => {
    if (!nota.trim()) {
      setErro("Escreva o que está acontecendo para os outros cuidadores.");
      return;
    }
    void executar(a.id, async () => {
      await apiRepository.patchAlerta(a.id, { status: "aberto", nota: nota.trim() });
      setEscalandoId(null);
      setNota("");
    });
  };

  const abrirNotificacao = async (n: Notificacao) => {
    if (!n.lidaEm) {
      setNotificacoes((l) => l.map((x) => (x.id === n.id ? { ...x, lidaEm: new Date().toISOString() } : x)));
      apiRepository.patchNotificacao(n.id, true).catch(() => {});
    }
    if (n.tipo !== "convite" && temCasa) setAba("seguranca");
  };

  const aceitarConvite = (n: Notificacao) =>
    executar(n.id, async () => {
      await apiRepository.patchConvite(n.alvoId);
      await loadResidencias();
    });

  const sosAbertos = sos.filter((x) => x.status === "aberto");
  const sosRecentes = sos.filter((x) => x.status !== "aberto").slice(0, 5);
  const alertasAbertos = alertas.filter((a) => a.status === "aberto");
  const alertasResolvidos = alertas.filter((a) => a.status === "reconhecido").slice(0, 10);
  const naoLidas = notificacoes.filter((n) => !n.lidaEm).length;

  const cardSOS = (s: SOSEvento) => {
    const aberto = s.status === "aberto";
    const origem =
      s.origem === "botao_fisico"
        ? `Botão de emergência${nomeDispositivo(s.dispositivoId, dispositivos) ? ` (${nomeDispositivo(s.dispositivoId, dispositivos)})` : ""}`
        : "Pelo aplicativo do morador";
    return (
      <View key={s.id} style={[styles.card, aberto ? styles.cardSos : styles.cardResolvido]}>
        <Text style={[styles.cardTitulo, aberto && { color: colors.sos }]}>
          {aberto ? "🚨 SOS — pedido de ajuda" : s.status === "cancelado_pelo_morador" ? "SOS cancelado: foi sem querer" : "SOS atendido"}
        </Text>
        <Text style={styles.cardTexto}>{origem}</Text>
        <Text style={styles.cardMeta}>
          {hora(s.createdAt)}
          {s.reconhecidoPor ? ` · atendido por ${s.reconhecidoPor}` : ""}
        </Text>
        {aberto && (
          <TouchableOpacity
            style={styles.btnPrimario}
            onPress={() => void executar(s.id, () => apiRepository.reconhecerSOS(s.id))}
            disabled={ocupadoId === s.id}
            accessibilityRole="button"
          >
            {ocupadoId === s.id ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={styles.btnPrimarioText}>✓ Estou cuidando disso</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const cardAlerta = (a: Alerta) => {
    const aberto = a.status === "aberto";
    const onde = nomeDispositivo(a.dispositivoId, dispositivos);
    return (
      <View key={a.id} style={[styles.card, aberto ? styles.cardAlerta : styles.cardResolvido]}>
        <View style={styles.cardTopo}>
          <Text style={[styles.cardTitulo, aberto && { color: colors.warn }, { flex: 1 }]}>
            {aberto ? "⚠️ " : "✓ "}
            {tituloAlerta(a)}
          </Text>
          {a.severidade === "alta" && aberto && (
            <View style={styles.chipAlta}>
              <Text style={styles.chipAltaText}>Importante</Text>
            </View>
          )}
        </View>
        {onde && <Text style={styles.cardTexto}>{onde}</Text>}
        {a.nota && <Text style={styles.nota}>Nota: {a.nota}</Text>}
        <Text style={styles.cardMeta}>
          {hora(a.createdAt)}
          {a.reconhecidoPor ? ` · verificado por ${a.reconhecidoPor}` : ""}
        </Text>

        {aberto &&
          (escalandoId === a.id ? (
            <View>
              <TextInput
                style={styles.input}
                placeholder="O que está acontecendo? (os outros cuidadores verão)"
                placeholderTextColor={colors.faint}
                value={nota}
                onChangeText={setNota}
                multiline
              />
              <View style={styles.linha}>
                <TouchableOpacity style={styles.btnSecundario} onPress={() => setEscalandoId(null)}>
                  <Text style={styles.btnSecundarioText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btnPrimario, { flex: 1, marginTop: 0 }]} onPress={() => escalarAlerta(a)}>
                  <Text style={styles.btnPrimarioText}>Avisar os outros</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.linha}>
              <TouchableOpacity
                style={[styles.btnPrimario, { flex: 1, marginTop: 0 }]}
                onPress={() => void reconhecerAlerta(a)}
                disabled={ocupadoId === a.id}
                accessibilityRole="button"
              >
                {ocupadoId === a.id ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <Text style={styles.btnPrimarioText}>Verifiquei, está tudo bem</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnSecundario}
                onPress={() => {
                  setEscalandoId(a.id);
                  setNota(a.nota ?? "");
                }}
                accessibilityRole="button"
              >
                <Text style={styles.btnSecundarioText}>Preciso de ajuda</Text>
              </TouchableOpacity>
            </View>
          ))}
      </View>
    );
  };

  const cardNotificacao = (n: Notificacao) => (
    <TouchableOpacity
      key={n.id}
      style={[styles.card, !n.lidaEm ? styles.cardNaoLida : styles.cardResolvido]}
      onPress={() => void abrirNotificacao(n)}
      accessibilityRole="button"
      accessibilityHint={n.lidaEm ? undefined : "Marca como lida"}
    >
      <Text style={[styles.cardTitulo, n.tipo === "sos" && { color: colors.sos }]}>{n.titulo}</Text>
      <Text style={styles.cardTexto}>{n.mensagem}</Text>
      <Text style={styles.cardMeta}>
        {hora(n.createdAt)}
        {!n.lidaEm ? " · nova" : ""}
      </Text>
      {n.tipo === "convite" && !n.lidaEm && (
        <TouchableOpacity
          style={styles.btnPrimario}
          onPress={() => void aceitarConvite(n)}
          disabled={ocupadoId === n.id}
          accessibilityRole="button"
        >
          {ocupadoId === n.id ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={styles.btnPrimarioText}>Aceitar convite</Text>
          )}
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.btnVoltar} onPress={onBack} accessibilityRole="button">
          <Text style={styles.btnVoltarText}>← Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Central de segurança</Text>
      </View>

      <View style={styles.tabRow}>
        {temCasa && (
          <TouchableOpacity
            style={[styles.tab, aba === "seguranca" && styles.tabActive]}
            onPress={() => setAba("seguranca")}
            accessibilityRole="tab"
            accessibilityState={{ selected: aba === "seguranca" }}
          >
            <Text style={[styles.tabText, aba === "seguranca" && styles.tabTextActive]}>
              Alertas{sosAbertos.length + alertasAbertos.length ? ` (${sosAbertos.length + alertasAbertos.length})` : ""}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.tab, aba === "notificacoes" && styles.tabActive]}
          onPress={() => setAba("notificacoes")}
          accessibilityRole="tab"
          accessibilityState={{ selected: aba === "notificacoes" }}
        >
          <Text style={[styles.tabText, aba === "notificacoes" && styles.tabTextActive]}>
            Notificações{naoLidas ? ` (${naoLidas})` : ""}
          </Text>
        </TouchableOpacity>
      </View>

      {offline && (
        <View style={styles.bannerOffline}>
          <Text style={styles.bannerOfflineText}>Sem conexão. Mostrando o último estado salvo.</Text>
        </View>
      )}
      {erro && (
        <View style={styles.bannerErro}>
          <Text style={styles.bannerErroText}>{erro}</Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void carregar()} colors={[colors.primary]} />}
      >
        {loading ? (
          <>
            <View style={styles.skeleton} />
            <View style={styles.skeleton} />
            <View style={styles.skeleton} />
          </>
        ) : aba === "seguranca" ? (
          <>
            {/* DESIGN.md: SOS sempre no topo, nunca misturado com alertas comuns */}
            {sosAbertos.map(cardSOS)}
            {alertasAbertos.map(cardAlerta)}
            {sosAbertos.length === 0 && alertasAbertos.length === 0 && (
              <View style={styles.vazio}>
                <Text style={styles.vazioTitulo}>Tudo em ordem.</Text>
                <Text style={styles.vazioTexto}>Nenhum alerta aberto agora.</Text>
              </View>
            )}
            {(sosRecentes.length > 0 || alertasResolvidos.length > 0) && <Text style={styles.secao}>Resolvidos recentemente</Text>}
            {sosRecentes.map(cardSOS)}
            {alertasResolvidos.map(cardAlerta)}
          </>
        ) : notificacoes.length === 0 ? (
          <View style={styles.vazio}>
            <Text style={styles.vazioTitulo}>Nenhuma notificação.</Text>
          </View>
        ) : (
          <>
            {notificacoes.map(cardNotificacao)}
            {!fimNotificacoes && (
              <TouchableOpacity style={styles.btnSecundarioLargo} onPress={() => void maisNotificacoes()}>
                <Text style={styles.btnSecundarioText}>Ver mais antigas</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  topBar: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    gap: spacing.sm,
  },
  btnVoltar: { minHeight: 48, justifyContent: "center", paddingRight: spacing.sm },
  btnVoltarText: { ...typography.buttonMd, color: colors.primary },
  title: { ...typography.cuidadorScreenTitle, color: colors.ink, flex: 1 },
  tabRow: { flexDirection: "row", paddingHorizontal: spacing.md, gap: spacing.xs, paddingTop: spacing.sm },
  tab: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { ...typography.buttonMd, color: colors.muted },
  tabTextActive: { color: colors.primary },
  bannerOffline: { backgroundColor: colors.offlineSoft, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  bannerOfflineText: { ...typography.bodyMd, color: colors.muted },
  bannerErro: { backgroundColor: colors.dangerSoft, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  bannerErroText: { ...typography.bodyMd, color: colors.danger },
  scroll: { padding: spacing.screenGutter, paddingBottom: spacing.xxl },
  card: { borderRadius: rounded.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.line },
  cardSos: { backgroundColor: colors.sosSoft, borderColor: colors.sosSoft },
  cardAlerta: { backgroundColor: colors.warnSoft, borderColor: colors.warnSoft },
  cardResolvido: { backgroundColor: colors.paper },
  cardNaoLida: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
  cardTopo: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  cardTitulo: { ...typography.cuidadorHeadingCard, color: colors.ink },
  cardTexto: { ...typography.bodyMd, color: colors.ink, marginTop: spacing.xxs },
  cardMeta: { ...typography.caption, color: colors.faint, marginTop: spacing.xxs },
  nota: { ...typography.bodyMd, color: colors.muted, marginTop: spacing.xs, fontStyle: "italic" },
  chipAlta: { backgroundColor: colors.warn, borderRadius: rounded.sm, paddingHorizontal: spacing.xs, paddingVertical: 2 },
  chipAltaText: { ...typography.caption, color: colors.onPrimary, fontWeight: "700" },
  linha: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  input: {
    ...typography.bodyMd,
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: rounded.sm,
    padding: spacing.sm,
    backgroundColor: colors.paper,
    color: colors.ink,
    marginTop: spacing.sm,
  },
  btnPrimario: {
    minHeight: 48,
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: rounded.sm,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  btnPrimarioText: { ...typography.buttonMd, color: colors.onPrimary },
  btnSecundario: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: rounded.sm,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    backgroundColor: colors.paper,
  },
  btnSecundarioLargo: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: rounded.sm,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  btnSecundarioText: { ...typography.buttonMd, color: colors.ink },
  secao: { ...typography.caption, color: colors.muted, marginTop: spacing.lg, marginBottom: spacing.xs, fontWeight: "600" },
  vazio: { paddingVertical: spacing.xl, alignItems: "center" },
  vazioTitulo: { ...typography.bodyLg, color: colors.ink, fontWeight: "600" },
  vazioTexto: { ...typography.bodyMd, color: colors.muted, marginTop: spacing.xxs },
  skeleton: { height: 96, borderRadius: rounded.md, backgroundColor: colors.paperDeep, marginBottom: spacing.sm },
});
