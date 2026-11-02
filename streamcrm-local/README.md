# StreamCRM Local

Sistema para administrar a tus clientes de cuentas y perfiles de streaming (Netflix, Disney+, Max, Prime Video,
Spotify, YouTube Premium…). Antes de que venza cada suscripción **llama al cliente con un agente de voz de IA**
(Retell AI) o **le escribe por WhatsApp**, anota si va a renovar y te lo muestra en el Resumen.

- Funciona en **tu computadora** (Windows 10/11, macOS o Linux) o en un VPS. Tus datos se quedan contigo.
- Usa **tu propia cuenta** de Retell y de WhatsApp Business: tú pagas directo los minutos y mensajes.
- No necesita internet para abrir el panel. Para llamar o mandar WhatsApp sí.

---

## 1. Instalar en Windows (paso a paso)

1. **Descomprime** el archivo `streamcrm-local-vX.Y.Z.zip` en una carpeta fija, por ejemplo `C:\StreamCRM`.
   (No lo dejes en Descargas ni en el Escritorio.)
2. Haz doble clic en **`instalar.bat`**.
   - Si no tienes Node.js, el instalador intenta instalarlo solo. Si te lo pide, **cierra la ventana y vuelve a abrir `instalar.bat`**.
   - Si no se puede instalar solo, descarga **Node.js LTS** en <https://nodejs.org>, instálalo con “Siguiente, Siguiente” y vuelve a abrir `instalar.bat`.
3. Al terminar se crea en el escritorio el acceso directo **StreamCRM** y se abre el navegador en `http://localhost:3000`.

> La ventana negra que se abre **es el programa**: déjala abierta (puedes minimizarla). Si la cierras, no salen los recordatorios.
> Para que esté siempre encendido sin ventana, mira la [sección 7](#7-dejarlo-siempre-encendido).

### Linux / macOS

```bash
./instalar.sh
./iniciar.sh
```

### VPS con Docker

```bash
docker compose up -d --build     # panel en 127.0.0.1:3000 del servidor
```

---

## 2. Primer uso: el asistente

La primera vez aparece un asistente de 5 pasos:

1. **Tu negocio**: nombre (el agente lo dice en la llamada), logo, color, WhatsApp de contacto, país, zona horaria
   (America/Lima por defecto) y moneda (S/ por defecto).
2. **Administrador**: tu email y una contraseña de al menos 8 caracteres.
3. **Licencia**: pega la clave que te dio tu proveedor o elige **Probar 14 días** (demo: hasta 20 suscripciones,
   los avisos se simulan y no se llama a nadie).
4. **Recordatorios**: Llamada con IA (Retell), WhatsApp automático (Cloud API) o **Solo manual** (botón de WhatsApp,
   sin API). Puedes probar tus claves con **“Probar llamada a mi número”** o **“Enviar mensaje de prueba”**.
5. **Horarios**: cuántos días antes avisar (2), a qué hora (10:00) y el horario permitido para llamar (9:00 a 20:00).

> ⚠ **Haz una copia de seguridad del archivo `.env` y de la carpeta `data\`.** El `.env` tiene la clave que cifra
> las contraseñas de tus cuentas. Si se pierde, esas contraseñas no se pueden recuperar.

### Uso diario

| Pantalla | Para qué |
|---|---|
| **Resumen** | Activas, por vencer, vencidas, ingresos y ganancia del mes, **Por cobrar** (dijeron que renuevan), **Vencen en 7 días** y **Recordatorios manuales de hoy** con botón WhatsApp. |
| **Nueva venta** | Busca al cliente (o escribe uno nuevo), elige servicio, cuenta madre y un perfil libre. El aviso se programa solo. |
| **Suscripciones** | Buscar y filtrar. Renovar, Avisar ya, Credenciales (mensaje listo para WhatsApp), Respuesta, Editar y Cancelar. |
| **Clientes** | Ficha con suscripciones, pagos, llamadas (resumen y grabación). Importar o exportar CSV y Excel. |
| **Cuentas madre** | Tus cuentas de cada plataforma: perfiles libres, vencimiento, costo y margen. Alerta 3 días antes de que venzan. |
| **Servicios** | Lo que vendes: “Netflix 1 perfil · S/ 15 · 30 días”. |
| **Ajustes** | Marca, canales, horarios, usuarios, licencia, webhook, red local, respaldos y bitácora. |

**¿Cómo funciona el aviso?** Si un perfil vence el día 20 a las 10:00 (hora de Lima), el día 18 a las 10:00 el
sistema llama al cliente. Si no contesta, reintenta cada 2 horas, máximo 3 veces, y luego lo marca como **Sin respuesta**.
Si dice que sí, aparece en **Por cobrar**: le escribes, cobras y pulsas **Renovar**. La renovación suma los días desde
el vencimiento, o desde hoy si ya había vencido, y programa el siguiente aviso.

**Consentimiento:** solo se llama a clientes marcados con *“aceptó recibir llamadas automatizadas”* (Ley 29733).
Los demás aparecen en **Recordatorios manuales de hoy** para que les escribas tú con un toque.

> La reventa de cuentas o perfiles debe estar permitida por los términos de servicio de cada plataforma. Cumplirlos es responsabilidad del negocio.

### Importar desde Excel o Google Sheets

En **Clientes → Importar CSV**. Columnas reconocidas (el orden no importa):
`nombre, telefono, email, notas, etiquetas, consentimiento (si/no), servicio, perfil, inicio, vencimiento, precio`.
Si la fila trae **servicio** y **vencimiento**, también se crea la suscripción con su aviso. En Excel usa
*Archivo → Guardar como → CSV UTF-8*. Se aceptan fechas `2026-10-29`, `29/10/2026` y `29-oct-26`.

---

## 3. Configurar Retell AI (llamadas con IA)

1. Crea una cuenta en <https://www.retellai.com> y recarga saldo.
2. Compra o importa un **número de teléfono** en Retell (será el número saliente).
3. Crea el **agente** con el prompt y el análisis post-llamada de [`docs/retell-agent.md`](docs/retell-agent.md).
4. En StreamCRM: **Ajustes → Canales** → *Llamada con IA* → pega la **API key**, el **Agent ID** y el **número saliente**.
5. Pulsa **“Probar llamada a mi número”**: tu teléfono debe sonar.
6. (Recomendado) Configura el **webhook** para recibir el resultado al instante (sección 5). Sin webhook también
   funciona: el sistema le pregunta a Retell por el resultado cada 2 minutos.

## 4. Configurar WhatsApp Cloud API (opcional)

1. En <https://developers.facebook.com> crea una app de tipo *Business* y agrega **WhatsApp**.
2. Registra tu número y copia el **Phone number ID** y un **token permanente** (usuario del sistema en Business Manager).
3. Crea la plantilla **`recordatorio_renovacion`** (categoría *Utilidad*, idioma *Español*) con 5 variables, por ejemplo:
   > Hola {{1}}, tu {{2}} vence el {{3}}. La renovación cuesta {{4}}. Responde a este mensaje para renovar. — {{5}}

   {{1}} cliente · {{2}} servicio · {{3}} fecha · {{4}} precio · {{5}} negocio.
4. En **Ajustes → Canales** pega los datos y pulsa **“Enviar mensaje de prueba”**.

Si no quieres usar la API, elige **Solo manual**: cada día verás la lista con el botón **WhatsApp**, que abre la
conversación con el mensaje ya escrito (wa.me).

## 5. Webhook de Retell con Cloudflare Tunnel

Retell necesita una dirección pública para avisar el resultado. Tu PC no la tiene, así que usamos un túnel gratuito:

1. Instala `cloudflared`: en Windows abre *Símbolo del sistema* y escribe `winget install --id Cloudflare.cloudflared`.
   También puedes descargar `cloudflared.exe` y ponerlo en la carpeta de StreamCRM.
2. Con StreamCRM abierto, haz doble clic en **`tunel.bat`** (o `./tunel.sh`).
3. Aparece una URL como `https://algo.trycloudflare.com`. La URL completa del webhook (`…/webhooks/retell`) se
   muestra también en **Ajustes → Webhook y red**. Pégala en tu agente de Retell → *Webhook URL*.

Con el túnel rápido **la URL cambia cada vez** que lo abres. Para tener una fija, sigue
[`docs/cloudflare-tunnel.md`](docs/cloudflare-tunnel.md). Por el túnel **solo entra el webhook**: tu panel no queda en internet.

**Sin túnel también funciona:** las llamadas salen igual y el sistema consulta a Retell
(`get-call`) hasta obtener el resultado.

## 6. Respaldos

- Cada día a las 03:00, o al encender la PC si estaba apagada, se guarda una copia en `backups\`. Se conservan las últimas 30.
- **Ajustes → Respaldos**: *Descargar respaldo ahora*, descargar o **Restaurar** cualquiera, o restaurar desde un archivo `.db`.
  Antes de restaurar siempre se guarda una copia de lo que había.
- Opcional: escribe la ruta de una carpeta de **Google Drive** u **OneDrive** sincronizada y cada respaldo también se copiará allí.
- Guarda además una copia de **`.env`** fuera de la PC.

## 7. Dejarlo siempre encendido

- **Windows (fácil):** doble clic en **`servicio-windows.bat`**. StreamCRM arranca solo al iniciar sesión, sin ventana.
  El registro queda en `data\servidor.log`. Para quitarlo: `servicio-windows.bat quitar`.
- **Windows sin iniciar sesión:** con NSSM (`scripts\servicio-nssm.bat`, como administrador).
- **Linux:** `sudo ./scripts/servicio-linux.sh` (systemd).
- **PM2 (cualquier sistema):** `npm i -g pm2 && pm2 start ecosystem.config.cjs && pm2 save`.

Detalles en [`docs/servicio.md`](docs/servicio.md). Configura la PC para que **no se suspenda**, o no saldrán las llamadas.

## 8. Entrar desde el celular

**Ajustes → Webhook y red → Habilitar red local** y reinicia StreamCRM. Entra desde el celular, conectado al mismo
WiFi, con la dirección que se muestra (por ejemplo `http://192.168.1.20:3000`). Hazlo solo en la red de tu negocio o casa,
nunca en una red pública.

## 9. Actualizar

1. Cierra StreamCRM (o detén el servicio).
2. Arrastra el `.zip` de la versión nueva sobre **`actualizar.bat`** (o `./actualizar.sh archivo.zip`).

El actualizador hace un respaldo, copia los archivos nuevos (sin tocar tus datos, tu `.env` ni tu marca), instala
dependencias y actualiza la base de datos. Si algo falla, **restaura el respaldo automáticamente**.
La versión instalada se ve en **Ajustes → Webhook y red → Sistema**.

## 10. Si algo falla

| Problema | Qué hacer |
|---|---|
| “El puerto 3000 ya está en uso” | StreamCRM ya está abierto (busca la ventana o el servicio). O cambia `PORT=3001` en `.env`. |
| El navegador no abre | Entra a mano a <http://localhost:3000>. |
| No salen las llamadas | Revisa en **Ajustes → Licencia** que no esté vencida, que el canal sea *Llamada con IA*, que el cliente tenga consentimiento y que estés en el horario permitido. Prueba con *Probar llamada*. |
| La llamada sale pero no se registra la respuesta | Revisa la *Webhook URL* en Retell o espera unos minutos (se consulta cada 2 minutos). Verifica que el agente tenga el campo `renovacion`. |
| “Firma inválida” en el webhook | La API key de Ajustes debe ser la misma cuenta de Retell del agente. |
| Olvidé la contraseña | Otro administrador puede cambiarla en **Ajustes → Usuarios**. Si eres el único, escribe a soporte. |
| “Demasiados intentos” | Espera 15 minutos. |
| El sistema está en solo lectura | La licencia o la demo venció. Contacta a tu proveedor (los datos se conservan). |
| Algo raro después de un corte de luz | Abre StreamCRM de nuevo. Los avisos pendientes salen solos. Si la base se dañó, restaura el último respaldo. |

Para soporte envía una captura de la ventana negra (o `data\servidor.log`) y la versión instalada.

---

### Para técnicos

- Node.js 22.13+, Express 5, SQLite integrado (`node:sqlite`), sin compilación. Dependencias: `express`, `retell-sdk`, `luxon`.
- `npm test` (pruebas automáticas con base temporal y servicios simulados) · `npm run smoke` (prueba de punta a punta).
- `npm run backup` · `npm run backup -- --list` · `npm run backup -- --restore <archivo>`.
- Estructura: `src/` servidor · `public/` panel · `migrations/` esquema SQL numerado · `scripts/` instalación, túnel, respaldo, actualización y empaquetado · `docs/`.
