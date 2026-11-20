#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
#  Inventario Outlet · encender SIN menú (macOS)
#  Para que encienda solo al prender la Mac: agregue ESTE archivo (no iniciar.command) en
#  Ajustes del Sistema → General → Ítems de inicio de sesión.
#  Solo enciende (si ya está encendido, no hace nada). Para apagar o lo demás, use iniciar.command.
# ─────────────────────────────────────────────────────────────────────────────
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.volta/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
if ! command -v node >/dev/null 2>&1; then echo "  No se encontró Node.js. Instale la versión LTS desde https://nodejs.org"; sleep 15; exit 1; fi
node arranque/menu.js encender
codigo=$?
# La ventana se cierra sola a los pocos segundos; si algo falló, se queda 2 minutos para poder leerlo
if [ $codigo -eq 0 ]; then sleep 4; else sleep 120; fi
exit $codigo
