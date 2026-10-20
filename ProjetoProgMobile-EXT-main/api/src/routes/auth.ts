import { eq } from "drizzle-orm";
import { db } from "../db";
import { usuarios } from "../../db/schema";
import { postAuthSchema, formatErrorResponse, formatZodError } from "../schemas";
import { hashPassword, verifyPassword, signToken, type TokenPayloadCuidador } from "../auth";

export async function handleAuth(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      formatErrorResponse("INVALID_JSON", "O corpo da requisição deve ser um JSON válido."),
      { status: 400 }
    );
  }

  const parsed = postAuthSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(formatZodError(parsed.error), { status: 400 });
  }

  const { metodo, email, senha, idToken } = parsed.data;

  if (metodo === "senha" && email && senha) {
    const [user] = await db.select().from(usuarios).where(eq(usuarios.email, email.toLowerCase()));

    if (!user) {
      // For initial setup/caregiver convenience, or if user doesn't exist yet, we create user
      // or if checking password:
      const hashedPassword = await hashPassword(senha);
      const [newUser] = await db
        .insert(usuarios)
        .values({
          nome: email.split("@")[0] || "Cuidador",
          email: email.toLowerCase(),
          senhaHash: hashedPassword,
        })
        .returning();

      if (!newUser) {
        return Response.json(
          formatErrorResponse("INTERNAL_ERROR", "Falha ao criar usuário."),
          { status: 500 }
        );
      }

      const tokenPayload: TokenPayloadCuidador = {
        sub: newUser.id,
        email: newUser.email,
        papel: "cuidador",
      };
      const token = await signToken(tokenPayload);

      return Response.json({
        token,
        usuario: {
          id: newUser.id,
          nome: newUser.nome,
          email: newUser.email,
        },
      });
    }

    if (!user.senhaHash) {
      return Response.json(
        formatErrorResponse("INVALID_CREDENTIALS", "Credenciais inválidas."),
        { status: 401 }
      );
    }

    const valid = await verifyPassword(senha, user.senhaHash);
    if (!valid) {
      return Response.json(
        formatErrorResponse("INVALID_CREDENTIALS", "Credenciais inválidas."),
        { status: 401 }
      );
    }

    const tokenPayload: TokenPayloadCuidador = {
      sub: user.id,
      email: user.email,
      papel: "cuidador",
    };
    const token = await signToken(tokenPayload);

    return Response.json({
      token,
      usuario: {
        id: user.id,
        nome: user.nome,
        email: user.email,
      },
    });
  }

  if (metodo === "google" && idToken) {
    // In production, verify Google OAuth token; for V1, extract email or mock decode
    const simulatedEmail = `google_${idToken.slice(0, 8)}@cuidalar.app`;
    let [user] = await db.select().from(usuarios).where(eq(usuarios.email, simulatedEmail));

    if (!user) {
      [user] = await db
        .insert(usuarios)
        .values({
          nome: "Cuidador Google",
          email: simulatedEmail,
        })
        .returning();
    }

    if (!user) {
      return Response.json(
        formatErrorResponse("INTERNAL_ERROR", "Falha ao obter dados do usuário."),
        { status: 500 }
      );
    }

    const tokenPayload: TokenPayloadCuidador = {
      sub: user.id,
      email: user.email,
      papel: "cuidador",
    };
    const token = await signToken(tokenPayload);

    return Response.json({
      token,
      usuario: {
        id: user.id,
        nome: user.nome,
        email: user.email,
      },
    });
  }

  return Response.json(
    formatErrorResponse("INVALID_CREDENTIALS", "Credenciais inválidas."),
    { status: 401 }
  );
}

export async function handleMe(userId: string): Promise<Response> {
  const [user] = await db.select().from(usuarios).where(eq(usuarios.id, userId));
  if (!user) {
    return Response.json(
      formatErrorResponse("USER_NOT_FOUND", "Usuário não encontrado."),
      { status: 401 }
    );
  }

  return Response.json({
    id: user.id,
    nome: user.nome,
    email: user.email,
  });
}
