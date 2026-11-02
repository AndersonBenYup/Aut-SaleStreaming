#!/usr/bin/env bash
# Instala StreamCRM como servicio systemd (arranca con el equipo y se reinicia si se cae).
#   sudo ./scripts/servicio-linux.sh            instalar
#   sudo ./scripts/servicio-linux.sh quitar     desinstalar
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
USER_NAME="${SUDO_USER:-$(whoami)}"
NODE="$(command -v node || true)"
UNIT=/etc/systemd/system/streamcrm.service

if [ "$(id -u)" -ne 0 ]; then echo "Ejecuta con sudo"; exit 1; fi

if [ "$1" = "quitar" ]; then
  systemctl disable --now streamcrm 2>/dev/null || true
  rm -f "$UNIT" && systemctl daemon-reload
  echo "Servicio eliminado."; exit 0
fi
[ -n "$NODE" ] || { echo "No se encontró node"; exit 1; }

cat > "$UNIT" <<EOF
[Unit]
Description=StreamCRM Local
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER_NAME
WorkingDirectory=$DIR
ExecStart=$NODE --disable-warning=ExperimentalWarning src/server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now streamcrm
echo "✔ Servicio activo. Estado: systemctl status streamcrm   Registro: journalctl -u streamcrm -f"
