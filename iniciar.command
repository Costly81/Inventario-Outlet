#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
#  Inventario Outlet · arranque en macOS
#  Doble clic en este archivo para abrir el MENÚ: encender, apagar, abrir en la Mac o en el celular,
#  ver el registro, respaldar, restablecer el PIN…
#  Cada opción se escribe y se confirma con Enter; apagar, reiniciar y restablecer el PIN piden además SI.
#  Sin menú (Terminal o conexión remota):  ./iniciar.command encender | apagar | reiniciar | estado | respaldo | celular
# ─────────────────────────────────────────────────────────────────────────────
cd "$(dirname "$0")" || exit 1

# Lugares habituales donde macOS instala Node.js (Homebrew, instalador oficial, Volta, nvm)
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.volta/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1

# Colores: solo si la ventana los admite
if [ -t 1 ] && [ "${TERM:-dumb}" != "dumb" ] && [ -z "$NO_COLOR" ]; then
  N=$'\033[0m'; F=$'\033[1m'; T=$'\033[2m'; CIELO=$'\033[38;5;39m'; ROJO=$'\033[31m'; ENL=$'\033[1;36m'
  printf '\033]0;Inventario Outlet\007'
else N=; F=; T=; CIELO=; ROJO=; ENL=; fi

encabezado() {
  echo
  echo "  ${CIELO}╭────────────────────────────────────────────────────────╮${N}"
  echo "  ${CIELO}│${N}        ${F}I N V E N T A R I O   O U T L E T${N}               ${CIELO}│${N}"
  echo "  ${CIELO}╰────────────────────────────────────────────────────────╯${N}"
  echo
}
mal()   { echo "  ${ROJO}✗${N}  ${F}$1${N}"; }
# Se cierra con Enter (no con cualquier tecla), para que un toque por accidente no cierre la ventana
pausa() { echo; read -r -p "  Presione ${F}Enter${N} para cerrar esta ventana… " _; }

if ! command -v node >/dev/null 2>&1; then
  encabezado; mal "No se encontró Node.js en esta Mac."
  echo "     Instale la versión «LTS» desde ${ENL}https://nodejs.org${N} y vuelva a abrir este archivo."
  echo "     ${T}(Se abrirá la página de descarga.)${N}"
  open "https://nodejs.org/es" 2>/dev/null
  pausa; exit 1
fi
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=13)?0:1)'; then
  encabezado; mal "Esta Mac tiene Node.js $(node -v), y se necesita la versión 22.13 o más reciente."
  echo "     Instale la versión «LTS» desde ${ENL}https://nodejs.org${N} y vuelva a abrir este archivo."
  open "https://nodejs.org/es" 2>/dev/null
  pausa; exit 1
fi

# El menú es arranque/menu.js. El sistema corre aparte: cerrar esta ventana no lo apaga (se apaga con la opción 2).
node arranque/menu.js "$@"
codigo=$?
# Si el menú se cerró por un error, la ventana espera a Enter para que se pueda leer el mensaje
[ $codigo -ne 0 ] && [ $# -eq 0 ] && pausa
exit $codigo
