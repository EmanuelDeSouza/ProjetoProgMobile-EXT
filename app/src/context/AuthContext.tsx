import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { type Usuario, type Morador } from "../types";
import { apiRepository, setAuthToken } from "../services/api";
import { setCacheItem, getCacheItem } from "../services/cache";

interface AuthContextData {
  user: Usuario | null;
  morador: Morador | null;
  role: "cuidador" | "morador" | null;
  token: string | null;
  loading: boolean;
  loginCuidador: (email: string, senha: string) => Promise<void>;
  loginGoogle: (idToken: string) => Promise<void>;
  loginMorador: (moradorId: string, pin: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<Usuario | null>(null);
  const [morador, setMorador] = useState<Morador | null>(null);
  const [role, setRole] = useState<"cuidador" | "morador" | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStoredAuth() {
      try {
        const storedToken = await getCacheItem<string>("auth_token");
        const storedRole = await getCacheItem<"cuidador" | "morador">("auth_role");
        const storedUser = await getCacheItem<Usuario>("auth_user");
        const storedMorador = await getCacheItem<Morador>("auth_morador");

        if (storedToken && storedRole) {
          setToken(storedToken);
          setAuthToken(storedToken);
          setRole(storedRole);
          if (storedRole === "cuidador" && storedUser) {
            setUser(storedUser);
          } else if (storedRole === "morador" && storedMorador) {
            setMorador(storedMorador);
          }
        }
      } catch (err) {
        console.warn("Erro ao restaurar sessão:", err);
      } finally {
        setLoading(false);
      }
    }
    loadStoredAuth();
  }, []);

  const loginCuidador = async (email: string, senha: string) => {
    const res = await apiRepository.postAuth({ metodo: "senha", email, senha });
    setToken(res.token);
    setUser(res.usuario);
    setMorador(null);
    setRole("cuidador");
    await setCacheItem("auth_token", res.token);
    await setCacheItem("auth_role", "cuidador");
    await setCacheItem("auth_user", res.usuario);
  };

  const loginGoogle = async (idToken: string) => {
    const res = await apiRepository.postAuth({ metodo: "google", idToken });
    setToken(res.token);
    setUser(res.usuario);
    setMorador(null);
    setRole("cuidador");
    await setCacheItem("auth_token", res.token);
    await setCacheItem("auth_role", "cuidador");
    await setCacheItem("auth_user", res.usuario);
  };

  const loginMorador = async (moradorId: string, pin: string) => {
    const res = await apiRepository.postLoginPin(moradorId, pin);
    setToken(res.token);
    setMorador(res.morador);
    setUser(null);
    setRole("morador");
    await setCacheItem("auth_token", res.token);
    await setCacheItem("auth_role", "morador");
    await setCacheItem("auth_morador", res.morador);
  };

  const logout = async () => {
    setToken(null);
    setAuthToken(null);
    setUser(null);
    setMorador(null);
    setRole(null);
    await setCacheItem("auth_token", null);
    await setCacheItem("auth_role", null);
    await setCacheItem("auth_user", null);
    await setCacheItem("auth_morador", null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        morador,
        role,
        token,
        loading,
        loginCuidador,
        loginGoogle,
        loginMorador,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  return useContext(AuthContext);
}
