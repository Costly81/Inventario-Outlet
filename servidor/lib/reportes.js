'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   REPORTES: tablero de hoy contra ayer, estado de resultados de un periodo,
   valor del inventario en las dos monedas, efecto del dólar y proyección.

   Cómo se calcula la ganancia (en palabras):
     Venta neta   = lo cobrado − descuentos − reembolsos de devoluciones.
     Costo        = lo que costaron las piezas vendidas (de sus lotes, con impuestos y gastos de la compra).
     Ganancia     = venta neta − costo.                         (bruta)
     Utilidad     = ganancia − merma − gastos de operación.     (lo que de verdad le quedó)
   En DÓLARES: cada venta se convierte con el dólar del momento en que se vendió, y el costo
   está en los dólares que realmente se pagaron. Así se ve si el negocio crece en dólares,
   no solo en pesos (si el peso se devalúa, ganar más pesos no siempre es ganar más).
   ───────────────────────────────────────────────────────────────────────────── */
const U = require('./util.js');
const T = require('./tiempo.js');
const C = require('./catalogo.js');
const A = require('./ajustes.js');

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** Estado de resultados de un periodo [desde, hasta] (fechas locales, inclusivas) */
function resumen(B, desde, hasta) {
  const v = B.uno(`SELECT COUNT(*) num, COALESCE(SUM(piezas),0) piezas, COALESCE(SUM(total),0) total, COALESCE(SUM(descuento),0) descuentos,
                   COALESCE(SUM(total_usd),0) usd, COALESCE(SUM(costo_mxn),0) costo_mxn, COALESCE(SUM(costo_usd),0) costo_usd
                   FROM ventas WHERE anulada = 0 AND fecha BETWEEN ? AND ?`, desde, hasta);
  const d = B.uno(`SELECT COUNT(*) num, COALESCE(SUM(d.cantidad),0) piezas, COALESCE(SUM(d.reembolso),0) reembolso,
                   COALESCE(SUM(d.reembolso / v.tc_mercado),0) reembolso_usd, COALESCE(SUM(d.costo_mxn),0) costo_mxn, COALESCE(SUM(d.costo_usd),0) costo_usd
                   FROM devoluciones d JOIN ventas v ON v.id = d.venta_id WHERE d.fecha BETWEEN ? AND ?`, desde, hasta);
  const m = B.uno('SELECT COALESCE(SUM(cantidad),0) piezas, COALESCE(SUM(costo_mxn),0) mxn, COALESCE(SUM(costo_usd),0) usd FROM mermas WHERE fecha BETWEEN ? AND ?', desde, hasta);
  const g = B.uno('SELECT COALESCE(SUM(monto_mxn),0) mxn, COALESCE(SUM(monto_usd),0) usd FROM gastos WHERE fecha BETWEEN ? AND ?', desde, hasta);
  const c = B.uno('SELECT COUNT(*) num, COALESCE(SUM(piezas),0) piezas, COALESCE(SUM(total_usd),0) usd, COALESCE(SUM(total_mxn),0) mxn FROM compras WHERE anulada = 0 AND fecha BETWEEN ? AND ?', desde, hasta);

  const netoMxn = v.total - d.reembolso, netoUsd = v.usd - d.reembolso_usd;
  const costoMxn = v.costo_mxn - d.costo_mxn, costoUsd = v.costo_usd - d.costo_usd;
  const ganMxn = netoMxn - costoMxn, ganUsd = netoUsd - costoUsd;
  return {
    desde, hasta,
    ventas: { num: v.num, piezas: v.piezas - d.piezas, bruto: U.r2(v.total + v.descuentos), descuentos: U.r2(v.descuentos), reembolsos: U.r2(d.reembolso), devoluciones: d.num,
      netoMxn: U.r2(netoMxn), netoUsd: U.r2(netoUsd), ticket: v.num ? U.r2(v.total / v.num) : 0 },
    costo: { mxn: U.r2(costoMxn), usd: U.r2(costoUsd) },
    ganancia: { mxn: U.r2(ganMxn), usd: U.r2(ganUsd), margen: netoMxn > 0 ? U.r2(ganMxn / netoMxn * 100) : null },
    merma: { piezas: m.piezas, mxn: U.r2(m.mxn), usd: U.r2(m.usd) },
    gastos: { mxn: U.r2(g.mxn), usd: U.r2(g.usd) },
    utilidad: { mxn: U.r2(ganMxn - m.mxn - g.mxn), usd: U.r2(ganUsd - m.usd - g.usd) },
    compras: { num: c.num, piezas: c.piezas, usd: U.r2(c.usd), mxn: U.r2(c.mxn) },
    /* Dólar promedio al que se vendió (pesos cobrados ÷ su equivalente en dólares) */
    tcPromedioVenta: v.usd > 0 ? U.r4(v.total / v.usd) : null
  };
}

/** Serie por día (todos los días del rango, aunque no haya ventas) */
function serieDiaria(B, desde, hasta) {
  const ventas = new Map(B.todos(`SELECT fecha, SUM(total) total, SUM(total_usd) usd, SUM(costo_mxn) costo, SUM(costo_usd) costo_usd, SUM(piezas) piezas, COUNT(*) num
                                  FROM ventas WHERE anulada = 0 AND fecha BETWEEN ? AND ? GROUP BY fecha`, desde, hasta).map(r => [r.fecha, r]));
  const dev = new Map(B.todos(`SELECT d.fecha, SUM(d.reembolso) re, SUM(d.reembolso / v.tc_mercado) re_usd, SUM(d.costo_mxn) co, SUM(d.costo_usd) co_usd, SUM(d.cantidad) pz FROM devoluciones d JOIN ventas v ON v.id = d.venta_id
                               WHERE d.fecha BETWEEN ? AND ? GROUP BY d.fecha`, desde, hasta).map(r => [r.fecha, r]));
  const tc = new Map(B.todos('SELECT fecha, cierre FROM tc_dias WHERE fecha BETWEEN ? AND ?', desde, hasta).map(r => [r.fecha, r.cierre]));
  const out = []; let ultimoTc = B.valor('SELECT cierre FROM tc_dias WHERE fecha < ? ORDER BY fecha DESC LIMIT 1', desde) || null;
  for (let f = desde; f <= hasta; f = T.sumarDias(f, 1)) {
    const v = ventas.get(f) || {}, d = dev.get(f) || {};
    const neto = (v.total || 0) - (d.re || 0), costo = (v.costo || 0) - (d.co || 0);
    const netoUsd = (v.usd || 0) - (d.re_usd || 0), costoUsd = (v.costo_usd || 0) - (d.co_usd || 0);
    if (tc.has(f)) ultimoTc = tc.get(f);
    out.push({ fecha: f, neto: U.r2(neto), costo: U.r2(costo), ganancia: U.r2(neto - costo), netoUsd: U.r2(netoUsd), gananciaUsd: U.r2(netoUsd - costoUsd),
      piezas: (v.piezas || 0) - (d.pz || 0), ventas: v.num || 0, tc: ultimoTc, dia: DIAS_SEMANA[new Date(f + 'T12:00:00Z').getUTCDay()] });
  }
  return out;
}

/** Valor del inventario: lo que costó (histórico) contra lo que costaría reponerlo con el dólar de hoy */
function valorInventario(B, tcHoy, tcCompraHoy) {
  const r = B.uno('SELECT COALESCE(SUM(disponible),0) piezas, COALESCE(SUM(disponible * costo_usd),0) usd, COALESCE(SUM(disponible * costo_mxn),0) mxn FROM lotes WHERE disponible > 0');
  const venta = B.valor(`SELECT COALESCE(SUM(l.disponible * COALESCE(v.precio, p.precio)),0) FROM lotes l JOIN variantes v ON v.id = l.variante_id JOIN productos p ON p.id = v.producto_id WHERE l.disponible > 0`) || 0;
  const tcCompra = tcCompraHoy || tcHoy;
  const reposicion = tcCompra ? r.usd * tcCompra : null;
  return {
    piezas: r.piezas, costoUsd: U.r2(r.usd), costoMxn: U.r2(r.mxn), valorVenta: U.r2(venta),
    gananciaPotencial: U.r2(venta - r.mxn),
    /* Dólar promedio al que está «metido» el inventario */
    tcPromedio: r.usd > 0 ? U.r4(r.mxn / r.usd) : null,
    reposicionMxn: reposicion == null ? null : U.r2(reposicion),
    /* Positivo: el dólar subió desde que compró (su mercancía vale más pesos hoy). Negativo: bajó. */
    efectoCambiario: reposicion == null ? null : U.r2(reposicion - r.mxn),
    /* Cuántos dólares «vale» el inventario a precio de venta con el dólar de hoy */
    valorVentaUsd: tcHoy ? U.r2(venta / tcHoy) : null
  };
}

/** Productos más vendidos de un periodo */
function ranking(B, desde, hasta, limite = 10) {
  return B.todos(`SELECT p.id, p.nombre, p.emoji, c.nombre categoria, SUM(r.cantidad - r.devueltas) piezas,
                  ROUND(SUM(r.neto * (r.cantidad - r.devueltas) * 1.0 / r.cantidad), 2) ventas,
                  ROUND(SUM((r.neto - r.costo_mxn) * (r.cantidad - r.devueltas) * 1.0 / r.cantidad), 2) ganancia
                  FROM renglones r JOIN ventas v ON v.id = r.venta_id JOIN variantes va ON va.id = r.variante_id JOIN productos p ON p.id = va.producto_id
                  LEFT JOIN categorias c ON c.id = p.categoria_id
                  WHERE v.anulada = 0 AND v.fecha BETWEEN ? AND ? GROUP BY p.id HAVING piezas > 0 ORDER BY ventas DESC LIMIT ?`, desde, hasta, limite);
}
function porCategoria(B, desde, hasta) {
  return B.todos(`SELECT COALESCE(c.nombre, 'Sin categoría') categoria, c.emoji, SUM(r.cantidad - r.devueltas) piezas,
                  ROUND(SUM(r.neto * (r.cantidad - r.devueltas) * 1.0 / r.cantidad), 2) ventas,
                  ROUND(SUM((r.neto - r.costo_mxn) * (r.cantidad - r.devueltas) * 1.0 / r.cantidad), 2) ganancia
                  FROM renglones r JOIN ventas v ON v.id = r.venta_id JOIN variantes va ON va.id = r.variante_id JOIN productos p ON p.id = va.producto_id
                  LEFT JOIN categorias c ON c.id = p.categoria_id WHERE v.anulada = 0 AND v.fecha BETWEEN ? AND ? GROUP BY c.id ORDER BY ventas DESC`, desde, hasta);
}
const porMetodo = (B, desde, hasta) => B.todos(`SELECT metodo, COUNT(*) num, ROUND(SUM(total),2) total, ROUND(SUM(CASE WHEN moneda_pago='USD' THEN recibido ELSE 0 END),2) dolares
                                                 FROM ventas WHERE anulada = 0 AND fecha BETWEEN ? AND ? GROUP BY metodo ORDER BY total DESC`, desde, hasta);
const porVendedor = (B, desde, hasta) => B.todos(`SELECT COALESCE(u.nombre,'—') nombre, u.color, COUNT(*) num, SUM(v.piezas) piezas, ROUND(SUM(v.total),2) total
                                                   FROM ventas v LEFT JOIN usuarios u ON u.id = v.usuario_id WHERE v.anulada = 0 AND v.fecha BETWEEN ? AND ? GROUP BY v.usuario_id ORDER BY total DESC`, desde, hasta);

/** Actividad reciente (para el tablero, se actualiza en vivo) */
function actividad(B, limite = 12) {
  return B.todos(`
    SELECT 'venta' tipo, v.id, v.t, v.total monto, v.piezas, u.nombre usuario, v.metodo detalle, v.anulada FROM ventas v LEFT JOIN usuarios u ON u.id = v.usuario_id
    UNION ALL SELECT 'devolucion', d.id, d.t, d.reembolso, d.cantidad, u.nombre, d.destino, 0 FROM devoluciones d LEFT JOIN usuarios u ON u.id = d.usuario_id
    UNION ALL SELECT 'merma', m.id, m.t, m.costo_mxn, m.cantidad, u.nombre, m.motivo, 0 FROM mermas m LEFT JOIN usuarios u ON u.id = m.usuario_id
    UNION ALL SELECT 'compra', c.id, c.t, c.total_usd, c.piezas, u.nombre, c.moneda, c.anulada FROM compras c LEFT JOIN usuarios u ON u.id = c.usuario_id
    ORDER BY t DESC LIMIT ?`, limite);
}

/** Tablero principal: hoy contra ayer, el dólar, el inventario y avisos */
function tablero(B, tcEstado) {
  const aj = A.leer(B), hoy = T.hoy(), ayer = T.ayer();
  const tcHoy = tcEstado && tcEstado.valor;
  const inicioMes = hoy.slice(0, 8) + '01';
  const p = T.partes();
  /* Mes anterior hasta el mismo día (comparación justa) */
  const [a, m] = [p.anio, p.mes]; const mesAnt = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
  const diasMesAnt = new Date(Date.UTC(+mesAnt.slice(0, 4), +mesAnt.slice(5), 0)).getUTCDate();
  const hastaMesAnt = `${mesAnt}-${String(Math.min(p.dia, diasMesAnt)).padStart(2, '0')}`;

  const productos = C.listarProductos(B, { tcHoy: tcEstado && tcEstado.compra });
  const minimoGeneral = aj.stockMinimo;
  const porAgotarse = productos.filter(x => x.existencia > 0 && x.existencia <= (x.minimo ?? minimoGeneral)).sort((x, y) => x.existencia - y.existencia).slice(0, 8);
  const agotados = productos.filter(x => x.existencia === 0 && x.vendidas30 > 0).slice(0, 8);
  const margenBajo = productos.filter(x => x.existencia > 0 && x.margenReposicion != null && x.margenReposicion < aj.margenObjetivo * 0.6)
    .sort((x, y) => x.margenReposicion - y.margenReposicion).slice(0, 6);
  /* Estancados: con piezas y sin ventas en 30 días, y con más de 30 días en la tienda */
  const desde30 = T.sumarDias(hoy, -30);
  const viejos = new Set(B.todos(`SELECT DISTINCT v.producto_id id FROM lotes l JOIN variantes v ON v.id = l.variante_id WHERE l.disponible > 0 AND l.fecha <= ?`, desde30).map(x => x.id));
  const estancados = productos.filter(x => x.existencia > 0 && x.vendidas30 === 0 && viejos.has(x.id)).sort((x, y) => y.valorMxn - x.valorMxn).slice(0, 6);

  return {
    hoy, ayer, zona: T.zona(), tienda: aj.tienda,
    resumenHoy: resumen(B, hoy, hoy),
    resumenAyer: resumen(B, ayer, ayer),
    mes: resumen(B, inicioMes, hoy),
    mesAnterior: resumen(B, `${mesAnt}-01`, hastaMesAnt),
    serie: serieDiaria(B, T.sumarDias(hoy, -13), hoy),
    horas: B.todos(`SELECT CAST(substr(hora,1,2) AS INTEGER) h, COUNT(*) num, ROUND(SUM(total),2) total FROM ventas WHERE anulada = 0 AND fecha = ? GROUP BY h ORDER BY h`, hoy),
    tc: tcEstado,
    inventario: valorInventario(B, tcHoy, tcEstado && tcEstado.compra),
    top: ranking(B, T.sumarDias(hoy, -6), hoy, 5),
    alertas: { porAgotarse, agotados, margenBajo, estancados },
    actividad: actividad(B, 12),
    margenObjetivo: aj.margenObjetivo
  };
}

/** Precio sugerido: el costo de reponer la pieza con el margen objetivo, redondeado hacia arriba */
function precioSugerido(costoMxn, margen, redondeo) {
  if (!costoMxn || margen >= 100) return null;
  const crudo = costoMxn / (1 - margen / 100);
  return Math.ceil(crudo / redondeo) * redondeo;
}

/**
 * Proyección a futuro con el ritmo reciente de ventas.
 * o = { dias: horizonte (30), tcSimulado: «¿y si el dólar estuviera en…?» }
 */
function proyeccion(B, tcEstado, { dias = 30, tcSimulado = null } = {}) {
  const aj = A.leer(B), hoy = T.hoy();
  dias = Math.min(365, Math.max(7, Math.round(dias)));
  /* Ventana base: últimos 28 días, o desde la primera venta si el negocio es más nuevo (mínimo 7) */
  const primera = B.valor('SELECT MIN(fecha) FROM ventas WHERE anulada = 0') || hoy;
  const ventana = Math.max(7, Math.min(28, T.diasEntre(primera, hoy) + 1));
  const desde = T.sumarDias(hoy, -(ventana - 1));
  const base = resumen(B, desde, hoy);
  const porDiaVenta = base.ventas.netoMxn / ventana, porDiaGan = base.ganancia.mxn / ventana, porDiaUsd = base.ganancia.usd / ventana;
  const gastosDia = resumen(B, T.sumarDias(hoy, -29), hoy).gastos.mxn / 30;

  /* Tendencia: últimos 14 días contra los 14 anteriores */
  const r1 = resumen(B, T.sumarDias(hoy, -13), hoy).ventas.netoMxn, r0 = resumen(B, T.sumarDias(hoy, -27), T.sumarDias(hoy, -14)).ventas.netoMxn;
  const tendencia = r0 > 0 ? U.r2((r1 / r0 - 1) * 100) : null;

  const tcMercado = tcEstado && tcEstado.valor, ajusteCompra = +aj.tc.ajusteCompra || 0;
  const tcSim = tcSimulado ? +tcSimulado : tcMercado;
  const tcCompraSim = tcSim ? tcSim + ajusteCompra : null;

  /* Por producto: ritmo en la ventana, cuándo se acaba, cuánto hay que resurtir y a qué precio venderlo con el dólar simulado */
  const ritmo = new Map(B.todos(`SELECT va.producto_id id, SUM(r.cantidad - r.devueltas) n FROM renglones r JOIN ventas v ON v.id = r.venta_id JOIN variantes va ON va.id = r.variante_id
                                 WHERE v.anulada = 0 AND v.fecha >= ? GROUP BY va.producto_id`, desde).map(x => [x.id, x.n]));
  const productos = C.listarProductos(B, { tcHoy: tcCompraSim }).map(p => {
    const porDia = (ritmo.get(p.id) || 0) / ventana;
    const diasRestantes = porDia > 0 ? Math.floor(p.existencia / porDia) : null;
    const necesarias = Math.max(0, Math.ceil(porDia * dias - p.existencia));
    const costoRepoMxn = tcCompraSim ? p.costoUsd * tcCompraSim : p.costoMxn;
    return {
      id: p.id, nombre: p.nombre, emoji: p.emoji, categoria: p.categoria, existencia: p.existencia, precio: p.precio,
      porDia: U.r2(porDia), diasRestantes, agotaEl: diasRestantes != null ? T.sumarDias(hoy, diasRestantes) : null,
      necesarias, presupuestoUsd: U.r2(necesarias * p.costoUsd),
      costoUsd: p.costoUsd, costoMxn: p.costoMxn, costoReposicion: U.r2(costoRepoMxn),
      margenActual: p.margen, margenSimulado: p.precio > 0 && costoRepoMxn ? U.r2((p.precio - costoRepoMxn) / p.precio * 100) : null,
      precioSugerido: precioSugerido(costoRepoMxn, aj.margenObjetivo, aj.redondeo)
    };
  });
  const resurtir = productos.filter(x => x.necesarias > 0).sort((a, b) => (a.diasRestantes ?? 1e9) - (b.diasRestantes ?? 1e9));
  const presupuestoUsd = U.r2(resurtir.reduce((s, x) => s + x.presupuestoUsd, 0));

  /* ¿Qué días de la semana se vende más? (últimos 56 días) */
  const sem = B.todos(`SELECT CAST(strftime('%w', fecha) AS INTEGER) d, COUNT(DISTINCT fecha) dias, SUM(total) total FROM ventas WHERE anulada = 0 AND fecha >= ? GROUP BY d`, T.sumarDias(hoy, -55));
  const semana = DIAS_SEMANA.map((nombre, i) => { const r = sem.find(x => x.d === i); return { dia: nombre, promedio: r && r.dias ? U.r2(r.total / r.dias) : 0 }; });

  const inv = valorInventario(B, tcSim, tcCompraSim);
  return {
    hoy, dias, ventana, desde, tendencia,
    tcMercado, tcSimulado: tcSim, tcCompraSimulado: tcCompraSim ? U.r4(tcCompraSim) : null,
    porDia: { ventas: U.r2(porDiaVenta), ganancia: U.r2(porDiaGan), gananciaUsd: U.r2(porDiaUsd), gastos: U.r2(gastosDia) },
    proyectado: {
      ventas: U.r2(porDiaVenta * dias), ganancia: U.r2(porDiaGan * dias), gananciaUsd: U.r2(porDiaUsd * dias),
      utilidad: U.r2((porDiaGan - gastosDia) * dias),
      /* La ganancia en dólares si el dólar estuviera en el valor simulado */
      gananciaUsdSimulada: tcSim ? U.r2(porDiaGan * dias / tcSim) : null
    },
    inventario: inv,
    presupuesto: { usd: presupuestoUsd, mxn: tcCompraSim ? U.r2(presupuestoUsd * tcCompraSim) : null },
    resurtir: resurtir.slice(0, 30),
    productos,
    semana,
    margenObjetivo: aj.margenObjetivo
  };
}

/** Compras con su dólar, para comparar contra hoy («¿compré caro o barato?») */
function comprasConDolar(B, tcHoy, limite = 40) {
  return B.todos(`SELECT c.id, c.folio, c.fecha, c.hora, c.moneda, c.total_usd, c.total_mxn, c.tc_mercado, c.tc_pagado, c.piezas, p.nombre proveedor
                  FROM compras c LEFT JOIN proveedores p ON p.id = c.proveedor_id WHERE c.anulada = 0 ORDER BY c.fecha DESC, c.id DESC LIMIT ?`, limite)
    .map(c => ({ ...c, mxnHoy: tcHoy ? U.r2(c.total_usd * tcHoy) : null, diferencia: tcHoy ? U.r2(c.total_usd * tcHoy - c.total_mxn) : null }));
}

module.exports = { resumen, serieDiaria, valorInventario, ranking, porCategoria, porMetodo, porVendedor, actividad, tablero, proyeccion, precioSugerido, comprasConDolar, DIAS_SEMANA };
