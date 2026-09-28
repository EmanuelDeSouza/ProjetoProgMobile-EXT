import { z } from "zod";
import { config } from "./config";
import {
  HttpError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  BadRequestError,
  ServiceUnavailableError,
  TooManyRequestsError,
} from "./errors";
import {
  hashPassword,
  verifyPassword,
  createCuidadorToken,
  createMoradorToken,
  getAuthenticatedCuidador,
  verifyToken,
} from "./auth";
import type {
  AuthRepository,
  ResidenciaRepository,
  MoradorRepository,
  DispositivoRepository,
  RegraAlertaRepository,
  AlertaRepository,
  SOSRepository,
  EventoDispositivoRepository,
  TipoDispositivo,
} from "./repositories/types";
import {
  InMemoryAuthRepository,
  InMemoryResidenciaRepository,
  InMemoryMoradorRepository,
  InMemoryDispositivoRepository,
  InMemoryRegraAlertaRepository,
  InMemoryAlertaRepository,
  InMemorySOSRepository,
  InMemoryEventoDispositivoRepository,
} from "./repositories/in-memory";
import {
  DrizzleAuthRepository,
  DrizzleResidenciaRepository,
  DrizzleMoradorRepository,
  DrizzleDispositivoRepository,
  DrizzleRegraAlertaRepository,
  DrizzleAlertaRepository,
  DrizzleSOSRepository,
  DrizzleEventoDispositivoRepository,
} from "./repositories/drizzle";
import { getDb } from "./db";
import { checkSystemHealth, type HealthStatus } from "./services/health";

export interface AppOptions {
  authRepo?: AuthRepository;
  residenciaRepo?: ResidenciaRepository;
  moradorRepo?: MoradorRepository;
  dispositivoRepo?: DispositivoRepository;
  regraRepo?: RegraAlertaRepository;
  alertaRepo?: AlertaRepository;
  sosRepo?: SOSRepository;
  eventoRepo?: EventoDispositivoRepository;
  publishMqtt?: (topic: string, message: string) => Promise<void>;
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

export const parearDispositivoSchema = z.object({
  codigo: z.string().min(1, "Código é obrigatório"),
  tipo: z.enum(
    [
      "sensor_presenca",
      "sensor_contato",
      "sensor_temperatura",
      "atuador_tomada",
      "botao_sos",
    ],
    {
      errorMap: () => ({ message: "Tipo de dispositivo não suportado na V1" }),
    }
  ),
  nome: z.string().min(1, "Nome é obrigatório"),
  comodo: z.string().min(1, "Cômodo é obrigatório"),
});

export const comandoDispositivoSchema = z.object({
  comando: z.string().min(1, "Comando é obrigatório"),
  valor: z.record(z.unknown()).default({}),
});

export const postSOSSchema = z.object({
  origem: z.enum(["app", "botao_fisico"]).default("app"),
});

export const patchSOSSchema = z.object({
  status: z.enum(["cancelado_pelo_morador", "reconhecido"]),
});

export const postRegraAlertaSchema = z.object({
  dispositivoId: z.string().nullable().optional(),
  condicao: z.enum([
    "sem_movimento_por",
    "contato_aberto_apos_horario",
    "temperatura_fora_da_faixa",
    "dispositivo_offline",
  ]),
  parametros: z.record(z.unknown()).default({}),
  ativa: z.boolean().default(true),
});

export const patchAlertaSchema = z.object({
  status: z.literal("reconhecido"),
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
  const db = !isTest ? getDb() : null;

  const authRepo =
    options.authRepo ??
    (isTest ? new InMemoryAuthRepository() : new DrizzleAuthRepository(db!));
  const residenciaRepo =
    options.residenciaRepo ??
    (isTest ? new InMemoryResidenciaRepository() : new DrizzleResidenciaRepository(db!));
  const moradorRepo =
    options.moradorRepo ??
    (isTest ? new InMemoryMoradorRepository() : new DrizzleMoradorRepository(db!));
  const dispositivoRepo =
    options.dispositivoRepo ??
    (isTest ? new InMemoryDispositivoRepository() : new DrizzleDispositivoRepository(db!));
  const regraRepo =
    options.regraRepo ??
    (isTest ? new InMemoryRegraAlertaRepository() : new DrizzleRegraAlertaRepository(db!));
  const alertaRepo =
    options.alertaRepo ??
    (isTest ? new InMemoryAlertaRepository() : new DrizzleAlertaRepository(db!));
  const sosRepo =
    options.sosRepo ??
    (isTest ? new InMemorySOSRepository() : new DrizzleSOSRepository(db!));
  const checkHealth = options.checkHealth ?? checkSystemHealth;
  const publishMqtt =
    options.publishMqtt ??
    (async () => {
      // no-op default fallback if broker not active
    });

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
            const senhaHash = await hashPassword(data.senha);
            const nome = data.nome?.trim() || data.email.split("@")[0] || "Cuidador";
            user = await authRepo.create({
              nome,
              email: data.email,
              senhaHash,
            });
          } else {
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

      // POST /v1/residencias/{id}/dispositivos/parear (RF-07)
      const postParearMatch = path.match(/^\/(?:v1\/)?residencias\/([^/]+)\/dispositivos\/parear\/?$/);
      if (method === "POST" && postParearMatch) {
        const residenciaId = postParearMatch[1];
        if (!residenciaId) throw new NotFoundError("Residência não encontrada");

        const payload = await getAuthenticatedCuidador(request, jwtSecret);
        const isMembro = await residenciaRepo.isMembro(residenciaId, payload.sub);
        if (!isMembro) throw new ForbiddenError("Acesso negado para esta residência");

        let jsonBody: unknown;
        try {
          jsonBody = await request.json();
        } catch {
          throw new ValidationError("JSON do corpo da requisição inválido");
        }

        const parsed = parearDispositivoSchema.safeParse(jsonBody);
        if (!parsed.success) {
          throw new ValidationError("Dados de pareamento inválidos", formatZodErrors(parsed.error));
        }

        const dispositivo = await dispositivoRepo.createDispositivo({
          residenciaId,
          tipo: parsed.data.tipo as TipoDispositivo,
          nome: parsed.data.nome,
          comodo: parsed.data.comodo,
        });

        return Response.json(
          {
            id: dispositivo.id,
            tipo: dispositivo.tipo,
            nome: dispositivo.nome,
            comodo: dispositivo.comodo,
            estadoAtual: dispositivo.estadoAtual,
            status: dispositivo.status,
            ultimoContatoEm: dispositivo.ultimoContatoEm,
          },
          { status: 201 }
        );
      }

      // GET /v1/residencias/{id}/dispositivos (RF-08, RF-09)
      const getDispositivosMatch = path.match(/^\/(?:v1\/)?residencias\/([^/]+)\/dispositivos\/?$/);
      if (method === "GET" && getDispositivosMatch) {
        const residenciaId = getDispositivosMatch[1];
        if (!residenciaId) throw new NotFoundError("Residência não encontrada");

        // Cuidador ou morador autenticado pode listar
        const authHeader = request.headers.get("Authorization");
        if (!authHeader) throw new UnauthorizedError("Token ausente");
        const token = authHeader.replace(/^Bearer\s+/, "");
        await verifyToken(token, jwtSecret);

        const list = await dispositivoRepo.listByResidenciaId(residenciaId);
        return Response.json(list);
      }

      // POST /v1/dispositivos/{id}/comando (RF-10)
      const postComandoMatch = path.match(/^\/(?:v1\/)?dispositivos\/([^/]+)\/comando\/?$/);
      if (method === "POST" && postComandoMatch) {
        const dispositivoId = postComandoMatch[1];
        if (!dispositivoId) throw new NotFoundError("Dispositivo não encontrado");

        const authHeader = request.headers.get("Authorization");
        if (!authHeader) throw new UnauthorizedError("Token ausente");
        const token = authHeader.replace(/^Bearer\s+/, "");
        await verifyToken(token, jwtSecret);

        const dispositivo = await dispositivoRepo.findById(dispositivoId);
        if (!dispositivo) {
          throw new NotFoundError("Dispositivo não encontrado");
        }

        // Regra RF-10: comando para dispositivo offline é recusado antes de sair do app
        if (dispositivo.status === "offline") {
          throw new BadRequestError("Dispositivo offline. Não é possível enviar comando.");
        }

        let jsonBody: unknown;
        try {
          jsonBody = await request.json();
        } catch {
          throw new ValidationError("JSON do corpo da requisição inválido");
        }

        const parsed = comandoDispositivoSchema.safeParse(jsonBody);
        if (!parsed.success) {
          throw new ValidationError("Dados do comando inválidos", formatZodErrors(parsed.error));
        }

        // Publica no MQTT topic: cuidalar/{residencia_id}/{dispositivo_id}/comando
        const topic = `cuidalar/${dispositivo.residenciaId}/${dispositivo.id}/comando`;
        await publishMqtt(topic, JSON.stringify(parsed.data));

        return Response.json({ status: "comando_enviado" }, { status: 200 });
      }

      // POST /v1/residencias/{id}/sos (RF-15)
      const postSosMatch = path.match(/^\/(?:v1\/)?residencias\/([^/]+)\/sos\/?$/);
      if (method === "POST" && postSosMatch) {
        const residenciaId = postSosMatch[1];
        if (!residenciaId) throw new NotFoundError("Residência não encontrada");

        const authHeader = request.headers.get("Authorization");
        if (!authHeader) throw new UnauthorizedError("Token ausente");
        const token = authHeader.replace(/^Bearer\s+/, "");
        const authPayload = await verifyToken(token, jwtSecret);

        let jsonBody: unknown = {};
        try {
          jsonBody = await request.json();
        } catch {
          jsonBody = {};
        }

        const parsed = postSOSSchema.safeParse(jsonBody);
        const origem = parsed.success ? parsed.data.origem : "app";
        const moradorId = authPayload.papel === "morador" ? authPayload.moradorId : null;

        const sos = await sosRepo.createSOS({
          residenciaId,
          moradorId,
          origem,
        });

        // Cria alerta crítico imediato
        await alertaRepo.createAlerta({
          residenciaId,
          dispositivoId: null,
          regraId: null,
          severidade: "alta",
        });

        return Response.json(sos, { status: 201 });
      }

      // PATCH /v1/sos/{id} (RF-16)
      const patchSosMatch = path.match(/^\/(?:v1\/)?sos\/([^/]+)\/?$/);
      if (method === "PATCH" && patchSosMatch) {
        const sosId = patchSosMatch[1];
        if (!sosId) throw new NotFoundError("SOS não encontrado");

        const authHeader = request.headers.get("Authorization");
        if (!authHeader) throw new UnauthorizedError("Token ausente");
        const token = authHeader.replace(/^Bearer\s+/, "");
        await verifyToken(token, jwtSecret);

        let jsonBody: unknown;
        try {
          jsonBody = await request.json();
        } catch {
          throw new ValidationError("JSON do corpo da requisição inválido");
        }

        const parsed = patchSOSSchema.safeParse(jsonBody);
        if (!parsed.success) {
          throw new ValidationError("Dados de atualização de SOS inválidos", formatZodErrors(parsed.error));
        }

        const updated = await sosRepo.updateStatus(sosId, parsed.data.status);
        if (!updated) {
          throw new NotFoundError("SOS não encontrado");
        }

        return Response.json(updated, { status: 200 });
      }

      // GET /v1/residencias/{id}/regras (RF-12)
      const getRegrasMatch = path.match(/^\/(?:v1\/)?residencias\/([^/]+)\/regras\/?$/);
      if (method === "GET" && getRegrasMatch) {
        const residenciaId = getRegrasMatch[1];
        if (!residenciaId) throw new NotFoundError("Residência não encontrada");

        const payload = await getAuthenticatedCuidador(request, jwtSecret);
        const isMembro = await residenciaRepo.isMembro(residenciaId, payload.sub);
        if (!isMembro) throw new ForbiddenError("Acesso negado");

        const regras = await regraRepo.listByResidenciaId(residenciaId);
        return Response.json(regras);
      }

      // POST /v1/residencias/{id}/regras (RF-12)
      if (method === "POST" && getRegrasMatch) {
        const residenciaId = getRegrasMatch[1];
        if (!residenciaId) throw new NotFoundError("Residência não encontrada");

        const payload = await getAuthenticatedCuidador(request, jwtSecret);
        const isMembro = await residenciaRepo.isMembro(residenciaId, payload.sub);
        if (!isMembro) throw new ForbiddenError("Acesso negado");

        let jsonBody: unknown;
        try {
          jsonBody = await request.json();
        } catch {
          throw new ValidationError("JSON inválido");
        }

        const parsed = postRegraAlertaSchema.safeParse(jsonBody);
        if (!parsed.success) {
          throw new ValidationError("Dados da regra inválidos", formatZodErrors(parsed.error));
        }

        const regra = await regraRepo.createRegra({
          residenciaId,
          dispositivoId: parsed.data.dispositivoId,
          condicao: parsed.data.condicao,
          parametros: parsed.data.parametros,
          ativa: parsed.data.ativa,
        });

        return Response.json(regra, { status: 201 });
      }

      // GET /v1/residencias/{id}/alertas (RF-14)
      const getAlertasMatch = path.match(/^\/(?:v1\/)?residencias\/([^/]+)\/alertas\/?$/);
      if (method === "GET" && getAlertasMatch) {
        const residenciaId = getAlertasMatch[1];
        if (!residenciaId) throw new NotFoundError("Residência não encontrada");

        const payload = await getAuthenticatedCuidador(request, jwtSecret);
        const isMembro = await residenciaRepo.isMembro(residenciaId, payload.sub);
        if (!isMembro) throw new ForbiddenError("Acesso negado");

        const alertas = await alertaRepo.listByResidenciaId(residenciaId);
        return Response.json(alertas);
      }

      // PATCH /v1/alertas/{id} (RF-14)
      const patchAlertaMatch = path.match(/^\/(?:v1\/)?alertas\/([^/]+)\/?$/);
      if (method === "PATCH" && patchAlertaMatch) {
        const alertaId = patchAlertaMatch[1];
        if (!alertaId) throw new NotFoundError("Alerta não encontrado");

        const payload = await getAuthenticatedCuidador(request, jwtSecret);

        let jsonBody: unknown;
        try {
          jsonBody = await request.json();
        } catch {
          throw new ValidationError("JSON inválido");
        }

        const parsed = patchAlertaSchema.safeParse(jsonBody);
        if (!parsed.success) {
          throw new ValidationError("Dados de reconhecimento inválidos", formatZodErrors(parsed.error));
        }

        const reconhecido = await alertaRepo.reconhecerAlerta(alertaId, payload.sub);
        if (!reconhecido) {
          throw new NotFoundError("Alerta não encontrado");
        }

        return Response.json(reconhecido, { status: 200 });
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
