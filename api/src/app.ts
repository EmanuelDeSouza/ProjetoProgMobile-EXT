import { verifyAuthToken } from "./auth";
import { sessaoDoToken, sessaoValida, type Sessao } from "./authz";
import { HttpError } from "./http";
import { formatErrorResponse } from "./schemas";
import { handleHealth } from "./routes/health";
import { handleAuth, handleMe, handlePostUsuario } from "./routes/auth";
import { handlePostPushToken } from "./routes/usuarios";
import {
  handleGetMinhasResidencias,
  handlePostResidencia,
  handlePostConvite,
  handlePatchConvite,
} from "./routes/residencias";
import { handleListMoradores, handlePostMorador, handlePostLoginPin } from "./routes/moradores";
import {
  handlePostPareamento,
  handleListDispositivos,
  handlePostComando,
  handleListEventosDispositivo,
} from "./routes/dispositivos";
import { handleListRegras, handlePostRegra } from "./routes/regras";
import { handleListAlertas, handlePatchAlerta } from "./routes/alertas";
import { handleListSOS, handlePostSOS, handlePatchSOS } from "./routes/sos";
import { handleListNotificacoes, handlePatchNotificacao } from "./routes/notificacoes";

export interface Contexto {
  req: Request;
  url: URL;
  params: string[];
  sessao: Sessao;
}

type HandlerPublico = (req: Request) => Promise<Response>;
type HandlerAutenticado = (ctx: Contexto) => Promise<Response>;

interface Rota {
  method: string;
  pattern: RegExp;
  publica?: HandlerPublico;
  autenticada?: HandlerAutenticado;
}

const seg = "([^/]+)";
const rotas: Rota[] = [
  // Públicas (AGENTS.md): health, auth, cadastro, login-pin
  { method: "GET", pattern: /^\/v1\/health$/, publica: () => handleHealth() },
  { method: "POST", pattern: /^\/v1\/auth$/, publica: handleAuth },
  { method: "POST", pattern: /^\/v1\/usuarios$/, publica: handlePostUsuario },
  { method: "POST", pattern: /^\/v1\/moradores\/login-pin$/, publica: handlePostLoginPin },

  { method: "GET", pattern: /^\/v1\/me$/, autenticada: handleMe },
  { method: "POST", pattern: /^\/v1\/usuarios\/push-token$/, autenticada: handlePostPushToken },
  { method: "GET", pattern: /^\/v1\/residencias$/, autenticada: handleGetMinhasResidencias },
  { method: "POST", pattern: /^\/v1\/residencias$/, autenticada: handlePostResidencia },
  { method: "POST", pattern: new RegExp(`^/v1/residencias/${seg}/convites$`), autenticada: handlePostConvite },
  { method: "PATCH", pattern: new RegExp(`^/v1/convites/${seg}$`), autenticada: handlePatchConvite },
  { method: "GET", pattern: new RegExp(`^/v1/residencias/${seg}/moradores$`), autenticada: handleListMoradores },
  { method: "POST", pattern: new RegExp(`^/v1/residencias/${seg}/moradores$`), autenticada: handlePostMorador },
  { method: "POST", pattern: new RegExp(`^/v1/residencias/${seg}/dispositivos/parear$`), autenticada: handlePostPareamento },
  { method: "GET", pattern: new RegExp(`^/v1/residencias/${seg}/dispositivos$`), autenticada: handleListDispositivos },
  { method: "POST", pattern: new RegExp(`^/v1/dispositivos/${seg}/comando$`), autenticada: handlePostComando },
  { method: "GET", pattern: new RegExp(`^/v1/dispositivos/${seg}/eventos$`), autenticada: handleListEventosDispositivo },
  { method: "GET", pattern: new RegExp(`^/v1/residencias/${seg}/regras$`), autenticada: handleListRegras },
  { method: "POST", pattern: new RegExp(`^/v1/residencias/${seg}/regras$`), autenticada: handlePostRegra },
  { method: "GET", pattern: new RegExp(`^/v1/residencias/${seg}/alertas$`), autenticada: handleListAlertas },
  { method: "PATCH", pattern: new RegExp(`^/v1/alertas/${seg}$`), autenticada: handlePatchAlerta },
  { method: "GET", pattern: new RegExp(`^/v1/residencias/${seg}/sos$`), autenticada: handleListSOS },
  { method: "POST", pattern: new RegExp(`^/v1/residencias/${seg}/sos$`), autenticada: handlePostSOS },
  { method: "PATCH", pattern: new RegExp(`^/v1/sos/${seg}$`), autenticada: handlePatchSOS },
  { method: "GET", pattern: /^\/v1\/notificacoes$/, autenticada: handleListNotificacoes },
  { method: "PATCH", pattern: new RegExp(`^/v1/notificacoes/${seg}$`), autenticada: handlePatchNotificacao },
];

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

const naoAutenticado = (msg: string) =>
  Response.json(formatErrorResponse("UNAUTHORIZED", msg), { status: 401 });

async function despachar(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  let rota: Rota | undefined;
  let params: string[] = [];
  let pathExiste = false;
  for (const r of rotas) {
    const m = path.match(r.pattern);
    if (!m) continue;
    pathExiste = true;
    if (r.method === req.method) {
      rota = r;
      params = m.slice(1).map((p) => decodeURIComponent(p));
      break;
    }
  }

  if (!rota) {
    if (pathExiste) {
      return Response.json(formatErrorResponse("METHOD_NOT_ALLOWED", "Método não permitido nesta rota."), {
        status: 405,
      });
    }
  }

  if (rota?.publica) return rota.publica(req);

  // Daqui para baixo tudo exige Bearer — inclusive rota inexistente (não revela o mapa da API).
  const auth = req.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) return naoAutenticado("Token de autenticação ausente ou inválido.");
  const payload = await verifyAuthToken(auth.slice(7).trim());
  if (!payload) return naoAutenticado("Token de autenticação inválido ou expirado.");
  const sessao = sessaoDoToken(payload);
  if (!(await sessaoValida(sessao))) return naoAutenticado("Sessão não existe mais. Entre de novo.");

  if (!rota?.autenticada) {
    return Response.json(formatErrorResponse("NOT_FOUND", `Rota ${req.method} ${path} não encontrada.`), {
      status: 404,
    });
  }
  return rota.autenticada({ req, url, params, sessao });
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return withCors(new Response(null, { status: 204 }));
  try {
    return withCors(await despachar(req));
  } catch (err) {
    if (err instanceof HttpError) return withCors(err.toResponse());
    console.error("Erro não tratado na requisição:", err);
    return withCors(Response.json(formatErrorResponse("INTERNAL_ERROR", "Erro interno do servidor."), { status: 500 }));
  }
}
