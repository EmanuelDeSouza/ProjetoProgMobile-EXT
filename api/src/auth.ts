import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { UnauthorizedError } from "./errors";

export interface TokenCuidadorPayload extends JWTPayload {
  sub: string;
  email: string;
  papel: "cuidador";
}

export interface TokenMoradorPayload extends JWTPayload {
  sub: string;
  moradorId: string;
  residenciaId: string;
  papel: "morador";
}

export type AuthTokenPayload = TokenCuidadorPayload | TokenMoradorPayload;

export async function hashPassword(password: string): Promise<string> {
  return await Bun.password.hash(password, {
    algorithm: "bcrypt",
    cost: 10,
  });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await Bun.password.verify(password, hash);
}

export async function createCuidadorToken(
  user: { id: string; email: string },
  jwtSecret: string
): Promise<string> {
  const secretKey = new TextEncoder().encode(jwtSecret);
  return await new SignJWT({
    email: user.email,
    papel: "cuidador",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey);
}

export async function createMoradorToken(
  morador: { id: string; residenciaId: string },
  jwtSecret: string
): Promise<string> {
  const secretKey = new TextEncoder().encode(jwtSecret);
  return await new SignJWT({
    moradorId: morador.id,
    residenciaId: morador.residenciaId,
    papel: "morador",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(morador.id)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey);
}

export async function verifyToken(
  token: string,
  jwtSecret: string
): Promise<AuthTokenPayload> {
  try {
    const secretKey = new TextEncoder().encode(jwtSecret);
    const { payload } = await jwtVerify(token, secretKey);
    return payload as unknown as AuthTokenPayload;
  } catch {
    throw new UnauthorizedError("Token inválido ou expirado");
  }
}

export async function getAuthenticatedCuidador(
  request: Request,
  jwtSecret: string
): Promise<TokenCuidadorPayload> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new UnauthorizedError("Cabeçalho de autorização ausente ou em formato inválido");
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    throw new UnauthorizedError("Token não fornecido");
  }

  const payload = await verifyToken(token, jwtSecret);
  if (payload.papel !== "cuidador" || !payload.sub) {
    throw new UnauthorizedError("Token não autorizado para cuidador");
  }

  return payload as TokenCuidadorPayload;
}
