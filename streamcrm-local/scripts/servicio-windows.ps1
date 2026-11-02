# Deja StreamCRM encendido siempre en Windows (sin ventana), con el Programador de tareas.
# Arranca al iniciar sesión y se reinicia solo si se cae. Registro en data\servidor.log
#
#   powershell -ExecutionPolicy Bypass -File scripts\servicio-windows.ps1            instalar
#   powershell -ExecutionPolicy Bypass -File scripts\servicio-windows.ps1 -Quitar    desinstalar
param([switch]$Quitar)

$ErrorActionPreference = 'Stop'
$Name = 'StreamCRM'
$Dir = Split-Path -Parent $PSScriptRoot

if ($Quitar) {
  Stop-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $Name -Confirm:$false -ErrorAction SilentlyContinue
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*src*server.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Write-Host 'Tarea "StreamCRM" eliminada.'
  exit 0
}

$Node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $Node) { Write-Host 'No se encontró Node.js. Ejecuta primero instalar.bat'; exit 1 }

# Lanzador oculto (sin ventana negra).
$Vbs = Join-Path $Dir 'scripts\iniciar-oculto.vbs'
New-Item -ItemType Directory -Force (Join-Path $Dir 'data') | Out-Null
@"
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "$Dir"
sh.Run "cmd /c ""$Node"" --disable-warning=ExperimentalWarning src\server.js >> data\servidor.log 2>&1", 0, False
"@ | Out-File -Encoding ascii $Vbs

$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$Vbs`"" -WorkingDirectory $Dir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $Name -Action $action -Trigger $trigger -Settings $settings -Description 'StreamCRM Local: panel y recordatorios' -Force | Out-Null
Start-ScheduledTask -TaskName $Name

Write-Host ''
Write-Host 'Listo: StreamCRM se abrirá solo cada vez que inicies sesión en Windows.'
Write-Host 'Abre el panel en http://localhost:3000   Registro: data\servidor.log'
Write-Host 'Si la PC no debe tener sesión iniciada, usa NSSM (ver docs/servicio.md).'
