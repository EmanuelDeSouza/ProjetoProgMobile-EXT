import { randomUUID } from "node:crypto";
import type {
  AuthRepository,
  ResidenciaRepository,
  MoradorRepository,
  UsuarioRecord,
  ResidenciaRecord,
  ResidenciaComPapelRecord,
  MoradorRecord,
} from "./types";

export class InMemoryAuthRepository implements AuthRepository {
  private users: Map<string, UsuarioRecord> = new Map();

  async findByEmail(email: string): Promise<UsuarioRecord | null> {
    for (const user of this.users.values()) {
      if (user.email.toLowerCase() === email.toLowerCase()) {
        return user;
      }
    }
    return null;
  }

  async findById(id: string): Promise<UsuarioRecord | null> {
    return this.users.get(id) ?? null;
  }

  async create(data: {
    nome: string;
    email: string;
    senhaHash: string | null;
  }): Promise<UsuarioRecord> {
    const user: UsuarioRecord = {
      id: randomUUID(),
      nome: data.nome,
      email: data.email,
      senhaHash: data.senhaHash,
      createdAt: new Date(),
    };
    this.users.set(user.id, user);
    return user;
  }
}

interface MembroRecord {
  id: string;
  residenciaId: string;
  usuarioId: string;
  papel: "dono" | "cuidador";
  createdAt: Date;
}

export class InMemoryResidenciaRepository implements ResidenciaRepository {
  private residencias: Map<string, ResidenciaRecord> = new Map();
  private membros: MembroRecord[] = [];

  async createResidencia(
    data: { nome: string; enderecoCurto?: string | null },
    usuarioId: string
  ): Promise<ResidenciaRecord> {
    const residencia: ResidenciaRecord = {
      id: randomUUID(),
      nome: data.nome,
      enderecoCurto: data.enderecoCurto ?? null,
      createdAt: new Date(),
    };
    this.residencias.set(residencia.id, residencia);

    this.membros.push({
      id: randomUUID(),
      residenciaId: residencia.id,
      usuarioId,
      papel: "dono",
      createdAt: new Date(),
    });

    return residencia;
  }

  async listByUsuarioId(usuarioId: string): Promise<ResidenciaComPapelRecord[]> {
    const userMembros = this.membros.filter((m) => m.usuarioId === usuarioId);
    const result: ResidenciaComPapelRecord[] = [];

    for (const membro of userMembros) {
      const residencia = this.residencias.get(membro.residenciaId);
      if (residencia) {
        result.push({
          id: residencia.id,
          nome: residencia.nome,
          enderecoCurto: residencia.enderecoCurto,
          papel: membro.papel,
        });
      }
    }

    return result;
  }

  async findById(id: string): Promise<ResidenciaRecord | null> {
    return this.residencias.get(id) ?? null;
  }

  async isMembro(residenciaId: string, usuarioId: string): Promise<boolean> {
    return this.membros.some(
      (m) => m.residenciaId === residenciaId && m.usuarioId === usuarioId
    );
  }
}

export class InMemoryMoradorRepository implements MoradorRepository {
  private moradores: Map<string, MoradorRecord> = new Map();

  async createMorador(data: {
    residenciaId: string;
    nome: string;
    pinHash: string;
  }): Promise<MoradorRecord> {
    const morador: MoradorRecord = {
      id: randomUUID(),
      residenciaId: data.residenciaId,
      nome: data.nome,
      pinHash: data.pinHash,
      tentativasErradas: 0,
      bloqueadoAte: null,
      createdAt: new Date(),
    };
    this.moradores.set(morador.id, morador);
    return morador;
  }

  async findById(id: string): Promise<MoradorRecord | null> {
    return this.moradores.get(id) ?? null;
  }

  async updateTentativas(
    id: string,
    tentativasErradas: number,
    bloqueadoAte?: Date | null
  ): Promise<void> {
    const morador = this.moradores.get(id);
    if (morador) {
      morador.tentativasErradas = tentativasErradas;
      morador.bloqueadoAte = bloqueadoAte ?? null;
    }
  }

  async resetTentativas(id: string): Promise<void> {
    const morador = this.moradores.get(id);
    if (morador) {
      morador.tentativasErradas = 0;
      morador.bloqueadoAte = null;
    }
  }
}

