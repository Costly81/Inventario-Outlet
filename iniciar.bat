@echo off
rem ─────────────────────────────────────────────────────────────────────────────
rem  Inventario Outlet · ventana del sistema en Windows
rem  Doble clic: el sistema ENCIENDE solo y la ventana se minimiza (sigue trabajando en la barra de tareas).
rem  Si se CIERRA esta ventana, el sistema SE APAGA por completo. Desde la ventana hay un menu con numeros
rem  (el mismo que iniciar.command en macOS): abrir, celular con codigo QR, reiniciar, registro, respaldo,
rem  restablecer PIN, apagar.
rem  Para que encienda solo al prender la computadora: Windows + R, escriba  shell:startup  y ponga ahi
rem  un ACCESO DIRECTO a este archivo.
rem  Sin ventana (Simbolo del sistema o conexion remota):
rem      iniciar.bat encender ^| apagar ^| reiniciar ^| estado ^| respaldo ^| celular
rem
rem  Todo va dentro de un bloque ( ... ): cmd.exe lo lee completo antes de ejecutarlo, asi una
rem  actualizacion que reemplace este archivo mientras corre no lo afecta a medias.
rem ─────────────────────────────────────────────────────────────────────────────
setlocal EnableDelayedExpansion
(
  rem UTF-8: para que se vean bien los acentos, los recuadros y el codigo QR
  chcp 65001 >nul
  cd /d "%~dp0"
  title Inventario Outlet
  where node >nul 2>nul
  if errorlevel 1 (
    echo.
    echo   X  No se encontro Node.js en esta computadora.
    echo      Instale la version "LTS" desde https://nodejs.org y vuelva a abrir este archivo.
    start "" "https://nodejs.org/es"
    echo.
    set /p "_=  Presione Enter para cerrar esta ventana... "
    exit /b 1
  )
  node -e "const [a,b]=process.versions.node.split('.').map(Number); process.exit(a>22||(a===22&&b>=13)?0:1)"
  if errorlevel 1 (
    echo.
    echo   X  Esta computadora tiene una version de Node.js anterior a la 22.13.
    echo      Instale la version "LTS" desde https://nodejs.org y vuelva a abrir este archivo.
    start "" "https://nodejs.org/es"
    echo.
    set /p "_=  Presione Enter para cerrar esta ventana... "
    exit /b 1
  )
  rem La ventana del sistema es arranque\menu.js
  node arranque\menu.js %*
  set "CODIGO=!ERRORLEVEL!"
  if not "!CODIGO!"=="0" if "%~1"=="" (
    echo.
    set /p "_=  Presione Enter para cerrar esta ventana... "
  )
  exit /b !CODIGO!
)
