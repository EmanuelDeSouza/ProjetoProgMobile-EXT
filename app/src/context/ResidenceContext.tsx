import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Dispositivo, ResidenciaComPapel } from "../types";
import { apiRepository, mensagemDeErro } from "../services/api";
import { aguardarConfirmacao, estadoAlvo } from "../services/comando";
import { local } from "../services/storage";
import { useAuth } from "./AuthContext";

interface ResidenceContextData {
  residencias: ResidenciaComPapel[];
  selectedResidencia: ResidenciaComPapel | null;
  dispositivos: Dispositivo[];
  /** Primeira carga ainda sem nada para mostrar (esqueleto). */
  loading: boolean;
  /** Mostrando último estado salvo (RNF-05). */
  isOffline: boolean;
  erro: string | null;
  selectResidencia: (res: ResidenciaComPapel) => void;
  loadResidencias: () => Promise<void>;
  refreshDispositivos: () => Promise<void>;
  /** RF-10: true só quando o dispositivo confirmar o novo estado. */
  controlarTomada: (dispositivoId: string, ligar: boolean) => Promise<boolean>;
}

const ResidenceContext = createContext<ResidenceContextData | null>(null);
const CHAVE_SELECIONADA = "residencia_selecionada";
const ATUALIZAR_A_CADA_MS = 15_000;

export const ResidenceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { role, morador } = useAuth();
  const [residencias, setResidencias] = useState<ResidenciaComPapel[]>([]);
  const [selectedResidencia, setSelected] = useState<ResidenciaComPapel | null>(null);
  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const comandando = useRef(0);

  const residenciaId = role === "morador" ? morador?.residenciaId ?? null : selectedResidencia?.id ?? null;

  // Troca de conta: limpa tudo que era do usuário anterior.
  useEffect(() => {
    setResidencias([]);
    setSelected(null);
    setDispositivos([]);
    setIsOffline(false);
    setErro(null);
  }, [role, morador?.id]);

  const selectResidencia = useCallback((r: ResidenciaComPapel) => {
    setSelected(r);
    setDispositivos([]);
    void local.gravar(CHAVE_SELECIONADA, r.id);
  }, []);

  const loadResidencias = useCallback(async () => {
    if (role !== "cuidador") return;
    setLoading(true);
    try {
      const { dados, offline } = await apiRepository.getMinhasResidencias();
      setResidencias(dados);
      setIsOffline(offline);
      setErro(null);
      const salva = await local.ler<string>(CHAVE_SELECIONADA);
      setSelected((atual) => {
        const manter = atual && dados.find((r) => r.id === atual.id);
        return manter ?? dados.find((r) => r.id === salva) ?? dados[0] ?? null;
      });
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setLoading(false);
    }
  }, [role]);

  const refreshDispositivos = useCallback(async () => {
    if (!residenciaId) return;
    setLoading((l) => l || dispositivos.length === 0);
    try {
      const { dados, offline } = await apiRepository.listDispositivos(residenciaId);
      // não sobrescreve enquanto um comando aguarda confirmação (o polling dele atualiza)
      if (comandando.current === 0) setDispositivos(dados);
      setIsOffline(offline);
      setErro(null);
    } catch (e) {
      setErro(mensagemDeErro(e, "Não foi possível carregar o painel."));
    } finally {
      setLoading(false);
    }
  }, [residenciaId, dispositivos.length]);

  useEffect(() => {
    if (role === "cuidador") void loadResidencias();
  }, [role, loadResidencias]);

  // Painel sempre fresco: primeira carga + atualização periódica enquanto a tela está aberta.
  useEffect(() => {
    if (!residenciaId) return;
    void refreshDispositivos();
    const t = setInterval(() => void refreshDispositivos(), ATUALIZAR_A_CADA_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [residenciaId]);

  const controlarTomada = useCallback(
    async (dispositivoId: string, ligar: boolean): Promise<boolean> => {
      const disp = dispositivos.find((d) => d.id === dispositivoId);
      if (!disp || disp.status === "offline" || isOffline || !residenciaId) {
        throw new Error("Sem contato com este dispositivo agora.");
      }
      const acao = ligar ? "ligar" : "desligar";
      comandando.current += 1;
      try {
        await apiRepository.postComandoDispositivo(dispositivoId, acao);
        return await aguardarConfirmacao(
          () => apiRepository.listDispositivosAoVivo(residenciaId),
          dispositivoId,
          estadoAlvo(acao),
          { aoAtualizar: setDispositivos }
        );
      } finally {
        comandando.current -= 1;
      }
    },
    [dispositivos, isOffline, residenciaId]
  );

  const value = useMemo<ResidenceContextData>(
    () => ({
      residencias,
      selectedResidencia,
      dispositivos,
      loading,
      isOffline,
      erro,
      selectResidencia,
      loadResidencias,
      refreshDispositivos,
      controlarTomada,
    }),
    [residencias, selectedResidencia, dispositivos, loading, isOffline, erro, selectResidencia, loadResidencias, refreshDispositivos, controlarTomada]
  );

  return <ResidenceContext.Provider value={value}>{children}</ResidenceContext.Provider>;
};

export function useResidence(): ResidenceContextData {
  const ctx = useContext(ResidenceContext);
  if (!ctx) throw new Error("useResidence fora do ResidenceProvider");
  return ctx;
}
