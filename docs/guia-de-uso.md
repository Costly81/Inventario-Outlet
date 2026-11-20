# Guía de uso

Para el **dueño** y para **quien vende**. Todo se usa desde el navegador: en la Mac de la tienda (`http://localhost:4300`) o en el celular (la dirección que muestra la opción 5 del menú, por ejemplo `http://192.168.1.50:4300`).

## Antes de empezar: los tres precios del dólar

En la frontera no hay un solo dólar. El sistema maneja tres, y los muestra juntos en la pantalla **Dólar**:

| Precio | Qué es | De dónde sale |
| --- | --- | --- |
| **Mercado** | El valor de referencia: el mismo que sale al buscar «dólar» en Google | Google Finanzas cada 5 minutos (si falla: Yahoo, ExchangeRate-API o Frankfurter) o un valor manual |
| **Compra** | Lo que **usted** paga por cada dólar en la casa de cambio para comprar mercancía | Mercado + el ajuste de *Ajustes → Dólar* (por omisión $0.35) |
| **Recibir** | A cuánto la **tienda** le toma un dólar a un cliente que paga en dólares | Mercado − un ajuste (por omisión $0.60), o un precio fijo |

La píldora dorada de arriba muestra el **mercado** y cuánto cambió contra el cierre de ayer (verde si subió, rojo si bajó). Late cuando cambia.

## Entrar

Toque su nombre y escriba su PIN. Cada persona tiene el suyo. El **dueño** ve todo; quien está en **ventas** puede vender, devolver y consultar existencias y el dólar, pero no ve costos ni ganancias.

La sesión dura 30 días en cada celular. Para salir: *Más → su nombre → Salir* (celular) o el círculo con su inicial (PC).

---

## Vender (celular)

1. Toque el **producto**. Si tiene tallas, toque la **talla**. El producto «vuela» a la bolsa y el celular vibra.
2. Repita para cada pieza. Arriba de cada cuadro se ven las piezas que quedan.
3. Toque la **barra oscura** de abajo (*Cobrar*). Ahí puede:
   - cambiar cantidades con **−** y **+**;
   - tocar el precio de una pieza para darle un **precio especial** (regateo);
   - aplicar un **descuento** al total.
4. Elija cómo paga: **Efectivo**, **Dólares**, **Tarjeta** o **Transferencia**.
   - Efectivo o dólares: toque el billete con el que paga (o *Exacto*, u *Otro*). El sistema muestra el **cambio en pesos**.
   - En dólares aparece cuánto es en dólares al precio *recibir*.
5. **Cobrar**. Aparece «¡Venta lista!» con el folio y el cambio. Si se equivocó, **Deshacer** (hasta 15 minutos).

**¿Y si se cae el Wi-Fi?** La venta se guarda en el celular y arriba aparece «1 venta sin enviar». Se envía sola cuando vuelve la conexión (o tóquela para enviarla). Nunca se registra dos veces.

**¿No aparece el producto o dice que no hay piezas?** El sistema solo vende lo que tiene registrado. Pida al dueño que registre la compra o haga un conteo.

## Ventas (devoluciones y cancelaciones)

- Toque una venta para ver el detalle.
- **Devolver**: elija cuántas piezas y cómo vienen. *Bien* = regresan al estante para revenderse. *Dañada* = van a merma (se pierde su costo). El sistema dice cuánto devolverle al cliente.
- **Cancelar venta**: solo para errores al cobrar (todas las piezas regresan). Quien vende puede cancelar sus ventas de los últimos 15 minutos; el dueño, cualquiera.

## Inicio

**Dueño:** la tarjeta azul responde *¿hoy fue rentable?*: ganancia de hoy, lo vendido, lo que costó y el margen, comparado con ayer. Debajo:

- venta neta, ganancia en dólares, piezas y ganancia del mes (contra el mes pasado al mismo día);
- **últimos 14 días**: cada barra es lo vendido; la parte naranja es lo que costó la mercancía y la azul la ganancia (pase el dedo o el ratón para ver el detalle);
- **su inventario y el dólar**: lo que le costó, lo que costaría reponerlo hoy y si el dólar le juega a favor o en contra;
- **avisos**: productos por agotarse, productos donde *el dólar se comió el margen* y productos sin vender en 30 días;
- **actividad en vivo**: cada venta de cualquier celular aparece al instante.

**Ventas:** lo que lleva vendido hoy y **lo que debe haber en caja** por forma de pago (pesos en efectivo, dólares recibidos, tarjeta, transferencia).

## Inventario (dueño)

- Arriba: cuánto le costó todo, cuánto costaría reponerlo hoy, cuánto vale a precio de venta y el margen promedio.
- Filtros: categoría, **por agotarse**, **agotados** y **sin vender en 30 días**.
- Cada renglón: piezas por talla (amarillo = quedan pocas, tachado = agotada), costo en dólares, margen (verde si llega al objetivo) y **cuántos días alcanza** al ritmo actual.
- Toque un producto para su **ficha**:
  - cada **compra** de ese producto con el dólar al que se pagó y lo que costaría hoy;
  - **precio sugerido** con el dólar de hoy para su margen objetivo, con botón *Usar*;
  - movimientos (ventas, merma, devoluciones, entradas);
  - *Editar*, *Merma* y *Archivar* (deja de aparecer para vender; su historia se conserva).

**Producto nuevo:** nombre, categoría, precio, dibujo y tallas (botones rápidos: *Ropa* CH–XG, *Pantalón* 28–38, *Calzado*, *Niños*, *Única*, o escriba las suyas). Si una talla cuesta distinto, ábralo en *Precio distinto por talla*.

> Para mucha mercancía surtida y poco catálogo, puede crear productos como «Surtido $100» con talla *Única*.

**Merma:** piezas que se pierden (dañada, robo, extravío, uso propio, regalo). Se descuentan y su costo cuenta como pérdida en Reportes.

**Contar:** cada renglón empieza con lo que dice el sistema; cuente el estante y corrija solo lo que no coincida (se pone amarillo). Al guardar, lo que falte se registra como merma «faltante» y lo que sobre entra al inventario al costo promedio de esa talla.

## Compras (dueño)

Registre aquí **toda** la mercancía, también la que ya tenía, **con la fecha en que se compró**.

1. **Cuándo y dónde.** Fecha y hora aproximada (hora de la tienda), proveedor y lugar, y si pagó en dólares o pesos. El sistema muestra **a cuánto estaba el dólar en ese momento** (de su propio historial, o del cierre oficial de ese día) y sugiere lo que pagó en la casa de cambio; cámbielo si fue otro.
2. **Qué compró.** Elija el producto (o *Crear producto nuevo*), escriba piezas por talla y:
   - *Precio por pieza*: el costo de cada una, o
   - *Un total por lote surtido*: lo que pagó por todo; se reparte parejo.
3. **Impuesto y gastos.** *Calcular 8.25 % (Texas)*, otros gastos en dólares y gastos en pesos (puente, gasolina, aduana). El resumen muestra el **costo real de cada pieza puesta en la tienda**, en dólares y en pesos, y cuánto le costó de más comprar los dólares arriba del mercado.

Una compra se puede **anular** mientras ninguna de sus piezas se haya vendido o movido.

## Dólar

- Valor actual con 4 decimales, cambio contra el cierre de ayer, apertura, mínimo y máximo de hoy.
- Historial: hoy, 7, 30, 90 días y 1 año.
- **Convertidor** con los tres precios.
- **Sus compras contra el dólar de hoy** (dueño): si hoy volviera a comprar lo mismo, ¿pagaría más o menos pesos?

## Reportes (dueño)

**Resultados** (hoy, 7 días, 30 días, este mes, mes pasado, 90 días o fechas a elegir), comparados con el periodo anterior del mismo largo:

| Renglón | Significado |
| --- | --- |
| Ventas | Lo cobrado antes de descuentos |
| − Descuentos, − Devoluciones | Lo que se rebajó o se regresó |
| **Venta neta** | Lo que de verdad entró por ventas |
| − Costo de lo vendido | Lo que costaron esas piezas (con impuestos y gastos de su compra) |
| **Ganancia bruta** | Venta neta − costo (el % es el margen) |
| − Merma, − Gastos de operación | Lo perdido y lo que cuesta operar |
| **Utilidad** | Lo que le quedó |

La columna en **dólares** convierte cada venta con el dólar **del día en que se hizo** y usa el costo en los dólares que realmente pagó: así ve si el negocio crece en dólares y no solo en pesos.

**Proyección:** con el ritmo de las últimas 4 semanas, cuánto venderá y ganará en 15–90 días, qué se acaba primero y **cuánto cuesta resurtir**. Mueva el control **«¿Y si el dólar se va a…?»** para ver cómo cambian el costo de reponer, sus márgenes y los precios sugeridos (botón *Usar* para aplicar uno).

**Gastos y merma:** registre renta, luz, bolsas, gasolina del cruce… (en pesos o dólares) para que la utilidad sea real.

Los botones **Excel** descargan archivos `.csv` que abren en Excel o Numbers.

## Ajustes (dueño)

- **Abrir en el celular:** código QR y dirección.
- **Tienda:** nombre, lema y zona horaria (por omisión Ciudad Juárez).
- **Dólar:** fuente preferida (Google por omisión), cada cuántos minutos se consulta, **dólar manual**, lo que cobra la casa de cambio, cómo recibir dólares de clientes y token opcional de Banxico.
- **Precios y avisos:** margen objetivo, redondeo de precios sugeridos y desde cuántas piezas avisar.
- **Personas:** agregar vendedores con su PIN, cambiar papel, color o PIN, desactivar.
- **Categorías**, **Respaldos** (descargar) y **Exportar a Excel**.

## Atajos en la PC

- **Ctrl + K** (⌘ + K en Mac): buscar pantalla, acción o producto.
- **Esc**: cerrar la ventana abierta.
- En el teclado de precios y PIN se puede escribir con el teclado normal y Enter.

## Preguntas frecuentes

**¿Por qué la ganancia en dólares no es la ganancia en pesos entre el dólar de hoy?** Porque cada venta se convierte con el dólar de su día, y el costo está en los dólares que pagó. Si el peso se deprecia, ganar más pesos no siempre es ganar más dólares.

**¿Qué significa «reponerlo hoy costaría»?** Lo que pagaría en pesos por la misma mercancía con el dólar de compra de hoy. Si es más de lo que le costó, el dólar subió: cuide que sus precios alcancen para volver a comprar.

**¿Puedo usarlo sin internet?** Sí. Escriba un dólar manual en Ajustes. Los celulares solo necesitan el Wi-Fi de la tienda, no internet.
