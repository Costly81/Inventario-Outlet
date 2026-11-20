'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   API DEL SISTEMA (todo lo que el navegador le pide al servidor).

   Convenciones:
   · Todas las rutas empiezan con /api y responden JSON: { ok: true, ... } o { ok: false, error: 'mensaje claro' }.
   · { publica: true }  → no pide sesión.      { rol: 'dueno' } → solo el dueño.
   · Lo que cambia datos (POST/PUT/DELETE) exige el encabezado X-CSRF de la sesión.
   · Después de cada cambio se avisa a los navegadores abiertos (evento «cambio») para que se actualicen solos.
   ───────────────────────────────────────────────────────────────────────────── */
const fs = require('fs');
const H = require('./lib/http.js');
const U = require('./lib/util.js');
const T = require('./lib/tiempo.js');
const A = require('./lib/ajustes.js');
const C = require('./lib/catalogo.js');
const O = require('./lib/operaciones.js');
const R = require('./lib/reportes.js');
const Red = require('./lib/red.js');

/**
 * Registra todas las rutas.
 * ctx = { B, cfg, auth, tc, eventos, respaldos, version }
 */
function registrar(ctx) {
  const { B, cfg, auth, tc, eventos, respaldos } = ctx;
  const r = H.enrutador();
  const fecha = (v, porOmision) => v ? (T.esFecha(v) ? v : U.falla('La fecha no es válida.')) : porOmision;
  const esDueno = s => s.usuario.rol === 'dueno';
  /* Avisa a todos que algo cambió (cada pantalla decide si recarga) */
  const cambio = (que, extra = {}) => eventos.emitir('cambio', { que, t: Date.now(), ...extra });

  /* Para un vendedor se ocultan costos y márgenes */
  const sinCostos = p => ({ ...p, costoUsd: undefined, costoMxn: undefined, costoReposicion: undefined, margen: undefined, margenReposicion: undefined, valorUsd: undefined, valorMxn: undefined,
    variantes: p.variantes.map(v => ({ ...v, costoUsd: undefined, costoMxn: undefined })) });

  /* ═══════════════ públicas ═══════════════ */
  r.get('/api/salud', () => ({ version: ctx.version, hora: T.partes().hora }), { publica: true });

  r.get('/api/estado', (req) => {
    const e = auth.estado(), aj = A.leer(B);
    return { instalacion: e, local: H.esLocal(req), tienda: aj.tienda, version: ctx.version, usuarios: e === 'listo' ? auth.listarParaEntrada() : [] };
  }, { publica: true });

  r.post('/api/instalar', (req, res, s, d) => {
    auth.instalar(d, H.esLocal(req));
    const u = B.uno("SELECT id FROM usuarios WHERE rol = 'dueno' AND activo = 1 ORDER BY id LIMIT 1");
    const ses = auth.entrar({ usuarioId: u.id, pin: d.pin }, H.ip(req), req.headers['user-agent']);
    H.ponerCookie(res, auth.COOKIE, ses.token, cfg.sesionDias * 86400);
    return { usuario: ses.usuario, csrf: ses.csrf };
  }, { publica: true });

  r.post('/api/entrar', (req, res, s, d) => {
    const ses = auth.entrar(d, H.ip(req), req.headers['user-agent']);
    H.ponerCookie(res, auth.COOKIE, ses.token, cfg.sesionDias * 86400);
    return { usuario: ses.usuario, csrf: ses.csrf };
  }, { publica: true, sinCsrf: true });

  /* ═══════════════ sesión ═══════════════ */
  r.post('/api/salir', (req, res, s) => { auth.salir(s.token); H.ponerCookie(res, auth.COOKIE, '', 0); return {}; });
  r.get('/api/sesion', (req, res, s) => ({
    usuario: s.usuario, csrf: s.csrf, version: ctx.version, zona: T.zona(), hoy: T.hoy(),
    ajustes: A.publicos(A.leer(B)), metodos: O.METODOS, motivosMerma: O.MOTIVOS_MERMA,
    red: Red.urls(cfg.puerto), puerto: cfg.puerto
  }));
  r.get('/api/eventos', (req, res, s) => { eventos.conectar(req, res, s.usuario); return H.SIN_RESPUESTA; });
  r.post('/api/mi-pin', (req, res, s, d) => { auth.cambiarPin(s.usuario.id, d.actual, d.nuevo); return {}; });

  /* ═══════════════ dólar ═══════════════ */
  r.get('/api/tc', () => ({ tc: tc.actual() }));
  r.post('/api/tc/actualizar', async () => ({ tc: await tc.actualizar() }), { rol: 'dueno' });
  r.get('/api/tc/historial', (req, res, s, d, q) => ({ dias: tc.historial(Math.min(800, +q.get('dias') || 90)), hoy: tc.intradia(fecha(q.get('fecha'), T.hoy())) }));
  r.get('/api/tc/momento', async (req, res, s, d, q) => {
    const f = fecha(q.get('fecha'), T.hoy()), h = q.get('hora') && T.esHora(q.get('hora')) ? q.get('hora') : T.partes().hora;
    const m = await tc.enMomento(f, h), aj = A.leer(B).tc;
    return { fecha: f, hora: h, ...m, compraSugerido: U.r4(m.valor + (+aj.ajusteCompra || 0)) };
  }, { rol: 'dueno' });
  r.get('/api/tc/compras', () => { const a = tc.actual(); return { compras: R.comprasConDolar(B, a.compra || a.valor) }; }, { rol: 'dueno' });

  /* ═══════════════ catálogo ═══════════════ */
  r.get('/api/catalogo', (req, res, s, d, q) => {
    const a = tc.actual();
    const productos = C.listarProductos(B, { inactivos: q.get('inactivos') === '1' && esDueno(s), tcHoy: a.compra || a.valor });
    return { categorias: C.listarCategorias(B), productos: esDueno(s) ? productos : productos.map(sinCostos) };
  });
  r.get('/api/productos/:id', (req, res, s, d, q, p) => { const a = tc.actual(); const x = C.detalleProducto(B, p.id, a.compra || a.valor); return { producto: esDueno(s) ? x : { ...sinCostos(x), lotes: [] } }; });
  r.post('/api/productos', (req, res, s, d) => { const id = C.guardarProducto(B, d); B.anotar(s.usuario.id, 'producto creado', { id, nombre: d.nombre }); cambio('catalogo'); return { id }; }, { rol: 'dueno' });
  r.put('/api/productos/:id', (req, res, s, d, q, p) => { C.guardarProducto(B, { ...d, id: +p.id }); cambio('catalogo'); return { id: +p.id }; }, { rol: 'dueno' });
  r.post('/api/productos/:id/activo', (req, res, s, d, q, p) => { C.activarProducto(B, +p.id, !!d.activo); cambio('catalogo'); return {}; }, { rol: 'dueno' });
  r.post('/api/categorias', (req, res, s, d) => { const id = C.guardarCategoria(B, d); cambio('catalogo'); return { id }; }, { rol: 'dueno' });
  r.put('/api/categorias/:id', (req, res, s, d, q, p) => { C.guardarCategoria(B, { ...d, id: +p.id }); cambio('catalogo'); return {}; }, { rol: 'dueno' });
  r.delete('/api/categorias/:id', (req, res, s, d, q, p) => { C.quitarCategoria(B, +p.id); cambio('catalogo'); return {}; }, { rol: 'dueno' });

  /* ═══════════════ compras ═══════════════ */
  r.post('/api/compras/calcular', async (req, res, s, d) => {
    const f = fecha(d.fecha, T.hoy()), h = d.hora && T.esHora(d.hora) ? d.hora : T.partes().hora;
    const m = await tc.enMomento(f, h), aj = A.leer(B).tc;
    return { calculo: O.calcularCompra(d, m.valor, m.valor + (+aj.ajusteCompra || 0)), momento: m };
  }, { rol: 'dueno' });
  r.post('/api/compras', async (req, res, s, d) => {
    const f = fecha(d.fecha, T.hoy()), h = d.hora && T.esHora(d.hora) ? d.hora : T.partes().hora;
    const m = await tc.enMomento(f, h), aj = A.leer(B).tc;
    const x = O.registrarCompra(B, { ...d, fecha: f, hora: h }, m, U.r4(m.valor + (+aj.ajusteCompra || 0)), s.usuario);
    cambio('compra', { id: x.id }); return { compra: x, momento: m };
  }, { rol: 'dueno' });
  r.get('/api/compras', (req, res, s, d, q) => ({ compras: O.listarCompras(B, { desde: fecha(q.get('desde')), hasta: fecha(q.get('hasta')) }) }), { rol: 'dueno' });
  r.get('/api/compras/:id', (req, res, s, d, q, p) => ({ compra: O.detalleCompra(B, +p.id) }), { rol: 'dueno' });
  r.post('/api/compras/:id/anular', (req, res, s, d, q, p) => { O.anularCompra(B, +p.id, s.usuario); cambio('compra'); return {}; }, { rol: 'dueno' });
  r.get('/api/proveedores', () => ({ proveedores: B.todos('SELECT p.*, (SELECT COUNT(*) FROM compras c WHERE c.proveedor_id = p.id AND c.anulada = 0) compras FROM proveedores p ORDER BY compras DESC, nombre') }), { rol: 'dueno' });

  /* ═══════════════ ventas y devoluciones ═══════════════ */
  r.post('/api/ventas', (req, res, s, d) => {
    const v = O.registrarVenta(B, d, tc.mercadoAhora(), s.usuario);
    cambio('venta', { id: v.id, total: v.total, piezas: v.piezas, usuario: s.usuario.nombre });
    return { venta: esDueno(s) ? v : { ...v, costo_mxn: undefined, costo_usd: undefined, ganancia: undefined } };
  });
  r.get('/api/ventas', (req, res, s, d, q) => {
    if (esDueno(s)) return { ventas: O.listarVentas(B, { desde: fecha(q.get('desde'), T.sumarDias(T.hoy(), -6)), hasta: fecha(q.get('hasta'), T.hoy()) }) };
    /* Un vendedor ve sus ventas de los últimos 7 días */
    return { ventas: O.listarVentas(B, { desde: T.sumarDias(T.hoy(), -6), hasta: T.hoy(), usuarioId: s.usuario.id }).map(v => ({ ...v, costo_mxn: undefined })) };
  });
  r.get('/api/ventas/:id', (req, res, s, d, q, p) => {
    const v = O.detalleVenta(B, +p.id);
    if (!esDueno(s)) { if (v.usuario_id !== s.usuario.id) U.falla('Solo puede ver sus propias ventas.', 403); return { venta: { ...v, costo_mxn: undefined, costo_usd: undefined, ganancia: undefined } }; }
    return { venta: v };
  });
  r.post('/api/ventas/:id/anular', (req, res, s, d, q, p) => { const v = O.anularVenta(B, +p.id, s.usuario); cambio('venta', { id: v.id, anulada: true }); return {}; });
  r.post('/api/devoluciones', (req, res, s, d) => {
    if (!esDueno(s)) { const v = B.uno('SELECT usuario_id, fecha FROM ventas WHERE id = ?', +d.ventaId || 0); if (!v || T.diasEntre(v.fecha, T.hoy()) > 30) U.falla('Esa venta no se encontró o tiene más de 30 días: pida ayuda al dueño.', 403); }
    const x = O.registrarDevolucion(B, d, s.usuario); cambio('devolucion'); return { devolucion: x };
  });

  /* Resumen del día de quien vende (lo que ve un vendedor en su inicio) */
  r.get('/api/mi-dia', (req, res, s) => {
    const hoy = T.hoy();
    const x = B.uno('SELECT COUNT(*) num, COALESCE(SUM(piezas),0) piezas, COALESCE(SUM(total),0) total FROM ventas WHERE anulada = 0 AND fecha = ? AND usuario_id = ?', hoy, s.usuario.id);
    const metodos = B.todos('SELECT metodo, COUNT(*) num, ROUND(SUM(total),2) total, ROUND(SUM(CASE WHEN moneda_pago = \'USD\' THEN recibido ELSE 0 END),2) dolares FROM ventas WHERE anulada = 0 AND fecha = ? AND usuario_id = ? GROUP BY metodo', hoy, s.usuario.id);
    return { hoy, ...x, metodos, tc: tc.actual() };
  });

  /* ═══════════════ merma, conteo y gastos ═══════════════ */
  r.post('/api/mermas', (req, res, s, d) => { const x = O.registrarMerma(B, d, s.usuario); cambio('merma'); return { merma: x }; }, { rol: 'dueno' });
  r.get('/api/mermas', (req, res, s, d, q) => ({ mermas: O.listarMermas(B, { desde: fecha(q.get('desde')), hasta: fecha(q.get('hasta')) }) }), { rol: 'dueno' });
  r.post('/api/conteos', (req, res, s, d) => { const a = tc.actual(); const x = O.registrarConteo(B, d, a.valor, s.usuario); cambio('conteo'); return { conteo: x }; }, { rol: 'dueno' });
  r.get('/api/conteos', () => ({ conteos: B.todos('SELECT c.*, u.nombre usuario FROM conteos c LEFT JOIN usuarios u ON u.id = c.usuario_id ORDER BY c.t DESC LIMIT 50') }), { rol: 'dueno' });
  r.post('/api/gastos', async (req, res, s, d) => {
    const f = fecha(d.fecha, T.hoy()); const m = f === T.hoy() ? tc.mercadoAhora() : await tc.enMomento(f, '12:00');
    const x = O.registrarGasto(B, { ...d, fecha: f }, m, s.usuario); cambio('gasto'); return { gasto: x };
  }, { rol: 'dueno' });
  r.get('/api/gastos', (req, res, s, d, q) => ({ gastos: O.listarGastos(B, { desde: fecha(q.get('desde')), hasta: fecha(q.get('hasta')) }) }), { rol: 'dueno' });
  r.delete('/api/gastos/:id', (req, res, s, d, q, p) => { O.quitarGasto(B, +p.id, s.usuario); cambio('gasto'); return {}; }, { rol: 'dueno' });

  /* ═══════════════ reportes ═══════════════ */
  r.get('/api/tablero', () => R.tablero(B, tc.actual()), { rol: 'dueno' });
  r.get('/api/reportes', (req, res, s, d, q) => {
    const hasta = fecha(q.get('hasta'), T.hoy()), desde = fecha(q.get('desde'), T.sumarDias(hasta, -29));
    if (desde > hasta) U.falla('La fecha inicial es posterior a la final.');
    if (T.diasEntre(desde, hasta) > 800) U.falla('El periodo es demasiado largo (máximo 800 días).');
    /* Periodo anterior del mismo largo, para comparar */
    const largo = T.diasEntre(desde, hasta) + 1, antHasta = T.sumarDias(desde, -1), antDesde = T.sumarDias(desde, -largo);
    return {
      resumen: R.resumen(B, desde, hasta), anterior: R.resumen(B, antDesde, antHasta), serie: R.serieDiaria(B, desde, hasta),
      ranking: R.ranking(B, desde, hasta, 15), categorias: R.porCategoria(B, desde, hasta), metodos: R.porMetodo(B, desde, hasta), vendedores: R.porVendedor(B, desde, hasta),
      mermas: O.listarMermas(B, { desde, hasta }).slice(0, 50), gastos: O.listarGastos(B, { desde, hasta })
    };
  }, { rol: 'dueno' });
  r.get('/api/proyeccion', (req, res, s, d, q) => R.proyeccion(B, tc.actual(), { dias: +q.get('dias') || 30, tcSimulado: q.get('tc') ? U.numero(q.get('tc'), 'El dólar simulado', { min: 5, max: 60 }) : null }), { rol: 'dueno' });

  /* ═══════════════ ajustes, personas, respaldos ═══════════════ */
  r.get('/api/ajustes', () => ({ ajustes: A.publicos(A.leer(B)), proveedoresTC: Object.entries(tc.PROVEEDORES).map(([id, p]) => ({ id, nombre: p.nombre, vivo: p.vivo })) }), { rol: 'dueno' });
  r.put('/api/ajustes', async (req, res, s, d) => {
    const antes = A.leer(B).tc.intervaloMin;
    const aj = A.guardar(B, d); B.anotar(s.usuario.id, 'ajustes', Object.keys(d));
    if (d.tc) { if (aj.tc.intervaloMin !== antes) tc.programar(); eventos.emitir('tc', tc.actual()); }
    cambio('ajustes'); return { ajustes: A.publicos(aj) };
  }, { rol: 'dueno' });
  r.get('/api/usuarios', () => ({ usuarios: auth.listar() }), { rol: 'dueno' });
  r.post('/api/usuarios', (req, res, s, d) => ({ id: auth.guardarUsuario(d, { ...s.usuario, token: s.token }) }), { rol: 'dueno' });
  r.put('/api/usuarios/:id', (req, res, s, d, q, p) => ({ id: auth.guardarUsuario({ ...d, id: +p.id }, { ...s.usuario, token: s.token }) }), { rol: 'dueno' });
  r.get('/api/respaldos', () => ({ respaldos: respaldos.listar(), carpeta: respaldos.carpeta }), { rol: 'dueno' });
  r.post('/api/respaldos', (req, res, s) => { const n = respaldos.ahora(); B.anotar(s.usuario.id, 'respaldo', n); return { nombre: n }; }, { rol: 'dueno' });
  r.get('/api/respaldos/:nombre', (req, res, s, d, q, p) => {
    const ruta = respaldos.ruta(p.nombre); if (!ruta) U.falla('No se encontró el respaldo.', 404);
    H.enviar(req, res, 200, fs.readFileSync(ruta), 'application/vnd.sqlite3', { 'Content-Disposition': `attachment; filename="${p.nombre}"`, 'Cache-Control': 'no-store' });
    return H.SIN_RESPUESTA;
  }, { rol: 'dueno' });
  r.get('/api/bitacora', () => ({ bitacora: B.todos('SELECT b.*, u.nombre usuario FROM bitacora b LEFT JOIN usuarios u ON u.id = b.usuario_id ORDER BY b.id DESC LIMIT 200') }), { rol: 'dueno' });

  /* ═══════════════ exportar a Excel (CSV) ═══════════════ */
  r.get('/api/exportar/:tipo', (req, res, s, d, q, p) => {
    const desde = fecha(q.get('desde'), '0000-01-01'), hasta = fecha(q.get('hasta'), '9999-12-31'); let filas, cols;
    switch (p.tipo) {
      case 'ventas.csv':
        filas = B.todos(`SELECT v.folio, v.fecha, v.hora, u.nombre usuario, p.nombre producto, va.nombre talla, r.cantidad, r.devueltas, r.precio, r.neto, r.costo_mxn, r.costo_usd, v.metodo, v.tc_mercado, v.anulada
                         FROM renglones r JOIN ventas v ON v.id = r.venta_id JOIN variantes va ON va.id = r.variante_id JOIN productos p ON p.id = va.producto_id LEFT JOIN usuarios u ON u.id = v.usuario_id
                         WHERE v.fecha BETWEEN ? AND ? ORDER BY v.t`, desde, hasta);
        cols = [['folio', 'Folio'], ['fecha', 'Fecha'], ['hora', 'Hora'], ['usuario', 'Vendió'], ['producto', 'Producto'], ['talla', 'Talla'], ['cantidad', 'Piezas'], ['devueltas', 'Devueltas'], ['precio', 'Precio'], ['neto', 'Cobrado MXN'],
          ['costo_mxn', 'Costo MXN'], ['costo_usd', 'Costo USD'], [f => U.r2(f.neto - f.costo_mxn), 'Ganancia MXN'], ['metodo', 'Pago'], ['tc_mercado', 'Dólar'], [f => f.anulada ? 'Sí' : '', 'Cancelada']]; break;
      case 'inventario.csv': {
        const a = tc.actual();
        filas = []; for (const x of C.listarProductos(B, { tcHoy: a.compra || a.valor })) for (const v of x.variantes) filas.push({ ...v, producto: x.nombre, categoria: x.categoria, tc: a.compra || a.valor });
        cols = [['producto', 'Producto'], ['categoria', 'Categoría'], ['nombre', 'Talla'], ['existencia', 'Piezas'], ['precio', 'Precio'], ['costoUsd', 'Costo USD'], ['costoMxn', 'Costo MXN'],
          [f => U.r2(f.costoUsd * f.tc), 'Reposición hoy MXN'], [f => U.r2(f.existencia * f.costoMxn), 'Valor costo MXN'], [f => U.r2(f.existencia * f.precio), 'Valor venta MXN'], ['vendidas30', 'Vendidas 30 días']]; break;
      }
      case 'compras.csv':
        filas = O.listarCompras(B, { desde, hasta, limite: 100000 });
        cols = [['folio', 'Folio'], ['fecha', 'Fecha'], ['hora', 'Hora'], ['proveedor', 'Proveedor'], ['lugar', 'Lugar'], ['moneda', 'Moneda'], ['subtotal', 'Subtotal'], ['impuesto', 'Impuesto'], ['gastos_usd', 'Gastos USD'], ['gastos_mxn', 'Gastos MXN'],
          ['tc_mercado', 'Dólar mercado'], ['tc_pagado', 'Dólar pagado'], ['total_usd', 'Total USD'], ['total_mxn', 'Total MXN'], ['piezas', 'Piezas'], [f => f.anulada ? 'Sí' : '', 'Anulada']]; break;
      case 'mermas.csv':
        filas = O.listarMermas(B, { desde, hasta });
        cols = [['fecha', 'Fecha'], ['producto', 'Producto'], ['variante', 'Talla'], ['cantidad', 'Piezas'], ['motivo', 'Motivo'], ['origen', 'Origen'], ['costo_mxn', 'Costo MXN'], ['costo_usd', 'Costo USD'], ['notas', 'Notas'], ['usuario', 'Registró']]; break;
      case 'gastos.csv':
        filas = O.listarGastos(B, { desde, hasta });
        cols = [['fecha', 'Fecha'], ['concepto', 'Concepto'], ['categoria', 'Categoría'], ['monto', 'Monto'], ['moneda', 'Moneda'], ['tc', 'Dólar'], ['monto_mxn', 'MXN'], ['monto_usd', 'USD']]; break;
      case 'dolar.csv':
        filas = tc.historial(800); cols = [['fecha', 'Fecha'], ['apertura', 'Apertura'], ['minimo', 'Mínimo'], ['maximo', 'Máximo'], ['cierre', 'Cierre']]; break;
      default: U.falla('No existe ese reporte.', 404);
    }
    H.enviar(req, res, 200, H.csv(filas, cols), H.TIPOS['.csv'], { 'Content-Disposition': `attachment; filename="${p.tipo.replace('.csv', '')}-${T.hoy()}.csv"`, 'Cache-Control': 'no-store' });
    return H.SIN_RESPUESTA;
  }, { rol: 'dueno' });

  return r;
}

module.exports = { registrar };
