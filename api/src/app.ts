import { z } from "zod";
import { config } from "./config";
import {
  HttpError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
  TooManyRequestsError,
} from "./errors";
import {
  hashPassword,
  verifyPassword,
  createCuidadorToken,
  createMoradorToken,
  getAuthenticatedCuidador,
} from "./auth";
import type {
  AuthRepository,
  ResidenciaRepository,
  MoradorRepository,
} from "./repositories/types";
import {
  InMemoryAuthRepository,
  InMemoryResidenciaRepository,
  InMemoryMoradorRepository,
} from "./repositories/in-memory";
import {
  DrizzleAuthRepository,
  DrizzleResidenciaRepository,
  DrizzleMoradorRepository,
} from "./repositories/drizzle";
import { getDb } from "./db";
import { checkSystemHealth, type HealthStatus } from "./services/health";

export interface AppOptions {
  authRepo?: AuthRepository;
  residenciaRepo?: ResidenciaRepository;
  moradorRepo?: MoradorRepository;
  jwtSecret?: string;
  checkHealth?: () => Promise<HealthStatus>;
}


export const authRequestSchema = z.discriminatedUnion("metodo", [
  z.object({
    metodo: z.literal("senha"),
    email: z.string().email("E-mail inválido"),
    senha: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
    nome: z.string().optional(),
  }),
  z.object({
    metodo: z.literal("google"),
    idToken: z.string().min(1, "idToken é obrigatório para metodo google"),
    email: z.string().email("E-mail inválido").optional(),
    nome: z.string().optional(),
  }),
]);

export const createResidenciaSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  enderecoCurto: z.string().optional().nullable(),
});

export const createMoradorSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  pin: z.string().regex(/^[0-9]{4}$/, "PIN deve ter exatamente 4 dígitos numéricos"),
});

export const loginPinSchema = z.object({
  moradorId: z.string().min(1, "moradorId é obrigatório"),
  pin: z.string().min(1, "PIN é obrigatório"),
});


function formatZodErrors(error: z.ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "body";
    if (!fields[key]) {
      fields[key] = [];
    }
    fields[key].push(issue.message);
  }
  return fields;
}

export function createApp(options: AppOptions = {}) {
  const isTest = process.env.NODE_ENV === "test" || Boolean(process.env.BUN_TEST);
  const jwtSecret = options.jwtSecret ?? config.JWT_SECRET;
  const authRepo =
    options.authRepo ??
    (isTest ? new InMemoryAuthRepository() : new DrizzleAuthRepository(getDb()));
  const residenciaRepo =
    options.residenciaRepo ??
    (isTest ? new InMemoryResidenciaRepository() : new DrizzleResidenciaRepository(getDb()));
  const moradorRepo =
    options.moradorRepo ??
    (isTest ? new InMemoryMoradorRepository() : new DrizzleMoradorRepository(getDb()));
  const checkHealth = options.checkHealth ?? checkSystemHealth;


  async function handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    // CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    try {
      // GET /v1/health
      if (method === "GET" && (path === "/v1/health" || path === "/health")) {
        const health = await checkHealth();
        if (health.postgres && health.mqtt) {
          return Response.json({ status: "ok" }, { status: 200 });
        }
        throw new ServiceUnavailableError(
          "Serviço degradado: Postgres ou Mosquitto inacessível"
        );
      }

      // POST /v1/auth
      if (method === "POST" && (path === "/v1/auth" || path === "/auth")) {
        let jsonBody: unknown;
        try {
          jsonBody = await request.json();
        } catch {
          throw new ValidationError("JSON do corpo da requisição inválido");
        }

        const parsed = authRequestSchema.safeParse(jsonBody);
        if (!parsed.success) {
          throw new ValidationError("Dados de autenticação inválidos", formatZodErrors(parsed.error));
        }

        const data = parsed.data;

        if (data.metodo === "senha") {
          let user = await authRepo.findByEmail(data.email);

          if (!user) {
            // Se usuário não existe, cadastra como novo cuidador
            const senhaHash = await hashPassword(data.senha);
            const nome = data.nome?.trim() || data.email.split("@")[0] || "Cuidador";
            user = await authRepo.create({
              nome,
              email: data.email,
              senhaHash,
            });
          } else {
            // Verifica senha
            if (!user.senhaHash) {
              throw new UnauthorizedError("Credenciais inválidas");
            }
            const isMatch = await verifyPassword(data.senha, user.senhaHash);
            if (!isMatch) {
              throw new UnauthorizedError("Credenciais inválidas");
            }
          }

          const token = await createCuidadorToken(user, jwtSecret);
          return Response.json({
            token,
            usuario: {
              id: user.id,
              nome: user.nome,
              email: user.email,
            },
          });
        }

        if (data.metodo === "google") {
          // Google Sign-In para cuidador
          const email = data.email ?? "google.user@exemplo.com";
          let user = await authRepo.findByEmail(email);
          if (!user) {
            const nome = data.nome?.trim() || email.split("@")[0] || "Cuidador Google";
            user = await authRepo.create({
              nome,
              email,
              senhaHash: null,
            });
          }

          const token = await createCuidadorToken(user, jwtSecret);
          return Response.json({
            token,
            usuario: {
              id: user.id,
              nome: user.nome,
              email: user.email,
            },
          });
        }
      }

      // GET /v1/me
      if (method === "GET" && (path === "/v1/me" || path === "/me")) {
        const payload = await getAuthenticatedCuidador(request, jwtSecret);
        const user = await authRepo.findById(payload.sub);
        if (!user) {
          throw new UnauthorizedError("Usuário não encontrado");
        }

        return Response.json({
          id: user.id,
          nome: user.nome,
          email: user.email,
        });
      }

      // GET /v1/residencias
      if (method === "GET" && (path === "/v1/residencias" || path === "/residencias")) {
        const payload = await getAuthenticatedCuidador(request, jwtSecret);
        const list = await residenciaRepo.listByUsuarioId(payload.sub);
        return Response.json(list);
      }

      // POST /v1/residencias
      if (method === "POST" && (path === "/v1/residencias" || path === "/residencias")) {
        const payload = await getAuthenticatedCuidador(request, jwtSecret);
        let jsonBody: unknown;
        try {
          jsonBody = await request.json();
        } catch {
          throw new ValidationError("JSON do corpo da requisição inválido");
        }

        const parsed = createResidenciaSchema.safeParse(jsonBody);
        if (!parsed.success) {
          throw new ValidationError("Dados da residência inválidos", formatZodErrors(parsed.error));
        }

        const residencia = await residenciaRepo.createResidencia(
          {
            nome: parsed.data.nome,
            enderecoCurto: parsed.data.enderecoCurto ?? null,
          },
          payload.sub
        );

        return Response.json(
          {
            id: residencia.id,
            nome: residencia.nome,
            enderecoCurto: residencia.enderecoCurto,
          },
          { status: 201 }
        );
      }

      // POST /v1/residencias/{id}/moradores
      const postMoradorMatch = path.match(/^\/(?:v1\/)?residencias\/([^/]+)\/moradores\/?$/);
      if (method === "POST" && postMoradorMatch) {
        const residenciaId = postMoradorMatch[1];
        if (!residenciaId) {
          throw new NotFoundError("Residência não encontrada");
        }

        const payload = await getAuthenticatedCuidador(request, jwtSecret);
        const isMembro = await residenciaRepo.isMembro(residenciaId, payload.sub);
        if (!isMembro) {
          throw new ForbiddenError("Acesso negado para esta residência");
        }

        let jsonBody: unknown;
        try {
          jsonBody = await request.json();
        } catch {
          throw new ValidationError("JSON do corpo da requisição inválido");
        }

        const parsed = createMoradorSchema.safeParse(jsonBody);
        if (!parsed.success) {
          throw new ValidationError("Dados do morador inválidos", formatZodErrors(parsed.error));
        }

        const pinHash = await hashPassword(parsed.data.pin);
        const morador = await moradorRepo.createMorador({
          residenciaId,
          nome: parsed.data.nome,
          pinHash,
        });

        return Response.json(
          {
            id: morador.id,
            nome: morador.nome,
            residenciaId: morador.residenciaId,
          },
          { status: 201 }
        );
      }

      // POST /v1/moradores/login-pin
      if (
        method === "POST" &&
        (path === "/v1/moradores/login-pin" || path === "/moradores/login-pin")
      ) {
        let jsonBody: unknown;
        try {
          jsonBody = await request.json();
        } catch {
          throw new ValidationError("JSON do corpo da requisição inválido");
        }

        const parsed = loginPinSchema.safeParse(jsonBody);
        if (!parsed.success) {
          throw new ValidationError("Dados de login inválidos", formatZodErrors(parsed.error));
        }

        const morador = await moradorRepo.findById(parsed.data.moradorId);
        if (!morador) {
          throw new UnauthorizedError("Credenciais inválidas");
        }

        if (morador.bloqueadoAte && new Date(morador.bloqueadoAte) > new Date()) {
          throw new TooManyRequestsError("Bloqueado temporariamente por excesso de tentativas");
        }

        const isMatch = await verifyPassword(parsed.data.pin, morador.pinHash);
        if (!isMatch) {
          const tentativas = morador.tentativasErradas + 1;
          const bloqueadoAte = tentativas >= 5 ? new Date(Date.now() + 5 * 60 * 1000) : null;
          await moradorRepo.updateTentativas(morador.id, tentativas, bloqueadoAte);
          throw new UnauthorizedError("Credenciais inválidas");
        }

        await moradorRepo.resetTentativas(morador.id);
        const token = await createMoradorToken(morador, jwtSecret);

        return Response.json({
          token,
          morador: {
            id: morador.id,
            nome: morador.nome,
            residenciaId: morador.residenciaId,
          },
        });
      }

      // Rota não encontrada
      return Response.json(
        {
          error: {
            code: "NOT_FOUND",
            message: `Rota ${method} ${path} não encontrada`,
          },
        },
        { status: 404 }
      );
    } catch (err: unknown) {
      if (err instanceof HttpError) {
        return err.toResponse();
      }

      const errorMessage = err instanceof Error ? err.message : "Erro desconhecido";
      return Response.json(
        {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Erro interno do servidor",
            fields: { details: [errorMessage] },
          },
        },
        { status: 500 }
      );
    }
  }

  return {
    fetch: handleRequest,
  };
}
