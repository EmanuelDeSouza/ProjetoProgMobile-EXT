import { verifyAuthToken, type TokenPayload } from "./auth";
import { formatErrorResponse } from "./schemas";
import { handleHealth } from "./routes/health";
import { handleAuth, handleMe } from "./routes/auth";
import { handlePostPushToken } from "./routes/usuarios";
import {
  handleGetMinhasResidencias,
  handlePostResidencia,
  handlePostConvite,
  handlePatchConvite,
} from "./routes/residencias";
import { handlePostMorador, handlePostLoginPin } from "./routes/moradores";
import {
  handlePostPareamento,
  handleListDispositivos,
  handlePostComando,
  handleListEventosDispositivo,
} from "./routes/dispositivos";
import { handleListRegras, handlePostRegra } from "./routes/regras";
import { handleListAlertas, handlePatchAlerta } from "./routes/alertas";
import { handlePostSOS, handlePatchSOS } from "./routes/sos";
import { handleListNotificacoes, handlePatchNotificacao } from "./routes/notificacoes";

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
}

function withCors(res: Response): Response {
  const newHeaders = new Headers(res.headers);
  const cors = corsHeaders();
  for (const [key, value] of Object.entries(cors)) {
    newHeaders.set(key, value);
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: newHeaders,
  });
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return withCors(new Response(null, { status: 204 }));
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    // Public routes (RNF-10: prefix /v1)
    if (method === "GET" && path === "/v1/health") {
      return withCors(await handleHealth());
    }

    if (method === "POST" && path === "/v1/auth") {
      return withCors(await handleAuth(req));
    }

    if (method === "POST" && path === "/v1/moradores/login-pin") {
      return withCors(await handlePostLoginPin(req));
    }

    // Authenticated routes require Bearer token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return withCors(
        Response.json(
          formatErrorResponse("UNAUTHORIZED", "Token de autenticação ausente ou inválido."),
          { status: 401 }
        )
      );
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const tokenPayload: TokenPayload | null = await verifyAuthToken(token);
    if (!tokenPayload) {
      return withCors(
        Response.json(
          formatErrorResponse("UNAUTHORIZED", "Token de autenticação inválido ou expirado."),
          { status: 401 }
        )
      );
    }

    const userId = tokenPayload.sub;

    // /v1/me
    if (method === "GET" && path === "/v1/me") {
      return withCors(await handleMe(userId));
    }

    // /v1/usuarios/push-token
    if (method === "POST" && path === "/v1/usuarios/push-token") {
      return withCors(await handlePostPushToken(req, userId));
    }

    // /v1/residencias
    if (method === "GET" && path === "/v1/residencias") {
      return withCors(await handleGetMinhasResidencias(userId));
    }
    if (method === "POST" && path === "/v1/residencias") {
      return withCors(await handlePostResidencia(req, userId));
    }

    // Match /v1/residencias/:id/convites
    const matchConvites = path.match(/^\/v1\/residencias\/([^/]+)\/convites$/);
    if (matchConvites?.[1] && method === "POST") {
      return withCors(await handlePostConvite(req, matchConvites[1], userId));
    }

    // Match /v1/convites/:id
    const matchPatchConvite = path.match(/^\/v1\/convites\/([^/]+)$/);
    if (matchPatchConvite?.[1] && method === "PATCH") {
      return withCors(await handlePatchConvite(req, matchPatchConvite[1], userId));
    }

    // Match /v1/residencias/:id/moradores
    const matchMoradores = path.match(/^\/v1\/residencias\/([^/]+)\/moradores$/);
    if (matchMoradores?.[1] && method === "POST") {
      return withCors(await handlePostMorador(req, matchMoradores[1]));
    }

    // Match /v1/residencias/:id/dispositivos/parear
    const matchParear = path.match(/^\/v1\/residencias\/([^/]+)\/dispositivos\/parear$/);
    if (matchParear?.[1] && method === "POST") {
      return withCors(await handlePostPareamento(req, matchParear[1]));
    }

    // Match /v1/residencias/:id/dispositivos
    const matchListDispositivos = path.match(/^\/v1\/residencias\/([^/]+)\/dispositivos$/);
    if (matchListDispositivos?.[1] && method === "GET") {
      return withCors(await handleListDispositivos(matchListDispositivos[1]));
    }

    // Match /v1/dispositivos/:id/comando
    const matchComando = path.match(/^\/v1\/dispositivos\/([^/]+)\/comando$/);
    if (matchComando?.[1] && method === "POST") {
      return withCors(await handlePostComando(req, matchComando[1]));
    }

    // Match /v1/dispositivos/:id/eventos
    const matchEventos = path.match(/^\/v1\/dispositivos\/([^/]+)\/eventos$/);
    if (matchEventos?.[1] && method === "GET") {
      return withCors(await handleListEventosDispositivo(matchEventos[1]));
    }

    // Match /v1/residencias/:id/regras
    const matchRegras = path.match(/^\/v1\/residencias\/([^/]+)\/regras$/);
    if (matchRegras?.[1] && method === "GET") {
      return withCors(await handleListRegras(matchRegras[1]));
    }
    if (matchRegras?.[1] && method === "POST") {
      return withCors(await handlePostRegra(req, matchRegras[1]));
    }

    // Match /v1/residencias/:id/alertas
    const matchAlertas = path.match(/^\/v1\/residencias\/([^/]+)\/alertas$/);
    if (matchAlertas?.[1] && method === "GET") {
      return withCors(await handleListAlertas(matchAlertas[1]));
    }

    // Match /v1/alertas/:id
    const matchPatchAlerta = path.match(/^\/v1\/alertas\/([^/]+)$/);
    if (matchPatchAlerta?.[1] && method === "PATCH") {
      return withCors(await handlePatchAlerta(req, matchPatchAlerta[1], userId));
    }

    // Match /v1/residencias/:id/sos
    const matchPostSOS = path.match(/^\/v1\/residencias\/([^/]+)\/sos$/);
    if (matchPostSOS?.[1] && method === "POST") {
      return withCors(await handlePostSOS(req, matchPostSOS[1]));
    }

    // Match /v1/sos/:id
    const matchPatchSOS = path.match(/^\/v1\/sos\/([^/]+)$/);
    if (matchPatchSOS?.[1] && method === "PATCH") {
      return withCors(await handlePatchSOS(req, matchPatchSOS[1]));
    }

    // /v1/notificacoes
    if (method === "GET" && path === "/v1/notificacoes") {
      return withCors(await handleListNotificacoes(userId));
    }

    // Match /v1/notificacoes/:id
    const matchPatchNotificacao = path.match(/^\/v1\/notificacoes\/([^/]+)$/);
    if (matchPatchNotificacao?.[1] && method === "PATCH") {
      return withCors(await handlePatchNotificacao(req, matchPatchNotificacao[1], userId));
    }

    return withCors(
      Response.json(
        formatErrorResponse("NOT_FOUND", `Rota ${method} ${path} não encontrada.`),
        { status: 404 }
      )
    );
  } catch (err) {
    console.error("Erro não tratado na requisição:", err);
    return withCors(
      Response.json(
        formatErrorResponse("INTERNAL_ERROR", "Erro interno do servidor."),
        { status: 500 }
      )
    );
  }
}
