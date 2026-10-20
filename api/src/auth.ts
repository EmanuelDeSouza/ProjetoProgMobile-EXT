import { SignJWT, jwtVerify } from "jose";
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

export async function hashPassword(password: string): Promise<string> {
  if (typeof Bun !== "undefined" && Bun.password) {
    return Bun.password.hash(password, { algorithm: "bcrypt", cost: 10 });
  }
  const encoder = new TextEncoder();
  const data = encoder.encode(password + config.JWT_SECRET);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (typeof Bun !== "undefined" && Bun.password && hash.startsWith("$2")) {
    return Bun.password.verify(password, hash);
  }
  const calculated = await hashPassword(password);
  return calculated === hash;
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
    return payload as unknown as TokenPayload;
  } catch {
    return null;
  }
}
