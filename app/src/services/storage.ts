// Armazenamento local com backend plugável: no app (App.tsx) usa AsyncStorage para cache
// e SecureStore para o token; nos testes (bun) fica em memória.

export interface ArmazenamentoChaveValor {
  getItem(chave: string): Promise<string | null>;
  setItem(chave: string, valor: string): Promise<void>;
  removeItem(chave: string): Promise<void>;
}

export function memoria(): ArmazenamentoChaveValor & { limpar(): void } {
  const m = new Map<string, string>();
  return {
    async getItem(k) {
      return m.get(k) ?? null;
    },
    async setItem(k, v) {
      m.set(k, v);
    },
    async removeItem(k) {
      m.delete(k);
    },
    limpar() {
      m.clear();
    },
  };
}

let geral: ArmazenamentoChaveValor = memoria();
let cofre: ArmazenamentoChaveValor = memoria();

/** Cache e preferências (AsyncStorage no app). */
export function configurarArmazenamento(kv: ArmazenamentoChaveValor): void {
  geral = kv;
}

/** Segredos — token de sessão (SecureStore no app). */
export function configurarCofre(kv: ArmazenamentoChaveValor): void {
  cofre = kv;
}

async function ler<T>(kv: ArmazenamentoChaveValor, chave: string): Promise<T | null> {
  try {
    const s = await kv.getItem(chave);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}

async function gravar<T>(kv: ArmazenamentoChaveValor, chave: string, valor: T | null): Promise<void> {
  try {
    if (valor === null || valor === undefined) await kv.removeItem(chave);
    else await kv.setItem(chave, JSON.stringify(valor));
  } catch (err) {
    console.warn(`[armazenamento] falha ao gravar ${chave}:`, err);
  }
}

export const local = {
  ler: <T>(chave: string) => ler<T>(geral, chave),
  gravar: <T>(chave: string, valor: T | null) => gravar(geral, chave, valor),
};

export const seguro = {
  ler: <T>(chave: string) => ler<T>(cofre, chave),
  gravar: <T>(chave: string, valor: T | null) => gravar(cofre, chave, valor),
};
