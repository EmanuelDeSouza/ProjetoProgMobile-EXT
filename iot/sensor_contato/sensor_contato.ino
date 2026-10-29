/*
  CuidaLar · Sensor de contato (porta/janela) — ESP32 + reed switch
  Contrato: docs/SPEC.md 6.3 → .../estado {"contato":"aberto"|"fechado"}
  Ligação: reed switch entre GPIO14 e GND (pull-up interno). Ímã encostado = fechado.
*/
#include <CuidaLarCore.h>

const int PIN_REED = 14;
CuidaLar cuidalar("sensor_contato");

bool ultimoAberto = false;
unsigned long ultimaMudanca = 0;

void publicar(bool aberto) {
  cuidalar.publicarEstado(aberto ? "{\"contato\":\"aberto\"}" : "{\"contato\":\"fechado\"}");
  Serial.printf("contato: %s\n", aberto ? "aberto" : "fechado");
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_REED, INPUT_PULLUP);
  cuidalar.onConectado([]() { publicar(digitalRead(PIN_REED) == HIGH); });
  cuidalar.begin();
  ultimoAberto = digitalRead(PIN_REED) == HIGH;
}

void loop() {
  cuidalar.loop();
  bool aberto = digitalRead(PIN_REED) == HIGH;
  // debounce de 200 ms: porta batendo não vira rajada de eventos
  if (aberto != ultimoAberto && millis() - ultimaMudanca > 200) {
    ultimaMudanca = millis();
    ultimoAberto = aberto;
    publicar(aberto);
  }
}
