# Inventario Outlet

Sistema de **inventario, compras y ventas** para una tienda outlet de ropa en la frontera: la mercancía se compra al mayoreo en **dólares** en Estados Unidos y se vende en **pesos** en México. Todo gira alrededor del dólar, así que el sistema lo sigue **en vivo** y guarda a cuánto estaba en cada compra y en cada venta para responder la pregunta que importa: **¿el negocio es rentable, en pesos y en dólares?**

Corre en una **Mac** de la tienda que hace de servidor (también funciona en **Windows**). Quien vende lo usa desde su **celular** (mismo Wi-Fi), sin escáner ni etiquetas: un toque en el producto y listo.

| Pregunta del día a día | Dónde se responde |
| --- | --- |
| ¿Cómo registro una venta rápido? | **Vender**: un toque por pieza, cobro en pesos o dólares con cálculo del cambio |
| ¿A cuánto está el dólar y cuánto cambió desde ayer? | Píldora del dólar (arriba, siempre visible) y pantalla **Dólar**. Sale de **Google** (Google Finanzas), con respaldos automáticos |
| ¿A cuánto estaba el dólar el día que compré esta mercancía? | **Compras**: cada compra guarda el dólar de su fecha y hora (hora de Ciudad Juárez) |
| ¿Hoy fue rentable comparado con ayer? | **Inicio**: ganancia de hoy contra ayer, en pesos y en dólares |
| ¿Cuánto vale mi inventario y cuánto me costaría reponerlo hoy? | **Inicio** e **Inventario** |
| ¿Qué se pierde (merma) y qué regresan los clientes? | **Inventario → Merma**, **Ventas → Devolver**, **Reportes → Gastos y merma** |
| ¿Qué resurtir, cuánto cuesta y qué pasa si el dólar sube? | **Reportes → Proyección** |

## Requisitos

- macOS o Windows (también Linux) con **[Node.js](https://nodejs.org) 22.13 o más reciente** (versión LTS).
- **Cero dependencias**: no hay `npm install`. La base de datos es el SQLite que ya trae Node.js (`node:sqlite`).
- Internet en la Mac para consultar el dólar (sin internet funciona con un dólar manual).

## Inicio rápido

1. Descargue el ZIP de la [última versión](../../releases/latest), descomprímalo y deje la carpeta en un lugar fijo (por ejemplo, en su carpeta personal).
2. Doble clic en **`iniciar.command`** en la Mac (la primera vez: clic derecho → Abrir; ver `LEEME.txt`) o en **`iniciar.bat`** en Windows.
3. Escriba **1** y Enter para encender. Escriba **4** para abrirlo en la Mac y cree el PIN del dueño.
4. Escriba **5** para ver la **dirección y el código QR** para los celulares.

```
   ╭────────────────────────────────────────────────────────╮
   │       ☀   I N V E N T A R I O   O U T L E T   $        │
   ╰────────────────────────────────────────────────────────╯
     1  Encender el sistema
     2  Apagar el sistema  (pide confirmar)
     3  Reiniciar el sistema  (pide confirmar)
     4  Abrir en esta Mac
     5  Abrir en un celular  (dirección y código QR)
     6  Ver lo último del registro
     7  Hacer un respaldo ahora
     8  Restablecer el PIN del dueño
     9  Versión y novedades
     0  Salir de este menú
```

Cada opción se escribe y **se confirma con Enter**; apagar, reiniciar y restablecer piden además `SI`. Cerrar la ventana **no** apaga el sistema. Para que encienda solo al prender la computadora: en la Mac agregue **`encender.command`** en *Ajustes del Sistema → General → Ítems de inicio de sesión*; en Windows ponga un acceso directo a **`encender.bat`** en la carpeta `shell:startup` (Windows + R).

Para desarrollar: `npm start` (lanzador en primer plano) o `npm run servidor`. Con datos de demostración en una carpeta aparte: `IO_DATOS=./datos-demo npm run demo` (dueño «Ana» PIN 1357, vendedora «Lupita» PIN 2468).

## Estructura

```
iniciar.command        menú de arranque (macOS)
iniciar.bat            el mismo menú (Windows)
encender.command       encender sin menú, para el arranque automático (macOS)
encender.bat           encender sin menú, para el arranque automático (Windows)
arranque/              menú y lanzador (vigila el servidor, lo reinicia si se cae)
servidor/              servidor HTTP, API, base de datos, dólar, inventario, reportes
  lib/                 piezas del servidor (una responsabilidad por archivo)
publico/               la página (HTML, CSS y JavaScript sin compilar)
pruebas/               pruebas automáticas (npm run probar)
docs/                  guía de uso y documentación técnica
datos/                 SE CREA SOLA: base de datos, respaldos, registro, configuración (no va a Git)
```

## Documentación

- **[Guía de uso](docs/guia-de-uso.md)**: para el dueño y quien vende, pantalla por pantalla.
- **[Documentación técnica](docs/documentacion-tecnica.md)**: arquitectura, modelo de datos, cálculo de costos y ganancia en dos monedas, fuentes del dólar, API, seguridad, respaldos, pruebas y publicación de versiones.
- **[Historial de versiones](CHANGELOG.md)**.

## Versiones

Cada vez que cambia el archivo `VERSION` en `main`, GitHub Actions corre las pruebas y publica la **Release** (etiqueta `vX.Y.Z`, notas del `CHANGELOG.md` y ZIP de instalación con su huella `.sha256`). Las pruebas también corren en cada cambio subido, en Linux, **Windows y macOS** (incluido el menú de arranque).

## Licencia

Uso restringido. Ver [LICENSE](LICENSE). © 2026 CAEROLI SOLUCIONES TECNOLÓGICAS, S.A.S.
