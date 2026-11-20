@echo off
rem ─────────────────────────────────────────────────────────────────────────────
rem  Inventario Outlet · arranque en Windows
rem  Doble clic en este archivo para abrir el MENU: encender, apagar, abrir en esta computadora o en el celular,
rem  ver el registro, respaldar, restablecer el PIN...  (Es el mismo menu que iniciar.command en macOS.)
rem  Cada opcion se escribe y se confirma con Enter; apagar, reiniciar y restablecer el PIN piden ademas SI.
rem  Sin menu (Simbolo del sistema o conexion remota):
rem      iniciar.bat encender ^| apagar ^| reiniciar ^| estado ^| respaldo ^| celular
rem ─────────────────────────────────────────────────────────────────────────────
setlocal
rem UTF-8: para que se vean bien los acentos, los recuadros y el codigo QR
chcp 65001 >nul
cd /d "%~dp0"
title Inventario Outlet

rem Node.js instalado y en una version suficiente (22.13 o mas reciente)
where node >nul 2>nul
if errorlevel 1 goto :sinnode
node -e "const [a,b]=process.versions.node.split('.').map(Number); process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 goto :viejo

rem El menu es arranque\menu.js. El sistema corre aparte: cerrar esta ventana no lo apaga (se apaga con la opcion 2).
node arranque\menu.js %*
set "CODIGO=%ERRORLEVEL%"
rem Si el menu se cerro por un error, la ventana espera a Enter para que se pueda leer el mensaje
if not "%CODIGO%"=="0" if "%~1"=="" call :pausa
exit /b %CODIGO%

:sinnode
echo.
echo   X  No se encontro Node.js en esta computadora.
echo      Instale la version "LTS" desde https://nodejs.org y vuelva a abrir este archivo.
echo      (Se abrira la pagina de descarga.)
start "" "https://nodejs.org/es"
call :pausa
exit /b 1

:viejo
echo.
for /f "delims=" %%v in ('node -v') do set "VER=%%v"
echo   X  Esta computadora tiene Node.js %VER%, y se necesita la version 22.13 o mas reciente.
echo      Instale la version "LTS" desde https://nodejs.org y vuelva a abrir este archivo.
start "" "https://nodejs.org/es"
call :pausa
exit /b 1

:pausa
rem Se cierra con Enter (no con cualquier tecla), para que un toque por accidente no cierre la ventana
echo.
set /p "_=  Presione Enter para cerrar esta ventana... "
exit /b 0
