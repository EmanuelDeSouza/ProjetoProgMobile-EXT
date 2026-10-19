# CuidaLar · Firmware IoT (ESP32)

Este diretório contém os códigos-fonte dos firmwares para microcontroladores **ESP32** utilizados no CuidaLar, desenvolvidos no ecossistema Arduino/C++.

## Contrato de Comunicação (MQTT)

Conforme especificado em `docs/SPEC.md` (Seção 6.3), os dispositivos comunicam-se com o broker Mosquitto via MQTT sobre TLS (ou TCP local para desenvolvimento):

### Tópicos por dispositivo

```
cuidalar/{residencia_id}/{dispositivo_id}/estado      — Dispositivo publica leitura/estado
cuidalar/{residencia_id}/{dispositivo_id}/heartbeat   — Dispositivo publica a cada 60s
cuidalar/{residencia_id}/{dispositivo_id}/comando     — Servidor publica, dispositivo assina (atuadores)
cuidalar/{residencia_id}/{dispositivo_id}/sos         — Dispositivo publica emergência (QoS 1)
```

### Payloads JSON estáveis por tipo

1. **Sensor de Presença (`sensor_presenca`)**:
   - `.../estado`: `{"presenca": true}` ou `{"presenca": false}`
2. **Sensor de Contato (`sensor_contato`)**:
   - `.../estado`: `{"contato": "aberto"}` ou `{"contato": "fechado"}`
3. **Sensor de Temperatura e Umidade (`sensor_temperatura`)**:
   - `.../estado`: `{"temperatura": 24.5, "umidade": 58.0}`
4. **Atuador de Tomada (`atuador_tomada`)**:
   - Inscrição em `.../comando`: `{"acao": "ligar"}` ou `{"acao": "desligar"}`
   - Confirmação em `.../estado`: `{"tomada": "ligada"}` ou `{"tomada": "desligada"}`
5. **Botão de Emergência SOS (`botao_sos`)**:
   - `.../sos`: `{"emergencia": true, "timestamp": 1718000000}` (QoS 1)

## Fluxo de Pareamento (RF-07)

1. Ao ligar pela primeira vez (ou se não houver credenciais salvas em NVS/EEPROM), o ESP32 entra em modo **Access Point (AP)** com SSID `CuidaLar-Setup-XXXX`.
2. O firmware gera um código de pareamento de 6 dígitos numéricos (válido por 10 minutos) e o exibe via Serial (e display caso presente).
3. O cuidador digita esse código no app.
4. O servidor associa o código à residência e emite as credenciais MQTT (`residencia_id`, `dispositivo_id`, `device_key`).
5. O dispositivo recebe a configuração Wi-Fi e as credenciais, salva na memória não volátil e reinicia no modo de operação normal.

## Estrutura de Pastas

- `sensor_presenca/`: Firmware para detector de movimento PIR
- `sensor_contato/`: Firmware para sensor de porta/janela magnético
- `sensor_temperatura/`: Firmware para medição de temperatura e umidade (DHT22)
- `atuador_tomada/`: Firmware para acionamento de relé com confirmação de estado
- `botao_sos/`: Firmware para botão físico dedicado de emergência com QoS 1
- `simulator.ts`: Simulador em TypeScript/Bun para testar toda a malha MQTT sem placas físicas

## Como executar o Simulador de Dispositivos

Para testar o fluxo de ponta a ponta sem placas físicas ESP32:

```bash
# Executa o simulador conectando ao broker Mosquitto local
bun iot/simulator.ts
```

