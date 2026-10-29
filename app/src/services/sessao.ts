// Sessão persistida (token no cofre) e vínculo do aparelho da casa com um morador (RF-04).
import { local, seguro } from "./storage";
import type { Morador, Usuario } from "../types";

export type SessaoSalva =
  | { tipo: "cuidador"; token: string; usuario: Usuario }
  | { tipo: "morador"; token: string; morador: Morador };

const CHAVE_SESSAO = "sessao";
const CHAVE_APARELHO = "aparelho_morador";

export const sessaoStore = {
  ler: () => seguro.ler<SessaoSalva>(CHAVE_SESSAO),
  gravar: (s: SessaoSalva | null) => seguro.gravar(CHAVE_SESSAO, s),
};

/**
 * Aparelho da casa: depois que o cuidador escolhe "Usar este aparelho para [morador]",
 * a tela inicial vira só o teclado de PIN daquele morador.
 */
export const aparelhoStore = {
  ler: () => local.ler<Morador>(CHAVE_APARELHO),
  gravar: (m: Morador | null) => local.gravar(CHAVE_APARELHO, m),
};
