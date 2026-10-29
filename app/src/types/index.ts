import type { z } from "zod";
import type * as s from "../services/schemas";

export type TipoDispositivo = z.infer<typeof s.tipoDispositivo>;
export type CondicaoRegra = z.infer<typeof s.condicaoRegra>;
export type StatusDispositivo = Dispositivo["status"];
export type SeveridadeAlerta = Alerta["severidade"];
export type StatusAlerta = Alerta["status"];
export type StatusSOS = SOSEvento["status"];

export type Usuario = z.infer<typeof s.usuario>;
export type Residencia = z.infer<typeof s.residencia>;
export type ResidenciaComPapel = z.infer<typeof s.residenciaComPapel>;
export type Convite = z.infer<typeof s.convite>;
export type Morador = z.infer<typeof s.morador>;
export type Dispositivo = z.infer<typeof s.dispositivo>;
export type EventoDispositivo = z.infer<typeof s.eventoDispositivo>;
export type RegraAlerta = z.infer<typeof s.regraAlerta>;
export type Alerta = z.infer<typeof s.alerta>;
export type SOSEvento = z.infer<typeof s.sosEvento>;
export type Notificacao = z.infer<typeof s.notificacao>;
export type ApiError = z.infer<typeof s.apiErro>;
