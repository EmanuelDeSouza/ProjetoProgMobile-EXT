// RNF-05 · Último estado conhecido, para nenhuma tela crítica ficar em branco offline.
import { local } from "./storage";

const PREFIXO = "cache:";
const INDICE = "cache:__indice";

async function registrarChave(key: string): Promise<void> {
  const indice = (await local.ler<string[]>(INDICE)) ?? [];
  if (!indice.includes(key)) await local.gravar(INDICE, [...indice, key]);
}

export async function setCacheItem<T>(key: string, data: T | null): Promise<void> {
  await local.gravar(PREFIXO + key, data);
  if (data !== null) await registrarChave(key);
}

export async function getCacheItem<T>(key: string): Promise<T | null> {
  return local.ler<T>(PREFIXO + key);
}

/** Apaga o cache de dados (ao sair da conta: o próximo usuário não vê dados do anterior). */
export async function clearCache(): Promise<void> {
  const indice = (await local.ler<string[]>(INDICE)) ?? [];
  for (const k of indice) await local.gravar(PREFIXO + k, null);
  await local.gravar(INDICE, null);
}
