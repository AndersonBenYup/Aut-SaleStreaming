# Conectar la hoja del negocio (Google Sheets)

StreamCRM **no obliga a migrar** la base del negocio. La hoja de Google sigue siendo la fuente principal:

- Cada 15 minutos (`SHEET_SCAN_CRON`) el sistema lee la pestaña **VENTAS**.
- Solo pasan a la base de datos las filas cuyo recordatorio cae dentro de las próximas 48 h
  (`SHEET_IMPORT_WINDOW_HOURS`) o que ya vencieron. El resto sigue viviendo solo en la hoja.
- Con los días, a medida que se recorren todas las fechas, toda la base termina también en Postgres.
- Todo cambio se escribe **en los dos lados**: respuesta del cliente, estado del aviso, renovaciones y ventas nuevas.

## Formato de la hoja

Los encabezados se reconocen **por nombre** (no por posición, sin importar mayúsculas ni tildes). La fila de
encabezados puede estar en cualquiera de las primeras 15 filas (en la plantilla está en la fila 2, debajo de "FECHA ACTUAL").

| Columna | Obligatoria | Alias aceptados | Notas |
|---|---|---|---|
| CLIENTE | sí | NOMBRE | |
| FECHA DE VENCIMIENTO | sí* | VENCE, FECHA FIN | *o FECHA INICIO + VENCIMIENTO (días) |
| TELÉFONO | para avisar | CELULAR, WHATSAPP, NUMERO | se normaliza a +51 si no trae código |
| FECHA INICIO | | INICIO, FECHA COMPRA | |
| VENCIMIENTO | | DIAS, DURACION | duración en días (como en la plantilla original) |
| CORREO, CONTRASEÑA | | CORREO/USUARIO, CLAVE | pueden ir en celdas combinadas para varios clientes |
| SERVICIO, PERFIL, PIN | | SUSCRIPCION, PLATAFORMA | |
| CUENTA, V/U, V/V, GANANCIA | | COSTO, PRECIO | V/V = precio de renovación |
| ACEPTA LLAMADAS | | CONSENTIMIENTO | SI/NO. **Si la columna no existe, no se llama** (Ley 29733): se usa WhatsApp o aviso manual |

Fechas aceptadas: fechas reales de Sheets, `25-mar-23`, `30/03/2023`, `4/30/2024`, `2026-10-29`.
Si una fecha es ambigua (05/04/2024), se interpreta como día/mes (configurable por negocio).

### Columnas que escribe el sistema

Si no existen, se crean solas al final de la tabla:

| Columna | Ejemplo |
|---|---|
| INTENCIÓN | Renueva · No renueva · Lo está pensando · Sin respuesta |
| RECORDATORIO | Programado 30/10/2026 10:00 · Enviado por llamada IA · Reintento 2 el… · Avisar manualmente |
| ÚLTIMO CONTACTO | 30/10/2026 09:05 |
| RESUMEN LLAMADA | resumen de Retell o texto del WhatsApp |
| ID SISTEMA | no la borres: así el sistema encuentra la fila aunque reordenes la hoja |

Reglas de escritura:

- **Las celdas con fórmula nunca se sobrescriben** (ESTADO, DÍAS RESTANTES, GANANCIA, FECHA DE VENCIMIENTO = inicio + días…).
- Al **renovar** se cambia FECHA INICIO (y la fecha de vencimiento si no es fórmula); la fórmula recalcula el resto.
- Una **venta nueva** del sistema se agrega como fila al final, copiando las fórmulas de la fila anterior.
- Si **editas la fecha o el teléfono en la hoja**, la hoja gana: el sistema actualiza la BD y reprograma el aviso.
- Si copias una fila con su ID SISTEMA para hacer otra venta, el sistema detecta el ID repetido y la trata como fila nueva.

La pestaña **CUENTAS** (opcional) se usa para perfiles y vencimiento de las cuentas madre: ESTADO, SUSCRIPCIÓN,
CORREO/USUARIO, CONTRASEÑA, PERFILES, DURACION DIAS, FECHA DE CREACION, FECHA DE VENCIMIENTO, PROVEEDOR.

## Paso a paso

1. **Plantilla de ejemplo.** `npm run demo:sheet` genera `ejemplos/streamcrm-demo.xlsx` con 16 clientes ficticios
   en todos los estados. En Google Drive: *Nuevo → Subir archivo* y luego *Abrir con Hojas de cálculo de Google*,
   o desde una hoja vacía *Archivo → Importar → Subir → Reemplazar hoja de cálculo*.
2. **Service account (una sola vez, la del SaaS).**
   1. En <https://console.cloud.google.com> crea un proyecto y habilita **Google Sheets API**.
   2. *IAM y administración → Cuentas de servicio → Crear*. Sin roles.
   3. En la cuenta creada: *Claves → Agregar clave → JSON*. Se descarga un archivo.
   4. En `.env`: `GOOGLE_SERVICE_ACCOUNT_JSON=C:/ruta/al/archivo.json` (o el JSON completo en una línea).
3. **Compartir la hoja.** En la hoja del negocio: *Compartir* → pega el `client_email` de la service account
   (termina en `iam.gserviceaccount.com`) con permiso **Editor**.
4. **Conectarla al negocio.** En el panel: *Ajustes → Hoja de cálculo*, pega el enlace y pulsa **Probar y conectar**.
   El sistema prueba leerla, te dice qué columnas reconoció y cuáles te convendría agregar, y la lee por primera vez.
5. **Leer ahora** (en Inicio o Ajustes) la vuelve a leer sin esperar los 15 minutos.

## Probar sin Google

`npm run seed` conecta el negocio demo a un `.xlsx` local (`data/hoja-demo-trabajo.xlsx`) con el mismo
comportamiento que Google Sheets. Ábrelo con Excel **cerrado mientras el servidor escribe** (Excel bloquea el archivo).
