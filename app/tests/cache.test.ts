import { describe, it, expect, beforeEach } from "bun:test";
import { setCacheItem, getCacheItem, clearCache } from "../src/services/cache";
import { configurarArmazenamento, memoria } from "../src/services/storage";

describe("RNF-05 · Cache local para operação offline", () => {
  beforeEach(() => configurarArmazenamento(memoria()));

  it("Given chave inexistente, When consulta o cache, Then retorna null", async () => {
    expect(await getCacheItem("chave_inexistente_123")).toBeNull();
  });

  it("Given gravação de dados no cache, When recupera a mesma chave, Then retorna os dados íntegros", async () => {
    const payload = { residenciaId: "res-01", dispositivos: [{ id: "disp-01", nome: "Sensor Quarto", status: "online" }] };
    await setCacheItem("painel:res-01", payload);
    const cached = await getCacheItem<typeof payload>("painel:res-01");
    expect(cached?.dispositivos[0]?.nome).toBe("Sensor Quarto");
  });

  it("Given usuário sai da conta, When limpa o cache, Then o próximo não vê os dados do anterior", async () => {
    await setCacheItem("a", 1);
    await setCacheItem("b", { x: 2 });
    await clearCache();
    expect(await getCacheItem("a")).toBeNull();
    expect(await getCacheItem("b")).toBeNull();
  });
});
