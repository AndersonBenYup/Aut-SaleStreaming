@echo off
chcp 65001 >nul
cd /d "%~dp0"
title StreamCRM - deja esta ventana abierta
if not exist node_modules\express (
  call "%~dp0instalar.bat"
  exit /b
)
set STREAMCRM_OPEN=1
node --disable-warning=ExperimentalWarning src\server.js
echo.
echo  StreamCRM se detuvo. Si ves un error arriba, toma una captura y enviala a soporte.
pause
