/*
  CuidaLar - Atuador de Tomada (ESP32 + Relé)
  Contrato: SPEC.md seção 6.3 e RF-10
  Tópicos:
    - cuidalar/{residencia_id}/{dispositivo_id}/comando (Assina)
    - cuidalar/{residencia_id}/{dispositivo_id}/estado  (Publica confirmação)
    - cuidalar/{residencia_id}/{dispositivo_id}/heartbeat
*/

#include <WiFi.h>
#include <PubSubClient.h>

const char* WIFI_SSID = "SUA_REDE_WIFI";
const char* WIFI_PASS = "SUA_SENHA_WIFI";
const char* MQTT_BROKER = "192.168.1.100";
const int MQTT_PORT = 1883;

const char* RESIDENCIA_ID = "RESIDENCIA_UUID";
const char* DISPOSITIVO_ID = "DISPOSITIVO_UUID";
const char* DEVICE_KEY = "DEVICE_KEY";

const int PIN_RELE = 23;

WiFiClient espClient;
PubSubClient client(espClient);

char topicComando[128];
char topicEstado[128];
char topicHeartbeat[128];

unsigned long lastHeartbeat = 0;
bool estadoTomadaLigada = false;

void callback(char* topic, byte* payload, unsigned int length) {
  String message = "";
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  Serial.printf("Comando recebido em %s: %s\n", topic, message.c_str());

  if (message.indexOf("ligar") >= 0) {
    estadoTomadaLigada = true;
    digitalWrite(PIN_RELE, HIGH);
  } else if (message.indexOf("desligar") >= 0) {
    estadoTomadaLigada = false;
    digitalWrite(PIN_RELE, LOW);
  }

  // RF-10: Confirma novo estado via tópico de estado
  char confirmPayload[64];
  snprintf(confirmPayload, sizeof(confirmPayload), "{\"tomada\": \"%s\"}", estadoTomadaLigada ? "ligada" : "desligada");
  client.publish(topicEstado, confirmPayload, true);
  Serial.printf("Confirmação enviada: %s\n", confirmPayload);
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_RELE, OUTPUT);
  digitalWrite(PIN_RELE, LOW);

  snprintf(topicComando, sizeof(topicComando), "cuidalar/%s/%s/comando", RESIDENCIA_ID, DISPOSITIVO_ID);
  snprintf(topicEstado, sizeof(topicEstado), "cuidalar/%s/%s/estado", RESIDENCIA_ID, DISPOSITIVO_ID);
  snprintf(topicHeartbeat, sizeof(topicHeartbeat), "cuidalar/%s/%s/heartbeat", RESIDENCIA_ID, DISPOSITIVO_ID);

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Conectado!");

  client.setServer(MQTT_BROKER, MQTT_PORT);
  client.setCallback(callback);
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("Conectando ao MQTT...");
    if (client.connect(DISPOSITIVO_ID, DISPOSITIVO_ID, DEVICE_KEY)) {
      Serial.println("Conectado!");
      client.subscribe(topicComando, 1);
      // Publica estado inicial
      char initPayload[64];
      snprintf(initPayload, sizeof(initPayload), "{\"tomada\": \"%s\"}", estadoTomadaLigada ? "ligada" : "desligada");
      client.publish(topicEstado, initPayload, true);
    } else {
      delay(5000);
    }
  }
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  unsigned long now = millis();
  if (now - lastHeartbeat >= 60000) {
    lastHeartbeat = now;
    client.publish(topicHeartbeat, "{\"status\": \"ok\"}");
  }
}
