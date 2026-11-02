@echo off
chcp 65001 >nul
cd /d "%~dp0"
title StreamCRM - Tunel para Retell (deja esta ventana abierta)
if exist "%~dp0cloudflared.exe" set CLOUDFLARED=%~dp0cloudflared.exe
node scripts\tunnel.js
pause
