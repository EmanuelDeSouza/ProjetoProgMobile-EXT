#include "CuidaLarCore.h"

#include <ArduinoJson.h>
#include <WiFiManager.h>
#include <esp_system.h>
#include "mbedtls/gcm.h"

namespace {

const char* NS = "cuidalar";

void hexDe(const uint8_t* bytes, size_t n, char* out) {
  static const char* H = "0123456789abcdef";
  for (size_t i = 0; i < n; i++) {
    out[i * 2] = H[bytes[i] >> 4];
    out[i * 2 + 1] = H[bytes[i] & 0x0f];
  }
  out[n * 2] = '\0';
}

int nibble(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

/** Converte hex em bytes. Retorna quantos bytes, ou -1 se inválido/não couber. */
int bytesDe(const char* hex, uint8_t* out, size_t max) {
  size_t len = strlen(hex);
  if (len % 2 != 0 || len / 2 > max) return -1;
  for (size_t i = 0; i < len / 2; i++) {
    int a = nibble(hex[i * 2]);
    int b = nibble(hex[i * 2 + 1]);
    if (a < 0 || b < 0) return -1;
    out[i] = (uint8_t)((a << 4) | b);
  }
  return (int)(len / 2);
}

void aleatorio(uint8_t* buf, size_t n) {
  // Com o rádio Wi-Fi ligado, esp_random() é RNG de hardware.
  for (size_t i = 0; i < n; i += 4) {
    uint32_t r = esp_random();
    for (size_t j = 0; j < 4 && i + j < n; j++) buf[i + j] = (uint8_t)(r >> (8 * j));
  }
}

void piscar(int vezes, int ms) {
  for (int i = 0; i < vezes; i++) {
    digitalWrite(CUIDALAR_PINO_LED, HIGH);
    delay(ms);
    digitalWrite(CUIDALAR_PINO_LED, LOW);
    delay(ms);
  }
}

}  // namespace

CuidaLar::CuidaLar(const char* tipo) : _tipo(tipo) {}

void CuidaLar::begin() {
  pinMode(CUIDALAR_PINO_LED, OUTPUT);
  pinMode(CUIDALAR_PINO_RESET, INPUT_PULLUP);
  _checarBotaoReset();
  _carregar();

#if CUIDALAR_MQTT_TLS
  _wifiTls.setCACert(CUIDALAR_CA_PEM);
  _mqtt.setClient(_wifiTls);
#else
  _mqtt.setClient(_wifiPlain);
#endif
  _mqtt.setBufferSize(1024);
  _mqtt.setKeepAlive(30);

  if (!_temCredencial()) {
    _modoPareamento();  // só volta reiniciando o ESP32
    return;
  }

  Serial.printf("[CuidaLar] %s pareado: dispositivo %s\n", _tipo, _dispositivoId.c_str());
  String base = "cuidalar/" + _residenciaId + "/" + _dispositivoId;
  _tEstado = base + "/estado";
  _tHeartbeat = base + "/heartbeat";
  _tSos = base + "/sos";
  _tComando = base + "/comando";

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin();  // usa o Wi-Fi salvo pelo portal
  _mqtt.setServer(_broker.c_str(), _porta);
  _mqtt.setCallback([this](char* t, uint8_t* p, unsigned int l) { _aoMensagem(t, p, l); });
}

void CuidaLar::loop() {
  if (!_temCredencial()) return;
  if (!_mqtt.connected()) {
    unsigned long agora = millis();
    if (agora - _ultimaTentativa < 5000 && _ultimaTentativa != 0) return;
    _ultimaTentativa = agora;
    if (!_reconectar()) return;
  }
  _mqtt.loop();
  if (millis() - _ultimoHeartbeat >= CUIDALAR_HEARTBEAT_MS) {
    _ultimoHeartbeat = millis();
    _mqtt.publish(_tHeartbeat.c_str(), "{}");
  }
}

bool CuidaLar::conectado() { return _mqtt.connected(); }

bool CuidaLar::publicarEstado(const char* json, bool qos1) {
  if (!_mqtt.connected()) return false;
  // PubSubClient publica em QoS 0; "qos1" aqui só força uma volta de loop para escoar o envio.
  bool ok = _mqtt.publish(_tEstado.c_str(), json, true);
  if (qos1) _mqtt.loop();
  return ok;
}

bool CuidaLar::publicarSOS() {
  if (!_mqtt.connected() && !_reconectar()) return false;
  bool ok = _mqtt.publish(_tSos.c_str(), "{\"emergencia\":true}");
  _mqtt.loop();
  return ok;
}

void CuidaLar::onComando(ComandoHandler h) { _aoComando = h; }

void CuidaLar::onConectado(std::function<void()> h) { _aoConectar = h; }

void CuidaLar::esquecer() {
  _prefs.begin(NS, false);
  _prefs.clear();
  _prefs.end();
  WiFiManager wm;
  wm.resetSettings();
  Serial.println("[CuidaLar] credenciais apagadas. Reiniciando em modo de pareamento.");
  delay(500);
  ESP.restart();
}

// ---------------- privado ----------------

bool CuidaLar::_temCredencial() { return _dispositivoId.length() > 0 && _deviceKey.length() > 0; }

void CuidaLar::_carregar() {
  _prefs.begin(NS, true);
  _broker = _prefs.getString("broker", "");
  _porta = _prefs.getUShort("porta", CUIDALAR_MQTT_PORTA_PADRAO);
  _residenciaId = _prefs.getString("res", "");
  _dispositivoId = _prefs.getString("disp", "");
  _deviceKey = _prefs.getString("key", "");
  _prefs.end();
}

void CuidaLar::_checarBotaoReset() {
  // Segurar BOOT por 5 s logo após ligar → esquece tudo e volta ao pareamento.
  if (digitalRead(CUIDALAR_PINO_RESET) != LOW) return;
  Serial.println("[CuidaLar] botão BOOT pressionado: segure 5 s para parear de novo...");
  unsigned long inicio = millis();
  while (digitalRead(CUIDALAR_PINO_RESET) == LOW) {
    digitalWrite(CUIDALAR_PINO_LED, (millis() / 100) % 2);
    if (millis() - inicio > 5000) {
      digitalWrite(CUIDALAR_PINO_LED, HIGH);
      esquecer();
    }
    delay(10);
  }
  digitalWrite(CUIDALAR_PINO_LED, LOW);
}

bool CuidaLar::_reconectar() {
  if (WiFi.status() != WL_CONNECTED) return false;
  String clientId = "disp-" + _dispositivoId.substring(0, 8);
  Serial.printf("[CuidaLar] conectando ao broker %s:%u...\n", _broker.c_str(), _porta);
  if (!_mqtt.connect(clientId.c_str(), _dispositivoId.c_str(), _deviceKey.c_str())) {
    Serial.printf("[CuidaLar] falhou (estado %d). Credencial revogada? Segure BOOT ao ligar para parear de novo.\n",
                  _mqtt.state());
    return false;
  }
  Serial.println("[CuidaLar] conectado.");
  if (strcmp(_tipo, "atuador_tomada") == 0) _mqtt.subscribe(_tComando.c_str(), 1);
  _mqtt.publish(_tHeartbeat.c_str(), "{}");
  _ultimoHeartbeat = millis();
  if (_aoConectar) _aoConectar();
  return true;
}

void CuidaLar::_aoMensagem(char* topic, uint8_t* payload, unsigned int len) {
  if (_tComando != topic || !_aoComando) return;
  JsonDocument doc;
  if (deserializeJson(doc, payload, len)) return;
  const char* acao = doc["acao"] | "";
  if (strcmp(acao, "ligar") == 0 || strcmp(acao, "desligar") == 0) _aoComando(acao);
}

void CuidaLar::_modoPareamento() {
  WiFi.mode(WIFI_AP_STA);  // rádio ligado: esp_random() passa a ser RNG de hardware
  delay(200);

  uint8_t chave[32];
  aleatorio(chave, sizeof(chave));
  char chaveHex[65];
  hexDe(chave, sizeof(chave), chaveHex);
  uint32_t n = esp_random() % 900000UL + 100000UL;
  char codigo[7];
  snprintf(codigo, sizeof(codigo), "%06lu", (unsigned long)n);

  Serial.println();
  Serial.println("==============================================");
  Serial.printf("  CuidaLar · %s\n", _tipo);
  Serial.printf("  CÓDIGO DE PAREAMENTO: %s\n", codigo);
  Serial.println("  1) Conecte o celular na rede CuidaLar-Setup");
  Serial.println("  2) Informe o Wi-Fi da casa e o servidor");
  Serial.println("  3) Digite o código no app (Parear dispositivo)");
  Serial.println("==============================================");

  // ---------- 1. Portal Wi-Fi (o código aparece na própria página) ----------
  static char html[360];
  snprintf(html, sizeof(html),
           "<div style='font-size:20px;margin:12px 0'>Código de pareamento:<br>"
           "<b style='font-size:40px;letter-spacing:6px'>%s</b></div>"
           "<p>Anote o código. Depois de salvar, digite-o no app CuidaLar em até 10 minutos.</p>",
           codigo);
  WiFiManager wm;
  wm.setTitle("CuidaLar");
  wm.setConfigPortalTimeout(CUIDALAR_PORTAL_TIMEOUT_S);
  WiFiManagerParameter pCodigo(html);
  char portaPadrao[6];
  snprintf(portaPadrao, sizeof(portaPadrao), "%u", _porta);
  WiFiManagerParameter pBroker("broker", "Endereço do servidor (IP do computador)", _broker.c_str(), 63);
  WiFiManagerParameter pPorta("porta", "Porta MQTT", portaPadrao, 5);
  wm.addParameter(&pCodigo);
  wm.addParameter(&pBroker);
  wm.addParameter(&pPorta);

  uint8_t mac[6];
  WiFi.macAddress(mac);
  char ap[32];
  snprintf(ap, sizeof(ap), "CuidaLar-Setup-%02X%02X", mac[4], mac[5]);
  if (!wm.startConfigPortal(ap)) {
    Serial.println("[CuidaLar] portal expirou sem configuração. Reiniciando.");
    ESP.restart();
  }

  _broker = String(pBroker.getValue());
  _broker.trim();
  long porta = String(pPorta.getValue()).toInt();
  _porta = (porta > 0 && porta < 65536) ? (uint16_t)porta : CUIDALAR_MQTT_PORTA_PADRAO;
  _prefs.begin(NS, false);
  _prefs.putString("broker", _broker);
  _prefs.putUShort("porta", _porta);
  _prefs.end();
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);

  // ---------- 2. Anúncio e espera da credencial ----------
  String tAnuncio = String("cuidalar/pareamento/") + codigo + "/anuncio";
  String tCred = String("cuidalar/pareamento/") + codigo + "/credenciais";
  String anuncio = String("{\"tipo\":\"") + _tipo + "\",\"chave\":\"" + chaveHex + "\"}";
  bool pronto = false;

  _mqtt.setServer(_broker.c_str(), _porta);
  _mqtt.setCallback([&](char* t, uint8_t* p, unsigned int l) {
    if (tCred != t || l == 0) return;
    if (_aplicarCredencialCifrada(p, l, chave)) pronto = true;
  });

  unsigned long inicio = millis();
  unsigned long ultimoAnuncio = 0;
  String clientId = String("setup-") + codigo;
  while (!pronto) {
    if (millis() - inicio > CUIDALAR_VALIDADE_CODIGO_MS) {
      Serial.println("[CuidaLar] código expirou (10 min). Reiniciando com código novo.");
      ESP.restart();
    }
    if (WiFi.status() != WL_CONNECTED) {
      piscar(1, 300);
      continue;
    }
    if (!_mqtt.connected()) {
      if (_mqtt.connect(clientId.c_str(), CUIDALAR_PROVISIONAMENTO_USUARIO, CUIDALAR_PROVISIONAMENTO_SENHA)) {
        _mqtt.subscribe(tCred.c_str(), 1);
        ultimoAnuncio = 0;
      } else {
        Serial.printf("[CuidaLar] não conectou ao broker %s:%u (estado %d)\n", _broker.c_str(), _porta, _mqtt.state());
        piscar(3, 150);
        delay(2000);
        continue;
      }
    }
    if (ultimoAnuncio == 0 || millis() - ultimoAnuncio > CUIDALAR_ANUNCIO_MS) {
      _mqtt.publish(tAnuncio.c_str(), anuncio.c_str());
      ultimoAnuncio = millis();
      Serial.printf("[CuidaLar] aguardando pareamento. Código: %s\n", codigo);
    }
    _mqtt.loop();
    digitalWrite(CUIDALAR_PINO_LED, (millis() / 500) % 2);  // pisca devagar: esperando o app
    delay(20);
  }

  _mqtt.disconnect();
  Serial.println("[CuidaLar] pareado! Reiniciando em modo normal.");
  piscar(5, 80);
  ESP.restart();
}

bool CuidaLar::_aplicarCredencialCifrada(const uint8_t* payload, unsigned int len, const uint8_t chave[32]) {
  JsonDocument msg;
  if (deserializeJson(msg, payload, len)) return false;
  const char* ivHex = msg["iv"] | "";
  const char* dadosHex = msg["dados"] | "";
  const char* tagHex = msg["tag"] | "";

  uint8_t iv[12], tag[16], cifrado[400], claro[401];
  if (bytesDe(ivHex, iv, sizeof(iv)) != 12 || bytesDe(tagHex, tag, sizeof(tag)) != 16) return false;
  int n = bytesDe(dadosHex, cifrado, sizeof(cifrado));
  if (n <= 0) return false;

  mbedtls_gcm_context gcm;
  mbedtls_gcm_init(&gcm);
  int r = mbedtls_gcm_setkey(&gcm, MBEDTLS_CIPHER_ID_AES, chave, 256);
  if (r == 0) r = mbedtls_gcm_auth_decrypt(&gcm, n, iv, sizeof(iv), nullptr, 0, tag, sizeof(tag), cifrado, claro);
  mbedtls_gcm_free(&gcm);
  if (r != 0) {
    Serial.println("[CuidaLar] credencial não decifrou (não é para este dispositivo).");
    return false;
  }
  claro[n] = '\0';

  JsonDocument cred;
  if (deserializeJson(cred, (const char*)claro)) return false;
  const char* res = cred["residenciaId"] | "";
  const char* disp = cred["dispositivoId"] | "";
  const char* key = cred["deviceKey"] | "";
  if (!*res || !*disp || !*key) return false;

  _prefs.begin(NS, false);
  _prefs.putString("res", res);
  _prefs.putString("disp", disp);
  _prefs.putString("key", key);
  _prefs.end();
  return true;
}
