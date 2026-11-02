#!/usr/bin/env bash
# Uso: ./actualizar.sh [ruta/al/streamcrm-local-vX.Y.Z.zip]
cd "$(dirname "$0")"
echo "Cierra StreamCRM (o detén el servicio: sudo systemctl stop streamcrm) antes de continuar."
read -r -p "Presiona Enter para seguir… " _
npm run update -- "$@"
