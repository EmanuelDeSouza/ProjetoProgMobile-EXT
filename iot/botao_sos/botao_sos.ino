/*
  CuidaLar · Botão físico de emergência — ESP32 + botão
  Contrato: docs/SPEC.md 6.3 e RF-15 → .../sos {"emergencia":true} (QoS 1, sem passar pelo app)
  Ligação: botão entre GPIO15 e GND (pull-up interno). LED de confirmação no GPIO2.
  Segurar 1 s para disparar (evita toque sem querer, como no app — DESIGN.md).
*/
#include <CuidaLarCore.h>

const int PIN_BOTAO = 15;
const int PIN_LED = 2;
const unsigned long SEGURAR_MS = 1000;

CuidaLar cuidalar("botao_sos");
unsigned long pressionadoDesde = 0;
bool disparado = false;
bool pendente = false;  // sem rede no momento: tenta de novo até conseguir

void setup() {
  Serial.begin(115200);
  pinMode(PIN_BOTAO, INPUT_PULLUP);
  pinMode(PIN_LED, OUTPUT);
  cuidalar.begin();
}

void loop() {
  cuidalar.loop();
  bool apertado = digitalRead(PIN_BOTAO) == LOW;

  if (apertado) {
    if (pressionadoDesde == 0) pressionadoDesde = millis();
    if (!disparado && millis() - pressionadoDesde >= SEGURAR_MS) {
      disparado = true;
      pendente = true;
      Serial.println("SOS acionado!");
    }
  } else {
    pressionadoDesde = 0;
    disparado = false;
  }

  if (pendente) {
    if (cuidalar.publicarSOS()) {
      pendente = false;
      for (int i = 0; i < 6; i++) {  // LED pisca: pedido saiu
        digitalWrite(PIN_LED, i % 2);
        delay(150);
      }
      digitalWrite(PIN_LED, LOW);
    } else {
      digitalWrite(PIN_LED, (millis() / 100) % 2);  // pisca rápido: tentando enviar
    }
  }
}
