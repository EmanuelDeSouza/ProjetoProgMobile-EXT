// Sistema de cache local para suporte offline (RNF-05)
// Garante que painel e telas críticas não fiquem em branco na ausência de rede.

const memoryCache = new Map<string, string>();

export async function setCacheItem<T>(key: string, data: T): Promise<void> {
  try {
    const serialized = JSON.stringify(data);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, serialized);
    } else {
      memoryCache.set(key, serialized);
    }
  } catch (err) {
    console.warn(`Erro ao salvar cache para a chave ${key}:`, err);
  }
}

export async function getCacheItem<T>(key: string): Promise<T | null> {
  try {
    let serialized: string | null = null;
    if (typeof localStorage !== "undefined") {
      serialized = localStorage.getItem(key);
    } else {
      serialized = memoryCache.get(key) ?? null;
    }

    if (!serialized) return null;
    return JSON.parse(serialized) as T;
  } catch (err) {
    console.warn(`Erro ao ler cache para a chave ${key}:`, err);
    return null;
  }
}
