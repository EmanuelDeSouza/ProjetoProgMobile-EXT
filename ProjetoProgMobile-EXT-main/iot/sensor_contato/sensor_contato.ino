/*
  CuidaLar - Sensor de Contato (ESP32 + Reed Switch / Magnético)
  Contrato: SPEC.md seção 6.3
  Tópicos:
    - cuidalar/{residencia_id}/{dispositivo_id}/estado
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

const int PIN_REED = 14;

WiFiClient espClient;
PubSubClient client(espClient);

char topicEstado[128];
char topicHeartbeat[128];

unsigned long lastHeartbeat = 0;
String lastState = "";

void setup() {
  Serial.begin(115200);
  pinMode(PIN_REED, INPUT_PULLUP);

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
      delay(5000);
    }
  }
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  // HIGH = Aberto (ímã afastado), LOW = Fechado (ímã encostado)
  bool isAberto = digitalRead(PIN_REED) == HIGH;
  String currentState = isAberto ? "aberto" : "fechado";

  if (currentState != lastState) {
    lastState = currentState;
    char payload[64];
    snprintf(payload, sizeof(payload), "{\"contato\": \"%s\"}", currentState.c_str());
    client.publish(topicEstado, payload, true);
    Serial.printf("Contato publicado: %s\n", payload);
  }

  unsigned long now = millis();
  if (now - lastHeartbeat >= 60000) {
    lastHeartbeat = now;
    client.publish(topicHeartbeat, "{\"status\": \"ok\"}");
  }

  delay(200);
}
