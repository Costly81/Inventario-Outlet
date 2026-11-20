#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
#  Inventario Outlet · ventana del sistema en macOS
#  Doble clic: el sistema ENCIENDE solo y la ventana se minimiza (sigue trabajando en el Dock).
#  Si se CIERRA esta ventana, el sistema SE APAGA por completo. Desde la ventana hay un menú con números:
#  abrir en la Mac, abrir en un celular (código QR), reiniciar, registro, respaldo, restablecer PIN, apagar.
#  Para que encienda solo al prender la Mac: agregue este archivo en
#  Ajustes del Sistema → General → Ítems de inicio de sesión.
#  Sin ventana (Terminal o conexión remota):  ./iniciar.command encender | apagar | reiniciar | estado | respaldo | celular
#
#  Todo va dentro de la función «principal» y se llama en la ÚLTIMA línea: así bash lee el archivo
#  completo antes de ejecutar, y una actualización que reemplace este archivo no lo afecta a medias.
# ─────────────────────────────────────────────────────────────────────────────
principal() {
  cd "$(dirname "$0")" || exit 1

  # Lugares habituales donde macOS instala Node.js (Homebrew, instalador oficial, Volta, nvm)
  export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.volta/bin:$PATH"
  [ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1

  local N= F= ROJO= ENL=
  if [ -t 1 ] && [ "${TERM:-dumb}" != "dumb" ] && [ -z "$NO_COLOR" ]; then N=$'\033[0m'; F=$'\033[1m'; ROJO=$'\033[31m'; ENL=$'\033[1;36m'; fi
  local pausa='echo; read -r -p "  Presione Enter para cerrar esta ventana… " _'

  if ! command -v node >/dev/null 2>&1; then
    echo; echo "  ${ROJO}✗${N}  ${F}No se encontró Node.js en esta Mac.${N}"
    echo "     Instale la versión «LTS» desde ${ENL}https://nodejs.org${N} y vuelva a abrir este archivo."
    open "https://nodejs.org/es" 2>/dev/null; eval "$pausa"; return 1
  fi
  if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=13)?0:1)'; then
    echo; echo "  ${ROJO}✗${N}  ${F}Esta Mac tiene Node.js $(node -v), y se necesita la versión 22.13 o más reciente.${N}"
    echo "     Instale la versión «LTS» desde ${ENL}https://nodejs.org${N} y vuelva a abrir este archivo."
    open "https://nodejs.org/es" 2>/dev/null; eval "$pausa"; return 1
  fi

  # La ventana del sistema (arranque/menu.js). exec: el menú ocupa el lugar de este script,
  # así al cerrar la ventana la señal le llega directo y apaga todo en orden.
  if [ $# -eq 0 ]; then exec node arranque/menu.js; fi
  node arranque/menu.js "$@"
}
principal "$@"; exit $?
