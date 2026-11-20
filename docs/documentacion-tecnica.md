# Documentación técnica

Para quien mantiene el sistema. La guía para usuarios está en [guia-de-uso.md](guia-de-uso.md).

## Arquitectura

```
                  Wi-Fi de la tienda
 celulares ─────────────┐
 (navegador)            ▼
                ┌──────────────────────── Mac (servidor) ────────────────────────┐
 iniciar.command│ arranque/menu.js ──hijo──► arranque/lanzador.js ──fork──► servidor/index.js   (todo en la MISMA ventana:
  iniciar.bat   │  (ventana = sistema)                                                    cerrarla = apagar)
                │   (menú numerado)            (vigila, reinicia,         │  HTTP :4300 (0.0.0.0)
                │                               apaga en orden)           │  publico/ (página)
                │                                                         │  /api/* (rutas.js)
                │                                                         │  /api/eventos (SSE)
                │                                                         ▼
                │                               datos/inventario.sqlite (node:sqlite, WAL)
                │                               datos/respaldos/ · datos/sistema.log
                └──────────────────────────────────────────────────────────────────┘
                                │ cada 5 min
                                ▼
        Google Finanzas → Yahoo Finanzas → Banxico (opcional) → ExchangeRate-API → Frankfurter
```

- **Sin dependencias.** Node.js ≥ 22.13 (`node:sqlite`, `fetch`, `Intl` con zonas horarias). La página es HTML + CSS + módulos ES sin compilar.
- **Un proceso servidor** atiende la página y la API en el puerto `4300`, escuchando en `0.0.0.0` para que entren los celulares de la red local.
- **La ventana es el sistema (desde 1.2).** `iniciar.command` hace `exec node arranque/menu.js`; el menú arranca el lanzador como hijo **no** desacoplado (misma ventana, mismo grupo de procesos) con la salida en `datos/sistema.log`, y minimiza la ventana (macOS: secuencia `ESC [2t`; Windows: `ShowWindow(GetConsoleWindow(), SW_MINIMIZE)` desde un PowerShell que comparte la consola). Al **cerrar la ventana**, macOS y Windows mandan `SIGHUP` a todos los procesos de la ventana: menú, lanzador y servidor se apagan en orden (Windows da ~5 s; el lanzador fuerza a los 4 s). Además el lanzador vigila el PID de la ventana (`IO_PADRE`) por si desaparece. Solo puede haber una ventana: el archivo `datos/lanzador.pid` guarda `{ pid, ventana }`; una segunda ventana avisa y no enciende otra copia. Si encuentra un sistema en segundo plano (versiones anteriores u orden `encender`), lo apaga y lo toma.
- **El lanzador** (`arranque/lanzador.js`) arranca el servidor con `fork` (canal IPC), lo reinicia si se cae (espera 2, 4, 8… hasta 60 s), aplica actualizaciones (código de salida 75, ver abajo) y lo apaga en orden con `SIGHUP`, `SIGTERM`, Control + C o el archivo `datos/detener.orden`.
- Las órdenes sin ventana (`menu.js encender | apagar | estado | respaldo | celular`) dejan el sistema en segundo plano; son para conexión remota y para las pruebas de GitHub Actions.
- **El menú** (`arranque/menu.js`) es el mismo en macOS (`iniciar.command`) y Windows (`iniciar.bat`). Evita que el equipo se duerma mientras el sistema está encendido: `caffeinate -i -w <pid>` en macOS; en Windows, un PowerShell oculto que llama `SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED)` y espera con `Wait-Process` a que termine el lanzador. Para apagar en Windows, si la orden por archivo no basta, usa `taskkill /t /f`. En Windows el menú usa recuadros dobles (`╔═╗`) y `√ ×` porque la consola clásica no dibuja `╭ ✓ ✗`. Sabe si el sistema está encendido consultando `GET /api/salud`.

### Archivos del servidor

| Archivo | Responsabilidad |
| --- | --- |
| `servidor/index.js` | Arranque, atención de peticiones (sesión, permisos, CSRF), tareas periódicas, apagado ordenado, órdenes `--respaldo`, `--restablecer-pin`, `--demo`; confirma una versión recién instalada; sale con 75 para actualizar |
| `servidor/rutas.js` | Todas las rutas `/api/*` |
| `lib/config.js` | `datos/configuracion.json` (puerto, host, respaldos, duración de sesión) y variables `IO_*` |
| `lib/db.js` | Apertura de SQLite, migraciones, transacciones, ajustes, bitácora, respaldo con `VACUUM INTO` |
| `lib/tiempo.js` | Fechas en la zona de la tienda (`America/Ciudad_Juarez` por omisión) |
| `lib/ajustes.js` | Ajustes del negocio (valores por omisión y validación) |
| `lib/tipoCambio.js` | Proveedores del dólar, muestras, resumen diario, dólar de un momento pasado |
| `lib/catalogo.js` | Categorías, productos, variantes (tallas) y su listado con existencias y costos |
| `lib/inventario.js` | Lotes FIFO: existencia, consumir, regresar, costo promedio |
| `lib/operaciones.js` | Compras, ventas, devoluciones, merma, conteos y gastos |
| `lib/reportes.js` | Resumen de periodo, serie diaria, tablero, valor del inventario, proyección |
| `lib/auth.js` | PIN (scrypt), sesiones, intentos fallidos, PIN del dueño solo desde la computadora, usuarios |
| `lib/eventos.js` | Avisos en vivo (Server-Sent Events) |
| `lib/http.js` | JSON, cuerpo, cookies, estáticos con gzip, encabezados de seguridad, enrutador, CSV |
| `lib/respaldo.js` | Respaldos diarios y manuales |
| `lib/red.js` | Direcciones IPv4 de la Mac en la red local |
| `lib/fotos.js` | Fotos de productos: valida JPEG/PNG/WebP por sus primeros bytes, guarda en `datos/fotos/` con nombre nuevo cada vez |
| `lib/zip.js` | Lector de `.zip` (directorio central, métodos 0 y 8, sin ZIP64, rechaza cifrados y enlaces) |
| `lib/actualizacion.js` | Revisa y descomprime el `.zip` de una versión nueva y deja la orden para el lanzador |
| `arranque/actualizar.js` | Aplica la orden con el servidor apagado: copia previa, sincroniza archivos, confirma o revierte |
| `servidor/demo.js` | Datos de demostración reproducibles |

### Archivos de la página

| Archivo | Responsabilidad |
| --- | --- |
| `publico/index.html` | Esqueleto; carga `js/qr.js` (clásico) y `js/app.js` (módulo) |
| `publico/css/app.css` | Todo el diseño (fichas, componentes, animaciones; respeta `prefers-reduced-motion`) |
| `js/app.js` | Arranque, entrada con PIN, primer uso, marco (isla en PC, dock en celular), rutas por `#`, paleta Ctrl/⌘ + K |
| `js/nucleo.js` | Estado compartido con suscriptores, `api()`, SSE, catálogo, formatos de dinero y fechas |
| `js/ui.js` | Avisos, hojas (bottom sheet / modal), confirmaciones, teclado numérico, números animados, vuelo al carrito |
| `js/graficas.js` | Barras, línea, mini línea y barras horizontales en SVG con globos informativos |
| `js/iconos.js` | Iconos SVG en línea |
| `js/qr.js` | Generador de códigos QR (también lo usa el menú en la Terminal) |
| `js/vistas/*.js` | Una pantalla por archivo; cada una exporta `montar(contenedor, params)` y opcionalmente `alCambio(evento)` |

## Modelo de datos

```
categorias 1─* productos 1─* variantes (tallas; «Única» si no tiene)
                                  │
compras 1─* lotes *───────────────┘   (cada lote: cantidad, disponible, costo_usd, costo_mxn POR PIEZA, tc)
              │
              └─* consumos *─ (tipo='venta' → renglones.id | tipo='merma' → mermas.id)
ventas 1─* renglones ─* devoluciones
mermas · conteos 1─* conteo_renglones · gastos
tc_muestras (cada consulta) · tc_dias (apertura, cierre, mínimo, máximo por día local)
usuarios · sesiones · intentos · ajustes · meta · bitacora
```

Cada operación guarda dos marcas de tiempo: `t` (instante UTC, ISO 8601) y `fecha` (día **local** de la tienda, `AAAA-MM-DD`), más `hora` local cuando aplica. Los reportes agrupan por `fecha`.

Las **migraciones** están en `lib/db.js` → `MIGRACIONES`, se aplican solas y en orden (`PRAGMA user_version`). Nunca se edita una publicada: se agrega una nueva al final.

## Costos y ganancia en dos monedas

### Costo de una compra

Para una compra en dólares con subtotal `S`, impuesto `I`, gastos en dólares `Gu`, gastos en pesos `Gm` y dólar pagado `P`:

```
total_usd = S + I + Gu + Gm / P
total_mxn = (S + I + Gu) × P + Gm
```

El total se reparte entre los renglones **por valor** (cada renglón absorbe en proporción a `cantidad × costo`) o **por pieza** (lote surtido: parejo). El resultado es el costo **por pieza puesta en la tienda** en las dos monedas, que se guarda en el lote. Para compras en pesos, los dólares se calculan con `P`.

`tc_mercado` (el dólar de ese momento) se guarda aparte: `(S + I + Gu) × (P − tc_mercado)` es lo que costó comprar los dólares arriba del mercado.

### Dólar de un momento pasado (`tipoCambio.enMomento(fecha, hora)`)

1. Si es de hace menos de 20 minutos → el actual.
2. La muestra guardada más cercana a ese instante, a máximo 3 horas.
3. El cierre de ese día en `tc_dias`, o del último día con dato en los 5 anteriores (fines de semana).
4. Frankfurter `/v1/{fecha}` (cierre oficial del BCE) y se guarda.
5. Si nada funciona, el actual, avisándolo en `detalle`.

La hora local se convierte a UTC con `tiempo.localAUTC`, que respeta horario de verano.

### FIFO

`inventario.consumir()` toma piezas de los lotes con `disponible > 0` ordenados por `fecha, t, id` y anota un **consumo** por lote con su costo. Una devolución (`regresar`) recorre los consumos de ese renglón del más nuevo al más viejo y devuelve las piezas **al mismo lote**. Así el costo de lo vendido es exacto aunque el dólar cambie entre compras.

### Venta

- Precio por renglón: el que envía el celular (precio especial) o el de la variante, o el del producto.
- El descuento se reparte en proporción al importe de cada renglón (`neto`).
- `tc_mercado` = dólar de mercado al vender; `total_usd = total / tc_mercado`.
- En dólares: `tc_cobro` = precio *recibir*; `cambio = recibido × tc_cobro − total` (en pesos).
- `clave` única generada por el celular: si la misma venta llega dos veces (reintento sin conexión), se devuelve la primera.

### Resumen de un periodo (`reportes.resumen`)

```
venta neta  = Σ ventas.total − Σ devoluciones.reembolso                 (MXN)
venta USD   = Σ ventas.total_usd − Σ (reembolso / tc_mercado de su venta)
costo       = Σ ventas.costo − Σ devoluciones.costo                     (ambas monedas)
ganancia    = venta neta − costo                     margen = ganancia / venta neta
utilidad    = ganancia − merma − gastos
```

Las devoluciones cuentan en el día en que ocurren. Una devolución a merma revierte la venta y además registra la merma con el costo de la pieza.

### Valor del inventario

`costo` = Σ disponible × costo por lote (histórico). `reposición` = costo en USD × dólar de **compra** de hoy. `efecto cambiario = reposición − costo MXN` (positivo: el dólar subió desde que se compró).

### Proyección

Ventana base: últimos 28 días (o desde la primera venta, mínimo 7). Ritmo por producto = piezas vendidas / días de la ventana. `días restantes = existencia / ritmo`; `comprar = ritmo × horizonte − existencia`; presupuesto en USD con el costo promedio. Precio sugerido = `costo de reposición / (1 − margen objetivo)`, redondeado hacia arriba al múltiplo de *redondeo*.

## Actualizar desde Ajustes

```
Ajustes (dueño) ──POST /api/actualizacion/subir (el .zip tal cual, máx. 60 MB)──► lib/actualizacion.preparar()
   · lee el .zip, quita la carpeta «inventario-outlet/», rechaza rutas con «..», absolutas o enlaces
   · exige VERSION, package.json (name = inventario-outlet), servidor/index.js, arranque/lanzador.js, publico/index.html
   · la versión debe ser MÁS NUEVA; revisa el Node.js que pide engines.node
   · nunca acepta datos/; descomprime en datos/actualizacion/pendiente/arbol (con permisos de ejecución)
   · devuelve las novedades de esa versión (su sección del CHANGELOG)
Instalar ──POST /api/actualizacion/instalar──► respaldo de la base + datos/actualizacion/orden.json + evento SSE «actualizando»
   └─ el servidor responde y sale con el código 75
lanzador (servidor apagado) ── arranque/actualizar.cumplirOrden():
   1. copia completa de lo instalado → datos/actualizacion/previa
   2. sincroniza: copia lo nuevo o distinto, borra lo que ya no existe (excepto datos/, .git, node_modules)
   3. estado «probando» → enciende el servidor
servidor nuevo arranca bien → confirma (estado «confirmada», historial)
servidor nuevo se cae antes de confirmar → el lanzador sincroniza desde «previa» (estado «revertida»)
Volver a la anterior ──POST /api/actualizacion/revertir──► la misma orden con «previa» como origen
```

Solo funciona cuando el servidor corre bajo el lanzador (`process.connected`). Solo se reescriben los archivos que cambian, y los `.command`/`.bat` se leen completos antes de ejecutarse (función `principal` en bash; bloque `( … )` en cmd), así reemplazarlos mientras la ventana está abierta no los rompe.

## Fotos de productos

El celular usa `<input type="file" accept="image/*">` (el teléfono ofrece cámara o galería; funciona sin HTTPS), achica la imagen a 900 px con `createImageBitmap` respetando la orientación y la sube como JPEG (~100–200 KB) a `POST /api/productos/:id/foto`. El servidor guarda `datos/fotos/p<id>-<aleatorio>.<ext>` y borra la anterior; `GET /api/fotos/:archivo` (con sesión) la sirve con caché larga porque el nombre cambia cada vez.

## Tipo de cambio

| Fuente | URL | Frecuencia |
| --- | --- | --- |
| **Google Finanzas** (principal) | `www.google.com/finance/quote/USD-MXN?hl=en` → atributo `data-last-price` de la página (respaldo: el número de la clase `YMlKec`) | Casi en vivo |
| Yahoo Finanzas | `query1.finance.yahoo.com/v8/finance/chart/MXN=X` → `meta.regularMarketPrice` | Casi en vivo |
| Banxico FIX (opcional) | `banxico.org.mx/SieAPIRest/service/v1/series/SF43718/datos/oportuno` con `Bmx-Token` | Diaria |
| ExchangeRate-API | `open.er-api.com/v6/latest/USD` → `rates.MXN` | Diaria |
| Frankfurter (BCE) | `api.frankfurter.dev/v1/latest?base=USD&symbols=MXN` y series `/v1/A..B` | Diaria |

- Fuente por omisión: **Google** (es el dólar que todos consultan). Si falla, se prueban Yahoo → Banxico (si hay token) → ExchangeRate-API → Frankfurter. Google no ofrece una API oficial para esto: se lee su página pública, así que si Google cambia el diseño de la página, `leerGoogle()` (en `lib/tipoCambio.js`) puede necesitar un ajuste; mientras tanto el sistema sigue solo con las fuentes de respaldo y la pantalla Dólar muestra el aviso.
- Se descarta un valor fuera de 5–60 o con un salto mayor a 15 % contra el último (dato roto).
- Al arrancar se llena el histórico diario de 120 días desde Frankfurter (solo si falta).
- Cada consulta exitosa: `tc_muestras` + actualización de `tc_dias` + evento SSE `tc` a todas las pantallas.
- Un **dólar manual** en Ajustes reemplaza al de internet en todo el sistema hasta que se borre.
- Las muestras de más de 400 días se podan; el resumen diario se conserva.

## API

Todas las respuestas son JSON `{ ok: true, … }` o `{ ok: false, error: 'mensaje para la persona' }`. Las marcadas *D* son solo del dueño.

| Método y ruta | Uso |
| --- | --- |
| `GET /api/salud` | Público. Versión (lo usa el menú) |
| `GET /api/estado` | Público. Estado de instalación, nombre de la tienda, personas para entrar |
| `POST /api/instalar` `{nombre, pin}` | Público, **solo desde la propia computadora** (127.0.0.1). Primer uso o PIN olvidado |
| `POST /api/entrar` `{usuarioId, pin}` / `POST /api/salir` | Sesión |
| `GET /api/sesion` | Usuario, CSRF, ajustes, direcciones de red |
| `GET /api/eventos` | SSE: `tc` (dólar) y `cambio` (`{que: venta/compra/catalogo/…}`) |
| `GET /api/tc` · `POST /api/tc/actualizar` *D* · `GET /api/tc/historial?dias=` · `GET /api/tc/momento?fecha&hora` *D* · `GET /api/tc/compras` *D* | Dólar |
| `GET /api/catalogo` · `GET /api/productos/:id` | Catálogo (al vendedor sin costos) |
| `POST /api/productos` · `PUT /api/productos/:id` · `POST /api/productos/:id/activo` *D* | Productos |
| `POST/PUT/DELETE /api/categorias[/:id]` *D* | Categorías |
| `POST /api/compras/calcular` · `POST /api/compras` · `GET /api/compras[/:id]` · `POST /api/compras/:id/anular` · `GET /api/proveedores` *D* | Compras |
| `POST /api/ventas` · `GET /api/ventas` · `GET /api/ventas/:id` · `POST /api/ventas/:id/anular` | Ventas |
| `POST /api/devoluciones` · `GET /api/mi-dia` | Devoluciones y día del vendedor |
| `POST/GET /api/mermas` · `POST/GET /api/conteos` · `POST/GET /api/gastos` · `DELETE /api/gastos/:id` *D* | Merma, conteo, gastos |
| `GET /api/tablero` · `GET /api/reportes?desde&hasta` · `GET /api/proyeccion?dias&tc` *D* | Reportes |
| `GET/PUT /api/ajustes` · `GET/POST/PUT /api/usuarios` · `GET/POST /api/respaldos` · `GET /api/respaldos/:nombre` · `GET /api/bitacora` *D* | Administración |
| `GET /api/exportar/{ventas,inventario,compras,mermas,gastos,dolar}.csv?desde&hasta` *D* | Excel (CSV con BOM UTF-8) |
| `POST /api/mi-pin` `{actual, nuevo}` | Cambiar el propio PIN |
| `POST /api/productos/:id/foto` (imagen) · `DELETE /api/productos/:id/foto` *D* · `GET /api/fotos/:archivo` | Fotos |
| `GET /api/actualizacion` · `POST /api/actualizacion/subir` (.zip) · `POST /api/actualizacion/{instalar,revertir}` · `DELETE /api/actualizacion/pendiente` *D* | Actualizar el sistema |

## Seguridad

- **PIN** de 4 a 6 dígitos guardado como `scrypt` con sal; nunca en texto. 8 intentos fallidos por dirección en 10 minutos bloquean esa dirección por el resto de la ventana.
- **Sesión**: cookie `io_sesion` HttpOnly, SameSite=Lax, 30 días; token aleatorio de 256 bits guardado en `sesiones`.
- **CSRF**: toda petición que cambia datos exige el encabezado `X-CSRF` de la sesión.
- **Papeles**: el servidor oculta costos y ganancias al vendedor (también en los movimientos de la ficha de un producto) y en los avisos en vivo solo le manda «qué cambió», sin montos; un vendedor solo ve y cancela sus ventas. Las pruebas verifican que reciba 403 en compras, reportes, proyección, ajustes, merma, personas, fotos, actualizaciones y Excel.
- **Encabezados**: CSP `default-src 'self'` (sin recursos externos), `X-Frame-Options: DENY`, `nosniff`, `no-referrer`.
- **Primer uso y PIN olvidado**: el PIN del dueño solo se crea desde la propia computadora (la conexión llega de 127.0.0.1). No hay códigos de instalación (las versiones 1.0 y 1.1 los usaban; la 1.2 borra `datos/INSTALACION.txt` si quedó).
- **Actualizaciones**: solo el dueño; el `.zip` se valida antes de tocar nada y siempre queda la versión previa para regresar.
- El sistema escucha en la red local, **no** en internet. Para usarlo fuera de la tienda haría falta un túnel con HTTPS (no incluido).

## Configuración técnica

`datos/configuracion.json` (se crea solo):

```json
{ "puerto": 4300, "host": "0.0.0.0", "respaldosDiarios": 30, "sesionDias": 30 }
```

Puertos reservados que nunca se usan (otros sistemas de la misma Mac): `3000 3001 4100 4101 5001 5002 8787 8788 9000 9001`.

Variables de entorno: `IO_DATOS` (carpeta de datos), `IO_PUERTO`, `IO_HOST`, `IO_SIN_RED=1` (no consultar el dólar; para pruebas).

## Gráficas

Colores de dos series (costo / ganancia): `#e8955a` / `#0b8fc6`, validados para daltonismo (ΔE CVD 19.2, visión normal 28.4). Contraste menor a 3:1 sobre blanco compensado con leyenda, globo informativo y tablas. El dólar va en `#c98500`. Nunca dos ejes verticales en una gráfica.

## Pruebas

`npm run probar` (node:test, 27 pruebas): fechas y zona horaria, reparto de costos de compras, FIFO, cobro en dólares, idempotencia, descuentos, devoluciones, merma, conteo, cancelaciones, lectura de la página de Google y proveedores del dólar con `fetch` simulado, dólar de un momento pasado, QR, el lector de `.zip`, la actualización completa (instalar, confirmar, regresar sola si falla, volver a la anterior), las fotos, y un recorrido HTTP completo (instalación solo local, PIN, CSRF, permisos del vendedor, compra, venta, tablero, CSV).

GitHub Actions (`.github/workflows/pruebas.yml`) las corre en cada cambio en Linux con Node 22 y 24 (además revisa la sintaxis de todo el JavaScript, de los `.command`, y que los `.bat` conserven CRLF) y en **Windows y macOS reales**, donde además prueba el menú de arranque de punta a punta (`encender`, `estado`, `respaldo`, `celular`, `apagar`).

### Archivos de arranque y finales de línea

| Archivo | Sistema | Finales de línea |
| --- | --- | --- |
| `iniciar.command`, `encender.command` | macOS | LF (si no, la Terminal no los ejecuta) |
| `iniciar.bat`, `encender.bat` | Windows | CRLF (si no, `cmd.exe` puede leer mal los bloques) |

Lo fija `.gitattributes`. Los `.bat` hacen `chcp 65001` (UTF-8) antes de abrir el menú y sus mensajes propios van sin acentos, por compatibilidad con la consola clásica.

## Versiones

1. Cambie el código y agregue la sección `## X.Y.Z · fecha` arriba en `CHANGELOG.md`.
2. Cambie `VERSION` (y `version` en `package.json`).
3. Suba a `main`. El flujo **Publicar versiones** corre las pruebas, crea la etiqueta `vX.Y.Z` y la Release con `inventario-outlet-vX.Y.Z.zip` y su `.sha256` (armado con `git archive`; `.github/` queda fuera por `.gitattributes`).

Para probar el armado sin publicar: `DRY_RUN=1 bash .github/scripts/publicar-versiones.sh`.

## Datos de demostración

```bash
IO_DATOS=./datos-demo IO_SIN_RED=1 node servidor/index.js --demo
```

Dueño «Ana» (PIN 1357), vendedora «Lupita» (PIN 2468), 14 productos genéricos, 4 compras, ~6 semanas de ventas, devoluciones, merma, gastos y 120 días de dólar simulado. Solo se cargan si la base está vacía.
