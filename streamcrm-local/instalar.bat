@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title StreamCRM - Instalacion
echo.
echo  ==============================================
echo     Instalando StreamCRM Local
echo  ==============================================
echo.

where node >nul 2>nul
if errorlevel 1 goto :sin_node

node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 goto :node_viejo

echo [1/3] Node.js encontrado:
node -v
echo.
echo [2/3] Instalando componentes. Puede tardar 1 o 2 minutos...
call npm install --omit=dev --no-audit --no-fund
if errorlevel 1 goto :error_npm

echo.
echo [3/3] Creando acceso directo "StreamCRM" en el escritorio...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\StreamCRM.lnk'); $s.TargetPath='%~dp0iniciar.bat'; $s.WorkingDirectory='%~dp0'; $s.IconLocation='%SystemRoot%\System32\SHELL32.dll,13'; $s.Save()" >nul 2>nul

echo.
echo  Listo. Se abrira StreamCRM en tu navegador.
echo  La proxima vez usa el acceso directo "StreamCRM" del escritorio.
echo.
call "%~dp0iniciar.bat"
exit /b 0

:sin_node
echo  No se encontro Node.js. Intentando instalarlo con winget...
winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
if errorlevel 1 (
  echo.
  echo  No se pudo instalar automaticamente.
  echo  Descarga Node.js LTS desde https://nodejs.org , instalalo y vuelve a abrir instalar.bat
  start https://nodejs.org/es/download
  pause
  exit /b 1
)
echo.
echo  Node.js instalado. CIERRA esta ventana y vuelve a abrir instalar.bat
pause
exit /b 0

:node_viejo
echo  Tu version de Node.js es antigua. StreamCRM necesita la 22.13 o mas nueva.
node -v
echo  Descarga la version LTS desde https://nodejs.org e instalala encima.
start https://nodejs.org/es/download
pause
exit /b 1

:error_npm
echo.
echo  Hubo un error instalando los componentes. Revisa tu conexion a internet y vuelve a intentar.
pause
exit /b 1
