#!/bin/sh
# Cria o arquivo do dynamic security com o usuário admin da API na primeira subida.
set -e
ARQ=/mosquitto/data/dynamic-security.json
if [ ! -f "$ARQ" ]; then
  echo "[cuidalar] criando $ARQ com admin '$MQTT_ADMIN_USER'"
  mosquitto_ctrl dynsec init "$ARQ" "$MQTT_ADMIN_USER" "$MQTT_ADMIN_PASSWORD"
fi
chown -R mosquitto:mosquitto /mosquitto/data
chmod 700 /mosquitto/data
chmod 600 "$ARQ"
exec /usr/sbin/mosquitto -c /mosquitto/config/mosquitto.conf
