// Cliente do plugin "dynamic security" do Mosquitto 2 (RNF-07).
// A API é admin do broker: cria um usuário MQTT por dispositivo (usuário = id, senha = device key)
// com ACL que só permite os próprios tópicos (SPEC 6.3), e o usuário compartilhado de provisionamento.
import type { MqttClient } from "mqtt";
import { config } from "./config";

const TOPICO_CMD = "$CONTROL/dynamic-security/v1";
const TOPICO_RESP = `${TOPICO_CMD}/response`;

type Comando = Record<string, unknown> & { command: string };
interface RespostaComando {
  command: string;
  error?: string;
  correlationData?: string;
  data?: { client?: { roles?: Array<{ rolename: string }> } };
}

export const ROLE_SERVIDOR = "cuidalar-servidor";
export const ROLE_PROVISIONAMENTO = "cuidalar-provisionamento";

export function topicosDispositivo(residenciaId: string, dispositivoId: string) {
  const base = `cuidalar/${residenciaId}/${dispositivoId}`;
  return {
    estado: `${base}/estado`,
    heartbeat: `${base}/heartbeat`,
    sos: `${base}/sos`,
    comando: `${base}/comando`,
  };
}

const ignoravel = (e?: string) => !e || /already|exists|já existe/i.test(e);

export class Dynsec {
  private pendentes = new Map<string, (r: RespostaComando) => void>();
  private seq = 0;

  constructor(private client: MqttClient) {
    client.on("message", (topic, payload) => {
      if (topic !== TOPICO_RESP) return;
      try {
        const body = JSON.parse(payload.toString()) as { responses?: RespostaComando[] };
        for (const r of body.responses ?? []) {
          const cb = r.correlationData ? this.pendentes.get(r.correlationData) : undefined;
          if (cb && r.correlationData) {
            this.pendentes.delete(r.correlationData);
            cb(r);
          }
        }
      } catch {
        // resposta malformada do broker: ignora
      }
    });
  }

  async iniciar(): Promise<void> {
    await new Promise<void>((ok, falha) =>
      this.client.subscribe(TOPICO_RESP, { qos: 1 }, (err) => (err ? falha(err) : ok()))
    );
  }

  /** Executa comandos em ordem; erros "já existe" são tratados como sucesso (idempotente). */
  async executar(comandos: Comando[], timeoutMs = 5000): Promise<RespostaComando[]> {
    const ids = comandos.map(() => `c${Date.now()}-${++this.seq}`);
    const promessas = ids.map(
      (id) =>
        new Promise<RespostaComando>((ok, falha) => {
          const t = setTimeout(() => {
            this.pendentes.delete(id);
            falha(new Error("timeout esperando resposta do broker (dynamic security)"));
          }, timeoutMs);
          this.pendentes.set(id, (r) => {
            clearTimeout(t);
            ok(r);
          });
        })
    );
    const payload = JSON.stringify({ commands: comandos.map((c, i) => ({ ...c, correlationData: ids[i] })) });
    await new Promise<void>((ok, falha) =>
      this.client.publish(TOPICO_CMD, payload, { qos: 1 }, (err) => (err ? falha(err) : ok()))
    );
    const respostas = await Promise.all(promessas);
    const erro = respostas.find((r) => !ignoravel(r.error));
    if (erro) throw new Error(`dynsec ${erro.command}: ${erro.error}`);
    return respostas;
  }

  /** Papéis base: o servidor enxerga tudo de cuidalar/#; provisionamento só anuncia e recebe credenciais. */
  private async temPapel(username: string, rolename: string): Promise<boolean> {
    const [r] = await this.executar([{ command: "getClient", username }]);
    return Boolean(r?.data?.client?.roles?.some((x) => x.rolename === rolename));
  }

  async garantirPapeisBase(): Promise<void> {
    // addClientRole repetido devolve "Internal error" no Mosquitto 2.0.x: só adiciona se faltar.
    const servidorOk = await this.temPapel(config.MQTT_USERNAME, ROLE_SERVIDOR);
    await this.executar([
      {
        command: "createRole",
        rolename: ROLE_SERVIDOR,
        acls: [
          { acltype: "subscribePattern", topic: "cuidalar/#", allow: true },
          { acltype: "publishClientSend", topic: "cuidalar/#", allow: true },
        ],
      },
      ...(servidorOk ? [] : [{ command: "addClientRole", username: config.MQTT_USERNAME, rolename: ROLE_SERVIDOR }]),
      {
        command: "createRole",
        rolename: ROLE_PROVISIONAMENTO,
        acls: [
          { acltype: "publishClientSend", topic: "cuidalar/pareamento/+/anuncio", allow: true },
          { acltype: "subscribePattern", topic: "cuidalar/pareamento/+/credenciais", allow: true },
        ],
      },
      {
        command: "createClient",
        username: config.MQTT_PROVISIONING_USERNAME,
        password: config.MQTT_PROVISIONING_PASSWORD,
        roles: [{ rolename: ROLE_PROVISIONAMENTO }],
      },
      // mantém a senha igual à do .env mesmo se o cliente já existia
      {
        command: "setClientPassword",
        username: config.MQTT_PROVISIONING_USERNAME,
        password: config.MQTT_PROVISIONING_PASSWORD,
      },
    ]);
  }

  /** Usuário MQTT do dispositivo + papel com ACL literal só dos próprios tópicos. */
  async garantirDispositivo(d: { id: string; residenciaId: string; deviceKey: string }): Promise<void> {
    await this.executar(comandosDispositivo(d));
  }

  /** Mesmo que garantirDispositivo, para muitos de uma vez (subida da API). */
  async garantirDispositivos(lista: Array<{ id: string; residenciaId: string; deviceKey: string }>): Promise<void> {
    for (let i = 0; i < lista.length; i += 50) {
      await this.executar(lista.slice(i, i + 50).flatMap(comandosDispositivo), 15_000);
    }
  }
}

function comandosDispositivo(d: { id: string; residenciaId: string; deviceKey: string }): Comando[] {
  const t = topicosDispositivo(d.residenciaId, d.id);
  const role = `disp-${d.id}`;
  return [
    {
      command: "createRole",
      rolename: role,
      acls: [
        { acltype: "publishClientSend", topic: t.estado, allow: true },
        { acltype: "publishClientSend", topic: t.heartbeat, allow: true },
        { acltype: "publishClientSend", topic: t.sos, allow: true },
        { acltype: "subscribePattern", topic: t.comando, allow: true },
      ],
    },
    { command: "createClient", username: d.id, password: d.deviceKey, roles: [{ rolename: role }] },
    { command: "setClientPassword", username: d.id, password: d.deviceKey },
  ];
}
