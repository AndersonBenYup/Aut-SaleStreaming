# LokiStream + Google Sheets

La hoja de Google es la base de datos del negocio. Desde ella:

- **Editas la web**: precios, plataformas, packs, preguntas, número de WhatsApp y horario. La web se actualiza sola (en menos de 5 minutos, o al instante con el menú **LokiStream → Actualizar la web ahora**).
- **Recibes los pedidos**: cada pedido de la web entra a la pestaña **PEDIDOS** con su código (`LK-XXXXXX`), el cliente, el celular, el detalle y el total. El precio lo calcula la hoja, no el navegador.
- **Entregas en automático**: cuando cambias un pedido a **Pagado**, la hoja busca perfiles libres en **CUENTAS**, crea las filas en **VENTAS** y envía los accesos por WhatsApp (o deja el mensaje listo con un enlace para mandarlo con un clic).
- **Recordatorios**: VENTAS usa las mismas columnas que **StreamCRM** (Local o Cloud). Conecta tu StreamCRM a esta misma hoja y seguirá llamando o escribiendo antes de cada vencimiento.

No hay servidor que mantener: todo corre en Google Apps Script, gratis, dentro de tu Google Drive.

---

## 1. Crear la hoja (10 minutos, una sola vez)

1. En la carpeta del proyecto ejecuta `npm run hoja:bundle`. Se genera **`apps-script/dist/LokiStream.gs`**.
2. Crea una hoja nueva en <https://sheets.new> y ponle nombre, por ejemplo *LokiStream*.
3. Menú **Extensiones → Apps Script**. Borra lo que haya en `Código.gs` y pega **todo** el contenido de `LokiStream.gs`. Guarda (Ctrl + S).
4. En la lista de funciones de arriba elige **`instalarLokiStream`** y pulsa **Ejecutar**. Google te pedirá permisos: *Revisar permisos → tu cuenta → Configuración avanzada → Ir a LokiStream → Permitir*.
   Se crean las pestañas AJUSTES, PLATAFORMAS, PLANES, PACKS, FAQ (con el catálogo actual de la web), PEDIDOS, VENTAS, CUENTAS y LOG.
5. **Implementar → Nueva implementación → ⚙ → Aplicación web**:
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier persona**
   - Pulsa **Implementar** y copia la **URL de la aplicación web** (termina en `/exec`).
6. En la web, crea el archivo `.env` (o la variable de entorno en Vercel o Netlify):
   ```
   VITE_SHEETS_API_URL=https://script.google.com/macros/s/XXXXXXXX/exec
   ```
   y vuelve a publicar (`npm run build`).

> Si cambias el código del script, usa **Implementar → Administrar implementaciones → ✏ → Versión: nueva**. Así la URL no cambia.

## 2. Uso diario

| Quiero… | Hago… |
|---|---|
| Cambiar un precio | Lo edito en **PLANES** (columna PRECIO). |
| Ocultar una plataforma o un plan | Desmarco **ACTIVO**. |
| Agregar una plataforma nueva | Fila nueva en **PLATAFORMAS** (ID corto en minúsculas, NOMBRE, COLOR `#rrggbb`) y al menos un plan en **PLANES** con ese ID. Sin logo propio, la web muestra el nombre. |
| Ver si algo está mal | Menú **LokiStream → Revisar catálogo**: lista las filas que no se publican y por qué. |
| Entregar un pedido | Cuando el cliente pague, cambio **ESTADO** a **Pagado**. |
| Reenviar los accesos | Abro el **ENLACE WHATSAPP** de la fila del pedido. |
| Reprocesar un pedido | Selecciono la fila → **LokiStream → Procesar pedido de la fila seleccionada**. |

### Estados de un pedido

| Estado | Significa |
|---|---|
| **Nuevo** | Llegó desde la web. Espera el pago (el cliente te escribe por WhatsApp con su código). |
| **Pagado** | Lo pones tú. Dispara la entrega automática. |
| **Listo para enviar** | Perfiles asignados y ventas creadas; falta mandar el mensaje (abre el ENLACE WHATSAPP). |
| **Entregado** | Accesos enviados por WhatsApp Cloud API. |
| **Sin stock** | No hay perfiles libres suficientes. Agrega cuentas en CUENTAS y vuelve a poner **Pagado**. No se crea nada a medias. |
| **Error** | Mira NOTAS y la pestaña LOG. |

### CUENTAS: de dónde salen los perfiles

Una fila por cuenta madre: **ESTADO** (vacío o ACTIVA; VENCIDA, CAÍDA o INACTIVA no se usan), **SUSCRIPCION** (Netflix, Disney+…), **CORREO USUARIO**, **CONTRASEÑA**, **PERFILES** (cuántos tiene), **FECHA DE VENCIMIENTO** y **PRECIO** (lo que te cuesta).

Los perfiles ocupados se cuentan en VENTAS: ventas con ese correo que aún no vencen y no están canceladas. Al asignar, la hoja:

1. prefiere cuentas que duren al menos lo que dura la venta (si no hay, usa otra y lo avisa en NOTAS);
2. llena primero las cuentas más ocupadas;
3. usa el primer número de perfil libre (Perfil 1, Perfil 2…).

En VENTAS escribe CLIENTE, TELÉFONO, SERVICIO, PERFIL, FECHA INICIO, DÍAS, FECHA DE VENCIMIENTO, **V U** (costo por perfil), **V V** (precio), GANANCIA (fórmula), ACEPTA LLAMADAS (lo que marcó el cliente) y PEDIDO. El **PIN** queda vacío: llénalo tú si tus perfiles lo usan.

## 3. WhatsApp automático (opcional)

Sin configurarlo, todo funciona: el pedido queda **Listo para enviar** con el mensaje y un enlace `wa.me`.

Para que los accesos salgan solos necesitas WhatsApp Cloud API (Meta Business). En Apps Script: **Configuración del proyecto → Propiedades del script → Agregar**:

| Propiedad | Valor |
|---|---|
| `WHATSAPP_TOKEN` | token permanente del usuario del sistema |
| `WHATSAPP_PHONE_ID` | ID del número de teléfono |

Las claves viven solo ahí: nunca en la hoja ni en la web. WhatsApp solo entrega texto libre si el cliente te escribió en las últimas 24 horas, que es lo normal porque el pedido entra por WhatsApp.

## 4. Recordatorios con StreamCRM

VENTAS tiene las columnas que lee StreamCRM: CORREO, CONTRASEÑA, CLIENTE, TELEFONO, SERVICIO, PERFIL, PIN, FECHA INICIO, DIAS, FECHA DE VENCIMIENTO, V U, V V, ACEPTA LLAMADAS, INTENCION, RECORDATORIO, ULTIMO CONTACTO y RESUMEN LLAMADA. Conecta tu StreamCRM a esta hoja y seguirá avisando antes de cada vencimiento. Solo usa un motor de recordatorios a la vez, para no avisar dos veces al mismo cliente.

## 5. Probar sin Google

```bash
npm run hoja:mock                                   # hoja simulada en http://localhost:8787/exec
echo VITE_SHEETS_API_URL=http://localhost:8787/exec > .env.local
npm run dev
```

El simulador usa la misma lógica que Apps Script. Para ver que la web cambia sola:
`http://localhost:8787/exec?action=precio&plataforma=netflix&plan=1m&valor=19`.
Los pedidos recibidos se ven en `http://localhost:8787/exec?action=pedidos`.

## 6. Seguridad

- La web solo conoce la URL pública. Los pedidos traen *qué* se pide; el precio lo calcula la hoja.
- Hay un campo trampa contra bots, un límite de pedidos por teléfono por hora (`PEDIDOS POR HORA POR TELEFONO` en AJUSTES) y los pedidos repetidos con el mismo código se ignoran.
- Un pedido **Nuevo** no entrega nada hasta que tú lo marcas **Pagado**.
