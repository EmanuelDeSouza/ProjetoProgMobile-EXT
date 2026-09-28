import { eq, and } from "drizzle-orm";
import type { Database } from "../db";
import { usuarios, residencias, residenciaMembros, moradores } from "../../db/schema";
import type {
  AuthRepository,
  ResidenciaRepository,
  MoradorRepository,
  UsuarioRecord,
  ResidenciaRecord,
  ResidenciaComPapelRecord,
  MoradorRecord,
} from "./types";

export class DrizzleAuthRepository implements AuthRepository {
  constructor(private db: Database) {}

  async findByEmail(email: string): Promise<UsuarioRecord | null> {
    const rows = await this.db
      .select()
      .from(usuarios)
      .where(eq(usuarios.email, email))
      .limit(1);

    const user = rows[0];
    if (!user) return null;

    return {
      id: user.id,
      nome: user.nome,
      email: user.email,
      senhaHash: user.senhaHash,
      createdAt: user.createdAt,
    };
  }

  async findById(id: string): Promise<UsuarioRecord | null> {
    const rows = await this.db
      .select()
      .from(usuarios)
      .where(eq(usuarios.id, id))
      .limit(1);

    const user = rows[0];
    if (!user) return null;

    return {
      id: user.id,
      nome: user.nome,
      email: user.email,
      senhaHash: user.senhaHash,
      createdAt: user.createdAt,
    };
  }

  async create(data: {
    nome: string;
    email: string;
    senhaHash: string | null;
  }): Promise<UsuarioRecord> {
    const [inserted] = await this.db
      .insert(usuarios)
      .values({
        nome: data.nome,
        email: data.email,
        senhaHash: data.senhaHash,
      })
      .returning();

    if (!inserted) {
      throw new Error("Falha ao criar usuário no banco");
    }

    return {
      id: inserted.id,
      nome: inserted.nome,
      email: inserted.email,
      senhaHash: inserted.senhaHash,
      createdAt: inserted.createdAt,
    };
  }
}

export class DrizzleResidenciaRepository implements ResidenciaRepository {
  constructor(private db: Database) {}

  async createResidencia(
    data: { nome: string; enderecoCurto?: string | null },
    usuarioId: string
  ): Promise<ResidenciaRecord> {
    const [inserted] = await this.db
      .insert(residencias)
      .values({
        nome: data.nome,
        enderecoCurto: data.enderecoCurto ?? null,
      })
      .returning();

    if (!inserted) {
      throw new Error("Falha ao criar residência no banco");
    }

    await this.db.insert(residenciaMembros).values({
      residenciaId: inserted.id,
      usuarioId,
      papel: "dono",
    });

    return {
      id: inserted.id,
      nome: inserted.nome,
      enderecoCurto: inserted.enderecoCurto,
      createdAt: inserted.createdAt,
    };
  }

  async listByUsuarioId(usuarioId: string): Promise<ResidenciaComPapelRecord[]> {
    const rows = await this.db
      .select({
        id: residencias.id,
        nome: residencias.nome,
        enderecoCurto: residencias.enderecoCurto,
        papel: residenciaMembros.papel,
      })
      .from(residenciaMembros)
      .innerJoin(residencias, eq(residenciaMembros.residenciaId, residencias.id))
      .where(eq(residenciaMembros.usuarioId, usuarioId));

    return rows.map((r) => ({
      id: r.id,
      nome: r.nome,
      enderecoCurto: r.enderecoCurto,
      papel: r.papel as "dono" | "cuidador",
    }));
  }

  async findById(id: string): Promise<ResidenciaRecord | null> {
    const rows = await this.db
      .select()
      .from(residencias)
      .where(eq(residencias.id, id))
      .limit(1);

    const res = rows[0];
    if (!res) return null;

    return {
      id: res.id,
      nome: res.nome,
      enderecoCurto: res.enderecoCurto,
      createdAt: res.createdAt,
    };
  }

  async isMembro(residenciaId: string, usuarioId: string): Promise<boolean> {
    const rows = await this.db
      .select()
      .from(residenciaMembros)
      .where(
        and(
          eq(residenciaMembros.residenciaId, residenciaId),
          eq(residenciaMembros.usuarioId, usuarioId)
        )
      )
      .limit(1);

    return rows.length > 0;
  }
}

export class DrizzleMoradorRepository implements MoradorRepository {
  constructor(private db: Database) {}

  async createMorador(data: {
    residenciaId: string;
    nome: string;
    pinHash: string;
  }): Promise<MoradorRecord> {
    const [inserted] = await this.db
      .insert(moradores)
      .values({
        residenciaId: data.residenciaId,
        nome: data.nome,
        pinHash: data.pinHash,
      })
      .returning();

    if (!inserted) {
      throw new Error("Falha ao criar morador no banco");
    }

    return {
      id: inserted.id,
      residenciaId: inserted.residenciaId,
      nome: inserted.nome,
      pinHash: inserted.pinHash,
      tentativasErradas: inserted.tentativasErradas,
      bloqueadoAte: inserted.bloqueadoAte,
      createdAt: inserted.createdAt,
    };
  }

  async findById(id: string): Promise<MoradorRecord | null> {
    const rows = await this.db
      .select()
      .from(moradores)
      .where(eq(moradores.id, id))
      .limit(1);

    const m = rows[0];
    if (!m) return null;

    return {
      id: m.id,
      residenciaId: m.residenciaId,
      nome: m.nome,
      pinHash: m.pinHash,
      tentativasErradas: m.tentativasErradas,
      bloqueadoAte: m.bloqueadoAte,
      createdAt: m.createdAt,
    };
  }

  async updateTentativas(
    id: string,
    tentativasErradas: number,
    bloqueadoAte?: Date | null
  ): Promise<void> {
    await this.db
      .update(moradores)
      .set({
        tentativasErradas,
        bloqueadoAte: bloqueadoAte ?? null,
      })
      .where(eq(moradores.id, id));
  }

  async resetTentativas(id: string): Promise<void> {
    await this.db
      .update(moradores)
      .set({
        tentativasErradas: 0,
        bloqueadoAte: null,
      })
      .where(eq(moradores.id, id));
  }
}

