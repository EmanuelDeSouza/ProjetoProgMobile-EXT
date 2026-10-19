import { describe, expect, it, beforeEach } from "bun:test";
import { setCacheItem, getCacheItem } from "../src/services/cache";

describe("RNF-05 · Cache Local para Suporte Offline", () => {
  it("Given dados válidos, When salvos no cache, Then podem ser recuperados com fidelidade", async () => {
    const mockData = {
      id: "res-01",
      nome: "Casa dos Avós",
      dispositivos: [
        { id: "disp-1", nome: "Sensor Presença", status: "online" },
      ],
    };

    await setCacheItem("painel_cache_teste", mockData);
    const recovered = await getCacheItem<typeof mockData>("painel_cache_teste");

    expect(recovered).not.toBeNull();
    expect(recovered?.id).toBe("res-01");
    expect(recovered?.dispositivos.length).toBe(1);
    expect(recovered?.dispositivos[0]?.nome).toBe("Sensor Presença");
  });

  it("Given chave inexistente, When consulta o cache, Then retorna null", async () => {
    const result = await getCacheItem("chave_inexistente_123");
    expect(result).toBeNull();
  });
});
