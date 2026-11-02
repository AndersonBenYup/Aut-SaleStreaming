@echo off
chcp 65001 >nul
cd /d "%~dp0"
title StreamCRM - Arranque automatico
echo  Esto deja StreamCRM encendido siempre (arranca solo al iniciar sesion, sin ventana).
echo  Para quitarlo: servicio-windows.bat quitar
echo.
if /i "%1"=="quitar" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\servicio-windows.ps1" -Quitar
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\servicio-windows.ps1"
)
pause
