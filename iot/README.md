# CuidaLar · Firmware (ESP32)

Contrato com o servidor: [`docs/SPEC.md` seção 6.3](../docs/SPEC.md) (tópicos, payloads e pareamento). Mudou payload → mudou contrato: atualize a seção 6.3 no mesmo commit.

## Estrutura

```
iot/
├── libraries/CuidaLarCore/   biblioteca comum: portal Wi-Fi, pareamento, MQTT, heartbeat
├── sensor_presenca/          PIR no GPIO13              → {"presenca": true|false}
├── sensor_contato/           reed switch no GPIO14       → {"contato": "aberto"|"fechado"}
├── sensor_temperatura/       DHT22 no GPIO4              → {"temperatura": 23.4, "umidade": 55}
├── atuador_tomada/           relé no GPIO23              ← {"acao": "ligar"|"desligar"}  → {"tomada": "ligada"|"desligada"}
└── botao_sos/                botão no GPIO15 (segurar 1 s) → .../sos {"emergencia": true}
```

## Preparar o Arduino IDE

1. Placas: instale **esp32 by Espressif Systems** (Gerenciador de Placas).
2. Bibliotecas (Gerenciador de Bibliotecas): **WiFiManager** (tzapu), **PubSubClient** (Nick O'Leary), **ArduinoJson** (v7) e, para o sensor de temperatura, **DHT sensor library** (Adafruit).
3. Aponte o *Sketchbook location* (Arquivo → Preferências) para esta pasta `iot/`. Assim o IDE enxerga `libraries/CuidaLarCore` sem copiar nada. Se preferir, copie `libraries/CuidaLarCore` para `Documentos/Arduino/libraries/`.
4. Abra o sketch do dispositivo, escolha a placa (ex.: *ESP32 Dev Module*) e grave.

Credencial de provisionamento: `libraries/CuidaLarCore/src/CuidaLarConfig.h` (`CUIDALAR_PROVISIONAMENTO_*`) tem de bater com `MQTT_PROVISIONING_*` do `api/.env`. Nenhuma device key vai no código: cada dispositivo recebe a sua no pareamento.

## Pareamento (RF-07)

1. Ligue o ESP32 novo. Ele gera um **código de 6 dígitos** e abre a rede Wi-Fi **`CuidaLar-Setup-XXXX`** (LED piscando).
2. Conecte o celular nessa rede. A página que abre mostra o **código** e pede:
   - o Wi-Fi da casa (nome e senha),
   - o **endereço do servidor** (IP do computador que roda o `docker compose`, ex.: `192.168.0.10`) e a porta (1883).
3. Salve. O ESP32 entra no Wi-Fi da casa e **anuncia o código** ao servidor.
4. No app do cuidador: **+ Parear** → digite o código, escolha o mesmo tipo do dispositivo, nome e cômodo. Prazo: 10 minutos.
5. O servidor cria um usuário MQTT só para esse dispositivo e manda a credencial **cifrada** (AES-256-GCM com a chave que o próprio ESP32 gerou). O ESP32 grava, pisca rápido e reinicia já online.

Para parear de novo (trocou de casa, de Wi-Fi ou de servidor): **segure o botão BOOT por 5 s logo depois de ligar**. O dispositivo antigo continua no painel como offline.

## Segurança (RNF-07)

- O broker não aceita conexão anônima. Cada dispositivo só publica nos próprios tópicos e só assina o próprio `.../comando` (ACL criada pela API no Mosquitto *dynamic security*).
- O usuário `provisionamento` (compartilhado, gravado no firmware) só consegue anunciar um código e receber credenciais cifradas — não lê nem publica telemetria.
- **TLS em produção**: gere os certificados com `mosquitto/gerar-certificados.sh <ip-ou-host>`, descomente o listener 8883 em `mosquitto/config/mosquitto.conf`, compile o firmware com `#define CUIDALAR_MQTT_TLS 1` e cole `mosquitto/certs/ca.crt` em `CUIDALAR_CA_PEM` (`CuidaLarConfig.h`).

## Sem hardware

`cd api && bun run iot:simulate` simula todos os dispositivos do banco. `bun run iot:simulate -- --parear sensor_contato` faz exatamente o fluxo acima (anuncia, espera o app, decifra a credencial) sem ESP32.
