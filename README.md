# Inventario Outlet

Sistema de **inventario, compras y ventas** del negocio propio: una tienda outlet de ropa en la frontera. Es de uso interno; no se vende ni se distribuye. En la tienda, la mercancía se compra al mayoreo en **dólares** en Estados Unidos y se vende en **pesos** en México. Todo gira alrededor del dólar, así que el sistema lo sigue **en vivo** y guarda a cuánto estaba en cada compra y en cada venta para responder la pregunta que importa: **¿el negocio es rentable, en pesos y en dólares?**

Corre en una **Mac** de la tienda que hace de servidor (también funciona en **Windows**). Quien vende lo usa desde su **celular** (mismo Wi-Fi), sin escáner ni etiquetas: un toque en el producto (con su **foto**) y listo.

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
3. El sistema **enciende solo** y la ventana se minimiza. Escriba **1** para abrirlo en la computadora y crear el PIN del dueño (solo se puede desde ahí).
4. Escriba **2** para ver el **código QR** para los celulares.

**La ventana es el sistema:** si la cierra, el sistema se apaga por completo. Las versiones nuevas se instalan desde **Ajustes → Actualizar el sistema**, arrastrando el `.zip` de la Release.

```
   ╭────────────────────────────────────────────────────────╮
   │       ☀   I N V E N T A R I O   O U T L E T   $        │
   ╰────────────────────────────────────────────────────────╯
   ● Encendido (versión 1.2.0)
     En esta Mac        http://localhost:4300
     En los celulares   http://192.168.1.50:4300

   ☀ Esta ventana es el sistema. Puede minimizarla; si la cierra, el sistema se apaga.

     1  Abrir en esta Mac
     2  Abrir en un celular  (código QR)
     3  Reiniciar el sistema
     4  Ver lo último del registro
     5  Hacer un respaldo ahora
     6  Restablecer el PIN del dueño
     7  Versión y novedades
     8  Minimizar esta ventana
     0  Apagar y cerrar
```

Cada opción se escribe y **se confirma con Enter**; apagar, reiniciar y restablecer piden además `SI`. Para que encienda solo al prender la computadora: en la Mac agregue **`iniciar.command`** en *Ajustes del Sistema → General → Ítems de inicio de sesión*; en Windows ponga un acceso directo a **`iniciar.bat`** en la carpeta `shell:startup` (Windows + R).

Para desarrollar: `npm start` (lanzador en primer plano) o `npm run servidor`. Con datos de demostración en una carpeta aparte: `IO_DATOS=./datos-demo npm run demo` (dueño «Ana» PIN 1357, vendedora «Lupita» PIN 2468).

## Estructura

```
iniciar.command        ventana del sistema con su menú (macOS)
iniciar.bat            la misma ventana (Windows)
encender.command/.bat  lo mismo que iniciar (se conservan por compatibilidad)
arranque/              menú, lanzador (vigila y reinicia el servidor) y aplicación de actualizaciones
servidor/              servidor HTTP, API, base de datos, dólar, inventario, reportes
  lib/                 piezas del servidor (una responsabilidad por archivo)
publico/               la página (HTML, CSS y JavaScript sin compilar)
pruebas/               pruebas automáticas (npm run probar)
docs/                  guía de uso y documentación técnica
datos/                 SE CREA SOLA: base de datos, fotos, respaldos, registro, configuración (no va a Git ni a las actualizaciones)
```

## Documentación

- **[Guía de uso](docs/guia-de-uso.md)**: para el dueño y quien vende, pantalla por pantalla.
- **[Documentación técnica](docs/documentacion-tecnica.md)**: arquitectura, modelo de datos, cálculo de costos y ganancia en dos monedas, fuentes del dólar, API, seguridad, respaldos, pruebas y publicación de versiones.
- **[Historial de versiones](CHANGELOG.md)**.

## Versiones

Cada vez que cambia el archivo `VERSION` en `main`, GitHub Actions corre las pruebas y publica la **Release**. Su `.zip` se instala desde *Ajustes → Actualizar el sistema* (etiqueta `vX.Y.Z`, notas del `CHANGELOG.md` y ZIP de instalación con su huella `.sha256`). Las pruebas también corren en cada cambio subido, en Linux, **Windows y macOS** (incluido el menú de arranque).

## Licencia

Sistema de uso interno del negocio propio; no se vende ni se distribuye. Ver [LICENSE](LICENSE). © 2026 CAEROLI SOLUCIONES TECNOLÓGICAS, S.A.S.
