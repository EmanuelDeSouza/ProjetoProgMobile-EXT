export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string[]>;
  };
}

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string[]>
  ) {
    super(message);
    this.name = "HttpError";
  }

  toResponse(): Response {
    const body: ApiErrorBody = {
      error: {
        code: this.code,
        message: this.message,
        ...(this.fields ? { fields: this.fields } : {}),
      },
    };

    return new Response(JSON.stringify(body), {
      status: this.statusCode,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export class BadRequestError extends HttpError {
  constructor(message = "Requisição inválida", fields?: Record<string, string[]>) {
    super(400, "BAD_REQUEST", message, fields);
  }
}

export class ValidationError extends HttpError {
  constructor(message = "Dados inválidos", fields?: Record<string, string[]>) {
    super(400, "VALIDATION_ERROR", message, fields);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = "Credenciais inválidas") {
    super(401, "UNAUTHORIZED", message);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = "Acesso negado") {
    super(403, "FORBIDDEN", message);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = "Recurso não encontrado") {
    super(404, "NOT_FOUND", message);
  }
}

export class ServiceUnavailableError extends HttpError {
  constructor(message = "Serviço temporariamente indisponível") {
    super(503, "SERVICE_UNAVAILABLE", message);
  }
}

export class TooManyRequestsError extends HttpError {
  constructor(message = "Muitas tentativas. Bloqueado temporariamente.") {
    super(429, "TOO_MANY_REQUESTS", message);
  }
}

