// Configuração de compilação do firmware CuidaLar.
// Os valores de provisionamento precisam bater com MQTT_PROVISIONING_* do api/.env.
#pragma once

#ifndef CUIDALAR_PROVISIONAMENTO_USUARIO
#define CUIDALAR_PROVISIONAMENTO_USUARIO "provisionamento"
#endif

#ifndef CUIDALAR_PROVISIONAMENTO_SENHA
#define CUIDALAR_PROVISIONAMENTO_SENHA "provisionamento-dev"
#endif

// 0 = MQTT sem TLS na porta 1883 (desenvolvimento na rede local)
// 1 = TLS na porta 8883 (produção, RNF-07). Cole a CA (mosquitto/certs/ca.crt) em CUIDALAR_CA_PEM.
#ifndef CUIDALAR_MQTT_TLS
#define CUIDALAR_MQTT_TLS 0
#endif

#if CUIDALAR_MQTT_TLS
#include <WiFiClientSecure.h>
#define CUIDALAR_MQTT_PORTA_PADRAO 8883
#ifndef CUIDALAR_CA_PEM
#define CUIDALAR_CA_PEM \
  "-----BEGIN CERTIFICATE-----\n" \
  "COLE AQUI O CONTEUDO DE mosquitto/certs/ca.crt\n" \
  "-----END CERTIFICATE-----\n"
#endif
#else
#define CUIDALAR_MQTT_PORTA_PADRAO 1883
#endif

#define CUIDALAR_HEARTBEAT_MS 60000UL        // SPEC 6.3
#define CUIDALAR_ANUNCIO_MS 30000UL          // reanuncia o código enquanto espera
#define CUIDALAR_VALIDADE_CODIGO_MS 600000UL // RF-07: 10 minutos
#define CUIDALAR_PORTAL_TIMEOUT_S 600        // portal fica aberto até 10 minutos
#define CUIDALAR_PINO_RESET 0                // botão BOOT
#define CUIDALAR_PINO_LED 2                  // LED da placa (pisca durante o pareamento)
