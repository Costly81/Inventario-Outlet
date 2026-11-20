#!/bin/bash
# Inventario Outlet · (compatibilidad) Desde la versión 1.2.0, iniciar.command ya enciende el sistema solo.
# Este archivo hace exactamente lo mismo, para quien lo tenga en «Ítems de inicio de sesión».
exec "$(dirname "$0")/iniciar.command" "$@"
