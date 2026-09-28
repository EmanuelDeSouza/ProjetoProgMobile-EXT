import { randomUUID } from "node:crypto";
import type {
  AuthRepository,
  ResidenciaRepository,
  MoradorRepository,
  DispositivoRepository,
  RegraAlertaRepository,
  AlertaRepository,
  SOSRepository,
  EventoDispositivoRepository,
  UsuarioRecord,
  ResidenciaRecord,
  ResidenciaComPapelRecord,
  MoradorRecord,
  DispositivoRecord,
  RegraAlertaRecord,
  AlertaRecord,
  SOSEventoRecord,
  EventoDispositivoRecord,
  TipoDispositivo,
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

export class InMemoryDispositivoRepository implements DispositivoRepository {
  private dispositivos: Map<string, DispositivoRecord> = new Map();

  async createDispositivo(data: {
    residenciaId: string;
    tipo: TipoDispositivo;
    nome: string;
    comodo: string;
  }): Promise<DispositivoRecord> {
    const dispositivo: DispositivoRecord = {
      id: randomUUID(),
      residenciaId: data.residenciaId,
      tipo: data.tipo,
      nome: data.nome,
      comodo: data.comodo,
      deviceKey: randomUUID(),
      estadoAtual: {},
      status: "offline",
      ultimoContatoEm: null,
      createdAt: new Date(),
    };
    this.dispositivos.set(dispositivo.id, dispositivo);
    return dispositivo;
  }

  async findById(id: string): Promise<DispositivoRecord | null> {
    return this.dispositivos.get(id) ?? null;
  }

  async listByResidenciaId(residenciaId: string): Promise<DispositivoRecord[]> {
    return Array.from(this.dispositivos.values()).filter(
      (d) => d.residenciaId === residenciaId
    );
  }

  async updateEstado(
    id: string,
    estadoAtual: Record<string, unknown>,
    status: "online" | "offline"
  ): Promise<void> {
    const d = this.dispositivos.get(id);
    if (d) {
      d.estadoAtual = { ...d.estadoAtual, ...estadoAtual };
      d.status = status;
      d.ultimoContatoEm = new Date();
    }
  }
}

export class InMemoryRegraAlertaRepository implements RegraAlertaRepository {
  private regras: Map<string, RegraAlertaRecord> = new Map();

  async createRegra(data: {
    residenciaId: string;
    dispositivoId?: string | null;
    condicao: string;
    parametros: Record<string, unknown>;
    ativa?: boolean;
  }): Promise<RegraAlertaRecord> {
    const regra: RegraAlertaRecord = {
      id: randomUUID(),
      residenciaId: data.residenciaId,
      dispositivoId: data.dispositivoId ?? null,
      condicao: data.condicao,
      parametros: data.parametros,
      ativa: data.ativa ?? true,
      createdAt: new Date(),
    };
    this.regras.set(regra.id, regra);
    return regra;
  }

  async listByResidenciaId(residenciaId: string): Promise<RegraAlertaRecord[]> {
    return Array.from(this.regras.values()).filter(
      (r) => r.residenciaId === residenciaId
    );
  }

  async listByDispositivoId(dispositivoId: string): Promise<RegraAlertaRecord[]> {
    return Array.from(this.regras.values()).filter(
      (r) => r.dispositivoId === dispositivoId
    );
  }
}

export class InMemoryAlertaRepository implements AlertaRepository {
  private alertas: Map<string, AlertaRecord> = new Map();

  async createAlerta(data: {
    residenciaId: string;
    regraId?: string | null;
    dispositivoId?: string | null;
    severidade: "baixa" | "media" | "alta";
  }): Promise<AlertaRecord> {
    const alerta: AlertaRecord = {
      id: randomUUID(),
      residenciaId: data.residenciaId,
      regraId: data.regraId ?? null,
      dispositivoId: data.dispositivoId ?? null,
      severidade: data.severidade,
      status: "aberto",
      reconhecidoPor: null,
      reconhecidoEm: null,
      createdAt: new Date(),
    };
    this.alertas.set(alerta.id, alerta);
    return alerta;
  }

  async listByResidenciaId(residenciaId: string): Promise<AlertaRecord[]> {
    return Array.from(this.alertas.values()).filter(
      (a) => a.residenciaId === residenciaId
    );
  }

  async listAbertos(residenciaId: string): Promise<AlertaRecord[]> {
    return Array.from(this.alertas.values()).filter(
      (a) => a.residenciaId === residenciaId && a.status === "aberto"
    );
  }

  async reconhecerAlerta(id: string, reconhecidoPor: string): Promise<AlertaRecord | null> {
    const alerta = this.alertas.get(id);
    if (!alerta) return null;
    alerta.status = "reconhecido";
    alerta.reconhecidoPor = reconhecidoPor;
    alerta.reconhecidoEm = new Date();
    return alerta;
  }
}

export class InMemorySOSRepository implements SOSRepository {
  private eventos: Map<string, SOSEventoRecord> = new Map();

  async createSOS(data: {
    residenciaId: string;
    moradorId?: string | null;
    origem: "app" | "botao_fisico";
  }): Promise<SOSEventoRecord> {
    const ev: SOSEventoRecord = {
      id: randomUUID(),
      residenciaId: data.residenciaId,
      moradorId: data.moradorId ?? null,
      origem: data.origem,
      status: "aberto",
      createdAt: new Date(),
    };
    this.eventos.set(ev.id, ev);
    return ev;
  }

  async findById(id: string): Promise<SOSEventoRecord | null> {
    return this.eventos.get(id) ?? null;
  }

  async updateStatus(
    id: string,
    status: "aberto" | "cancelado_pelo_morador" | "reconhecido"
  ): Promise<SOSEventoRecord | null> {
    const ev = this.eventos.get(id);
    if (!ev) return null;
    ev.status = status;
    return ev;
  }
}

export class InMemoryEventoDispositivoRepository implements EventoDispositivoRepository {
  private eventos: EventoDispositivoRecord[] = [];

  async createEvento(data: {
    dispositivoId: string;
    tipo: string;
    valor: Record<string, unknown>;
  }): Promise<EventoDispositivoRecord> {
    const ev: EventoDispositivoRecord = {
      id: randomUUID(),
      dispositivoId: data.dispositivoId,
      tipo: data.tipo,
      valor: data.valor,
      createdAt: new Date(),
    };
    this.eventos.push(ev);
    return ev;
  }

  async listByDispositivoId(dispositivoId: string): Promise<EventoDispositivoRecord[]> {
    return this.eventos.filter((e) => e.dispositivoId === dispositivoId);
  }
}


