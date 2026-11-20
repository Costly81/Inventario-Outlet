@echo off
rem ─────────────────────────────────────────────────────────────────────────────
rem  Inventario Outlet · encender SIN menu (Windows)
rem  Para que encienda solo al prender la computadora: presione Windows + R, escriba  shell:startup  y
rem  ponga ahi un ACCESO DIRECTO a ESTE archivo (no a iniciar.bat).
rem  Solo enciende (si ya esta encendido, no hace nada). Para apagar o lo demas, use iniciar.bat.
rem ─────────────────────────────────────────────────────────────────────────────
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title Inventario Outlet
where node >nul 2>nul
if errorlevel 1 (
  echo   No se encontro Node.js. Instale la version LTS desde https://nodejs.org
  timeout /t 15 >nul
  exit /b 1
)
node arranque\menu.js encender
set "CODIGO=%ERRORLEVEL%"
rem La ventana se cierra sola a los pocos segundos; si algo fallo, se queda 2 minutos para poder leerlo
if "%CODIGO%"=="0" (timeout /t 4 >nul) else (timeout /t 120 >nul)
exit /b %CODIGO%
