'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   CATÁLOGO: categorías, productos y sus variantes (tallas).
   Un producto sin tallas tiene una sola variante llamada «Única».
   Nada se borra si ya tuvo movimientos: se desactiva (deja de verse para vender,
   pero su historia y sus números se conservan).
   ───────────────────────────────────────────────────────────────────────────── */
const U = require('./util.js');
const T = require('./tiempo.js');
const I = require('./inventario.js');

const CATEGORIAS_INICIALES = [
  ['Playeras', '👕', '#38bdf8'], ['Pantalones', '👖', '#6366f1'], ['Vestidos', '👗', '#f472b6'],
  ['Sudaderas y chamarras', '🧥', '#0ea5e9'], ['Shorts', '🩳', '#22d3ee'], ['Calzado', '👟', '#f59e0b'],
  ['Niños', '🧸', '#a78bfa'], ['Accesorios', '👜', '#14b8a6'], ['Gorras', '🧢', '#fb7185']
];
function sembrarCategorias(B) {
  if (B.valor('SELECT COUNT(*) FROM categorias') > 0) return;
  CATEGORIAS_INICIALES.forEach(([n, e, c], i) => B.run('INSERT INTO categorias (nombre, emoji, color, orden) VALUES (?, ?, ?, ?)', n, e, c, i));
}

/* ---------------- categorías ---------------- */
const listarCategorias = B => B.todos(`SELECT c.*, (SELECT COUNT(*) FROM productos p WHERE p.categoria_id = c.id AND p.activo = 1) productos
                                        FROM categorias c WHERE c.activo = 1 ORDER BY c.orden, c.nombre`);
function guardarCategoria(B, d) {
  const nombre = U.texto(d.nombre, 'El nombre de la categoría', { min: 1, max: 40 });
  const emoji = U.emoji(d.emoji) || '🏷️', color = U.color(d.color) || '#38bdf8';
  const choca = B.uno('SELECT id FROM categorias WHERE nombre = ? COLLATE NOCASE AND id != ?', nombre, d.id || 0);
  if (choca) U.falla('Ya existe una categoría con ese nombre.');
  if (d.id) { B.run('UPDATE categorias SET nombre = ?, emoji = ?, color = ?, activo = 1 WHERE id = ?', nombre, emoji, color, d.id); return d.id; }
  const orden = (B.valor('SELECT MAX(orden) FROM categorias') || 0) + 1;
  return B.insertar('INSERT INTO categorias (nombre, emoji, color, orden) VALUES (?, ?, ?, ?)', nombre, emoji, color, orden);
}
function quitarCategoria(B, id) {
  if (B.valor('SELECT COUNT(*) FROM productos WHERE categoria_id = ? AND activo = 1', id) > 0) U.falla('La categoría todavía tiene productos. Muévalos a otra categoría primero.');
  B.run('UPDATE categorias SET activo = 0 WHERE id = ?', id);
}

/* ---------------- productos ---------------- */

/**
 * Lista de productos con sus variantes, existencias, costo promedio (USD/MXN) y ritmo de venta.
 * @param {object} o
 * @param {boolean} o.inactivos  incluir productos desactivados
 * @param {number}  o.tcHoy      dólar de hoy, para calcular el «costo de reposición» (cuánto costaría volver a comprarlo hoy)
 */
function listarProductos(B, { inactivos = false, tcHoy = null } = {}) {
  const desde = T.sumarDias(T.hoy(), -30);
  /* Ventas de los últimos 30 días por variante (para ritmo y días de inventario) */
  const ritmo = new Map(B.todos(`SELECT r.variante_id id, SUM(r.cantidad - r.devueltas) n FROM renglones r JOIN ventas v ON v.id = r.venta_id
                                 WHERE v.anulada = 0 AND v.fecha >= ? GROUP BY r.variante_id`, desde).map(x => [x.id, x.n]));
  const stock = new Map(B.todos(`SELECT variante_id id, SUM(disponible) n, SUM(disponible * costo_usd) usd, SUM(disponible * costo_mxn) mxn
                                 FROM lotes WHERE disponible > 0 GROUP BY variante_id`).map(x => [x.id, x]));
  const ultimo = new Map(B.todos(`SELECT l.variante_id id, l.costo_usd usd, l.costo_mxn mxn, l.tc FROM lotes l
                                  JOIN (SELECT variante_id, MAX(id) mid FROM lotes GROUP BY variante_id) u ON u.mid = l.id`).map(x => [x.id, x]));
  const prods = B.todos(`SELECT p.*, c.nombre categoria, c.emoji cat_emoji, c.color cat_color FROM productos p LEFT JOIN categorias c ON c.id = p.categoria_id
                         ${inactivos ? '' : 'WHERE p.activo = 1'} ORDER BY c.orden, p.nombre`);
  const vars = B.todos(`SELECT * FROM variantes ${inactivos ? '' : 'WHERE activo = 1'} ORDER BY producto_id, orden, id`);
  const porProducto = new Map();
  for (const v of vars) { if (!porProducto.has(v.producto_id)) porProducto.set(v.producto_id, []); porProducto.get(v.producto_id).push(v); }

  return prods.map(p => {
    let n = 0, usd = 0, mxn = 0, vendidas30 = 0;
    const variantes = (porProducto.get(p.id) || []).map(v => {
      const s = stock.get(v.id), u = ultimo.get(v.id);
      const ex = s ? s.n : 0, cu = s && s.n ? s.usd / s.n : (u ? u.usd : 0), cm = s && s.n ? s.mxn / s.n : (u ? u.mxn : 0);
      n += ex; usd += s ? s.usd : 0; mxn += s ? s.mxn : 0; vendidas30 += ritmo.get(v.id) || 0;
      return { id: v.id, nombre: v.nombre, precio: v.precio ?? p.precio, precioPropio: v.precio, activo: !!v.activo, existencia: ex,
        costoUsd: U.r2(cu), costoMxn: U.r2(cm), vendidas30: ritmo.get(v.id) || 0 };
    });
    const costoUsd = n ? usd / n : (variantes.find(v => v.costoUsd) || {}).costoUsd || 0;
    const costoMxn = n ? mxn / n : (variantes.find(v => v.costoMxn) || {}).costoMxn || 0;
    const porDia = vendidas30 / 30;
    const reposicion = tcHoy ? costoUsd * tcHoy : null;
    return {
      id: p.id, nombre: p.nombre, categoriaId: p.categoria_id, categoria: p.categoria, emoji: p.emoji || p.cat_emoji || '🏷️', color: p.color || p.cat_color || '#38bdf8',
      precio: p.precio, minimo: p.minimo, notas: p.notas, activo: !!p.activo, variantes,
      existencia: n, valorUsd: U.r2(usd), valorMxn: U.r2(mxn), valorVenta: U.r2(variantes.reduce((s, v) => s + v.existencia * v.precio, 0)),
      costoUsd: U.r2(costoUsd), costoMxn: U.r2(costoMxn), costoReposicion: reposicion == null ? null : U.r2(reposicion),
      margen: p.precio > 0 && costoMxn ? U.r2((p.precio - costoMxn) / p.precio * 100) : null,
      margenReposicion: p.precio > 0 && reposicion ? U.r2((p.precio - reposicion) / p.precio * 100) : null,
      vendidas30, porDia: U.r2(porDia), diasInventario: porDia > 0 ? Math.round(n / porDia) : null
    };
  });
}

/** Un producto con todo su detalle: lotes (cada compra con su dólar) y últimos movimientos */
function detalleProducto(B, id, tcHoy) {
  const p = listarProductos(B, { inactivos: true, tcHoy }).find(x => x.id === +id);
  if (!p) U.falla('No se encontró el producto.', 404);
  const ids = p.variantes.map(v => v.id); if (!ids.length) return { ...p, lotes: [], movimientos: [] };
  const marcas = ids.map(() => '?').join(',');
  p.lotes = B.todos(`SELECT l.*, v.nombre variante, c.folio compra_folio, pr.nombre proveedor FROM lotes l JOIN variantes v ON v.id = l.variante_id
                     LEFT JOIN compras c ON c.id = l.compra_id LEFT JOIN proveedores pr ON pr.id = c.proveedor_id
                     WHERE l.variante_id IN (${marcas}) ORDER BY l.fecha DESC, l.id DESC LIMIT 60`, ...ids);
  p.movimientos = B.todos(`
      SELECT 'venta' tipo, v.t, v.fecha, r.cantidad, r.neto importe, va.nombre variante, v.folio ref FROM renglones r JOIN ventas v ON v.id = r.venta_id JOIN variantes va ON va.id = r.variante_id WHERE r.variante_id IN (${marcas}) AND v.anulada = 0
      UNION ALL SELECT 'merma', m.t, m.fecha, m.cantidad, m.costo_mxn, va.nombre, m.motivo FROM mermas m JOIN variantes va ON va.id = m.variante_id WHERE m.variante_id IN (${marcas})
      UNION ALL SELECT 'devolucion', d.t, d.fecha, d.cantidad, d.reembolso, va.nombre, d.destino FROM devoluciones d JOIN renglones r ON r.id = d.renglon_id JOIN variantes va ON va.id = r.variante_id WHERE r.variante_id IN (${marcas})
      UNION ALL SELECT 'entrada', l.t, l.fecha, l.cantidad, l.cantidad * l.costo_mxn, va.nombre, l.origen FROM lotes l JOIN variantes va ON va.id = l.variante_id WHERE l.variante_id IN (${marcas})
      ORDER BY t DESC LIMIT 80`, ...ids, ...ids, ...ids, ...ids);
  return p;
}

/**
 * Crea o edita un producto con sus variantes.
 * d = { id?, nombre, categoriaId, emoji, color, precio, minimo, notas, activo, variantes: [{ id?, nombre, precio? }] }
 */
function guardarProducto(B, d) {
  const nombre = U.texto(d.nombre, 'El nombre del producto', { min: 1, max: 60 });
  const precio = U.r2(U.numero(d.precio, 'El precio de venta', { min: 0, max: 999999 }));
  const categoriaId = d.categoriaId ? U.entero(d.categoriaId, 'La categoría', { min: 1 }) : null;
  if (categoriaId && !B.uno('SELECT id FROM categorias WHERE id = ?', categoriaId)) U.falla('La categoría no existe.');
  const minimo = d.minimo === '' || d.minimo == null ? null : U.entero(d.minimo, 'El mínimo', { min: 0, max: 9999 });
  const notas = U.texto(d.notas, 'Las notas', { max: 300 });
  const emoji = U.emoji(d.emoji), color = U.color(d.color);
  let variantes = Array.isArray(d.variantes) ? d.variantes : [];
  if (!variantes.length) variantes = [{ nombre: 'Única' }];
  if (variantes.length > 40) U.falla('Máximo 40 tallas o variantes por producto.');
  const limpias = variantes.map((v, i) => ({
    id: v.id ? U.entero(v.id, 'La variante', { min: 1 }) : null,
    nombre: U.texto(v.nombre, 'El nombre de la talla', { min: 1, max: 20 }),
    precio: v.precio === '' || v.precio == null ? null : U.r2(U.numero(v.precio, 'El precio de la talla', { min: 0, max: 999999 })),
    orden: i
  }));
  const nombres = limpias.map(v => v.nombre.toLowerCase());
  if (new Set(nombres).size !== nombres.length) U.falla('Hay tallas repetidas.');
  const ahora = T.ahoraISO();

  return B.tx(() => {
    let id = d.id ? +d.id : null;
    if (id) {
      if (!B.uno('SELECT id FROM productos WHERE id = ?', id)) U.falla('No se encontró el producto.', 404);
      B.run('UPDATE productos SET nombre = ?, categoria_id = ?, emoji = ?, color = ?, precio = ?, minimo = ?, notas = ?, activo = ?, actualizado = ? WHERE id = ?',
        nombre, categoriaId, emoji, color, precio, minimo, notas, d.activo === false ? 0 : 1, ahora, id);
    } else {
      id = B.insertar('INSERT INTO productos (nombre, categoria_id, emoji, color, precio, minimo, notas, activo, creado) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)',
        nombre, categoriaId, emoji, color, precio, minimo, notas, ahora);
    }
    /* Variantes: se actualizan las que vienen con id, se crean las nuevas y las que ya no vienen se desactivan */
    const existentes = B.todos('SELECT id, nombre FROM variantes WHERE producto_id = ?', id);
    const conservar = new Set();
    for (const v of limpias) {
      let vid = v.id && existentes.find(e => e.id === v.id) ? v.id : null;
      if (!vid) { const mismo = existentes.find(e => e.nombre.toLowerCase() === v.nombre.toLowerCase()); if (mismo) vid = mismo.id; }
      if (vid) B.run('UPDATE variantes SET nombre = ?, precio = ?, orden = ?, activo = 1 WHERE id = ?', v.nombre, v.precio, v.orden, vid);
      else vid = B.insertar('INSERT INTO variantes (producto_id, nombre, precio, orden) VALUES (?, ?, ?, ?)', id, v.nombre, v.precio, v.orden);
      conservar.add(vid);
    }
    for (const e of existentes) if (!conservar.has(e.id)) {
      if (I.existencia(B, e.id) > 0) U.falla(`La talla «${e.nombre}» todavía tiene piezas. Véndalas, regístrelas como merma o páselas a otra talla antes de quitarla.`);
      B.run('UPDATE variantes SET activo = 0 WHERE id = ?', e.id);
    }
    return id;
  });
}

/** Desactiva (o reactiva) un producto */
function activarProducto(B, id, activo) {
  if (!activo && B.valor('SELECT COALESCE(SUM(l.disponible),0) FROM lotes l JOIN variantes v ON v.id = l.variante_id WHERE v.producto_id = ?', id) > 0)
    U.falla('El producto todavía tiene piezas en existencia. Regístrelas como merma o véndalas antes de archivarlo.');
  B.run('UPDATE productos SET activo = ?, actualizado = ? WHERE id = ?', activo ? 1 : 0, T.ahoraISO(), id);
}

/** Nombre legible de una variante: «Playera Nike · M» */
function nombreVariante(B, varianteId) {
  const r = B.uno('SELECT p.nombre p, v.nombre v, p.id pid FROM variantes v JOIN productos p ON p.id = v.producto_id WHERE v.id = ?', varianteId);
  if (!r) U.falla('Uno de los artículos ya no existe.', 404);
  return r.v === 'Única' ? r.p : `${r.p} · ${r.v}`;
}

module.exports = { sembrarCategorias, listarCategorias, guardarCategoria, quitarCategoria, listarProductos, detalleProducto, guardarProducto, activarProducto, nombreVariante };
