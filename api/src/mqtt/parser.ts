export type TipoMensagemMqtt = "estado" | "heartbeat" | "comando" | "sos";

export interface ParsedMqttMessage {
  residenciaId: string;
  dispositivoId: string;
  tipoMensagem: TipoMensagemMqtt;
  data: Record<string, unknown>;
}

export function parseMqttTopicAndPayload(
  topic: string,
  payload: string | Buffer
): ParsedMqttMessage | null {
  const parts = topic.split("/");
  // Expected: cuidalar/{residencia_id}/{dispositivo_id}/{tipo}
  if (parts.length !== 4 || parts[0] !== "cuidalar") {
    return null;
  }

  const residenciaId = parts[1];
  const dispositivoId = parts[2];
  const tipoMensagem = parts[3] as TipoMensagemMqtt;

  if (!residenciaId || !dispositivoId || !tipoMensagem) {
    return null;
  }

  const validTypes: TipoMensagemMqtt[] = ["estado", "heartbeat", "comando", "sos"];
  if (!validTypes.includes(tipoMensagem)) {
    return null;
  }

  let data: Record<string, unknown> = {};
  const payloadStr = typeof payload === "string" ? payload : payload.toString("utf-8");

  try {
    const parsedJson = JSON.parse(payloadStr);
    if (typeof parsedJson === "object" && parsedJson !== null && !Array.isArray(parsedJson)) {
      data = parsedJson as Record<string, unknown>;
    } else {
      data = { valor: parsedJson };
    }
  } catch {
    data = { raw: payloadStr };
  }

  return {
    residenciaId,
    dispositivoId,
    tipoMensagem,
    data,
  };
}
