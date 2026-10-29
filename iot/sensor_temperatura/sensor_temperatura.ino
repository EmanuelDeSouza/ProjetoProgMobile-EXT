/*
  CuidaLar · Sensor de temperatura e umidade — ESP32 + DHT22
  Contrato: docs/SPEC.md 6.3 → .../estado {"temperatura":23.4,"umidade":55}
  Ligação: dados do DHT22 no GPIO4 (resistor de 10k para 3V3). Biblioteca: "DHT sensor library" (Adafruit).
*/
#include <CuidaLarCore.h>
#include <DHT.h>

const int PIN_DHT = 4;
const unsigned long INTERVALO_MS = 60000UL;       // leitura a cada 1 min
const float VARIACAO_PARA_ENVIAR = 0.5;            // ou antes, se mudar 0,5 °C

DHT dht(PIN_DHT, DHT22);
CuidaLar cuidalar("sensor_temperatura");
unsigned long ultimaLeitura = 0;
float ultimaTemp = NAN;

void lerEPublicar(bool forcar) {
  float t = dht.readTemperature();
  float u = dht.readHumidity();
  if (isnan(t) || isnan(u)) {
    Serial.println("DHT22 sem leitura (confira a ligação)");
    return;  // nunca publica valor inventado
  }
  if (!forcar && !isnan(ultimaTemp) && fabs(t - ultimaTemp) < VARIACAO_PARA_ENVIAR &&
      millis() - ultimaLeitura < INTERVALO_MS) {
    return;
  }
  char json[64];
  snprintf(json, sizeof(json), "{\"temperatura\":%.1f,\"umidade\":%.0f}", t, u);
  cuidalar.publicarEstado(json);
  ultimaTemp = t;
  ultimaLeitura = millis();
  Serial.println(json);
}

void setup() {
  Serial.begin(115200);
  dht.begin();
  cuidalar.onConectado([]() { lerEPublicar(true); });
  cuidalar.begin();
}

void loop() {
  cuidalar.loop();
  static unsigned long ultimaAmostra = 0;
  if (millis() - ultimaAmostra > 5000) {  // DHT22 aguenta 1 leitura a cada 2 s
    ultimaAmostra = millis();
    lerEPublicar(millis() - ultimaLeitura >= INTERVALO_MS);
  }
}
