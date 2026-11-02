# StreamCRM Cloud

SaaS multi-negocio para vendedores de cuentas y perfiles de streaming. Antes de que venza cada suscripción
llama al cliente con un agente de voz (Retell AI) o le escribe por WhatsApp, registra si va a renovar y lo
refleja **en la hoja de Google del negocio y en la base de datos**.

> Estado: **Fases 1 y 2 terminadas** (núcleo, hoja de cálculo, scheduler, login y panel). La facturación del SaaS
> (Mercado Pago), el super-admin completo, la API pública y Docker vienen en las fases 3 a 5.

## Requisitos

- Node.js 22 o más nuevo (probado con 24).
- Nada más para desarrollar: si `DATABASE_URL` está vacío se usa un **Postgres 16 embebido** (paquete npm).

## Empezar

```bash
npm install
cp .env.example .env            # y completa ENCRYPTION_KEY (comando dentro del archivo)
npm run seed                    # planes, negocio demo, usuarios de prueba y hoja demo
npm run dev                     # panel en http://localhost:5173 + API en http://localhost:3000
```

`npm run dev:api` y `npm run dev:web` levantan cada parte por separado. En producción, `npm run build` genera
`apps/web/dist` y la API lo sirve en su misma URL.

npm 12 bloquea los scripts de instalación. Si `argon2` o `embedded-postgres` fallan, ejecuta:
`npm install-scripts approve argon2 esbuild @embedded-postgres/windows-x64` y luego `npm rebuild`.

### Datos de ejemplo

`npm run seed` deja:

| Rol | Email | Contraseña |
|---|---|---|
| super-admin | admin@streamcrm.test | Admin12345! |
| dueño | dueno@demo.test | Demo12345! |
| vendedor | vendedor@demo.test | Demo12345! |

También conecta el negocio **Streaming Demo Lima** a `data/hoja-demo-trabajo.xlsx`: 16 ventas ficticias
(3 vencidas, 2 vencen hoy, 4 de 1 a 3 días y 7 de más de 3 días), cuentas compartidas en celdas combinadas,
un cliente sin consentimiento y uno sin teléfono. Las pestañas son VENTAS, CUENTAS y LISTAS, como en las capturas.
`npm run demo:sheet` genera la misma hoja en `ejemplos/streamcrm-demo.xlsx` para subirla a Google Sheets.

Los teléfonos son inventados. En desarrollo **nunca se llama de verdad** salvo a los números de `DEV_ALLOWED_NUMBERS`:
el resto sale por consola (`📞 [console] …`).

## Probar el flujo completo en el panel

1. `npm run seed` y `npm run dev`. Abre <http://localhost:5173> y pulsa **Dueño** (botones de prueba del login).
2. En **Inicio → Hoja del negocio** pulsa **Leer ahora**: de las 16 ventas de la hoja entran 9 (las que vencen en
   48 h o ya vencieron) y 7 quedan esperando su fecha.
3. En **Suscripciones** abre un cliente. En la tarjeta amarilla **Probar sin llamar** pulsa *Enviar aviso ahora*
   (en la consola de la API aparece `📞 [console] …`) y luego *Sí renuevo*, *Lo pienso*, *Ya no* o *No contesta*.
4. El cliente aparece en **Inicio → Para hacer hoy**. Pulsa **Renovar**, elige Yape/Plin y guarda.
5. **Nueva venta** crea la venta y la agrega como fila nueva en la hoja.
6. Detén el servidor y abre `data/hoja-demo-trabajo.xlsx`: verás INTENCIÓN, RECORDATORIO, ÚLTIMO CONTACTO,
   la nueva FECHA INICIO de la renovación y la venta nueva al final.
7. Entra como **Vendedor**: puede vender y renovar, pero no ve Equipo, no cambia Ajustes y no ve contraseñas
   (salvo que el dueño lo active en Ajustes → Seguridad).
8. Entra como **Super-admin**: ve la lista de negocios y puede entrar a uno para dar soporte.

Las rutas `/dev/*` (las de la tarjeta *Probar sin llamar*) siguen disponibles con curl y no existen en producción.

## Qué hay en el panel

| Página | Para qué |
|---|---|
| Inicio | Vencen hoy, por vencer, vencidas, cobrado del mes, minutos de IA, **Para hacer hoy** (clientes que dijeron que sí, que lo piensan o que no contestaron), próximos avisos y estado de la hoja |
| Suscripciones | Filtros por estado y respuesta, búsqueda, renovar, detalle con PIN, cuenta, pagos, llamadas e historial; avisar ahora, registrar la respuesta a mano, WhatsApp con el mensaje ya escrito, cancelar |
| Clientes | Editar teléfono, consentimiento de llamadas y notas |
| Cuentas | Cuentas madre, perfiles usados y contraseña (ver contraseña queda registrado) |
| Pagos | Cobrado por rango de fechas y por método |
| Llamadas y actividad | Cada aviso con su resultado y resumen, y el historial completo |
| Ajustes | Conectar Google Sheets, horario y días del aviso, canal (según el plan), Retell/WhatsApp, permisos, contraseña |
| Equipo | Usuarios del negocio (dueño/vendedor) con el límite del plan |

Seguridad: contraseñas con argon2, sesión en cookie `HttpOnly` + `SameSite=Lax` (el token se guarda hasheado),
token CSRF en cada cambio, límite de intentos de login y todas las consultas filtradas por negocio.

## Pruebas

```bash
npm test
```

85 pruebas con un Postgres real embebido. Retell y WhatsApp están mockeados. Cubren: escaneo perezoso, no duplicar,
celdas combinadas, escritura en la fila correcta aunque se reordene la hoja, renovación sin pisar fórmulas, la hoja gana
cuando el negocio edita, ventas nuevas como filas, hora local y horario 9–20, reintentos (3 intentos y fallido),
dos workers sin duplicados, firma de Retell válida/falsa, idempotencia de webhooks, aislamiento entre negocios,
negocio suspendido sin llamadas y cifrado de contraseñas y PIN. Del panel: registro, login, CSRF, logout,
cambio de contraseña, un negocio no ve ni toca datos de otro, permisos del vendedor, límite de usuarios del plan,
super-admin, ventas, renovaciones y reprogramación de avisos al cambiar los ajustes.

## Estructura

```
apps/web/src      panel React (Vite + Tailwind + React Query)
apps/api/src
  auth/       sesiones, CSRF y roles
  routes/     auth, panel/* (dashboard, suscripciones, clientes, cuentas, pagos, ajustes, equipo), dev
  channels/   retell, whatsapp, console
  db/         schema.ts (Drizzle), Postgres embebido; migraciones en apps/api/drizzle
  jobs/       pg-boss: tick cada minuto (estados + avisos), escaneo de hojas, escritura en hojas, webhooks
  lib/        cifrado AES-256-GCM, teléfonos E.164, fechas con zona horaria, montos
  modules/    suscripciones (renovar, vender, estados), recordatorios, webhooks, tenantScope
  sheets/     cliente Google / xlsx, encabezados y alias, parser de filas, sincronización
  scripts/    seed, demo:sheet, migrate, create-superadmin
packages/shared   enums, esquemas zod, interpretación de la intención
docs/             google-sheets.md, retell-agent.md
```

## Más

- [Conectar Google Sheets](docs/google-sheets.md)
- [Configurar el agente de Retell](docs/retell-agent.md)
- `npm run create-superadmin -- correo@dominio.com "contraseña-larga" "Nombre"`
