// Simulador de ESP32 para desenvolvimento sem hardware. Segue o contrato da SPEC 6.3.
//
//   bun run iot:simulate                      → simula todos os dispositivos já cadastrados no banco
//   bun run iot:simulate -- --residencia <id> → só os de uma residência
//   bun run iot:simulate -- --parear sensor_contato
//        → age como um ESP32 novo: anuncia um código de 6 dígitos, espera o cuidador parear no app,
//          decifra a credencial que chega pelo broker e passa a publicar com ela
//   --rapido   heartbeat a cada 10s e eventos mais frequentes
//   --sos      (com botao_sos) pressiona o botão 5s depois de conectar
import { createDecipheriv, randomBytes } from "node:crypto";
import mqtt, { type MqttClient } from "mqtt";
import { eq } from "drizzle-orm";
import { config } from "../src/config";
import { db, pgClient } from "../src/db";
import { dispositivos, tipoDispositivoEnum, type TipoDispositivo } from "../db/schema";

interface Credencial {
  residenciaId: string;
  dispositivoId: string;
  deviceKey: string;
  tipo: TipoDispositivo;
  nome: string;
}

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const valor = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const rapido = flag("rapido");
const HEARTBEAT_MS = rapido ? 10_000 : 60_000;

function conectar(username: string, password: string, clientId?: string): Promise<MqttClient> {
  return new Promise((ok, falha) => {
    const c = mqtt.connect(config.MQTT_BROKER_URL, { username, password, clientId, reconnectPeriod: 3000 });
    c.once("connect", () => ok(c));
    c.once("error", falha);
  });
}

function decifrar(chaveHex: string, msg: { iv: string; dados: string; tag: string }) {
  const d = createDecipheriv("aes-256-gcm", Buffer.from(chaveHex, "hex"), Buffer.from(msg.iv, "hex"));
  d.setAuthTag(Buffer.from(msg.tag, "hex"));
  const claro = Buffer.concat([d.update(Buffer.from(msg.dados, "hex")), d.final()]).toString("utf-8");
  return JSON.parse(claro) as { residenciaId: string; dispositivoId: string; deviceKey: string };
}

/** Fluxo de pareamento do firmware (RF-07 / SPEC 6.3). */
async function parear(tipo: TipoDispositivo): Promise<Credencial> {
  const codigo = String(100000 + Math.floor(Math.random() * 900000));
  const chave = randomBytes(32).toString("hex");
  const c = await conectar(
    config.MQTT_PROVISIONING_USERNAME,
    config.MQTT_PROVISIONING_PASSWORD,
    `setup-${codigo}`
  );
  const topicoCred = `cuidalar/pareamento/${codigo}/credenciais`;
  const anunciar = () =>
    c.publish(`cuidalar/pareamento/${codigo}/anuncio`, JSON.stringify({ tipo, chave }), { qos: 1 });

  console.log("\n┌──────────────────────────────────────────┐");
  console.log(`│  Código de pareamento: ${codigo}            │`);
  console.log(`│  Tipo: ${tipo.padEnd(34)}│`);
  console.log("│  Digite no app (Parear dispositivo).      │");
  console.log("│  Válido por 10 minutos.                   │");
  console.log("└──────────────────────────────────────────┘\n");

  return new Promise((ok, falha) => {
    const timer = setInterval(anunciar, 30_000);
    const expira = setTimeout(() => {
      clearInterval(timer);
      c.end(true);
      falha(new Error("código expirou sem pareamento; rode de novo para gerar outro"));
    }, 10 * 60_000);
    c.subscribe(topicoCred, { qos: 1 }, () => anunciar());
    c.on("message", (t, payload) => {
      if (t !== topicoCred || payload.length === 0) return;
      try {
        const cred = decifrar(chave, JSON.parse(payload.toString()));
        clearInterval(timer);
        clearTimeout(expira);
        c.end(true);
        console.log(`✓ Pareado! dispositivo ${cred.dispositivoId}`);
        ok({ ...cred, tipo, nome: `${tipo} (simulado)` });
      } catch {
        console.warn("credencial recebida mas não decifrou (outro dispositivo?) — ignorando");
      }
    });
  });
}

/** Comportamento de cada tipo de dispositivo. */
async function rodar(cred: Credencial): Promise<void> {
  const base = `cuidalar/${cred.residenciaId}/${cred.dispositivoId}`;
  const c = await conectar(cred.dispositivoId, cred.deviceKey, `sim-${cred.dispositivoId.slice(0, 8)}`);
  const pub = (sub: string, p: object, qos: 0 | 1 = 0) => c.publish(`${base}/${sub}`, JSON.stringify(p), { qos });
  const tag = `[${cred.nome}]`;
  console.log(`${tag} conectado`);

  pub("heartbeat", {});
  setInterval(() => pub("heartbeat", {}), HEARTBEAT_MS);

  switch (cred.tipo) {
    case "sensor_presenca": {
      const tick = () => {
        const presenca = Math.random() < 0.4;
        pub("estado", { presenca });
        console.log(`${tag} presenca=${presenca}`);
      };
      tick();
      setInterval(tick, rapido ? 15_000 : 90_000);
      break;
    }
    case "sensor_contato": {
      let aberto = false;
      pub("estado", { contato: "fechado" });
      setInterval(() => {
        if (Math.random() < 0.3) {
          aberto = !aberto;
          pub("estado", { contato: aberto ? "aberto" : "fechado" });
          console.log(`${tag} contato=${aberto ? "aberto" : "fechado"}`);
        }
      }, rapido ? 10_000 : 60_000);
      break;
    }
    case "sensor_temperatura": {
      let t = 23 + Math.random() * 2;
      const tick = () => {
        t = Math.max(10, Math.min(40, t + (Math.random() - 0.5) * 1.2));
        const umidade = Math.round(45 + Math.random() * 20);
        pub("estado", { temperatura: Number(t.toFixed(1)), umidade });
        console.log(`${tag} ${t.toFixed(1)} °C ${umidade}%`);
      };
      tick();
      setInterval(tick, rapido ? 15_000 : 120_000);
      break;
    }
    case "atuador_tomada": {
      let ligada = false;
      pub("estado", { tomada: "desligada" }, 1);
      c.subscribe(`${base}/comando`, { qos: 1 });
      c.on("message", (t, payload) => {
        if (t !== `${base}/comando`) return;
        try {
          const { acao } = JSON.parse(payload.toString()) as { acao?: string };
          if (acao !== "ligar" && acao !== "desligar") return;
          ligada = acao === "ligar";
          // pequena demora, como o relé real
          setTimeout(() => {
            pub("estado", { tomada: ligada ? "ligada" : "desligada" }, 1);
            console.log(`${tag} comando ${acao} → confirmado`);
          }, 400);
        } catch {
          // payload inválido: ignora, como o firmware
        }
      });
      break;
    }
    case "botao_sos": {
      if (flag("sos")) {
        setTimeout(() => {
          pub("sos", { emergencia: true }, 1);
          console.log(`${tag} 🚨 botão pressionado`);
        }, 5000);
      }
      break;
    }
  }
}

async function main() {
  const tipoParear = valor("parear");
  if (tipoParear) {
    if (!tipoDispositivoEnum.includes(tipoParear as TipoDispositivo)) {
      throw new Error(`tipo inválido. Use um de: ${tipoDispositivoEnum.join(", ")}`);
    }
    await rodar(await parear(tipoParear as TipoDispositivo));
    return;
  }

  const residencia = valor("residencia");
  const lista = await (residencia
    ? db.select().from(dispositivos).where(eq(dispositivos.residenciaId, residencia))
    : db.select().from(dispositivos));
  await pgClient.end();
  if (lista.length === 0) {
    console.log("Nenhum dispositivo no banco. Rode `bun run db:seed` ou use --parear <tipo>.");
    process.exit(0);
  }
  console.log(`Simulando ${lista.length} dispositivo(s). Ctrl+C para parar.`);
  for (const d of lista) {
    await rodar({
      residenciaId: d.residenciaId,
      dispositivoId: d.id,
      deviceKey: d.deviceKey,
      tipo: d.tipo,
      nome: d.nome,
    });
  }
}

main().catch((err) => {
  console.error("Erro no simulador:", (err as Error).message);
  process.exit(1);
});
