import { describe, it, expect } from "bun:test";
import { handleMqttMessage } from "../src/mqtt-listener";

describe("MQTT Listener & Payload Parsing (docs/SPEC.md § 6.3)", () => {
  it("Given tópico que não segue o padrão cuidalar/+/+/+, Then ignora silenciosamente sem lançar exceção", async () => {
    let errorThrown = false;
    try {
      await handleMqttMessage("topico/invalido", Buffer.from(JSON.stringify({ valor: 1 })));
      await handleMqttMessage("outro/prefixo/123/estado", Buffer.from(JSON.stringify({ valor: 1 })));
    } catch {
      errorThrown = true;
    }
    expect(errorThrown).toBe(false);
  });

  it("Given payload com JSON corrompido, Then trata o erro sem quebrar a execução", async () => {
    let errorThrown = false;
    try {
      await handleMqttMessage(
        "cuidalar/res-01/disp-01/estado",
        Buffer.from("invalid-json{not-closed")
      );
    } catch {
      errorThrown = true;
    }
    expect(errorThrown).toBe(false);
  });
});
