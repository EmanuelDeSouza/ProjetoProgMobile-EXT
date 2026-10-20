/*
  CuidaLar - Botão Físico Dedicado de SOS (ESP32)
  Contrato: SPEC.md seção 6.3, RF-15 (Emergência SOS)
  Tópicos:
    - cuidalar/{residencia_id}/{dispositivo_id}/sos (QoS 1)
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

const int PIN_BOTAO_SOS = 15;
const int PIN_LED_CONFIRM = 2;

WiFiClient espClient;
PubSubClient client(espClient);

char topicSOS[128];
char topicHeartbeat[128];

unsigned long lastHeartbeat = 0;
unsigned long lastDebounceTime = 0;
const unsigned long debounceDelay = 250;
int lastButtonState = HIGH;

void setup() {
  Serial.begin(115200);
  pinMode(PIN_BOTAO_SOS, INPUT_PULLUP);
  pinMode(PIN_LED_CONFIRM, OUTPUT);
  digitalWrite(PIN_LED_CONFIRM, LOW);

  snprintf(topicSOS, sizeof(topicSOS), "cuidalar/%s/%s/sos", RESIDENCIA_ID, DISPOSITIVO_ID);
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

void dispararSOS() {
  Serial.println("DISPARANDO SOS VIA BOTAO FISICO (QoS 1)...");
  digitalWrite(PIN_LED_CONFIRM, HIGH);

  const char* payload = "{\"emergencia\": true, \"origem\": \"botao_fisico\"}";
  // Publicação obrigatória com QoS 1 conforme SPEC.md 6.3 e RNF-07
  client.publish(topicSOS, payload, 1);

  delay(1000);
  digitalWrite(PIN_LED_CONFIRM, LOW);
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  int reading = digitalRead(PIN_BOTAO_SOS);

  if (reading == LOW && lastButtonState == HIGH) {
    if ((millis() - lastDebounceTime) > debounceDelay) {
      dispararSOS();
      lastDebounceTime = millis();
    }
  }
  lastButtonState = reading;

  unsigned long now = millis();
  if (now - lastHeartbeat >= 60000) {
    lastHeartbeat = now;
    client.publish(topicHeartbeat, "{\"status\": \"ok\"}");
  }
}
