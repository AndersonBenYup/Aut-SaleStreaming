#!/usr/bin/env bash
# Instalador de StreamCRM Local para Linux y macOS.
set -e
cd "$(dirname "$0")"
echo "== Instalando StreamCRM Local =="

if ! command -v node >/dev/null 2>&1; then
  echo "No se encontró Node.js (22.13 o más nuevo)."
  if [[ "$OSTYPE" == darwin* ]]; then
    echo "Instálalo con:  brew install node@22   o desde https://nodejs.org"
  else
    echo "Instálalo con:  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs"
    echo "o desde https://nodejs.org"
  fi
  exit 1
fi

if ! node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"; then
  echo "Tu Node.js ($(node -v)) es antiguo. Se necesita 22.13 o más nuevo."
  exit 1
fi

echo "Node.js $(node -v) encontrado. Instalando componentes…"
npm install --omit=dev --no-audit --no-fund
chmod +x iniciar.sh actualizar.sh tunel.sh scripts/*.sh 2>/dev/null || true
echo
echo "Listo. Para abrir StreamCRM:  ./iniciar.sh"
echo "Para dejarlo siempre encendido (servicio):  sudo ./scripts/servicio-linux.sh"
