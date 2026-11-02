# Guía del vendedor (NO se entrega al cliente)

`npm run package` no incluye este archivo, ni `tools/`, `.env`, `data/`, `backups/` o `clientes/`.

## 1. Tus claves de licencia (una sola vez)

```bash
node tools/license-generator.js --init
```

- Crea `tools/keys/private.pem` (**tu clave privada**) y escribe la pública en `src/license-public-key.js`.
- **Respalda `tools/keys/private.pem`** en un lugar seguro y fuera de la PC (USB cifrado o gestor de contraseñas).
  Si la pierdes, no podrás emitir licencias para las instalaciones que ya vendiste. Si se filtra, cualquiera podrá crearlas.
- No ejecutes `--init` otra vez: con claves nuevas, las licencias emitidas dejan de valer. `--force` existe solo para empezar de cero.

> Este repositorio ya trae un par generado el 2026-10-30. Si vas a vender con él, respalda su `private.pem` ahora.

## 2. Emitir licencias

```bash
# Anual (por defecto): 12 meses, llamadas IA + WhatsApp
node tools/license-generator.js --business "Streaming Juan" --type anual --months 12 --features ai_calls,whatsapp

# Anual completa, con límites
node tools/license-generator.js --business "Streaming Juan" --type anual --months 12 \
  --features ai_calls,whatsapp,multiuser,branding --max-subs 500 --max-users 3

# Perpetua con 12 meses de actualizaciones
node tools/license-generator.js --business "Streaming Juan" --type perpetua --support-months 12 \
  --features ai_calls,whatsapp,multiuser,branding

# Verificar una licencia
node tools/license-generator.js --verify STREAMCRM-eyJ...
```

Cada licencia se guarda en `tools/licencias/<ID>.txt` (tu historial). La clave empieza con `STREAMCRM-`.

| Campo | Efecto |
|---|---|
| `type: anual` + `expiresAt` | Al vencer, el sistema pasa a **solo lectura** y no envía avisos. Muestra tu contacto. |
| `type: perpetua` | Nunca bloquea. Después de `supportUntil`, `npm run update` se niega a actualizar. |
| `features` | `ai_calls` (Retell), `whatsapp` (Cloud API), `multiuser` (hasta 10 usuarios o `maxUsers`), `branding` (logo, color y nombre del panel). |
| `maxSubscriptions` | Tope de suscripciones no canceladas. |
| `maxUsers` | Tope de usuarios (sin `multiuser` es 1). |

**Demo sin licencia:** 14 días desde el asistente, 20 suscripciones, 2 usuarios, avisos simulados (canal console).

**Renovar una anual:** emite una licencia nueva con otro `--months` y el cliente la pega en **Ajustes → Licencia**
(se puede aun en solo lectura). Los datos nunca se pierden.

### Precio sugerido (referencia)

| Plan | Precio | Licencia |
|---|---|---|
| Básico anual | S/ 300 / año | `--type anual --features whatsapp` (manual + WhatsApp API) |
| Pro anual | S/ 450 / año | `--type anual --features ai_calls,whatsapp,branding` |
| Pro perpetuo | S/ 900 una vez | `--type perpetua --support-months 12 --features ai_calls,whatsapp,multiuser,branding` |
| Renovación de soporte perpetuo | S/ 200 / año | licencia perpetua nueva con `supportUntil` extendido |

Las llamadas las paga el negocio en su cuenta de Retell (aprox. US$ 0.07–0.10 por minuto). Vale la pena explicarlo en la venta.

## 3. Tus datos de contacto

Se muestran cuando vence la licencia. Cámbialos en `src/vendor.js` (para todas las instalaciones) o en
`branding.json → vendor` (por cliente).

## 4. Personalizar la marca y preparar el zip

```
clientes/
  streaming-juan/
    branding.json      ← copia de branding.example.json
    logo.png           ← PNG/JPG/WEBP, cuadrado, ≤ 1 MB
    licencia.txt       ← (opcional) la clave; el asistente la trae pegada
```

```bash
npm test                                            # que todo pase antes de entregar
npm run package -- --cliente clientes/streaming-juan
# → dist/streamcrm-local-v1.0.0-streaming-juan.zip
```

`branding.json` define el nombre del negocio, el nombre del panel, el color, el WhatsApp, el país, la zona horaria, la moneda, el logo y tu contacto.
El asistente aparece con esos valores ya cargados y el logo se aplica solo. Sin `--cliente` sale un zip genérico.

El script verifica que no se cuelen `tools/`, `data/`, `.env`, `node_modules/` ni `private.pem`.

## 5. Actualizar a tus clientes

1. Sube `version` (y `releaseDate`) en `package.json`.
2. ¿Cambia la base de datos? Crea `migrations/00N_descripcion.sql`, con el siguiente número. **Solo agrega**
   (`CREATE TABLE`, `ALTER TABLE … ADD COLUMN`, `CREATE INDEX`, `UPDATE` de datos). Nunca uses `DROP` ni borres datos.
   Agrega una prueba en `test/backup.test.js` si la migración es delicada.
3. `npm test` y `npm run package`.
4. Envía el zip. El cliente cierra StreamCRM y lo arrastra sobre `actualizar.bat`. El actualizador hace todo esto:
   - se niega si la licencia perpetua ya no tiene soporte o la anual venció;
   - hace un respaldo `pre-actualizacion`;
   - copia los archivos nuevos sin tocar `.env`, `data/`, `backups/`, `branding.json`, `branding/` ni `licencia.txt`;
   - corre `npm install` y aplica migraciones en un proceso nuevo. Si una migración falla, restaura la base automáticamente.
5. Si el cliente instaló con git: `npm run update` hace `git pull --ff-only`.

## 6. Lista de verificación de instalación en sitio

- [ ] PC con Windows 10/11 actualizado, carpeta fija (`C:\StreamCRM`), **sin suspensión** con corriente.
- [ ] `instalar.bat` → acceso directo en el escritorio. Se abre `http://localhost:3000`.
- [ ] Asistente: nombre exacto del negocio, zona horaria correcta, admin con contraseña fuerte, licencia pegada.
- [ ] Servicios creados (nombre, precio, días) y cuentas madre con perfiles, vencimiento y costo.
- [ ] Retell: agente creado según `docs/retell-agent.md` (prompt + `renovacion` enum), saldo cargado. **Probar llamada** al celular del dueño ✔.
- [ ] WhatsApp (si aplica): plantilla aprobada, **mensaje de prueba** ✔.
- [ ] Túnel: `tunel.bat` (o túnel con nombre) y Webhook URL pegada en Retell. O explicar que sin túnel el resultado tarda unos minutos.
- [ ] Una venta de prueba con el número del dueño: **Avisar ya** → suena → aparece en *Por cobrar*.
- [ ] `servicio-windows.bat` para que arranque solo. Reinicia la PC y comprueba que el panel abre.
- [ ] Respaldos: carpeta de OneDrive o Drive en **Ajustes → Respaldos**. **Descargar respaldo ahora** ✔.
- [ ] Copia de `.env` en un USB entregado al dueño, junto con la explicación de por qué es importante.
- [ ] (Opcional) Red local para el celular, con su advertencia.
- [ ] Explicar consentimiento (Ley 29733) y términos de las plataformas.
- [ ] Anotar en tu registro: cliente, ID de licencia, versión instalada, vencimiento.
