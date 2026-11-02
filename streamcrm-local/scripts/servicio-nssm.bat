@echo off
rem Servicio real de Windows con NSSM (arranca aunque nadie inicie sesion). Ejecutar como administrador.
rem Descarga nssm.exe de https://nssm.cc/download y ponlo en esta carpeta (scripts\) o en el PATH.
chcp 65001 >nul
cd /d "%~dp0.."
set NSSM=nssm
if exist "%~dp0nssm.exe" set NSSM="%~dp0nssm.exe"
for /f "delims=" %%n in ('where node') do set NODE=%%n& goto :found
echo No se encontro Node.js & pause & exit /b 1
:found
%NSSM% install StreamCRM "%NODE%" "--disable-warning=ExperimentalWarning src\server.js"
%NSSM% set StreamCRM AppDirectory "%cd%"
%NSSM% set StreamCRM AppStdout "%cd%\data\servidor.log"
%NSSM% set StreamCRM AppStderr "%cd%\data\servidor.log"
%NSSM% set StreamCRM Start SERVICE_AUTO_START
%NSSM% start StreamCRM
echo.
echo Servicio "StreamCRM" instalado. Para quitarlo: nssm remove StreamCRM confirm
pause
