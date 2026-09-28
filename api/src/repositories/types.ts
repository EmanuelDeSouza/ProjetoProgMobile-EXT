export interface UsuarioRecord {
  id: string;
  nome: string;
  email: string;
  senhaHash: string | null;
  createdAt: Date;
}

export interface ResidenciaRecord {
  id: string;
  nome: string;
  enderecoCurto: string | null;
  createdAt: Date;
}

export interface ResidenciaComPapelRecord {
  id: string;
  nome: string;
  enderecoCurto: string | null;
  papel: "dono" | "cuidador";
}

export interface MoradorRecord {
  id: string;
  residenciaId: string;
  nome: string;
  pinHash: string;
  tentativasErradas: number;
  bloqueadoAte: Date | null;
  createdAt: Date;
}

export interface AuthRepository {
  findByEmail(email: string): Promise<UsuarioRecord | null>;
  findById(id: string): Promise<UsuarioRecord | null>;
  create(data: { nome: string; email: string; senhaHash: string | null }): Promise<UsuarioRecord>;
}

export interface ResidenciaRepository {
  createResidencia(
    data: { nome: string; enderecoCurto?: string | null },
    usuarioId: string
  ): Promise<ResidenciaRecord>;
  listByUsuarioId(usuarioId: string): Promise<ResidenciaComPapelRecord[]>;
  findById(id: string): Promise<ResidenciaRecord | null>;
  isMembro(residenciaId: string, usuarioId: string): Promise<boolean>;
}

export interface MoradorRepository {
  createMorador(data: {
    residenciaId: string;
    nome: string;
    pinHash: string;
  }): Promise<MoradorRecord>;
  findById(id: string): Promise<MoradorRecord | null>;
  updateTentativas(
    id: string,
    tentativasErradas: number,
    bloqueadoAte?: Date | null
  ): Promise<void>;
  resetTentativas(id: string): Promise<void>;
}

