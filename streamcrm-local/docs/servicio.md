# Dejar StreamCRM siempre encendido

El scheduler (el que envía los avisos cada minuto) vive dentro del programa. Si el programa está cerrado, no sale
nada. Los avisos pendientes se envían en cuanto vuelve a arrancar, sin duplicarse.

## Windows

### Opción 1: Programador de tareas (recomendada, no requiere descargas)

Doble clic en **`servicio-windows.bat`**. Esto:
- crea la tarea **StreamCRM**, que se ejecuta al iniciar sesión sin ventana (`scripts\iniciar-oculto.vbs`);
- guarda el registro en `data\servidor.log`.

Quitar: `servicio-windows.bat quitar`. Ver o detener la tarea: *Programador de tareas → Biblioteca → StreamCRM*.

Configura **Energía → Suspender: Nunca** mientras esté enchufada.

### Opción 2: NSSM (arranca aunque nadie inicie sesión)

1. Descarga NSSM de <https://nssm.cc/download> y copia `win64\nssm.exe` en la carpeta `scripts\`.
2. Clic derecho sobre `scripts\servicio-nssm.bat` → **Ejecutar como administrador**.
3. Administrar: `services.msc` → *StreamCRM*. Quitar: `nssm remove StreamCRM confirm`.

## Linux (systemd)

```bash
sudo ./scripts/servicio-linux.sh          # instalar y arrancar
systemctl status streamcrm                # estado
journalctl -u streamcrm -f                # registro en vivo
sudo ./scripts/servicio-linux.sh quitar   # desinstalar
```

## PM2 (Windows, Linux, macOS)

```bash
npm i -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup        # Linux/macOS: ejecuta el comando que imprime
```

Usa **una sola instancia**: SQLite y el scheduler deben vivir en un único proceso.

## Docker (VPS)

`docker compose up -d --build`. El contenedor se reinicia solo (`restart: unless-stopped`). Datos en `./data` y `./backups`.
