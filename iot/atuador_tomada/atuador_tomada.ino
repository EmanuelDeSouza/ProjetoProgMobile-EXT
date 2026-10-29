/*
  CuidaLar · Tomada inteligente — ESP32 + módulo relé
  Contrato: docs/SPEC.md 6.3 e RF-10
    assina   .../comando {"acao":"ligar"|"desligar"}
    confirma .../estado  {"tomada":"ligada"|"desligada"}  ← é isto que o app mostra como sucesso
  Ligação: entrada do relé no GPIO23. ATENÇÃO: 127/220 V — monte em caixa fechada e com supervisão.
*/
#include <CuidaLarCore.h>

const int PIN_RELE = 23;
const bool RELE_ATIVO_EM_HIGH = true;  // troque para false se o seu módulo liga com LOW

CuidaLar cuidalar("atuador_tomada");
bool ligada = false;

void aplicar(bool liga) {
  ligada = liga;
  digitalWrite(PIN_RELE, (liga == RELE_ATIVO_EM_HIGH) ? HIGH : LOW);
}

void confirmar() {
  // Só confirma o estado que o relé realmente assumiu.
  cuidalar.publicarEstado(ligada ? "{\"tomada\":\"ligada\"}" : "{\"tomada\":\"desligada\"}", true);
  Serial.printf("tomada: %s\n", ligada ? "ligada" : "desligada");
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_RELE, OUTPUT);
  aplicar(false);  // ao religar após queda de energia, começa desligada (segurança)
  cuidalar.onComando([](const char* acao) {
    aplicar(strcmp(acao, "ligar") == 0);
    confirmar();
  });
  cuidalar.onConectado(confirmar);
  cuidalar.begin();
}

void loop() {
  cuidalar.loop();
}
