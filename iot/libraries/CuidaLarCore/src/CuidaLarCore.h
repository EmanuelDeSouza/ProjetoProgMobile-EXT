/*
  CuidaLarCore — base comum dos dispositivos CuidaLar (ESP32, Arduino framework).
  Contrato: docs/SPEC.md seção 6.3 (tópicos, payloads e pareamento).

  Ciclo de vida:
    1. Sem credencial salva → gera código de 6 dígitos + chave aleatória de 32 bytes e abre o
       portal Wi-Fi "CuidaLar-Setup-XXXX" (o código aparece na página do portal e no Serial).
    2. Pessoa informa o Wi-Fi da casa e o endereço do broker → o ESP32 conecta e anuncia
       {"tipo","chave"} em cuidalar/pareamento/{codigo}/anuncio (usuário "provisionamento").
    3. Cuidador digita o código no app → servidor publica a credencial cifrada (AES-256-GCM)
       em cuidalar/pareamento/{codigo}/credenciais → o ESP32 decifra, salva e reinicia.
    4. Operação normal: usuário MQTT = id do dispositivo, senha = device key; heartbeat a cada 60s.

  Para parear de novo: segure o botão BOOT (GPIO0) por 5 s logo depois de ligar.
*/
#pragma once

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <Preferences.h>
#include <functional>

#include "CuidaLarConfig.h"

class CuidaLar {
 public:
  using ComandoHandler = std::function<void(const char* acao)>;

  /** tipo: sensor_presenca | sensor_contato | sensor_temperatura | atuador_tomada | botao_sos */
  explicit CuidaLar(const char* tipo);

  /** Chame no setup(). Bloqueia no portal/pareamento até ter credencial (e reinicia ao recebê-la). */
  void begin();

  /** Chame em todo loop(): mantém Wi-Fi/MQTT, heartbeat e entrega comandos. */
  void loop();

  bool conectado();

  /** Publica em .../estado (JSON pequeno, ex.: {"contato":"aberto"}). retain para o painel ver o último. */
  bool publicarEstado(const char* json, bool qos1 = false);

  /** Publica {"emergencia":true} em .../sos com QoS 1 (só botao_sos). Retorna true se o broker confirmou envio. */
  bool publicarSOS();

  /** Só atuadores: recebe "ligar" / "desligar" de .../comando. Confirme publicando o novo estado. */
  void onComando(ComandoHandler h);

  /** Chamado a cada (re)conexão: bom lugar para publicar o estado atual. */
  void onConectado(std::function<void()> h);

  /** Apaga credencial e configuração de rede e reinicia em modo de pareamento. */
  void esquecer();

 private:
  const char* _tipo;
  Preferences _prefs;
  WiFiClient _wifiPlain;
#if CUIDALAR_MQTT_TLS
  WiFiClientSecure _wifiTls;
#endif
  PubSubClient _mqtt;
  String _broker;
  uint16_t _porta = CUIDALAR_MQTT_PORTA_PADRAO;
  String _residenciaId, _dispositivoId, _deviceKey;
  String _tEstado, _tHeartbeat, _tSos, _tComando;
  unsigned long _ultimoHeartbeat = 0;
  unsigned long _ultimaTentativa = 0;
  ComandoHandler _aoComando;
  std::function<void()> _aoConectar;

  bool _temCredencial();
  void _carregar();
  void _checarBotaoReset();
  void _modoPareamento();
  bool _aplicarCredencialCifrada(const uint8_t* payload, unsigned int len, const uint8_t chave[32]);
  bool _reconectar();
  void _aoMensagem(char* topic, uint8_t* payload, unsigned int len);
};
