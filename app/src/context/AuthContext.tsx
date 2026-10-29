import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Morador, Usuario } from "../types";
import { apiRepository, setAoPerderSessao, setAuthToken } from "../services/api";
import { clearCache } from "../services/cache";
import { aparelhoStore, sessaoStore, type SessaoSalva } from "../services/sessao";
import { registrarPush } from "../services/notifications";

interface AuthContextData {
  user: Usuario | null;
  morador: Morador | null;
  role: "cuidador" | "morador" | null;
  loading: boolean;
  /** Morador vinculado a este aparelho (tablet da casa), se houver. */
  aparelhoMorador: Morador | null;
  loginCuidador: (email: string, senha: string) => Promise<void>;
  cadastrarCuidador: (nome: string, email: string, senha: string) => Promise<void>;
  loginGoogle: (idToken: string) => Promise<void>;
  loginMorador: (pin: string) => Promise<void>;
  vincularAparelho: (m: Morador) => Promise<void>;
  desvincularAparelho: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextData | null>(null);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [sessao, setSessao] = useState<SessaoSalva | null>(null);
  const [aparelhoMorador, setAparelhoMorador] = useState<Morador | null>(null);
  const [loading, setLoading] = useState(true);

  const aplicar = useCallback(async (s: SessaoSalva | null) => {
    setAuthToken(s?.token ?? null);
    setSessao(s);
    await sessaoStore.gravar(s);
    if (s?.tipo === "cuidador") registrarPush().catch(() => {});
  }, []);

  const logout = useCallback(async () => {
    await aplicar(null);
    await clearCache();
  }, [aplicar]);

  useEffect(() => {
    // 401 em qualquer chamada autenticada → volta para a tela de entrada (SPEC seção 3)
    setAoPerderSessao(() => {
      void logout();
    });
    (async () => {
      try {
        const [salva, aparelho] = await Promise.all([sessaoStore.ler(), aparelhoStore.ler()]);
        setAparelhoMorador(aparelho);
        if (salva) {
          setAuthToken(salva.token);
          setSessao(salva);
          if (salva.tipo === "cuidador") registrarPush().catch(() => {});
        }
      } finally {
        setLoading(false);
      }
    })();
    return () => setAoPerderSessao(null);
  }, [logout]);

  const loginCuidador = useCallback(
    async (email: string, senha: string) => {
      const r = await apiRepository.postAuth({ metodo: "senha", email: email.trim().toLowerCase(), senha });
      await aplicar({ tipo: "cuidador", token: r.token, usuario: r.usuario });
    },
    [aplicar]
  );

  const cadastrarCuidador = useCallback(
    async (nome: string, email: string, senha: string) => {
      const r = await apiRepository.postUsuario({ nome: nome.trim(), email: email.trim().toLowerCase(), senha });
      await aplicar({ tipo: "cuidador", token: r.token, usuario: r.usuario });
    },
    [aplicar]
  );

  const loginGoogle = useCallback(
    async (idToken: string) => {
      const r = await apiRepository.postAuth({ metodo: "google", idToken });
      await aplicar({ tipo: "cuidador", token: r.token, usuario: r.usuario });
    },
    [aplicar]
  );

  const loginMorador = useCallback(
    async (pin: string) => {
      if (!aparelhoMorador) throw new Error("Este aparelho ainda não foi configurado por um cuidador.");
      const r = await apiRepository.postLoginPin(aparelhoMorador.id, pin);
      await aplicar({ tipo: "morador", token: r.token, morador: r.morador });
    },
    [aparelhoMorador, aplicar]
  );

  const vincularAparelho = useCallback(
    async (m: Morador) => {
      await aparelhoStore.gravar(m);
      setAparelhoMorador(m);
      // O cuidador sai: daqui em diante o aparelho é do morador (só PIN).
      await logout();
    },
    [logout]
  );

  const desvincularAparelho = useCallback(async () => {
    await aparelhoStore.gravar(null);
    setAparelhoMorador(null);
  }, []);

  const value = useMemo<AuthContextData>(
    () => ({
      user: sessao?.tipo === "cuidador" ? sessao.usuario : null,
      morador: sessao?.tipo === "morador" ? sessao.morador : null,
      role: sessao?.tipo ?? null,
      loading,
      aparelhoMorador,
      loginCuidador,
      cadastrarCuidador,
      loginGoogle,
      loginMorador,
      vincularAparelho,
      desvincularAparelho,
      logout,
    }),
    [sessao, loading, aparelhoMorador, loginCuidador, cadastrarCuidador, loginGoogle, loginMorador, vincularAparelho, desvincularAparelho, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextData {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth fora do AuthProvider");
  return ctx;
}
