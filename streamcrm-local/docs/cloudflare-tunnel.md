# Cloudflare Tunnel para el webhook de Retell

Retell avisa el resultado de cada llamada a una URL pública (`https://…/webhooks/retell`). Una PC de oficina no tiene
IP pública, así que se usa **Cloudflare Tunnel** (gratis). StreamCRM **solo acepta los webhooks** por el túnel:
cualquier otra ruta que llega por Cloudflare responde 403, así el panel no queda expuesto.

> Sin túnel el sistema también funciona: consulta a Retell cada 2 minutos (`get-call`). El túnel solo hace que el resultado llegue al instante.

## Opción A: túnel rápido (2 minutos, la URL cambia)

1. Instala cloudflared:
   - **Windows:** `winget install --id Cloudflare.cloudflared`. También puedes descargar `cloudflared-windows-amd64.exe` desde
     <https://github.com/cloudflare/cloudflared/releases>, renombrarlo a `cloudflared.exe` y ponerlo en la carpeta de StreamCRM.
   - **macOS:** `brew install cloudflared`
   - **Linux:** paquete `cloudflared` desde <https://pkg.cloudflare.com/>
2. Con StreamCRM abierto, ejecuta **`tunel.bat`** (o `./tunel.sh`).
3. Copia la URL que aparece, más `/webhooks/retell`, en la *Webhook URL* del agente de Retell. También la ves en **Ajustes → Webhook y red**.
4. Deja la ventana abierta.

Cada vez que se abre el túnel rápido, la URL cambia y hay que pegarla de nuevo en Retell.

## Opción B: túnel con nombre y dominio fijo (recomendado)

Necesitas un dominio administrado en Cloudflare (por ejemplo, uno `.com` barato).

1. En <https://one.dash.cloudflare.com> → **Networks → Tunnels → Create a tunnel → Cloudflared**. Ponle de nombre `streamcrm`.
2. Copia el **token** que muestra (el texto largo después de `--token`).
3. En **Public Hostname** agrega: subdominio `crm`, dominio `tunegocio.com`, servicio `HTTP` → `localhost:3000`.
4. En la carpeta de StreamCRM, abre `.env` con el Bloc de notas y agrega una línea:
   ```
   CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoi...
   ```
5. Ejecuta `tunel.bat`. En **Ajustes → Webhook y red** escribe la URL pública `https://crm.tunegocio.com` y guarda.
6. En Retell pega `https://crm.tunegocio.com/webhooks/retell`. Esta URL no cambia.

Para que el túnel arranque solo con Windows: `cloudflared service install <TOKEN>` (como administrador).

## Docker

```bash
CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoi... docker compose --profile tunel up -d
```
En Cloudflare apunta el hostname a `http://streamcrm:3000`.
