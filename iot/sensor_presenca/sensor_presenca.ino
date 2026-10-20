/*
  CuidaLar - Sensor de Presença (ESP32 + PIR)
  Contrato: SPEC.md seção 6.3
  Tópicos:
    - cuidalar/{residencia_id}/{dispositivo_id}/estado
    - cuidalar/{residencia_id}/{dispositivo_id}/heartbeat
*/

#include <WiFi.h>
#include <PubSubClient.h>

// Configurações do Wi-Fi e MQTT (preenchidas no pareamento)
const char* WIFI_SSID = "SUA_REDE_WIFI";
const char* WIFI_PASS = "SUA_SENHA_WIFI";
const char* MQTT_BROKER = "192.168.1.100";
const int MQTT_PORT = 1883;

// Identificadores do dispositivo
const char* RESIDENCIA_ID = "RESIDENCIA_UUID";
const char* DISPOSITIVO_ID = "DISPOSITIVO_UUID";
const char* DEVICE_KEY = "DEVICE_KEY";

// Pinos
const int PIN_PIR = 13;
const int PIN_LED = 2;

WiFiClient espClient;
PubSubClient client(espClient);

char topicEstado[128];
char topicHeartbeat[128];

unsigned long lastHeartbeat = 0;
bool lastPresenceState = false;

void setup() {
  Serial.begin(115200);
  pinMode(PIN_PIR, INPUT);
  pinMode(PIN_LED, OUTPUT);

  snprintf(topicEstado, sizeof(topicEstado), "cuidalar/%s/%s/estado", RESIDENCIA_ID, DISPOSITIVO_ID);
  snprintf(topicHeartbeat, sizeof(topicHeartbeat), "cuidalar/%s/%s/heartbeat", RESIDENCIA_ID, DISPOSITIVO_ID);

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Conectado!");

  client.setServer(MQTT_BROKER, MQTT_PORT);
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("Conectando ao MQTT...");
    if (client.connect(DISPOSITIVO_ID, DISPOSITIVO_ID, DEVICE_KEY)) {
      Serial.println("Conectado!");
    } else {
      Serial.print("Falha rc=");
      Serial.print(client.state());
      delay(5000);
    }
  }
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  // Leitura do sensor
  bool currentPresence = digitalRead(PIN_PIR) == HIGH;
  digitalWrite(PIN_LED, currentPresence ? HIGH : LOW);

  // Publica alteração de estado
  if (currentPresence != lastPresenceState) {
    lastPresenceState = currentPresence;
    char payload[32];
    snprintf(payload, sizeof(payload), "{\"presenca\": %s}", currentPresence ? "true" : "false");
    client.publish(topicEstado, payload, true);
    Serial.printf("Estado publicado: %s\n", payload);
  }

  // Heartbeat a cada 60s (conforme SPEC.md 6.3)
  unsigned long now = millis();
  if (now - lastHeartbeat >= 60000) {
    lastHeartbeat = now;
    client.publish(topicHeartbeat, "{\"status\": \"ok\"}");
    Serial.println("Heartbeat publicado");
  }

  delay(100);
}
