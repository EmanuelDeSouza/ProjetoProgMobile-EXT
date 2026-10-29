import { SignJWT, jwtVerify, createRemoteJWKSet } from "jose";
import { z } from "zod";
import { config } from "./config";

const secretKey = new TextEncoder().encode(config.JWT_SECRET);

export interface TokenPayloadCuidador {
  sub: string;
  email: string;
  papel: "cuidador";
}

export interface TokenPayloadMorador {
  sub: string;
  residenciaId: string;
  papel: "morador";
}

export type TokenPayload = TokenPayloadCuidador | TokenPayloadMorador;

const tokenSchema = z.discriminatedUnion("papel", [
  z.object({ papel: z.literal("cuidador"), sub: z.string().uuid(), email: z.string() }),
  z.object({ papel: z.literal("morador"), sub: z.string().uuid(), residenciaId: z.string().uuid() }),
]);

// bcrypt via Bun.password: lento de propósito (dificulta força bruta em hash vazado).
export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: "bcrypt", cost: 10 });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!hash.startsWith("$2")) return false;
  return Bun.password.verify(password, hash);
}

export async function hashPin(pin: string): Promise<string> {
  return hashPassword(`pin:${pin}`);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return verifyPassword(`pin:${pin}`, hash);
}

export async function signToken(payload: TokenPayload, expiresIn = "7d"): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey);
}

export async function verifyAuthToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    const parsed = tokenSchema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// ---------- Google Sign-In (RF-01) ----------

const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

const googleClaims = z.object({
  email: z.string().email(),
  email_verified: z.boolean(),
  name: z.string().optional(),
});

export type GoogleIdentidade = { email: string; nome: string };

/**
 * Valida o ID token do Google: assinatura (JWKS do Google), emissor, audience
 * (nossos client ids) e e-mail verificado. Retorna null se qualquer coisa falhar.
 */
export async function verificarGoogleIdToken(idToken: string): Promise<GoogleIdentidade | null> {
  if (config.GOOGLE_CLIENT_IDS.length === 0) return null;
  try {
    const { payload } = await jwtVerify(idToken, googleJwks, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: config.GOOGLE_CLIENT_IDS,
    });
    const claims = googleClaims.safeParse(payload);
    if (!claims.success || !claims.data.email_verified) return null;
    return { email: claims.data.email.toLowerCase(), nome: claims.data.name ?? claims.data.email.split("@")[0]! };
  } catch {
    return null;
  }
}
