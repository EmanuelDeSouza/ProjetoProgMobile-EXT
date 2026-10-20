/*
  CuidaLar - Sensor de Temperatura e Umidade (ESP32 + DHT22)
  Contrato: SPEC.md seção 6.3
  Tópicos:
    - cuidalar/{residencia_id}/{dispositivo_id}/estado
    - cuidalar/{residencia_id}/{dispositivo_id}/heartbeat
*/

#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>

const char* WIFI_SSID = "SUA_REDE_WIFI";
const char* WIFI_PASS = "SUA_SENHA_WIFI";
const char* MQTT_BROKER = "192.168.1.100";
const int MQTT_PORT = 1883;

const char* RESIDENCIA_ID = "RESIDENCIA_UUID";
const char* DISPOSITIVO_ID = "DISPOSITIVO_UUID";
const char* DEVICE_KEY = "DEVICE_KEY";

const int PIN_DHT = 4;
#define DHTTYPE DHT22

DHT dht(PIN_DHT, DHTTYPE);

WiFiClient espClient;
PubSubClient client(espClient);

char topicEstado[128];
char topicHeartbeat[128];

unsigned long lastHeartbeat = 0;
unsigned long lastRead = 0;

void setup() {
  Serial.begin(115200);
  dht.begin();

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

  unsigned long now = millis();

  // Leitura a cada 10 segundos
  if (now - lastRead >= 10000) {
    lastRead = now;
    float t = dht.readTemperature();
    float h = dht.readHumidity();

    if (!isnan(t) && !isnan(h)) {
      char payload[96];
      snprintf(payload, sizeof(payload), "{\"temperatura\": %.1f, \"umidade\": %.1f}", t, h);
      client.publish(topicEstado, payload);
      Serial.printf("Temperatura publicada: %s\n", payload);
    }
  }

  // Heartbeat a cada 60s
  if (now - lastHeartbeat >= 60000) {
    lastHeartbeat = now;
    client.publish(topicHeartbeat, "{\"status\": \"ok\"}");
  }

  delay(100);
}
