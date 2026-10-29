/*
  CuidaLar · Sensor de presença — ESP32 + PIR (HC-SR501)
  Contrato: docs/SPEC.md 6.3 → .../estado {"presenca":true|false}
  Ligação: saída do PIR no GPIO13. O servidor conta "sem movimento" a partir do último {"presenca":true}.
*/
#include <CuidaLarCore.h>

const int PIN_PIR = 13;
const int PIN_LED = 2;
const unsigned long REPETIR_PRESENCA_MS = 5UL * 60UL * 1000UL;  // presença contínua: reafirma a cada 5 min

CuidaLar cuidalar("sensor_presenca");
bool ultimo = false;
unsigned long ultimoEnvio = 0;

void publicar(bool presenca) {
  cuidalar.publicarEstado(presenca ? "{\"presenca\":true}" : "{\"presenca\":false}");
  ultimoEnvio = millis();
  Serial.printf("presenca: %s\n", presenca ? "sim" : "nao");
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_PIR, INPUT);
  pinMode(PIN_LED, OUTPUT);
  cuidalar.onConectado([]() { publicar(digitalRead(PIN_PIR) == HIGH); });
  cuidalar.begin();
}

void loop() {
  cuidalar.loop();
  bool presenca = digitalRead(PIN_PIR) == HIGH;
  digitalWrite(PIN_LED, presenca ? HIGH : LOW);
  if (presenca != ultimo || (presenca && millis() - ultimoEnvio > REPETIR_PRESENCA_MS)) {
    ultimo = presenca;
    publicar(presenca);
  }
}
