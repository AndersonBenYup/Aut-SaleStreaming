#!/usr/bin/env bash
cd "$(dirname "$0")"
[ -x ./cloudflared ] && export CLOUDFLARED="$PWD/cloudflared"
exec node scripts/tunnel.js
