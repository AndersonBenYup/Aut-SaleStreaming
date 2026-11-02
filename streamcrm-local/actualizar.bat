@echo off
chcp 65001 >nul
cd /d "%~dp0"
title StreamCRM - Actualizar
echo  Cierra StreamCRM antes de continuar (la ventana negra del programa).
echo  Puedes arrastrar el archivo .zip de la version nueva sobre este archivo.
echo.
pause
call npm run update -- %1
pause
