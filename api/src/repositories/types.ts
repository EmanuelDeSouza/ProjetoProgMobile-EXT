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

export type TipoDispositivo =
  | "sensor_presenca"
  | "sensor_contato"
  | "sensor_temperatura"
  | "atuador_tomada"
  | "botao_sos";

export interface DispositivoRecord {
  id: string;
  residenciaId: string;
  tipo: TipoDispositivo;
  nome: string;
  comodo: string;
  deviceKey: string;
  estadoAtual: Record<string, unknown>;
  status: "online" | "offline";
  ultimoContatoEm: Date | null;
  createdAt: Date;
}

export interface RegraAlertaRecord {
  id: string;
  residenciaId: string;
  dispositivoId: string | null;
  condicao: string;
  parametros: Record<string, unknown>;
  ativa: boolean;
  createdAt: Date;
}

export interface AlertaRecord {
  id: string;
  residenciaId: string;
  regraId: string | null;
  dispositivoId: string | null;
  severidade: "baixa" | "media" | "alta";
  status: "aberto" | "reconhecido";
  reconhecidoPor?: string | null;
  reconhecidoEm?: Date | null;
  createdAt: Date;
}

export interface SOSEventoRecord {
  id: string;
  residenciaId: string;
  moradorId: string | null;
  origem: "app" | "botao_fisico";
  status: "aberto" | "cancelado_pelo_morador" | "reconhecido";
  createdAt: Date;
}

export interface EventoDispositivoRecord {
  id: string;
  dispositivoId: string;
  tipo: string;
  valor: Record<string, unknown>;
  createdAt: Date;
}

export interface DispositivoRepository {
  createDispositivo(data: {
    residenciaId: string;
    tipo: TipoDispositivo;
    nome: string;
    comodo: string;
  }): Promise<DispositivoRecord>;
  findById(id: string): Promise<DispositivoRecord | null>;
  listByResidenciaId(residenciaId: string): Promise<DispositivoRecord[]>;
  updateEstado(
    id: string,
    estadoAtual: Record<string, unknown>,
    status: "online" | "offline"
  ): Promise<void>;
}

export interface RegraAlertaRepository {
  createRegra(data: {
    residenciaId: string;
    dispositivoId?: string | null;
    condicao: string;
    parametros: Record<string, unknown>;
    ativa?: boolean;
  }): Promise<RegraAlertaRecord>;
  listByResidenciaId(residenciaId: string): Promise<RegraAlertaRecord[]>;
  listByDispositivoId(dispositivoId: string): Promise<RegraAlertaRecord[]>;
}

export interface AlertaRepository {
  createAlerta(data: {
    residenciaId: string;
    regraId?: string | null;
    dispositivoId?: string | null;
    severidade: "baixa" | "media" | "alta";
  }): Promise<AlertaRecord>;
  listByResidenciaId(residenciaId: string): Promise<AlertaRecord[]>;
  listAbertos(residenciaId: string): Promise<AlertaRecord[]>;
  reconhecerAlerta(id: string, reconhecidoPor: string): Promise<AlertaRecord | null>;
}

export interface SOSRepository {
  createSOS(data: {
    residenciaId: string;
    moradorId?: string | null;
    origem: "app" | "botao_fisico";
  }): Promise<SOSEventoRecord>;
  findById(id: string): Promise<SOSEventoRecord | null>;
  updateStatus(
    id: string,
    status: "aberto" | "cancelado_pelo_morador" | "reconhecido"
  ): Promise<SOSEventoRecord | null>;
}

export interface EventoDispositivoRepository {
  createEvento(data: {
    dispositivoId: string;
    tipo: string;
    valor: Record<string, unknown>;
  }): Promise<EventoDispositivoRecord>;
  listByDispositivoId(dispositivoId: string): Promise<EventoDispositivoRecord[]>;
}


