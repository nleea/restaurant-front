#!/bin/sh
# Genera /env.js en runtime a partir de las variables de entorno del pod
# (K8s Secret/ConfigMap). El entrypoint oficial de nginx ejecuta todo lo que
# haya en /docker-entrypoint.d/*.sh antes de arrancar nginx.
set -e

: "${VITE_API_BASE_URL:=}"
: "${VITE_API_PORT:=}"

cat > /usr/share/nginx/html/env.js <<EOF
window.__ENV__ = {
  VITE_API_BASE_URL: "${VITE_API_BASE_URL}",
  VITE_API_PORT: "${VITE_API_PORT}",
};
EOF

echo "[env-js] env.js generado (VITE_API_BASE_URL='${VITE_API_BASE_URL}')"
