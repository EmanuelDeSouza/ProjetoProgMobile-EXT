import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { type ResidenciaComPapel, type Dispositivo } from "../types";
import { apiRepository, ApiException } from "../services/api";
import { useAuth } from "./AuthContext";

interface ResidenceContextData {
  residencias: ResidenciaComPapel[];
  selectedResidencia: ResidenciaComPapel | null;
  dispositivos: Dispositivo[];
  loading: boolean;
  isOffline: boolean;
  selectResidencia: (res: ResidenciaComPapel) => void;
  loadResidencias: () => Promise<void>;
  refreshDispositivos: () => Promise<void>;
  controlarTomada: (dispositivoId: string, ligar: boolean) => Promise<boolean>;
}

const ResidenceContext = createContext<ResidenceContextData>({} as ResidenceContextData);

export const ResidenceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { role, morador } = useAuth();
  const [residencias, setResidencias] = useState<ResidenciaComPapel[]>([]);
  const [selectedResidencia, setSelectedResidencia] = useState<ResidenciaComPapel | null>(null);
  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  const loadResidencias = useCallback(async () => {
    if (role !== "cuidador") return;
    setLoading(true);
    try {
      const list = await apiRepository.getMinhasResidencias();
      setResidencias(list);
      setIsOffline(false);
      if (list.length > 0 && !selectedResidencia) {
        setSelectedResidencia(list[0]);
      }
    } catch {
      setIsOffline(true);
    } finally {
      setLoading(false);
    }
  }, [role, selectedResidencia]);

  const refreshDispositivos = useCallback(async () => {
    const resId = selectedResidencia?.id || morador?.residenciaId;
    if (!resId) return;

    setLoading(true);
    try {
      const list = await apiRepository.listDispositivos(resId);
      setDispositivos(list);
      setIsOffline(false);
    } catch {
      setIsOffline(true);
    } finally {
      setLoading(false);
    }
  }, [selectedResidencia?.id, morador?.residenciaId]);

  useEffect(() => {
    if (role === "cuidador") {
      loadResidencias();
    } else if (role === "morador" && morador?.residenciaId) {
      refreshDispositivos();
    }
  }, [role, morador?.residenciaId, loadResidencias, refreshDispositivos]);

  useEffect(() => {
    if (selectedResidencia) {
      refreshDispositivos();
    }
  }, [selectedResidencia, refreshDispositivos]);

  // RF-10: Controlar atuador com timeout de 8 segundos e confirmação via estado retornado
  const controlarTomada = async (dispositivoId: string, ligar: boolean): Promise<boolean> => {
    const disp = dispositivos.find((d) => d.id === dispositivoId);
    if (!disp || disp.status === "offline") {
      throw new Error("Dispositivo offline, comando não pode ser enviado.");
    }

    const acao = ligar ? "ligar" : "desligar";
    await apiRepository.postComandoDispositivo(dispositivoId, acao);

    // Aguarda confirmação que volta via MQTT (polling de até 8 segundos conforme RF-10)
    const targetEstado = ligar ? "ligada" : "desligada";
    const resId = selectedResidencia?.id || morador?.residenciaId;
    if (!resId) return false;

    const startTime = Date.now();
    while (Date.now() - startTime < 8000) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const updatedList = await apiRepository.listDispositivos(resId);
        setDispositivos(updatedList);
        const updatedDisp = updatedList.find((d) => d.id === dispositivoId);
        if (updatedDisp && updatedDisp.estadoAtual?.tomada === targetEstado) {
          return true; // Sucesso confirmado!
        }
      } catch {
        // Se falhar a leitura na rede, segue tentativa até timeout
      }
    }

    return false; // Timeout de 8s excedido
  };

  return (
    <ResidenceContext.Provider
      value={{
        residencias,
        selectedResidencia,
        dispositivos,
        loading,
        isOffline,
        selectResidencia: setSelectedResidencia,
        loadResidencias,
        refreshDispositivos,
        controlarTomada,
      }}
    >
      {children}
    </ResidenceContext.Provider>
  );
};

export function useResidence() {
  return useContext(ResidenceContext);
}
