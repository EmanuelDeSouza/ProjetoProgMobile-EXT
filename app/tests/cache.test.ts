import { describe, it, expect } from "bun:test";
import { setCacheItem, getCacheItem } from "../src/services/cache";

describe("RNF-05 · Cache local para operação offline", () => {
  it("Given chave inexistente, When consulta o cache, Then retorna null", async () => {
    const result = await getCacheItem("chave_inexistente_123");
    expect(result).toBeNull();
  });

  it("Given gravação de dados no cache, When recupera a mesma chave, Then retorna os dados íntegros", async () => {
    const payload = {
      residenciaId: "res-01",
      dispositivos: [
        { id: "disp-01", nome: "Sensor Quarto", status: "online" },
      ],
    };

    await setCacheItem("painel:res-01", payload);
    const cached = await getCacheItem<typeof payload>("painel:res-01");

    expect(cached).not.toBeNull();
    expect(cached?.residenciaId).toBe("res-01");
    expect(cached?.dispositivos.length).toBe(1);
    expect(cached?.dispositivos[0]?.nome).toBe("Sensor Quarto");
  });
});
