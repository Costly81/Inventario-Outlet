# Historial de versiones

Cada versión nueva cambia el archivo `VERSION`; al subirla a `main`, GitHub Actions corre las pruebas y publica la Release con su ZIP de instalación (ver `docs/documentacion-tecnica.md` → Versiones).

## 1.2.0 · 19 de noviembre de 2026

- **La ventana es el sistema.** Al abrir `iniciar.command` (Mac) o `iniciar.bat` (Windows) el sistema enciende solo y la ventana se **minimiza sola**. Si se **cierra la ventana, se apaga todo** (servidor y base de datos, en orden): ya no queda nada corriendo escondido. El menú sigue ahí (1 abrir, 2 celular con QR, 3 reiniciar, 4 registro, 5 respaldo, 6 restablecer PIN, 7 versión, 8 minimizar, 0 apagar y cerrar). Si quedó encendido en segundo plano por una versión anterior, la ventana lo toma sola. `encender.command` y `encender.bat` siguen funcionando: hacen lo mismo que `iniciar`.
- **Actualizar desde Ajustes, sin entrar a la computadora.** *Ajustes → Actualizar el sistema*: se arrastra el `.zip` de la Release (o se elige desde el celular), se ve qué trae y se toca **Instalar**. Antes de cambiar se hace un respaldo de la base y una copia de la versión actual; el sistema se reinicia solo, las pantallas abiertas esperan y se recargan, y **si la versión nueva no arranca, regresa sola a la anterior**. Botón **Volver a la versión anterior** e historial de actualizaciones. La carpeta `datos/` nunca se toca.
- **Fotos de los productos** con la **cámara o la galería** del celular (o un archivo en la PC). Se achican en el celular antes de subirse (rápido por Wi-Fi) y se ven en Vender, al elegir talla, en el carrito y en el inventario, para reconocer la prenda a la primera. Filtro «Sin foto» en Inventario.
- **Sin códigos para entrar.** Se quitó el código de instalación: el PIN del dueño se crea (o se restablece) solo desde la computadora de la tienda, y los celulares entran con el código QR y el PIN de cada quien.
- **Permisos revisados.** Quien vende solo puede vender, ver y devolver sus ventas, consultar existencias y precios, y ver el dólar. Ya no recibe en vivo los montos de las ventas de otros ni ve el costo de la merma o las entradas en la ficha de un producto. El dueño ve y controla todo.
- **Negocio propio:** la licencia y la documentación dejan claro que el sistema es para el uso interno del negocio y no se vende ni se distribuye.
- Los `.command` y `.bat` se leen completos antes de ejecutarse, para que una actualización que los reemplace no los afecte a la mitad.
- Pruebas: **27** del servidor (antes 23), con el lector de `.zip`, la actualización completa (instalar, confirmar, regresar sola si falla y volver a la anterior), las fotos y los permisos del vendedor. GitHub Actions las corre en Linux, Windows y macOS.

## 1.1.0 · 19 de noviembre de 2026

- **También en Windows.** Nuevos `iniciar.bat` (el mismo menú con los mismos números que `iniciar.command`) y `encender.bat` (encender sin menú, para la carpeta de Inicio de Windows). Revisan que Node.js esté instalado y en versión 22.13 o más reciente.
- En Windows, la computadora no se duerme sola mientras el sistema está encendido (igual que la Mac con `caffeinate`). La pantalla sí puede apagarse.
- El menú usa en Windows recuadros y marcas que la consola clásica sabe dibujar, y habla de «esta computadora» en lugar de «esta Mac». La página y el servidor también dejan de decir «Mac» donde puede ser cualquier computadora.
- Los `.bat` se guardan con finales de línea de Windows (`.gitattributes`), para que `cmd.exe` los lea bien aunque el repositorio se descargue desde otra computadora.
- GitHub Actions prueba ahora en **Windows y macOS reales**: las pruebas del servidor y el menú de arranque de punta a punta (encender, estado, respaldo, código QR y apagar).
- Los datos (`datos/`) son los mismos en los dos sistemas: se puede pasar la carpeta completa de una Mac a una computadora con Windows o al revés.

## 1.0.0 · 19 de noviembre de 2026

Primera versión del sistema de inventario y ventas para la tienda outlet.

- **Vender desde el celular con un toque.** Cuadros grandes por producto (con su dibujo, precio y piezas). Si tiene tallas, se elige la talla con otro toque. Carrito fijo abajo, precio especial por pieza (regateo), descuento, y cobro en **efectivo, dólares, tarjeta o transferencia** con cálculo del cambio. Al cobrar en dólares, el cambio se da en pesos al precio al que la tienda recibe dólares. «Deshacer» durante 15 minutos.
- **Sin Wi-Fi no se pierde la venta:** se guarda en el celular y se envía sola al volver la conexión, sin cobrar dos veces.
- **Dólar en vivo desde Google** (Google Finanzas, el mismo que sale al buscar «dólar» en Google), con respaldo automático en Yahoo Finanzas, ExchangeRate-API y Frankfurter (BCE), y Banxico FIX opcional con token. Se consulta cada 5 minutos (ajustable), avisa a todas las pantallas al momento y guarda el historial. Tres precios: **mercado**, **compra** (lo que cobra la casa de cambio) y **recibir** (a cuánto la tienda acepta dólares). Dólar manual para cuando no hay internet.
- **Compras en dólares con el dólar de su fecha.** Asistente de 3 pasos: la fecha y hora de la compra (puede ser de días atrás, en hora de Ciudad Juárez) → el sistema busca a cuánto estaba el dólar en ese momento; productos y piezas por talla; impuesto (botón 8.25 % de Texas) y gastos (puente, gasolina…) repartidos entre las piezas. Precio por pieza o un total por lote surtido.
- **Costos por lote (primero en entrar, primero en salir):** cada pieza vendida sabe cuánto costó en dólares y en pesos, así la ganancia sale en las dos monedas.
- **Inventario:** piezas por talla, costo en USD y MXN, margen, días que alcanza, filtros (por agotarse, agotados, sin vender en 30 días), ficha con cada compra y su dólar, «reponerla hoy costaría», y **precio sugerido** para el margen objetivo con un botón para aplicarlo.
- **Merma** (dañada, robo, extravío, uso propio, regalo), **devoluciones** (la pieza vuelve al estante o va a merma), **cancelar venta** y **conteo físico** del inventario (corrige faltantes y sobrantes).
- **Inicio del dueño:** «Ganancia de hoy» contra ayer en pesos y en dólares, mes contra mes pasado, últimos 14 días, valor del inventario (lo que costó contra lo que costaría reponerlo hoy y el efecto del dólar), avisos y actividad en vivo. **Inicio del vendedor:** su día y lo que debe haber en caja por forma de pago.
- **Reportes:** estado de resultados en pesos y dólares contra el periodo anterior (ventas, descuentos, devoluciones, costo, ganancia, merma, gastos y utilidad), por categoría, forma de pago y vendedor, lo más vendido. **Proyección** a 15–90 días, qué resurtir y cuánto cuesta, días de la semana que más venden y simulador **«¿y si el dólar se va a…?»** con precios sugeridos. **Gastos** de operación.
- **Personas con PIN:** dueño (todo) y vendedores (vender, devolver, ver existencias; sin costos ni ganancias). Entrada con teclado de PIN grande.
- **Diseño azul cielo** con dock flotante abajo en el celular e isla flotante arriba en la PC (sin menú lateral), animaciones, paleta de comandos (Ctrl/⌘ + K) y modo «app» en el iPhone (Agregar a pantalla de inicio).
- **Arranque en la Mac:** `iniciar.command` abre un menú con números (encender, apagar, reiniciar, abrir en la Mac, **abrir en el celular con código QR en la Terminal**, registro, respaldo, restablecer PIN, versión). `encender.command` para el arranque automático. La Mac no se duerme mientras el sistema está encendido.
- **Respaldos** diarios automáticos (se guardan 30) y manuales; exportar a Excel (ventas, inventario, compras, merma, gastos e historial del dólar).
- Sin dependencias: Node.js 22.13+ y su SQLite integrado. Puerto `4300`.
- Pruebas: **23** automáticas del servidor (`npm run probar`), que GitHub Actions corre en cada cambio y antes de publicar.
