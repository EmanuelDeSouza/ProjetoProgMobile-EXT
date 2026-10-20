export type TipoDispositivo =
  | "sensor_presenca"
  | "sensor_contato"
  | "sensor_temperatura"
  | "atuador_tomada"
  | "botao_sos";

export type StatusDispositivo = "online" | "offline";

export type CondicaoRegra =
  | "sem_movimento_por"
  | "contato_aberto_apos_horario"
  | "temperatura_fora_da_faixa"
  | "dispositivo_offline";

export type SeveridadeAlerta = "baixa" | "media" | "alta";

export type StatusAlerta = "aberto" | "reconhecido";

export type StatusSOS = "aberto" | "cancelado_pelo_morador" | "reconhecido";

export interface Usuario {
  id: string;
  nome: string;
  email: string;
}

export interface Residencia {
  id: string;
  nome: string;
  enderecoCurto?: string | null;
}

export interface ResidenciaComPapel extends Residencia {
  papel: "dono" | "cuidador";
}

export interface Morador {
  id: string;
  nome: string;
  residenciaId: string;
}

export interface Dispositivo {
  id: string;
  tipo: TipoDispositivo;
  nome: string;
  comodo: string;
  estadoAtual: Record<string, unknown>;
  status: StatusDispositivo;
  ultimoContatoEm?: string | null;
}

export interface EventoDispositivo {
  id: string;
  tipo: string;
  valor: Record<string, unknown>;
  createdAt: string;
}

export interface RegraAlerta {
  id: string;
  dispositivoId: string;
  condicao: CondicaoRegra;
  parametros: Record<string, unknown>;
  ativa: boolean;
}

export interface Alerta {
  id: string;
  dispositivoId?: string | null;
  regraId?: string | null;
  severidade: SeveridadeAlerta;
  status: StatusAlerta;
  createdAt: string;
}

export interface SOSEvento {
  id: string;
  moradorId?: string | null;
  origem: "app" | "botao_fisico";
  status: StatusSOS;
  createdAt: string;
}

export interface Notificacao {
  id: string;
  tipo: string;
  alvoId: string;
  lidaEm?: string | null;
  createdAt: string;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
}
