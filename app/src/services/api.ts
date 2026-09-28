import {
  type Usuario,
  type Residencia,
  type ResidenciaComPapel,
  type Morador,
  type Dispositivo,
  type EventoDispositivo,
  type RegraAlerta,
  type Alerta,
  type SOSEvento,
  type Notificacao,
  type ApiError,
  type TipoDispositivo,
  type CondicaoRegra,
} from "../types";
import { setCacheItem, getCacheItem } from "./cache";

const BASE_URL = "http://localhost:3000/v1";

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

export class ApiException extends Error {
  public code: string;
  public fields?: Record<string, string>;
  public status: number;

  constructor(status: number, error: ApiError["error"]) {
    super(error.message);
    this.name = "ApiException";
    this.status = status;
    this.code = error.code;
    this.fields = error.fields;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  cacheKey?: string
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };

  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
    });

    if (!res.ok) {
      let errorData: ApiError;
      try {
        errorData = (await res.json()) as ApiError;
      } catch {
        errorData = {
          error: {
            code: `HTTP_${res.status}`,
            message: "Erro na comunicação com o servidor.",
          },
        };
      }
      throw new ApiException(res.status, errorData.error);
    }

    if (res.status === 204 || res.headers.get("content-length") === "0") {
      return {} as T;
    }

    const data = (await res.json()) as T;
    if (cacheKey) {
      await setCacheItem(cacheKey, data);
    }
    return data;
  } catch (err) {
    if (cacheKey) {
      const cached = await getCacheItem<T>(cacheKey);
      if (cached) {
        return cached;
      }
    }
    throw err;
  }
}

// ----------------- Repositório / Chamadas de API -----------------

export const apiRepository = {
  async postAuth(data: {
    metodo: "senha" | "google";
    email?: string;
    senha?: string;
    idToken?: string;
  }): Promise<{ token: string; usuario: Usuario }> {
    const res = await request<{ token: string; usuario: Usuario }>("/auth", {
      method: "POST",
      body: JSON.stringify(data),
    });
    setAuthToken(res.token);
    return res;
  },

  async getMe(): Promise<Usuario> {
    return request<Usuario>("/me");
  },

  async getMinhasResidencias(): Promise<ResidenciaComPapel[]> {
    return request<ResidenciaComPapel[]>("/residencias", {}, "cache_minhas_residencias");
  },

  async postResidencia(data: {
    nome: string;
    enderecoCurto?: string;
  }): Promise<Residencia> {
    return request<Residencia>("/residencias", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async postConvite(residenciaId: string, email: string): Promise<void> {
    return request<void>(`/residencias/${residenciaId}/convites`, {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },

  async patchConvite(conviteId: string): Promise<void> {
    return request<void>(`/convites/${conviteId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "aceito" }),
    });
  },

  async postMorador(
    residenciaId: string,
    data: { nome: string; pin: string }
  ): Promise<Morador> {
    return request<Morador>(`/residencias/${residenciaId}/moradores`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async postLoginPin(
    moradorId: string,
    pin: string
  ): Promise<{ token: string; morador: Morador }> {
    const res = await request<{ token: string; morador: Morador }>(
      "/moradores/login-pin",
      {
        method: "POST",
        body: JSON.stringify({ moradorId, pin }),
      }
    );
    setAuthToken(res.token);
    return res;
  },

  async postPareamento(
    residenciaId: string,
    data: {
      codigo: string;
      tipo: TipoDispositivo;
      nome: string;
      comodo: string;
    }
  ): Promise<Dispositivo> {
    return request<Dispositivo>(`/residencias/${residenciaId}/dispositivos/parear`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async listDispositivos(residenciaId: string): Promise<Dispositivo[]> {
    return request<Dispositivo[]>(
      `/residencias/${residenciaId}/dispositivos`,
      {},
      `cache_dispositivos_${residenciaId}`
    );
  },

  async postComandoDispositivo(dispositivoId: string, acao: string): Promise<void> {
    return request<void>(`/dispositivos/${dispositivoId}/comando`, {
      method: "POST",
      body: JSON.stringify({ acao }),
    });
  },

  async listEventosDispositivo(dispositivoId: string): Promise<EventoDispositivo[]> {
    return request<EventoDispositivo[]>(`/dispositivos/${dispositivoId}/eventos`);
  },

  async listRegras(residenciaId: string): Promise<RegraAlerta[]> {
    return request<RegraAlerta[]>(`/residencias/${residenciaId}/regras`);
  },

  async postRegraAlerta(
    residenciaId: string,
    data: {
      dispositivoId: string;
      condicao: CondicaoRegra;
      parametros: Record<string, unknown>;
    }
  ): Promise<RegraAlerta> {
    return request<RegraAlerta>(`/residencias/${residenciaId}/regras`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async listAlertas(residenciaId: string): Promise<Alerta[]> {
    return request<Alerta[]>(`/residencias/${residenciaId}/alertas`);
  },

  async patchAlerta(alertaId: string, data: { status: "reconhecido"; nota?: string }): Promise<void> {
    return request<void>(`/alertas/${alertaId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  async postSOS(residenciaId: string, moradorId: string): Promise<SOSEvento> {
    return request<SOSEvento>(`/residencias/${residenciaId}/sos`, {
      method: "POST",
      body: JSON.stringify({ moradorId }),
    });
  },

  async patchSOS(sosId: string): Promise<void> {
    return request<void>(`/sos/${sosId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "cancelado_pelo_morador" }),
    });
  },

  async listNotificacoes(): Promise<Notificacao[]> {
    return request<Notificacao[]>("/notificacoes");
  },

  async patchNotificacao(notificacaoId: string, lida: boolean): Promise<void> {
    return request<void>(`/notificacoes/${notificacaoId}`, {
      method: "PATCH",
      body: JSON.stringify({ lida }),
    });
  },
};
