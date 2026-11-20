#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Crea en GitHub la Release de cada versión que todavía no la tenga. Lo ejecuta el flujo «Publicar versiones».
#   ETIQUETA=v1.2.0       publica solo esa etiqueta (cuando se sube una etiqueta nueva)
#   VERSIONES="1.1.0"     publica solo esas (vacío: la versión del archivo VERSION y cualquier etiqueta v* sin Release)
#   DRY_RUN=1             no llama a GitHub: arma ZIP y notas y muestra lo que haría (para probar en una computadora)
#   SALIDA=carpeta        dónde dejar ZIP y notas en DRY_RUN (por omisión, una carpeta temporal)
#
# El ZIP es el código de esa versión tal cual (git archive), dentro de una carpeta «inventario-outlet».
# Lo marcado como export-ignore en .gitattributes (por ejemplo .github/) no va en el ZIP.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO="${GITHUB_REPOSITORY:-}"
ETIQUETA="${ETIQUETA:-}"; VERSIONES="${VERSIONES:-}"; DRY_RUN="${DRY_RUN:-}"
RAIZ="$(git rev-parse --show-toplevel)"
SALIDA="${SALIDA:-$(mktemp -d)}"; mkdir -p "$SALIDA"
PRODUCTO="inventario-outlet"

[[ "$VERSIONES" =~ ^[0-9.\ ]*$ ]] || { echo "«versiones» solo admite números, puntos y espacios." >&2; exit 1; }

# La versión actual (archivo VERSION) se publica en el último commit que cambió VERSION, aunque aún no tenga etiqueta
ACTUAL="$(tr -d '\r\n ' < "$RAIZ/VERSION")"
declare -A COMMIT=()
if [[ "$ACTUAL" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] && ! git rev-parse -q --verify "refs/tags/v$ACTUAL" >/dev/null; then
  COMMIT[$ACTUAL]="$(git log -n1 --format=%H -- VERSION)"
fi

existe() { [ -z "$DRY_RUN" ] && gh release view "v$1" ${REPO:+--repo "$REPO"} >/dev/null 2>&1; }

if [ -n "$ETIQUETA" ]; then
  [[ "$ETIQUETA" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "La etiqueta «$ETIQUETA» no es de la forma v1.2.3; no se publica."; exit 0; }
  lista="${ETIQUETA#v}"
elif [ -n "${VERSIONES// /}" ]; then
  lista="$VERSIONES"
else
  lista="$( { printf '%s\n' "${!COMMIT[@]}"; git tag --list 'v[0-9]*.[0-9]*.[0-9]*' | sed 's/^v//'; } | sort -Vu | tr '\n' ' ')"
fi
echo "Versiones a revisar: $lista"
maxima="$(printf '%s\n' $lista $( [ -z "$DRY_RUN" ] && gh release list ${REPO:+--repo "$REPO"} --limit 200 --json tagName --jq '.[].tagName' | sed 's/^v//' ) | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -1)"

for v in $lista; do
  if existe "$v"; then echo "• v$v: la Release ya existe; se omite."; continue; fi
  if git rev-parse -q --verify "refs/tags/v$v" >/dev/null; then sha="$(git rev-list -n1 "v$v")"
  elif [ -n "${COMMIT[$v]:-}" ]; then sha="${COMMIT[$v]}"
  else echo "• v$v: no hay etiqueta ni commit conocido; se omite." >&2; continue; fi
  echo; echo "══ v$v  (commit ${sha:0:7})"

  [ "$(git show "$sha:VERSION" | tr -d '\r\n ')" = "$v" ] || { echo "• v$v: el archivo VERSION de ese commit no coincide; se omite." >&2; continue; }

  # Notas: la sección «## v · fecha» del CHANGELOG de ese commit
  notas="$SALIDA/notas-v$v.md"
  git show "$sha:CHANGELOG.md" | awk -v v="$v" 'p && /^## /{exit} index($0,"## " v " ")==1{p=1;next} p' | sed '/./,$!d' > "$notas"
  [ -s "$notas" ] || { echo "• v$v: el CHANGELOG no tiene su sección; se omite." >&2; continue; }

  # ZIP de instalación y su huella
  zip="$SALIDA/$PRODUCTO-v$v.zip"
  git archive --format=zip --prefix="$PRODUCTO/" -o "$zip" "$sha"
  (cd "$SALIDA" && sha256sum "$(basename "$zip")" > "$(basename "$zip").sha256")
  cat >> "$notas" <<PIE

---

**Cómo instalar:** descargue \`$PRODUCTO-v$v.zip\`, descomprímalo en la Mac y siga \`LEEME.txt\` (doble clic en \`iniciar.command\`). Requiere Node.js 22.13 o más reciente.

**Cómo actualizar una instalación existente:** apague el sistema (opción 2 del menú), reemplace todo **excepto la carpeta \`datos/\`** y vuelva a encender. La base de datos se actualiza sola.

**Cómo comprobar el archivo:** \`shasum -a 256 -c $PRODUCTO-v$v.zip.sha256\`
PIE

  marca="--latest=false"; [ "$v" = "$maxima" ] && marca="--latest"
  cmd=(gh release create "v$v" "$zip" "$zip.sha256" ${REPO:+--repo "$REPO"} --target "$sha" --title "Inventario Outlet $v" --notes-file "$notas" "$marca")
  if [ -n "$DRY_RUN" ]; then echo "  (DRY_RUN) ${cmd[*]}"; else "${cmd[@]}"; echo "  ✓ v$v publicada"; fi
done
echo; echo "Listo."
