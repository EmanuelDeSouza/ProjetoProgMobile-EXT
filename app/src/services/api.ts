// Repositório HTTP (UI → estado → repositório). Toda resposta passa por Zod (contract/openapi.yaml).
import { z } from "zod";
import * as s from "./schemas";
import { getCacheItem, setCacheItem } from "./cache";
import type {
  Alerta,
  CondicaoRegra,
  Convite,
  Dispositivo,
  EventoDispositivo,
  Morador,
  Notificacao,
  RegraAlerta,
  Residencia,
  ResidenciaComPapel,
  SOSEvento,
  TipoDispositivo,
  Usuario,
} from "../types";

let baseUrl = (process.env.EXPO_PUBLIC_API_URL || "http://10.0.2.2:3000/v1").replace(/\/+$/, "");

export function setApiBaseUrl(url: string) {
  baseUrl = url.replace(/\/+$/, "");
}
export function getApiBaseUrl(): string {
  return baseUrl;
}

let authToken: string | null = null;
export function setAuthToken(token: string | null) {
  authToken = token;
}
export function getAuthToken(): string | null {
  return authToken;
}

/** Chamado quando o servidor diz que a sessão não vale mais (401 numa rota autenticada). */
let aoPerderSessao: (() => void) | null = null;
export function setAoPerderSessao(fn: (() => void) | null) {
  aoPerderSessao = fn;
}

export class ApiException extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>
  ) {
    super(message);
    this.name = "ApiException";
  }
}

/** Falha de rede (sem internet, servidor fora). Diferente de erro HTTP. */
export class SemConexao extends Error {
  constructor() {
    super("Sem conexão com o servidor.");
    this.name = "SemConexao";
  }
}

/** Texto para a pessoa — nunca código HTTP nem JSON (DESIGN.md / SPEC seção 3). */
export function mensagemDeErro(err: unknown, padrao = "Algo deu errado. Tente de novo."): string {
  if (err instanceof SemConexao) return "Sem conexão. Verifique a internet e tente de novo.";
  if (err instanceof ApiException) {
    if (err.code === "VALIDATION_ERROR" && err.fields) {
      const primeiro = Object.values(err.fields)[0];
      if (primeiro) return primeiro;
    }
    if (err.status >= 500) return "O servidor não respondeu como esperado. Tente de novo.";
    return err.message || padrao;
  }
  return padrao;
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestInit = {},
  timeoutMs = 15_000
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, { ...options, headers, signal: controller.signal });
  } catch {
    throw new SemConexao();
  } finally {
    clearTimeout(timer);
  }

  const texto = await res.text();
  let corpo: unknown = null;
  if (texto) {
    try {
      corpo = JSON.parse(texto);
    } catch {
      corpo = null;
    }
  }

  if (!res.ok) {
    const erro = s.apiErro.safeParse(corpo);
    if (res.status === 401 && authToken && aoPerderSessao) aoPerderSessao();
    if (erro.success) {
      throw new ApiException(res.status, erro.data.error.code, erro.data.error.message, erro.data.error.fields);
    }
    throw new ApiException(res.status, `HTTP_${res.status}`, "Erro na comunicação com o servidor.");
  }

  const parsed = schema.safeParse(corpo ?? {});
  if (!parsed.success) {
    console.warn(`[api] resposta fora do contrato em ${path}:`, parsed.error.issues[0]);
    throw new ApiException(res.status, "CONTRACT_MISMATCH", "Resposta inesperada do servidor.");
  }
  return parsed.data;
}

/** Resultado de leitura com fallback no último estado salvo (RNF-05). */
export interface Leitura<T> {
  dados: T;
  offline: boolean;
}

async function comCache<T>(chave: string, buscar: () => Promise<T>): Promise<Leitura<T>> {
  try {
    const dados = await buscar();
    await setCacheItem(chave, dados);
    return { dados, offline: false };
  } catch (err) {
    if (err instanceof SemConexao || (err instanceof ApiException && err.status >= 500)) {
      const salvo = await getCacheItem<T>(chave);
      if (salvo !== null) return { dados: salvo, offline: true };
    }
    throw err;
  }
}

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });
const vazio = z.unknown();
const ok = z.object({ status: z.string() });

export const apiRepository = {
  postAuth(data: { metodo: "senha"; email: string; senha: string } | { metodo: "google"; idToken: string }) {
    return request("/auth", s.sessaoCuidador, { method: "POST", ...json(data) });
  },

  postUsuario(data: { nome: string; email: string; senha: string }) {
    return request("/usuarios", s.sessaoCuidador, { method: "POST", ...json(data) });
  },

  getMe(): Promise<Usuario> {
    return request("/me", s.usuario);
  },

  postPushToken(pushToken: string) {
    return request("/usuarios/push-token", ok, { method: "POST", ...json({ pushToken }) });
  },

  getMinhasResidencias(): Promise<Leitura<ResidenciaComPapel[]>> {
    return comCache("residencias", () => request("/residencias", z.array(s.residenciaComPapel)));
  },

  postResidencia(data: { nome: string; enderecoCurto?: string }): Promise<Residencia> {
    return request("/residencias", s.residencia, { method: "POST", ...json(data) });
  },

  postConvite(residenciaId: string, email: string): Promise<Convite> {
    return request(`/residencias/${residenciaId}/convites`, s.convite, { method: "POST", ...json({ email }) });
  },

  patchConvite(conviteId: string): Promise<ResidenciaComPapel> {
    return request(`/convites/${conviteId}`, s.residenciaComPapel, {
      method: "PATCH",
      ...json({ status: "aceito" }),
    });
  },

  listMoradores(residenciaId: string): Promise<Morador[]> {
    return request(`/residencias/${residenciaId}/moradores`, z.array(s.morador));
  },

  postMorador(residenciaId: string, data: { nome: string; pin: string }): Promise<Morador> {
    return request(`/residencias/${residenciaId}/moradores`, s.morador, { method: "POST", ...json(data) });
  },

  postLoginPin(moradorId: string, pin: string) {
    return request("/moradores/login-pin", s.sessaoMorador, { method: "POST", ...json({ moradorId, pin }) });
  },

  postPareamento(
    residenciaId: string,
    data: { codigo: string; tipo: TipoDispositivo; nome: string; comodo: string }
  ): Promise<Dispositivo> {
    return request(`/residencias/${residenciaId}/dispositivos/parear`, s.dispositivo, {
      method: "POST",
      ...json(data),
    });
  },

  listDispositivos(residenciaId: string): Promise<Leitura<Dispositivo[]>> {
    return comCache(`dispositivos:${residenciaId}`, () =>
      request(`/residencias/${residenciaId}/dispositivos`, z.array(s.dispositivo), {}, 8000)
    );
  },

  /** Só busca, sem cache: usado no polling da confirmação do comando. */
  listDispositivosAoVivo(residenciaId: string): Promise<Dispositivo[]> {
    return request(`/residencias/${residenciaId}/dispositivos`, z.array(s.dispositivo), {}, 4000);
  },

  async postComandoDispositivo(dispositivoId: string, acao: "ligar" | "desligar"): Promise<void> {
    await request(`/dispositivos/${dispositivoId}/comando`, vazio, { method: "POST", ...json({ acao }) });
  },

  listEventosDispositivo(dispositivoId: string): Promise<Leitura<EventoDispositivo[]>> {
    return comCache(`eventos:${dispositivoId}`, () =>
      request(`/dispositivos/${dispositivoId}/eventos`, z.array(s.eventoDispositivo))
    );
  },

  listRegras(residenciaId: string): Promise<Leitura<RegraAlerta[]>> {
    return comCache(`regras:${residenciaId}`, () =>
      request(`/residencias/${residenciaId}/regras`, z.array(s.regraAlerta))
    );
  },

  postRegraAlerta(
    residenciaId: string,
    data: { dispositivoId: string; condicao: CondicaoRegra; parametros: Record<string, unknown> }
  ): Promise<RegraAlerta> {
    return request(`/residencias/${residenciaId}/regras`, s.regraAlerta, { method: "POST", ...json(data) });
  },

  listAlertas(residenciaId: string): Promise<Leitura<Alerta[]>> {
    return comCache(`alertas:${residenciaId}`, () =>
      request(`/residencias/${residenciaId}/alertas`, z.array(s.alerta))
    );
  },

  patchAlerta(alertaId: string, data: { status: "reconhecido"; nota?: string } | { status: "aberto"; nota: string }) {
    return request(`/alertas/${alertaId}`, s.alerta, { method: "PATCH", ...json(data) });
  },

  listSOS(residenciaId: string): Promise<Leitura<SOSEvento[]>> {
    return comCache(`sos:${residenciaId}`, () => request(`/residencias/${residenciaId}/sos`, z.array(s.sosEvento)));
  },

  postSOS(residenciaId: string, moradorId: string): Promise<SOSEvento> {
    return request(`/residencias/${residenciaId}/sos`, s.sosEvento, { method: "POST", ...json({ moradorId }) }, 10_000);
  },

  cancelarSOS(sosId: string): Promise<SOSEvento> {
    return request(`/sos/${sosId}`, s.sosEvento, { method: "PATCH", ...json({ status: "cancelado_pelo_morador" }) });
  },

  reconhecerSOS(sosId: string): Promise<SOSEvento> {
    return request(`/sos/${sosId}`, s.sosEvento, { method: "PATCH", ...json({ status: "reconhecido" }) });
  },

  listNotificacoes(opts: { limite?: number; antes?: string } = {}): Promise<Notificacao[]> {
    const q = new URLSearchParams();
    if (opts.limite) q.set("limite", String(opts.limite));
    if (opts.antes) q.set("antes", opts.antes);
    const qs = q.toString();
    return request(`/notificacoes${qs ? `?${qs}` : ""}`, z.array(s.notificacao));
  },

  patchNotificacao(notificacaoId: string, lida: boolean): Promise<Notificacao> {
    return request(`/notificacoes/${notificacaoId}`, s.notificacao, { method: "PATCH", ...json({ lida }) });
  },
};
