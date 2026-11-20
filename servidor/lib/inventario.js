'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   EXISTENCIAS POR LOTES (FIFO: primero en entrar, primero en salir).

   ¿Por qué lotes? Porque la misma playera se compra varias veces con dólares a precios
   distintos. Si en octubre la compró a $5 USD con el dólar en $18.10 y en noviembre a $5 USD
   con el dólar en $19.40, en pesos no le costó lo mismo. Al vender, el sistema descuenta del
   lote más viejo y así sabe la ganancia REAL de cada pieza, en pesos y en dólares.

   Todas las funciones de aquí se llaman DENTRO de una transacción (B.tx) de quien las usa.
   ───────────────────────────────────────────────────────────────────────────── */
const U = require('./util.js');
const T = require('./tiempo.js');

/** Piezas disponibles de una variante */
const existencia = (B, varianteId) => B.valor('SELECT COALESCE(SUM(disponible), 0) FROM lotes WHERE variante_id = ?', varianteId) || 0;

/** Crea un lote (entrada de piezas). costoUsd y costoMxn son POR PIEZA. */
function crearLote(B, { compraId = null, varianteId, origen = 'compra', fecha = T.hoy(), t = T.ahoraISO(), cantidad, costoUsd, costoMxn, tc }) {
  return B.insertar(`INSERT INTO lotes (compra_id, variante_id, origen, fecha, t, cantidad, disponible, costo_usd, costo_mxn, tc)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, compraId, varianteId, origen, fecha, t, cantidad, cantidad, U.r6(costoUsd), U.r6(costoMxn), U.r4(tc));
}

/**
 * Saca `cantidad` piezas de una variante, de los lotes más viejos primero, y anota de qué lote salió cada una.
 * @returns {{costoUsd:number, costoMxn:number}} costo total de lo que salió
 * Lanza ErrorUsuario si no alcanzan las piezas.
 */
function consumir(B, tipo, refId, varianteId, cantidad, nombreParaError = 'este artículo') {
  const hay = existencia(B, varianteId);
  if (hay < cantidad) U.falla(hay <= 0
    ? `No hay piezas registradas de ${nombreParaError}. Regístrelas en Compras o con un Conteo de inventario.`
    : `Solo hay ${hay} pieza${hay === 1 ? '' : 's'} de ${nombreParaError} en el sistema (se pidieron ${cantidad}).`, 409);
  let falta = cantidad, usd = 0, mxn = 0;
  const lotes = B.todos('SELECT id, disponible, costo_usd, costo_mxn FROM lotes WHERE variante_id = ? AND disponible > 0 ORDER BY fecha, t, id', varianteId);
  for (const l of lotes) {
    if (falta <= 0) break;
    const toma = Math.min(falta, l.disponible);
    B.run('UPDATE lotes SET disponible = disponible - ? WHERE id = ?', toma, l.id);
    B.run('INSERT INTO consumos (tipo, ref_id, lote_id, cantidad, costo_usd, costo_mxn) VALUES (?, ?, ?, ?, ?, ?)', tipo, refId, l.id, toma, U.r6(l.costo_usd), U.r6(l.costo_mxn));
    usd += toma * l.costo_usd; mxn += toma * l.costo_mxn; falta -= toma;
  }
  return { costoUsd: U.r2(usd), costoMxn: U.r2(mxn) };
}

/**
 * Regresa piezas a los MISMOS lotes de donde salieron (devolución de un cliente).
 * Empieza por el último consumo, así lo más reciente vuelve primero.
 * @param {boolean} reponer  true = las piezas vuelven a estar disponibles; false = solo se calcula su costo (van a merma)
 * @returns {{costoUsd:number, costoMxn:number, lotes:Array}} costo de lo regresado
 */
function regresar(B, tipo, refId, cantidad, reponer = true) {
  let falta = cantidad, usd = 0, mxn = 0; const tocados = [];
  const cons = B.todos('SELECT id, lote_id, cantidad, devuelto, costo_usd, costo_mxn FROM consumos WHERE tipo = ? AND ref_id = ? AND cantidad > devuelto ORDER BY id DESC', tipo, refId);
  for (const c of cons) {
    if (falta <= 0) break;
    const toma = Math.min(falta, c.cantidad - c.devuelto);
    B.run('UPDATE consumos SET devuelto = devuelto + ? WHERE id = ?', toma, c.id);
    if (reponer) B.run('UPDATE lotes SET disponible = disponible + ? WHERE id = ?', toma, c.lote_id);
    tocados.push({ loteId: c.lote_id, cantidad: toma, costoUsd: c.costo_usd, costoMxn: c.costo_mxn });
    usd += toma * c.costo_usd; mxn += toma * c.costo_mxn; falta -= toma;
  }
  if (falta > 0) U.falla('No se encontró de qué lote salieron esas piezas.', 409);
  return { costoUsd: U.r2(usd), costoMxn: U.r2(mxn), lotes: tocados };
}

/**
 * Costo promedio por pieza de lo que hay en existencia (ponderado por piezas).
 * Si no hay nada, el del último lote que existió. Si nunca hubo, ceros.
 */
function costoPromedio(B, varianteId) {
  const r = B.uno('SELECT SUM(disponible) n, SUM(disponible * costo_usd) usd, SUM(disponible * costo_mxn) mxn FROM lotes WHERE variante_id = ? AND disponible > 0', varianteId);
  if (r && r.n > 0) return { usd: r.usd / r.n, mxn: r.mxn / r.n, tc: r.mxn / r.usd || 0 };
  const u = B.uno('SELECT costo_usd usd, costo_mxn mxn, tc FROM lotes WHERE variante_id = ? ORDER BY t DESC, id DESC LIMIT 1', varianteId);
  return u ? { usd: u.usd, mxn: u.mxn, tc: u.tc } : { usd: 0, mxn: 0, tc: 0 };
}

module.exports = { existencia, crearLote, consumir, regresar, costoPromedio };
