'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   OPERACIONES DEL NEGOCIO: compras, ventas, devoluciones, merma, conteos y gastos.

   Regla de oro: cada operación es una transacción (todo o nada). Si algo falla a la
   mitad (por ejemplo, no alcanzan las piezas), no queda nada a medias en la base.

   Cada operación guarda el dólar del momento, para comparar después en las dos monedas.
   ───────────────────────────────────────────────────────────────────────────── */
const U = require('./util.js');
const T = require('./tiempo.js');
const I = require('./inventario.js');
const C = require('./catalogo.js');
const A = require('./ajustes.js');

const METODOS = ['efectivo', 'dolares', 'tarjeta', 'transferencia'];
const MOTIVOS_MERMA = ['danado', 'robo', 'extravio', 'uso', 'regalo', 'faltante', 'otro'];
const siguienteFolio = (B, tabla) => (B.valor(`SELECT MAX(folio) FROM ${tabla}`) || 0) + 1;

/* ═════════════════════════════ COMPRAS ═════════════════════════════ */

/**
 * Calcula (sin guardar) cómo se reparte el costo de una compra entre sus piezas.
 * Se usa para la vista previa del formulario y para guardar: así lo que se ve es lo que se guarda.
 *
 * d = {
 *   moneda: 'USD'|'MXN', reparto: 'valor'|'piezas',
 *   subtotal (solo para reparto por piezas: lo que se pagó por todo el lote, sin impuesto),
 *   impuesto, gastosUsd, gastosMxn, tcPagado,
 *   renglones: [{ varianteId, cantidad, costo }]   ← costo por pieza en la moneda de la compra
 * }
 */
function calcularCompra(d, tcMercado, tcCompraSugerido) {
  const moneda = U.opcion(d.moneda, 'La moneda', ['USD', 'MXN'], 'USD');
  const reparto = U.opcion(d.reparto, 'La forma de repartir el costo', ['valor', 'piezas'], 'valor');
  if (!Array.isArray(d.renglones) || !d.renglones.length) U.falla('Agregue al menos un artículo a la compra.');
  if (d.renglones.length > 300) U.falla('Máximo 300 renglones por compra.');
  const renglones = d.renglones.map(r => ({
    varianteId: U.entero(r.varianteId, 'El artículo', { min: 1 }),
    cantidad: U.entero(r.cantidad, 'La cantidad', { min: 1, max: 100000 }),
    costo: reparto === 'valor' ? U.numero(r.costo, 'El costo por pieza', { min: 0.01, max: 1e6 }) : 0
  }));
  const piezas = renglones.reduce((s, r) => s + r.cantidad, 0);
  const subtotal = U.r2(reparto === 'valor' ? renglones.reduce((s, r) => s + r.cantidad * r.costo, 0) : U.numero(d.subtotal, 'El total pagado por el lote', { min: 0.01, max: 1e8 }));
  const impuesto = U.r2(U.numero(d.impuesto || 0, 'El impuesto', { min: 0, max: 1e8 }));
  const gastosUsd = U.r2(U.numero(d.gastosUsd || 0, 'Los gastos en dólares', { min: 0, max: 1e8 }));
  const gastosMxn = U.r2(U.numero(d.gastosMxn || 0, 'Los gastos en pesos', { min: 0, max: 1e9 }));
  const tcPagado = U.r4(d.tcPagado ? U.numero(d.tcPagado, 'El dólar que pagó', { min: 5, max: 60 }) : (moneda === 'USD' ? tcCompraSugerido : tcMercado));

  /* Totales «puestos en la tienda» (con impuesto y gastos), en las dos monedas */
  let totalUsd, totalMxn;
  if (moneda === 'USD') { totalUsd = subtotal + impuesto + gastosUsd + gastosMxn / tcPagado; totalMxn = (subtotal + impuesto + gastosUsd) * tcPagado + gastosMxn; }
  else { totalMxn = subtotal + impuesto + gastosMxn + gastosUsd * tcPagado; totalUsd = totalMxn / tcPagado; }

  /* Reparto: por valor (lo caro absorbe más gastos) o parejo por pieza (lote surtido) */
  const detalle = renglones.map(r => {
    const base = reparto === 'valor' ? r.cantidad * r.costo : r.cantidad;
    const f = base / (reparto === 'valor' ? subtotal : piezas);
    return { ...r, costoUsd: U.r6(totalUsd * f / r.cantidad), costoMxn: U.r6(totalMxn * f / r.cantidad) };
  });
  return {
    moneda, reparto, piezas, subtotal, impuesto, gastosUsd, gastosMxn, tcMercado: U.r4(tcMercado), tcPagado,
    totalUsd: U.r2(totalUsd), totalMxn: U.r2(totalMxn),
    /* Cuánto de más se pagó por comprar los dólares arriba del mercado (solo informativo) */
    sobrecostoCambio: moneda === 'USD' ? U.r2((subtotal + impuesto + gastosUsd) * (tcPagado - tcMercado)) : 0,
    renglones: detalle
  };
}

/** Guarda una compra: crea los lotes de existencias. `momento` = { valor, fuente } del dólar de esa fecha y hora. */
function registrarCompra(B, d, momento, compraSugerido, usuario) {
  const fecha = d.fecha ? (T.esFecha(d.fecha) ? d.fecha : U.falla('La fecha no es válida.')) : T.hoy();
  if (fecha > T.hoy()) U.falla('La fecha de la compra no puede ser en el futuro.');
  const hora = d.hora ? (T.esHora(d.hora) ? d.hora : U.falla('La hora no es válida.')) : T.partes().hora;
  const calc = calcularCompra(d, momento.valor, compraSugerido);
  const notas = U.texto(d.notas, 'Las notas', { max: 300 });
  const proveedorNombre = U.texto(d.proveedor, 'El proveedor', { max: 60 });
  const lugar = U.texto(d.lugar, 'El lugar', { max: 60 });
  const t = T.localAUTC(fecha, hora).toISOString();

  return B.tx(() => {
    for (const r of calc.renglones) C.nombreVariante(B, r.varianteId);   // valida que existan
    let proveedorId = null;
    if (proveedorNombre) {
      const p = B.uno('SELECT id FROM proveedores WHERE nombre = ? COLLATE NOCASE', proveedorNombre);
      proveedorId = p ? p.id : B.insertar('INSERT INTO proveedores (nombre, lugar) VALUES (?, ?)', proveedorNombre, lugar || null);
      if (p && lugar) B.run('UPDATE proveedores SET lugar = ? WHERE id = ?', lugar, p.id);
    }
    const folio = siguienteFolio(B, 'compras');
    const id = B.insertar(`INSERT INTO compras (folio, t, fecha, hora, proveedor_id, moneda, subtotal, impuesto, gastos_usd, gastos_mxn, tc_mercado, tc_fuente, tc_pagado,
                           total_usd, total_mxn, piezas, reparto, notas, usuario_id, creado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      folio, t, fecha, hora, proveedorId, calc.moneda, calc.subtotal, calc.impuesto, calc.gastosUsd, calc.gastosMxn, calc.tcMercado, momento.fuente || null, calc.tcPagado,
      calc.totalUsd, calc.totalMxn, calc.piezas, calc.reparto, notas, usuario.id, T.ahoraISO());
    for (const r of calc.renglones) I.crearLote(B, { compraId: id, varianteId: r.varianteId, fecha, t, cantidad: r.cantidad, costoUsd: r.costoUsd, costoMxn: r.costoMxn, tc: calc.tcPagado });
    B.anotar(usuario.id, 'compra', { id, folio, piezas: calc.piezas, totalUsd: calc.totalUsd });
    return { id, folio, ...calc };
  });
}

/** Anula una compra solo si NINGUNA de sus piezas se ha movido todavía (si no, quedaría la historia rota). */
function anularCompra(B, id, usuario) {
  return B.tx(() => {
    const c = B.uno('SELECT * FROM compras WHERE id = ?', id); if (!c) U.falla('No se encontró la compra.', 404);
    if (c.anulada) U.falla('La compra ya estaba anulada.');
    const movidas = B.valor('SELECT COALESCE(SUM(cantidad - disponible), 0) FROM lotes WHERE compra_id = ?', id);
    if (movidas > 0) U.falla(`No se puede anular: ya se vendieron o movieron ${movidas} pieza(s) de esta compra. Corrija con un conteo de inventario.`);
    B.run('UPDATE lotes SET disponible = 0, cantidad = 0 WHERE compra_id = ?', id);
    B.run('UPDATE compras SET anulada = 1 WHERE id = ?', id);
    B.anotar(usuario.id, 'compra anulada', { id, folio: c.folio });
  });
}

function listarCompras(B, { desde, hasta, limite = 100 } = {}) {
  return B.todos(`SELECT c.*, p.nombre proveedor, p.lugar, u.nombre usuario FROM compras c LEFT JOIN proveedores p ON p.id = c.proveedor_id LEFT JOIN usuarios u ON u.id = c.usuario_id
                  WHERE c.fecha BETWEEN ? AND ? ORDER BY c.fecha DESC, c.id DESC LIMIT ?`, desde || '0000-01-01', hasta || '9999-12-31', limite);
}
function detalleCompra(B, id) {
  const c = B.uno('SELECT c.*, p.nombre proveedor, p.lugar, u.nombre usuario FROM compras c LEFT JOIN proveedores p ON p.id = c.proveedor_id LEFT JOIN usuarios u ON u.id = c.usuario_id WHERE c.id = ?', id);
  if (!c) U.falla('No se encontró la compra.', 404);
  c.lotes = B.todos(`SELECT l.*, v.nombre variante, pr.nombre producto, pr.emoji, pr.id producto_id FROM lotes l JOIN variantes v ON v.id = l.variante_id JOIN productos pr ON pr.id = v.producto_id
                     WHERE l.compra_id = ? ORDER BY l.id`, id);
  return c;
}

/* ═════════════════════════════ VENTAS ═════════════════════════════ */

/**
 * Registra una venta. d = {
 *   clave: identificador único que genera el celular (si la red falla y se reintenta, no se cobra dos veces),
 *   renglones: [{ varianteId, cantidad, precio? }], descuento (pesos), metodo, recibido, notas }
 * tc = estado del dólar (tipoCambio.mercadoAhora())
 */
function registrarVenta(B, d, tc, usuario) {
  const clave = d.clave ? U.texto(d.clave, 'La clave', { max: 64 }) : null;
  if (clave) { const ya = B.uno('SELECT id FROM ventas WHERE clave = ?', clave); if (ya) return detalleVenta(B, ya.id); }
  if (!Array.isArray(d.renglones) || !d.renglones.length) U.falla('El carrito está vacío.');
  if (d.renglones.length > 100) U.falla('Máximo 100 artículos distintos por venta.');
  const metodo = U.opcion(d.metodo, 'La forma de pago', METODOS, 'efectivo');
  const notas = U.texto(d.notas, 'Las notas', { max: 200 });

  return B.tx(() => {
    /* Precio de cada renglón: el que mande el celular (si se ajustó) o el del catálogo */
    const lineas = d.renglones.map(r => {
      const varianteId = U.entero(r.varianteId, 'El artículo', { min: 1 });
      const v = B.uno('SELECT v.id, COALESCE(v.precio, p.precio) precio FROM variantes v JOIN productos p ON p.id = v.producto_id WHERE v.id = ?', varianteId);
      if (!v) U.falla('Uno de los artículos ya no existe.', 404);
      const cantidad = U.entero(r.cantidad, 'La cantidad', { min: 1, max: 999 });
      const precio = U.r2(r.precio === undefined || r.precio === null || r.precio === '' ? v.precio : U.numero(r.precio, 'El precio', { min: 0, max: 999999 }));
      return { varianteId, cantidad, precio, importe: U.r2(precio * cantidad) };
    });
    const subtotal = U.r2(lineas.reduce((s, l) => s + l.importe, 0));
    const descuento = U.r2(U.numero(d.descuento || 0, 'El descuento', { min: 0, max: subtotal }));
    const total = U.r2(subtotal - descuento);
    const piezas = lineas.reduce((s, l) => s + l.cantidad, 0);

    /* Cobro: en pesos, o en dólares al precio «recibir» de la tienda; el cambio siempre se da en pesos */
    const monedaPago = metodo === 'dolares' ? 'USD' : 'MXN';
    const tcCobro = monedaPago === 'USD' ? tc.recibir : null;
    let recibido = d.recibido === undefined || d.recibido === null || d.recibido === '' ? null : U.r2(U.numero(d.recibido, 'Lo recibido', { min: 0, max: 1e7 }));
    let cambio = null;
    if (metodo === 'efectivo' || metodo === 'dolares') {
      const recibidoMxn = recibido == null ? total : (monedaPago === 'USD' ? recibido * tcCobro : recibido);
      if (recibidoMxn + 0.004 < total) U.falla(monedaPago === 'USD'
        ? `Faltan dólares: el total es US$${(total / tcCobro).toFixed(2)} (a $${tcCobro} por dólar).`
        : `Lo recibido es menor que el total ($${total.toFixed(2)}).`);
      cambio = U.r2(recibidoMxn - total);
      if (recibido == null) recibido = monedaPago === 'USD' ? U.r2(total / tcCobro) : total;
    }

    const folio = siguienteFolio(B, 'ventas'), ahora = new Date(), p = T.partes(ahora);
    const id = B.insertar(`INSERT INTO ventas (folio, clave, t, fecha, hora, usuario_id, piezas, subtotal, descuento, total, metodo, moneda_pago, recibido, cambio, tc_mercado, tc_cobro, total_usd, notas)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      folio, clave, ahora.toISOString(), p.fecha, p.hora, usuario.id, piezas, subtotal, descuento, total, metodo, monedaPago, recibido, cambio, tc.valor, tcCobro, U.r2(total / tc.valor), notas);

    /* Cada renglón descuenta sus piezas de los lotes (FIFO) y guarda su costo. El descuento se reparte proporcional. */
    let costoMxn = 0, costoUsd = 0;
    for (const l of lineas) {
      const neto = subtotal > 0 ? U.r2(l.importe * total / subtotal) : 0;
      const rid = B.insertar('INSERT INTO renglones (venta_id, variante_id, cantidad, precio, importe, neto) VALUES (?, ?, ?, ?, ?, ?)', id, l.varianteId, l.cantidad, l.precio, l.importe, neto);
      const c = I.consumir(B, 'venta', rid, l.varianteId, l.cantidad, C.nombreVariante(B, l.varianteId));
      B.run('UPDATE renglones SET costo_mxn = ?, costo_usd = ? WHERE id = ?', c.costoMxn, c.costoUsd, rid);
      costoMxn += c.costoMxn; costoUsd += c.costoUsd;
    }
    B.run('UPDATE ventas SET costo_mxn = ?, costo_usd = ? WHERE id = ?', U.r2(costoMxn), U.r2(costoUsd), id);
    B.anotar(usuario.id, 'venta', { id, folio, total });
    return detalleVenta(B, id);
  });
}

function detalleVenta(B, id) {
  const v = B.uno('SELECT v.*, u.nombre usuario FROM ventas v LEFT JOIN usuarios u ON u.id = v.usuario_id WHERE v.id = ?', id);
  if (!v) U.falla('No se encontró la venta.', 404);
  v.renglones = B.todos(`SELECT r.*, va.nombre variante, p.nombre producto, p.emoji, p.id producto_id FROM renglones r JOIN variantes va ON va.id = r.variante_id
                         JOIN productos p ON p.id = va.producto_id WHERE r.venta_id = ? ORDER BY r.id`, id);
  v.devoluciones = B.todos('SELECT * FROM devoluciones WHERE venta_id = ? ORDER BY id', id);
  v.ganancia = U.r2(v.total - v.costo_mxn);
  return v;
}

/** Cancela una venta completa (por error al cobrar): las piezas vuelven a sus lotes. */
function anularVenta(B, id, usuario) {
  return B.tx(() => {
    const v = B.uno('SELECT * FROM ventas WHERE id = ?', id); if (!v) U.falla('No se encontró la venta.', 404);
    if (v.anulada) U.falla('La venta ya estaba cancelada.');
    if (usuario.rol !== 'dueno') {
      if (v.usuario_id !== usuario.id) U.falla('Solo puede cancelar sus propias ventas.', 403);
      if (Date.now() - Date.parse(v.t) > 15 * 60000) U.falla('Pasaron más de 15 minutos: pida al dueño que la cancele o registre una devolución.', 403);
    }
    if (B.valor('SELECT COUNT(*) FROM devoluciones WHERE venta_id = ?', id) > 0) U.falla('La venta ya tiene devoluciones; registre devoluciones por lo que falte.');
    for (const r of B.todos('SELECT id, cantidad FROM renglones WHERE venta_id = ?', id)) I.regresar(B, 'venta', r.id, r.cantidad, true);
    B.run('UPDATE ventas SET anulada = 1 WHERE id = ?', id);
    B.anotar(usuario.id, 'venta cancelada', { id, folio: v.folio, total: v.total });
    return detalleVenta(B, id);
  });
}

function listarVentas(B, { desde, hasta, usuarioId, limite = 200 } = {}) {
  return B.todos(`SELECT v.id, v.folio, v.t, v.fecha, v.hora, v.piezas, v.total, v.descuento, v.metodo, v.moneda_pago, v.recibido, v.tc_mercado, v.total_usd, v.costo_mxn, v.anulada,
                  u.nombre usuario, (SELECT COALESCE(SUM(reembolso),0) FROM devoluciones d WHERE d.venta_id = v.id) reembolsado,
                  (SELECT GROUP_CONCAT(p.emoji || ' ' || p.nombre || CASE WHEN va.nombre = 'Única' THEN '' ELSE ' ' || va.nombre END, ', ')
                     FROM renglones r JOIN variantes va ON va.id = r.variante_id JOIN productos p ON p.id = va.producto_id WHERE r.venta_id = v.id) resumen
                  FROM ventas v LEFT JOIN usuarios u ON u.id = v.usuario_id
                  WHERE v.fecha BETWEEN ? AND ? AND (? IS NULL OR v.usuario_id = ?) ORDER BY v.t DESC LIMIT ?`,
    desde || '0000-01-01', hasta || '9999-12-31', usuarioId || null, usuarioId || null, limite);
}

/* ═════════════════════════════ DEVOLUCIONES ═════════════════════════════ */

/**
 * d = { ventaId, renglonId, cantidad, destino: 'inventario' (se puede volver a vender) | 'merma' (venía dañada), motivo, reembolso? }
 */
function registrarDevolucion(B, d, usuario) {
  const destino = U.opcion(d.destino, 'A dónde va la pieza', ['inventario', 'merma'], 'inventario');
  const motivo = U.texto(d.motivo, 'El motivo', { max: 120 });
  return B.tx(() => {
    const r = B.uno('SELECT r.*, v.anulada, v.id vid FROM renglones r JOIN ventas v ON v.id = r.venta_id WHERE r.id = ?', U.entero(d.renglonId, 'El artículo', { min: 1 }));
    if (!r) U.falla('No se encontró ese artículo en la venta.', 404);
    if (d.ventaId && +d.ventaId !== r.vid) U.falla('El artículo no corresponde a esa venta.');
    if (r.anulada) U.falla('La venta está cancelada.');
    const max = r.cantidad - r.devueltas;
    const cantidad = U.entero(d.cantidad || 1, 'La cantidad', { min: 1, max: Math.max(1, max) });
    if (max <= 0) U.falla('Ese artículo ya se devolvió completo.');
    const sugerido = U.r2(r.neto / r.cantidad * cantidad);
    const reembolso = d.reembolso === undefined || d.reembolso === null || d.reembolso === '' ? sugerido : U.r2(U.numero(d.reembolso, 'El reembolso', { min: 0, max: sugerido }));
    const c = I.regresar(B, 'venta', r.id, cantidad, destino === 'inventario');
    const p = T.partes(), t = T.ahoraISO();
    const id = B.insertar(`INSERT INTO devoluciones (venta_id, renglon_id, t, fecha, cantidad, reembolso, destino, motivo, costo_mxn, costo_usd, usuario_id)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, r.vid, r.id, t, p.fecha, cantidad, reembolso, destino, motivo, c.costoMxn, c.costoUsd, usuario.id);
    B.run('UPDATE renglones SET devueltas = devueltas + ? WHERE id = ?', cantidad, r.id);
    /* Si la pieza venía dañada, su costo pasa a merma (se pierde), pero la venta sí se revierte */
    if (destino === 'merma') B.run(`INSERT INTO mermas (t, fecha, variante_id, cantidad, motivo, notas, costo_mxn, costo_usd, origen, usuario_id) VALUES (?, ?, ?, ?, 'danado', ?, ?, ?, 'devolucion', ?)`,
      t, p.fecha, r.variante_id, cantidad, motivo || 'Devolución en mal estado', c.costoMxn, c.costoUsd, usuario.id);
    B.anotar(usuario.id, 'devolución', { id, venta: r.vid, cantidad, reembolso, destino });
    return { id, reembolso, cantidad, destino };
  });
}

/* ═════════════════════════════ MERMA ═════════════════════════════ */

function registrarMerma(B, d, usuario, origen = 'manual') {
  const varianteId = U.entero(d.varianteId, 'El artículo', { min: 1 });
  const cantidad = U.entero(d.cantidad || 1, 'La cantidad', { min: 1, max: 100000 });
  const motivo = U.opcion(d.motivo, 'El motivo', MOTIVOS_MERMA, 'danado');
  const notas = U.texto(d.notas, 'Las notas', { max: 200 });
  return B.tx(() => {
    const p = T.partes(), t = T.ahoraISO();
    const id = B.insertar('INSERT INTO mermas (t, fecha, variante_id, cantidad, motivo, notas, origen, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', t, p.fecha, varianteId, cantidad, motivo, notas, origen, usuario.id);
    const c = I.consumir(B, 'merma', id, varianteId, cantidad, C.nombreVariante(B, varianteId));
    B.run('UPDATE mermas SET costo_mxn = ?, costo_usd = ? WHERE id = ?', c.costoMxn, c.costoUsd, id);
    B.anotar(usuario.id, 'merma', { id, varianteId, cantidad, motivo });
    return { id, cantidad, motivo, costoMxn: c.costoMxn, costoUsd: c.costoUsd };
  });
}
function listarMermas(B, { desde, hasta } = {}) {
  return B.todos(`SELECT m.*, va.nombre variante, p.nombre producto, p.emoji, u.nombre usuario FROM mermas m JOIN variantes va ON va.id = m.variante_id JOIN productos p ON p.id = va.producto_id
                  LEFT JOIN usuarios u ON u.id = m.usuario_id WHERE m.fecha BETWEEN ? AND ? ORDER BY m.t DESC LIMIT 300`, desde || '0000-01-01', hasta || '9999-12-31');
}

/* ═════════════════════════════ CONTEO FÍSICO ═════════════════════════════ */

/**
 * Compara lo contado en el estante con lo que dice el sistema y corrige:
 *   faltan piezas → merma «faltante» · sobran piezas → lote nuevo al costo promedio de esa talla.
 * d = { renglones: [{ varianteId, contado }], notas }   (solo se tocan las variantes incluidas)
 * tcHoy = dólar de hoy (para el costo de las piezas que sobren si nunca hubo lote)
 */
function registrarConteo(B, d, tcHoy, usuario) {
  if (!Array.isArray(d.renglones) || !d.renglones.length) U.falla('No hay nada contado.');
  const notas = U.texto(d.notas, 'Las notas', { max: 200 });
  return B.tx(() => {
    const p = T.partes(), t = T.ahoraISO();
    const id = B.insertar('INSERT INTO conteos (t, fecha, usuario_id, notas, piezas_sistema, piezas_contadas, faltantes, sobrantes) VALUES (?, ?, ?, ?, 0, 0, 0, 0)', t, p.fecha, usuario.id, notas);
    let sis = 0, con = 0, falt = 0, sobr = 0; const sinCosto = [];
    for (const r of d.renglones) {
      const varianteId = U.entero(r.varianteId, 'El artículo', { min: 1 }), contado = U.entero(r.contado, 'Lo contado', { min: 0, max: 100000 });
      const nombre = C.nombreVariante(B, varianteId), sistema = I.existencia(B, varianteId), dif = contado - sistema;
      B.run('INSERT INTO conteo_renglones (conteo_id, variante_id, sistema, contado) VALUES (?, ?, ?, ?)', id, varianteId, sistema, contado);
      sis += sistema; con += contado;
      if (dif < 0) {
        falt += -dif;
        const mid = B.insertar(`INSERT INTO mermas (t, fecha, variante_id, cantidad, motivo, notas, origen, usuario_id) VALUES (?, ?, ?, ?, 'faltante', ?, 'conteo', ?)`, t, p.fecha, varianteId, -dif, `Conteo #${id}`, usuario.id);
        const c = I.consumir(B, 'merma', mid, varianteId, -dif, nombre);
        B.run('UPDATE mermas SET costo_mxn = ?, costo_usd = ? WHERE id = ?', c.costoMxn, c.costoUsd, mid);
      } else if (dif > 0) {
        sobr += dif;
        const cp = I.costoPromedio(B, varianteId);
        if (!cp.usd && !cp.mxn) sinCosto.push(nombre);
        I.crearLote(B, { varianteId, origen: 'conteo', fecha: p.fecha, t, cantidad: dif, costoUsd: cp.usd, costoMxn: cp.mxn, tc: cp.tc || tcHoy || 0 });
      }
    }
    B.run('UPDATE conteos SET piezas_sistema = ?, piezas_contadas = ?, faltantes = ?, sobrantes = ? WHERE id = ?', sis, con, falt, sobr, id);
    B.anotar(usuario.id, 'conteo', { id, faltantes: falt, sobrantes: sobr });
    return { id, piezasSistema: sis, piezasContadas: con, faltantes: falt, sobrantes: sobr, sinCosto };
  });
}

/* ═════════════════════════════ GASTOS ═════════════════════════════ */

function registrarGasto(B, d, momento, usuario) {
  const fecha = d.fecha ? (T.esFecha(d.fecha) ? d.fecha : U.falla('La fecha no es válida.')) : T.hoy();
  const concepto = U.texto(d.concepto, 'El concepto', { min: 1, max: 80 });
  const categoria = U.texto(d.categoria, 'La categoría', { max: 30 }) || 'Otro';
  const moneda = U.opcion(d.moneda, 'La moneda', ['MXN', 'USD'], 'MXN');
  const monto = U.r2(U.numero(d.monto, 'El monto', { min: 0.01, max: 1e8 }));
  const tc = U.r4(momento.valor);
  const mxn = moneda === 'MXN' ? monto : U.r2(monto * tc), usd = moneda === 'USD' ? monto : U.r2(monto / tc);
  const id = B.insertar('INSERT INTO gastos (t, fecha, concepto, categoria, monto, moneda, tc, monto_mxn, monto_usd, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    T.ahoraISO(), fecha, concepto, categoria, monto, moneda, tc, mxn, usd, usuario.id);
  B.anotar(usuario.id, 'gasto', { id, concepto, mxn });
  return { id, montoMxn: mxn, montoUsd: usd };
}
const listarGastos = (B, { desde, hasta } = {}) => B.todos('SELECT g.*, u.nombre usuario FROM gastos g LEFT JOIN usuarios u ON u.id = g.usuario_id WHERE g.fecha BETWEEN ? AND ? ORDER BY g.fecha DESC, g.id DESC',
  desde || '0000-01-01', hasta || '9999-12-31');
function quitarGasto(B, id, usuario) { const r = B.run('DELETE FROM gastos WHERE id = ?', id); if (!r.changes) U.falla('No se encontró el gasto.', 404); B.anotar(usuario.id, 'gasto eliminado', { id }); }

module.exports = {
  METODOS, MOTIVOS_MERMA,
  calcularCompra, registrarCompra, anularCompra, listarCompras, detalleCompra,
  registrarVenta, detalleVenta, anularVenta, listarVentas,
  registrarDevolucion, registrarMerma, listarMermas, registrarConteo,
  registrarGasto, listarGastos, quitarGasto
};
