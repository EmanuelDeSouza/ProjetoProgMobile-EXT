import { eq, and } from "drizzle-orm";
import type { Database } from "../db";
import {
  usuarios,
  residencias,
  residenciaMembros,
  moradores,
  dispositivos,
  regrasAlerta,
  alertas,
  sosEventos,
  eventosDispositivo,
} from "../../db/schema";
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

export class DrizzleDispositivoRepository implements DispositivoRepository {
  constructor(private db: Database) {}

  async createDispositivo(data: {
    residenciaId: string;
    tipo: TipoDispositivo;
    nome: string;
    comodo: string;
  }): Promise<DispositivoRecord> {
    const deviceKey = crypto.randomUUID();
    const [inserted] = await this.db
      .insert(dispositivos)
      .values({
        residenciaId: data.residenciaId,
        tipo: data.tipo,
        nome: data.nome,
        comodo: data.comodo,
        deviceKey,
        estadoAtual: {},
        status: "offline",
      })
      .returning();

    if (!inserted) {
      throw new Error("Falha ao criar dispositivo no banco");
    }

    return {
      id: inserted.id,
      residenciaId: inserted.residenciaId,
      tipo: inserted.tipo as TipoDispositivo,
      nome: inserted.nome,
      comodo: inserted.comodo,
      deviceKey: inserted.deviceKey,
      estadoAtual: (inserted.estadoAtual ?? {}) as Record<string, unknown>,
      status: inserted.status as "online" | "offline",
      ultimoContatoEm: inserted.ultimoContatoEm,
      createdAt: inserted.createdAt,
    };
  }

  async findById(id: string): Promise<DispositivoRecord | null> {
    const rows = await this.db
      .select()
      .from(dispositivos)
      .where(eq(dispositivos.id, id))
      .limit(1);

    const d = rows[0];
    if (!d) return null;

    return {
      id: d.id,
      residenciaId: d.residenciaId,
      tipo: d.tipo as TipoDispositivo,
      nome: d.nome,
      comodo: d.comodo,
      deviceKey: d.deviceKey,
      estadoAtual: (d.estadoAtual ?? {}) as Record<string, unknown>,
      status: d.status as "online" | "offline",
      ultimoContatoEm: d.ultimoContatoEm,
      createdAt: d.createdAt,
    };
  }

  async listByResidenciaId(residenciaId: string): Promise<DispositivoRecord[]> {
    const rows = await this.db
      .select()
      .from(dispositivos)
      .where(eq(dispositivos.residenciaId, residenciaId));

    return rows.map((d) => ({
      id: d.id,
      residenciaId: d.residenciaId,
      tipo: d.tipo as TipoDispositivo,
      nome: d.nome,
      comodo: d.comodo,
      deviceKey: d.deviceKey,
      estadoAtual: (d.estadoAtual ?? {}) as Record<string, unknown>,
      status: d.status as "online" | "offline",
      ultimoContatoEm: d.ultimoContatoEm,
      createdAt: d.createdAt,
    }));
  }

  async updateEstado(
    id: string,
    estadoAtual: Record<string, unknown>,
    status: "online" | "offline"
  ): Promise<void> {
    await this.db
      .update(dispositivos)
      .set({
        estadoAtual,
        status,
        ultimoContatoEm: new Date(),
      })
      .where(eq(dispositivos.id, id));
  }
}

export class DrizzleRegraAlertaRepository implements RegraAlertaRepository {
  constructor(private db: Database) {}

  async createRegra(data: {
    residenciaId: string;
    dispositivoId?: string | null;
    condicao: string;
    parametros: Record<string, unknown>;
    ativa?: boolean;
  }): Promise<RegraAlertaRecord> {
    const [inserted] = await this.db
      .insert(regrasAlerta)
      .values({
        residenciaId: data.residenciaId,
        dispositivoId: data.dispositivoId ?? null,
        condicao: data.condicao as any,
        parametros: data.parametros,
        ativa: data.ativa ?? true,
      })
      .returning();

    if (!inserted) {
      throw new Error("Falha ao criar regra no banco");
    }

    return {
      id: inserted.id,
      residenciaId: inserted.residenciaId,
      dispositivoId: inserted.dispositivoId,
      condicao: inserted.condicao,
      parametros: (inserted.parametros ?? {}) as Record<string, unknown>,
      ativa: inserted.ativa,
      createdAt: inserted.createdAt,
    };
  }

  async listByResidenciaId(residenciaId: string): Promise<RegraAlertaRecord[]> {
    const rows = await this.db
      .select()
      .from(regrasAlerta)
      .where(eq(regrasAlerta.residenciaId, residenciaId));

    return rows.map((r) => ({
      id: r.id,
      residenciaId: r.residenciaId,
      dispositivoId: r.dispositivoId,
      condicao: r.condicao,
      parametros: (r.parametros ?? {}) as Record<string, unknown>,
      ativa: r.ativa,
      createdAt: r.createdAt,
    }));
  }

  async listByDispositivoId(dispositivoId: string): Promise<RegraAlertaRecord[]> {
    const rows = await this.db
      .select()
      .from(regrasAlerta)
      .where(eq(regrasAlerta.dispositivoId, dispositivoId));

    return rows.map((r) => ({
      id: r.id,
      residenciaId: r.residenciaId,
      dispositivoId: r.dispositivoId,
      condicao: r.condicao,
      parametros: (r.parametros ?? {}) as Record<string, unknown>,
      ativa: r.ativa,
      createdAt: r.createdAt,
    }));
  }
}

export class DrizzleAlertaRepository implements AlertaRepository {
  constructor(private db: Database) {}

  async createAlerta(data: {
    residenciaId: string;
    regraId?: string | null;
    dispositivoId?: string | null;
    severidade: "baixa" | "media" | "alta";
  }): Promise<AlertaRecord> {
    const [inserted] = await this.db
      .insert(alertas)
      .values({
        residenciaId: data.residenciaId,
        regraId: data.regraId ?? null,
        dispositivoId: data.dispositivoId ?? null,
        severidade: data.severidade,
        status: "aberto",
      })
      .returning();

    if (!inserted) {
      throw new Error("Falha ao criar alerta no banco");
    }

    return {
      id: inserted.id,
      residenciaId: inserted.residenciaId,
      regraId: inserted.regraId,
      dispositivoId: inserted.dispositivoId,
      severidade: inserted.severidade as "baixa" | "media" | "alta",
      status: inserted.status as "aberto" | "reconhecido",
      reconhecidoPor: inserted.reconhecidoPor,
      reconhecidoEm: inserted.reconhecidoEm,
      createdAt: inserted.createdAt,
    };
  }

  async listByResidenciaId(residenciaId: string): Promise<AlertaRecord[]> {
    const rows = await this.db
      .select()
      .from(alertas)
      .where(eq(alertas.residenciaId, residenciaId));

    return rows.map((a) => ({
      id: a.id,
      residenciaId: a.residenciaId,
      regraId: a.regraId,
      dispositivoId: a.dispositivoId,
      severidade: a.severidade as "baixa" | "media" | "alta",
      status: a.status as "aberto" | "reconhecido",
      reconhecidoPor: a.reconhecidoPor,
      reconhecidoEm: a.reconhecidoEm,
      createdAt: a.createdAt,
    }));
  }

  async listAbertos(residenciaId: string): Promise<AlertaRecord[]> {
    const rows = await this.db
      .select()
      .from(alertas)
      .where(and(eq(alertas.residenciaId, residenciaId), eq(alertas.status, "aberto")));

    return rows.map((a) => ({
      id: a.id,
      residenciaId: a.residenciaId,
      regraId: a.regraId,
      dispositivoId: a.dispositivoId,
      severidade: a.severidade as "baixa" | "media" | "alta",
      status: a.status as "aberto" | "reconhecido",
      reconhecidoPor: a.reconhecidoPor,
      reconhecidoEm: a.reconhecidoEm,
      createdAt: a.createdAt,
    }));
  }

  async reconhecerAlerta(id: string, reconhecidoPor: string): Promise<AlertaRecord | null> {
    const [updated] = await this.db
      .update(alertas)
      .set({
        status: "reconhecido",
        reconhecidoPor,
        reconhecidoEm: new Date(),
      })
      .where(eq(alertas.id, id))
      .returning();

    if (!updated) return null;

    return {
      id: updated.id,
      residenciaId: updated.residenciaId,
      regraId: updated.regraId,
      dispositivoId: updated.dispositivoId,
      severidade: updated.severidade as "baixa" | "media" | "alta",
      status: updated.status as "aberto" | "reconhecido",
      reconhecidoPor: updated.reconhecidoPor,
      reconhecidoEm: updated.reconhecidoEm,
      createdAt: updated.createdAt,
    };
  }
}

export class DrizzleSOSRepository implements SOSRepository {
  constructor(private db: Database) {}

  async createSOS(data: {
    residenciaId: string;
    moradorId?: string | null;
    origem: "app" | "botao_fisico";
  }): Promise<SOSEventoRecord> {
    const [inserted] = await this.db
      .insert(sosEventos)
      .values({
        residenciaId: data.residenciaId,
        moradorId: data.moradorId ?? null,
        origem: data.origem,
        status: "aberto",
      })
      .returning();

    if (!inserted) {
      throw new Error("Falha ao criar SOS no banco");
    }

    return {
      id: inserted.id,
      residenciaId: inserted.residenciaId,
      moradorId: inserted.moradorId,
      origem: inserted.origem as "app" | "botao_fisico",
      status: inserted.status as "aberto" | "cancelado_pelo_morador" | "reconhecido",
      createdAt: inserted.createdAt,
    };
  }

  async findById(id: string): Promise<SOSEventoRecord | null> {
    const rows = await this.db
      .select()
      .from(sosEventos)
      .where(eq(sosEventos.id, id))
      .limit(1);

    const s = rows[0];
    if (!s) return null;

    return {
      id: s.id,
      residenciaId: s.residenciaId,
      moradorId: s.moradorId,
      origem: s.origem as "app" | "botao_fisico",
      status: s.status as "aberto" | "cancelado_pelo_morador" | "reconhecido",
      createdAt: s.createdAt,
    };
  }

  async updateStatus(
    id: string,
    status: "aberto" | "cancelado_pelo_morador" | "reconhecido"
  ): Promise<SOSEventoRecord | null> {
    const [updated] = await this.db
      .update(sosEventos)
      .set({ status })
      .where(eq(sosEventos.id, id))
      .returning();

    if (!updated) return null;

    return {
      id: updated.id,
      residenciaId: updated.residenciaId,
      moradorId: updated.moradorId,
      origem: updated.origem as "app" | "botao_fisico",
      status: updated.status as "aberto" | "cancelado_pelo_morador" | "reconhecido",
      createdAt: updated.createdAt,
    };
  }
}

export class DrizzleEventoDispositivoRepository implements EventoDispositivoRepository {
  constructor(private db: Database) {}

  async createEvento(data: {
    dispositivoId: string;
    tipo: string;
    valor: Record<string, unknown>;
  }): Promise<EventoDispositivoRecord> {
    const [inserted] = await this.db
      .insert(eventosDispositivo)
      .values({
        dispositivoId: data.dispositivoId,
        tipo: data.tipo,
        valor: data.valor,
      })
      .returning();

    if (!inserted) {
      throw new Error("Falha ao registrar evento no banco");
    }

    return {
      id: inserted.id,
      dispositivoId: inserted.dispositivoId,
      tipo: inserted.tipo,
      valor: inserted.valor as Record<string, unknown>,
      createdAt: inserted.createdAt,
    };
  }

  async listByDispositivoId(dispositivoId: string): Promise<EventoDispositivoRecord[]> {
    const rows = await this.db
      .select()
      .from(eventosDispositivo)
      .where(eq(eventosDispositivo.dispositivoId, dispositivoId));

    return rows.map((e) => ({
      id: e.id,
      dispositivoId: e.dispositivoId,
      tipo: e.tipo,
      valor: e.valor as Record<string, unknown>,
      createdAt: e.createdAt,
    }));
  }
}


