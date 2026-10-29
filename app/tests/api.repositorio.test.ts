// Repositório HTTP: valida contrato com Zod, cai no último estado salvo sem rede (RNF-05),
// nunca mostra código HTTP/JSON (SPEC seção 3) e avisa quando a sessão cai (401).
import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import {
  ApiException,
  SemConexao,
  apiRepository,
  mensagemDeErro,
  setAoPerderSessao,
  setApiBaseUrl,
  setAuthToken,
} from "../src/services/api";
import { configurarArmazenamento, memoria } from "../src/services/storage";

const dispositivo = {
  id: "d1",
  tipo: "atuador_tomada",
  nome: "Abajur",
  comodo: "Quarto",
  estadoAtual: { tomada: "desligada" },
  status: "online",
  ultimoContatoEm: "2026-10-29T12:00:00.000Z",
};

const fetchOriginal = globalThis.fetch;
function responder(status: number, corpo: unknown) {
  globalThis.fetch = mock(async () => new Response(corpo === undefined ? null : JSON.stringify(corpo), { status })) as unknown as typeof fetch;
}

describe("Repositório HTTP do app", () => {
  beforeEach(() => {
    configurarArmazenamento(memoria());
    setApiBaseUrl("http://api.teste/v1");
    setAuthToken("token-x");
  });
  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    setAoPerderSessao(null);
  });

  it("Given resposta no contrato, Then devolve os dados tipados e online", async () => {
    responder(200, [dispositivo]);
    const r = await apiRepository.listDispositivos("r1");
    expect(r.offline).toBe(false);
    expect(r.dados[0]?.nome).toBe("Abajur");
  });

  it("Given resposta fora do contrato, Then recusa (não usa dado inventado)", async () => {
    responder(200, [{ ...dispositivo, status: "talvez" }]);
    await expect(apiRepository.listDispositivosAoVivo("r1")).rejects.toBeInstanceOf(ApiException);
  });

  it("Given sem rede depois de uma leitura boa, Then mostra o último estado salvo marcado como offline", async () => {
    responder(200, [dispositivo]);
    await apiRepository.listDispositivos("r1");
    globalThis.fetch = mock(async () => {
      throw new TypeError("Network request failed");
    }) as unknown as typeof fetch;
    const r = await apiRepository.listDispositivos("r1");
    expect(r.offline).toBe(true);
    expect(r.dados[0]?.id).toBe("d1");
  });

  it("Given sem rede e sem nada salvo, Then erro SemConexao com mensagem humana", async () => {
    globalThis.fetch = mock(async () => {
      throw new TypeError("Network request failed");
    }) as unknown as typeof fetch;
    const e = await apiRepository.listDispositivos("nunca-visto").catch((x: unknown) => x);
    expect(e).toBeInstanceOf(SemConexao);
    expect(mensagemDeErro(e)).toBe("Sem conexão. Verifique a internet e tente de novo.");
  });

  it("Given 400 com campos, Then a mensagem é a do campo; 500 nunca mostra código", async () => {
    responder(400, { error: { code: "VALIDATION_ERROR", message: "Corrija os campos destacados.", fields: { tipo: "Este dispositivo se apresentou como botao sos." } } });
    const e1 = await apiRepository.postPareamento("r1", { codigo: "123456", tipo: "sensor_contato", nome: "x", comodo: "y" }).catch((x: unknown) => x);
    expect(mensagemDeErro(e1)).toBe("Este dispositivo se apresentou como botao sos.");
    responder(500, { error: { code: "INTERNAL_ERROR", message: "Erro interno do servidor." } });
    const e2 = await apiRepository.getMe().catch((x: unknown) => x);
    expect(mensagemDeErro(e2)).not.toContain("500");
  });

  it("Given 401 numa rota autenticada, Then avisa para voltar à tela de entrada", async () => {
    let perdeu = false;
    setAoPerderSessao(() => {
      perdeu = true;
    });
    responder(401, { error: { code: "UNAUTHORIZED", message: "Token inválido" } });
    await apiRepository.getMe().catch(() => {});
    expect(perdeu).toBe(true);
  });

  it("Given comando, Then envia ação no corpo com Bearer", async () => {
    const chamadas: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = mock(async (url: string, init: RequestInit) => {
      chamadas.push({ url, init });
      return new Response(null, { status: 202 });
    }) as unknown as typeof fetch;
    await apiRepository.postComandoDispositivo("d1", "ligar");
    expect(chamadas[0]?.url).toBe("http://api.teste/v1/dispositivos/d1/comando");
    expect(JSON.parse(String(chamadas[0]?.init.body))).toEqual({ acao: "ligar" });
    expect((chamadas[0]?.init.headers as Record<string, string>).Authorization).toBe("Bearer token-x");
  });
});
