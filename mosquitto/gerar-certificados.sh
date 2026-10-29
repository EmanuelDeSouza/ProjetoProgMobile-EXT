#!/bin/sh
# Gera CA + certificado do broker autoassinados para TLS (RNF-07). Uso: ./gerar-certificados.sh <host-ou-ip>
set -e
HOST="${1:-localhost}"
cd "$(dirname "$0")/certs"
openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -keyout ca.key -out ca.crt -subj "/CN=CuidaLar CA"
openssl req -newkey rsa:2048 -nodes -keyout server.key -out server.csr -subj "/CN=$HOST"
printf "subjectAltName=DNS:%s,IP:%s\n" "$HOST" "$HOST" > san.ext 2>/dev/null || true
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out server.crt -days 825 -extfile san.ext
rm -f server.csr san.ext
echo "Pronto: certs/ca.crt vai no firmware; descomente o listener 8883 em config/mosquitto.conf."
