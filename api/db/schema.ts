import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const usuarios = pgTable("usuarios", {
  id: uuid("id").defaultRandom().primaryKey(),
  nome: text("nome").notNull(),
  email: text("email").notNull().unique(),
  senhaHash: text("senha_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const residencias = pgTable("residencias", {
  id: uuid("id").defaultRandom().primaryKey(),
  nome: text("nome").notNull(),
  enderecoCurto: text("endereco_curto"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const residenciaMembros = pgTable("residencia_membros", {
  id: uuid("id").defaultRandom().primaryKey(),
  residenciaId: uuid("residencia_id")
    .references(() => residencias.id, { onDelete: "cascade" })
    .notNull(),
  usuarioId: uuid("usuario_id")
    .references(() => usuarios.id, { onDelete: "cascade" })
    .notNull(),
  papel: text("papel", { enum: ["dono", "cuidador"] }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const moradores = pgTable("moradores", {
  id: uuid("id").defaultRandom().primaryKey(),
  residenciaId: uuid("residencia_id")
    .references(() => residencias.id, { onDelete: "cascade" })
    .notNull(),
  nome: text("nome").notNull(),
  pinHash: text("pin_hash").notNull(),
  tentativasErradas: integer("tentativas_erradas").default(0).notNull(),
  bloqueadoAte: timestamp("bloqueado_ate", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const convites = pgTable("convites", {
  id: uuid("id").defaultRandom().primaryKey(),
  residenciaId: uuid("residencia_id")
    .references(() => residencias.id, { onDelete: "cascade" })
    .notNull(),
  email: text("email").notNull(),
  status: text("status", { enum: ["pendente", "aceito"] })
    .default("pendente")
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const tipoDispositivoEnum = [
  "sensor_presenca",
  "sensor_contato",
  "sensor_temperatura",
  "atuador_tomada",
  "botao_sos",
] as const;
export type TipoDispositivo = (typeof tipoDispositivoEnum)[number];

export const dispositivos = pgTable("dispositivos", {
  id: uuid("id").defaultRandom().primaryKey(),
  residenciaId: uuid("residencia_id")
    .references(() => residencias.id, { onDelete: "cascade" })
    .notNull(),
  tipo: text("tipo", { enum: tipoDispositivoEnum }).notNull(),
  nome: text("nome").notNull(),
  comodo: text("comodo").notNull(),
  deviceKey: text("device_key").notNull().unique(),
  estadoAtual: jsonb("estado_atual").$type<Record<string, unknown>>().default({}).notNull(),
  status: text("status", { enum: ["online", "offline"] })
    .default("offline")
    .notNull(),
  ultimoContatoEm: timestamp("ultimo_contato_em", { withTimezone: true }),
  codigoPareamento: text("codigo_pareamento"),
  codigoPareamentoExpiraEm: timestamp("codigo_pareamento_expira_em", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const condicaoRegraEnum = [
  "sem_movimento_por",
  "contato_aberto_apos_horario",
  "temperatura_fora_da_faixa",
  "dispositivo_offline",
] as const;
export type CondicaoRegra = (typeof condicaoRegraEnum)[number];

export const regrasAlerta = pgTable("regras_alerta", {
  id: uuid("id").defaultRandom().primaryKey(),
  residenciaId: uuid("residencia_id")
    .references(() => residencias.id, { onDelete: "cascade" })
    .notNull(),
  dispositivoId: uuid("dispositivo_id").references(() => dispositivos.id, {
    onDelete: "cascade",
  }),
  condicao: text("condicao", { enum: condicaoRegraEnum }).notNull(),
  parametros: jsonb("parametros").$type<Record<string, unknown>>().default({}).notNull(),
  ativa: boolean("ativa").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const alertas = pgTable("alertas", {
  id: uuid("id").defaultRandom().primaryKey(),
  residenciaId: uuid("residencia_id")
    .references(() => residencias.id, { onDelete: "cascade" })
    .notNull(),
  regraId: uuid("regra_id").references(() => regrasAlerta.id, {
    onDelete: "set null",
  }),
  dispositivoId: uuid("dispositivo_id").references(() => dispositivos.id, {
    onDelete: "set null",
  }),
  severidade: text("severidade", { enum: ["baixa", "media", "alta"] }).notNull(),
  status: text("status", { enum: ["aberto", "reconhecido"] })
    .default("aberto")
    .notNull(),
  reconhecidoPor: uuid("reconhecido_por").references(() => usuarios.id, {
    onDelete: "set null",
  }),
  reconhecidoEm: timestamp("reconhecido_em", { withTimezone: true }),
  nota: text("nota"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sosEventos = pgTable("sos_eventos", {
  id: uuid("id").defaultRandom().primaryKey(),
  residenciaId: uuid("residencia_id")
    .references(() => residencias.id, { onDelete: "cascade" })
    .notNull(),
  moradorId: uuid("morador_id").references(() => moradores.id, {
    onDelete: "set null",
  }),
  origem: text("origem", { enum: ["app", "botao_fisico"] }).notNull(),
  status: text("status", { enum: ["aberto", "cancelado_pelo_morador", "reconhecido"] })
    .default("aberto")
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const eventosDispositivo = pgTable("eventos_dispositivo", {
  id: uuid("id").defaultRandom().primaryKey(),
  dispositivoId: uuid("dispositivo_id")
    .references(() => dispositivos.id, { onDelete: "cascade" })
    .notNull(),
  tipo: text("tipo").notNull(),
  valor: jsonb("valor").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const notificacoes = pgTable("notificacoes", {
  id: uuid("id").defaultRandom().primaryKey(),
  usuarioId: uuid("usuario_id")
    .references(() => usuarios.id, { onDelete: "cascade" })
    .notNull(),
  tipo: text("tipo").notNull(),
  alvoId: uuid("alvo_id").notNull(),
  lidaEm: timestamp("lida_em", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Relations
export const usuariosRelations = relations(usuarios, ({ many }) => ({
  membros: many(residenciaMembros),
  notificacoes: many(notificacoes),
}));

export const residenciasRelations = relations(residencias, ({ many }) => ({
  membros: many(residenciaMembros),
  moradores: many(moradores),
  convites: many(convites),
  dispositivos: many(dispositivos),
  regras: many(regrasAlerta),
  alertas: many(alertas),
  sosEventos: many(sosEventos),
}));

export const residenciaMembrosRelations = relations(residenciaMembros, ({ one }) => ({
  residencia: one(residencias, {
    fields: [residenciaMembros.residenciaId],
    references: [residencias.id],
  }),
  usuario: one(usuarios, {
    fields: [residenciaMembros.usuarioId],
    references: [usuarios.id],
  }),
}));

export const moradoresRelations = relations(moradores, ({ one, many }) => ({
  residencia: one(residencias, {
    fields: [moradores.residenciaId],
    references: [residencias.id],
  }),
  sosEventos: many(sosEventos),
}));

export const convitesRelations = relations(convites, ({ one }) => ({
  residencia: one(residencias, {
    fields: [convites.residenciaId],
    references: [residencias.id],
  }),
}));

export const dispositivosRelations = relations(dispositivos, ({ one, many }) => ({
  residencia: one(residencias, {
    fields: [dispositivos.residenciaId],
    references: [residencias.id],
  }),
  regras: many(regrasAlerta),
  alertas: many(alertas),
  eventos: many(eventosDispositivo),
}));

export const regrasAlertaRelations = relations(regrasAlerta, ({ one, many }) => ({
  residencia: one(residencias, {
    fields: [regrasAlerta.residenciaId],
    references: [residencias.id],
  }),
  dispositivo: one(dispositivos, {
    fields: [regrasAlerta.dispositivoId],
    references: [dispositivos.id],
  }),
  alertas: many(alertas),
}));

export const alertasRelations = relations(alertas, ({ one }) => ({
  residencia: one(residencias, {
    fields: [alertas.residenciaId],
    references: [residencias.id],
  }),
  regra: one(regrasAlerta, {
    fields: [alertas.regraId],
    references: [regrasAlerta.id],
  }),
  dispositivo: one(dispositivos, {
    fields: [alertas.dispositivoId],
    references: [dispositivos.id],
  }),
  reconhecidoPorUsuario: one(usuarios, {
    fields: [alertas.reconhecidoPor],
    references: [usuarios.id],
  }),
}));

export const sosEventosRelations = relations(sosEventos, ({ one }) => ({
  residencia: one(residencias, {
    fields: [sosEventos.residenciaId],
    references: [residencias.id],
  }),
  morador: one(moradores, {
    fields: [sosEventos.moradorId],
    references: [moradores.id],
  }),
}));

export const eventosDispositivoRelations = relations(eventosDispositivo, ({ one }) => ({
  dispositivo: one(dispositivos, {
    fields: [eventosDispositivo.dispositivoId],
    references: [dispositivos.id],
  }),
}));

export const notificacoesRelations = relations(notificacoes, ({ one }) => ({
  usuario: one(usuarios, {
    fields: [notificacoes.usuarioId],
    references: [usuarios.id],
  }),
}));
