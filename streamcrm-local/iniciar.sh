#!/usr/bin/env bash
cd "$(dirname "$0")"
[ -d node_modules/express ] || ./instalar.sh || exit 1
export STREAMCRM_OPEN="${STREAMCRM_OPEN:-1}"
exec node --disable-warning=ExperimentalWarning src/server.js
