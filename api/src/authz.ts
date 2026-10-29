// RF-02 · O papel vem do vínculo na residência. RF-04/RF-11 · A sessão do morador
// só alcança a interface simplificada. Toda rota autenticada passa por aqui.
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { dispositivos, moradores, residenciaMembros, residencias, usuarios } from "../db/schema";
import { HttpError, naoEncontrado, proibido } from "./http";
import type { TokenPayload } from "./auth";

export type Sessao =
  | { tipo: "cuidador"; usuarioId: string }
  | { tipo: "morador"; moradorId: string; residenciaId: string };

export function sessaoDoToken(p: TokenPayload): Sessao {
  return p.papel === "cuidador"
    ? { tipo: "cuidador", usuarioId: p.sub }
    : { tipo: "morador", moradorId: p.sub, residenciaId: p.residenciaId };
}

/** Confirma que o dono do token ainda existe (conta apagada → 401). */
export async function sessaoValida(s: Sessao): Promise<boolean> {
  if (s.tipo === "cuidador") {
    const [u] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.id, s.usuarioId));
    return Boolean(u);
  }
  const [m] = await db
    .select({ id: moradores.id })
    .from(moradores)
    .where(and(eq(moradores.id, s.moradorId), eq(moradores.residenciaId, s.residenciaId)));
  return Boolean(m);
}

export function exigirCuidador(s: Sessao): string {
  if (s.tipo !== "cuidador") throw proibido("Esta ação é só do cuidador.");
  return s.usuarioId;
}

export function exigirMorador(s: Sessao): { moradorId: string; residenciaId: string } {
  if (s.tipo !== "morador") throw proibido("Esta ação é só do aparelho do morador.");
  return { moradorId: s.moradorId, residenciaId: s.residenciaId };
}

async function residenciaExiste(residenciaId: string): Promise<boolean> {
  const [r] = await db.select({ id: residencias.id }).from(residencias).where(eq(residencias.id, residenciaId));
  return Boolean(r);
}

export async function papelNaResidencia(usuarioId: string, residenciaId: string) {
  const [m] = await db
    .select({ papel: residenciaMembros.papel })
    .from(residenciaMembros)
    .where(and(eq(residenciaMembros.residenciaId, residenciaId), eq(residenciaMembros.usuarioId, usuarioId)));
  return m?.papel ?? null;
}

/**
 * Cuidador membro da residência. 404 se a residência não existe, 403 se existe e ele não é membro.
 * Devolve o id do usuário.
 */
export async function exigirCuidadorMembro(s: Sessao, residenciaId: string): Promise<string> {
  const usuarioId = exigirCuidador(s);
  if (!(await residenciaExiste(residenciaId))) throw naoEncontrado("Residência");
  if (!(await papelNaResidencia(usuarioId, residenciaId))) throw proibido();
  return usuarioId;
}

/** Cuidador membro OU morador daquela residência (painel, comando). */
export async function exigirAcessoResidencia(s: Sessao, residenciaId: string): Promise<void> {
  if (s.tipo === "morador") {
    if (s.residenciaId !== residenciaId) {
      if (!(await residenciaExiste(residenciaId))) throw naoEncontrado("Residência");
      throw proibido();
    }
    return;
  }
  await exigirCuidadorMembro(s, residenciaId);
}

export async function carregarDispositivo(dispositivoId: string) {
  const [d] = await db.select().from(dispositivos).where(eq(dispositivos.id, dispositivoId));
  if (!d) throw naoEncontrado("Dispositivo");
  return d;
}

export { HttpError };
