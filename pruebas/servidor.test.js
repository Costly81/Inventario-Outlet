'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   PRUEBAS AUTOMÁTICAS (node:test, sin dependencias).   Correr:  npm run probar
   Cada prueba usa su propia base de datos temporal; nunca toca datos/ reales.
   Las corre también GitHub Actions antes de publicar cada versión.
   ───────────────────────────────────────────────────────────────────────────── */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');

const DB = require('../servidor/lib/db.js');
const T = require('../servidor/lib/tiempo.js');
const C = require('../servidor/lib/catalogo.js');
const O = require('../servidor/lib/operaciones.js');
const I = require('../servidor/lib/inventario.js');
const R = require('../servidor/lib/reportes.js');
const TC = require('../servidor/lib/tipoCambio.js');
const Auth = require('../servidor/lib/auth.js');
const QR = require('../publico/js/qr.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'io-prueba-'));
const dueno = { id: 1, rol: 'dueno' }, vendedor = { id: 2, rol: 'vendedor' };
const casi = (a, b, tol = 0.011) => assert.ok(Math.abs(a - b) <= tol, `${a} ≈ ${b}`);

/* Base con un producto de dos tallas y dos usuarios */
function base() {
  const B = DB.abrir(':memory:');
  C.sembrarCategorias(B);
  B.run("INSERT INTO usuarios (id, nombre, rol, pin, creado) VALUES (1, 'Ana', 'dueno', 'x', 'hoy'), (2, 'Lupe', 'vendedor', 'x', 'hoy')");
  const pid = C.guardarProducto(B, { nombre: 'Playera', categoriaId: 1, precio: 200, variantes: [{ nombre: 'M' }, { nombre: 'G' }] });
  const [m, g] = B.todos('SELECT id FROM variantes WHERE producto_id = ? ORDER BY orden', pid).map(x => x.id);
  return { B, pid, m, g };
}
const tcFijo = (valor = 18, recibir = 17.5) => ({ valor, recibir, compra: valor + 0.3 });

describe('Fechas en la zona de la tienda', () => {
  test('hora local → UTC y de regreso (Ciudad Juárez)', () => {
    T.usarZona('America/Ciudad_Juarez');
    const d = T.localAUTC('2026-11-19', '15:30');
    assert.equal(d.toISOString(), '2026-11-19T22:30:00.000Z');     // invierno: UTC−7
    const p = T.partes(d); assert.equal(p.fecha, '2026-11-19'); assert.equal(p.hora, '15:30');
    const v = T.localAUTC('2026-07-04', '09:00');
    assert.equal(T.partes(v).hora, '09:00');
  });
  test('aritmética de días', () => {
    assert.equal(T.sumarDias('2026-03-01', -1), '2026-02-28');
    assert.equal(T.diasEntre('2026-01-30', '2026-02-02'), 3);
  });
  test('zona inválida se rechaza', () => assert.throws(() => T.usarZona('Marte/Olympus')));
});

describe('Compras: costo real repartido', () => {
  test('reparto por valor con impuesto y gastos en las dos monedas', () => {
    const k = O.calcularCompra({ moneda: 'USD', reparto: 'valor', impuesto: 8.25, gastosMxn: 180, tcPagado: 18,
      renglones: [{ varianteId: 1, cantidad: 10, costo: 5 }, { varianteId: 2, cantidad: 5, costo: 10 }] }, 17.7, 18);
    assert.equal(k.subtotal, 100); assert.equal(k.piezas, 15);
    casi(k.totalUsd, 100 + 8.25 + 10);                 // 180 MXN / 18 = 10 USD
    casi(k.totalMxn, 108.25 * 18 + 180);
    /* La suma de los costos por pieza reproduce el total */
    casi(k.renglones.reduce((s, r) => s + r.costoUsd * r.cantidad, 0), k.totalUsd);
    casi(k.renglones.reduce((s, r) => s + r.costoMxn * r.cantidad, 0), k.totalMxn);
    /* Lo caro absorbe más: la pieza de 10 USD cuesta el doble que la de 5 */
    casi(k.renglones[1].costoUsd, k.renglones[0].costoUsd * 2, 1e-6);
    casi(k.sobrecostoCambio, 108.25 * 0.3);
  });
  test('lote surtido: reparto parejo por pieza', () => {
    const k = O.calcularCompra({ moneda: 'USD', reparto: 'piezas', subtotal: 300, tcPagado: 18, renglones: [{ varianteId: 1, cantidad: 20 }, { varianteId: 2, cantidad: 40 }] }, 18, 18);
    casi(k.renglones[0].costoUsd, 5); casi(k.renglones[1].costoUsd, 5); casi(k.renglones[0].costoMxn, 90);
  });
  test('compra en pesos también se ve en dólares', () => {
    const k = O.calcularCompra({ moneda: 'MXN', reparto: 'valor', tcPagado: 20, renglones: [{ varianteId: 1, cantidad: 2, costo: 100 }] }, 20, 20.3);
    casi(k.totalMxn, 200); casi(k.totalUsd, 10);
  });
  test('validaciones claras', () => {
    assert.throws(() => O.calcularCompra({ renglones: [] }, 18, 18), /al menos un artículo/);
    assert.throws(() => O.calcularCompra({ reparto: 'valor', renglones: [{ varianteId: 1, cantidad: 1 }] }, 18, 18), /costo por pieza/);
  });
});

describe('Inventario FIFO, ventas, devoluciones, merma y conteo', () => {
  test('la venta usa primero el lote más viejo y guarda su costo', () => {
    const { B, m } = base();
    O.registrarCompra(B, { fecha: '2026-10-01', hora: '10:00', tcPagado: 18, renglones: [{ varianteId: m, cantidad: 2, costo: 5 }] }, { valor: 17.8, fuente: 'prueba' }, 18, dueno);
    O.registrarCompra(B, { fecha: '2026-11-01', hora: '10:00', tcPagado: 20, renglones: [{ varianteId: m, cantidad: 2, costo: 5 }] }, { valor: 19.7, fuente: 'prueba' }, 20, dueno);
    assert.equal(I.existencia(B, m), 4);
    const v = O.registrarVenta(B, { renglones: [{ varianteId: m, cantidad: 3 }], metodo: 'efectivo' }, tcFijo(19), vendedor);
    /* 2 piezas a 90 MXN (5×18) + 1 a 100 MXN (5×20) */
    casi(v.costo_mxn, 280); casi(v.costo_usd, 15); assert.equal(v.total, 600); casi(v.ganancia, 320);
    assert.equal(I.existencia(B, m), 1);
  });

  test('cobro en dólares: cambio en pesos al precio de recibir', () => {
    const { B, m } = base();
    O.registrarCompra(B, { tcPagado: 18, renglones: [{ varianteId: m, cantidad: 5, costo: 5 }] }, { valor: 18, fuente: 'p' }, 18, dueno);
    const v = O.registrarVenta(B, { renglones: [{ varianteId: m, cantidad: 1 }], metodo: 'dolares', recibido: 20 }, tcFijo(18, 17.5), vendedor);
    assert.equal(v.moneda_pago, 'USD'); casi(v.cambio, 20 * 17.5 - 200); casi(v.total_usd, 200 / 18);
    assert.throws(() => O.registrarVenta(B, { renglones: [{ varianteId: m, cantidad: 1 }], metodo: 'dolares', recibido: 5 }, tcFijo(18, 17.5), vendedor), /Faltan dólares/);
  });

  test('la misma clave no cobra dos veces (red inestable)', () => {
    const { B, m } = base();
    O.registrarCompra(B, { tcPagado: 18, renglones: [{ varianteId: m, cantidad: 5, costo: 5 }] }, { valor: 18, fuente: 'p' }, 18, dueno);
    const d = { clave: 'abc-123', renglones: [{ varianteId: m, cantidad: 1 }], metodo: 'tarjeta' };
    const a = O.registrarVenta(B, d, tcFijo(), vendedor), b = O.registrarVenta(B, d, tcFijo(), vendedor);
    assert.equal(a.id, b.id); assert.equal(I.existencia(B, m), 4);
  });

  test('no se vende lo que no hay (y no queda nada a medias)', () => {
    const { B, m, g } = base();
    O.registrarCompra(B, { tcPagado: 18, renglones: [{ varianteId: m, cantidad: 1, costo: 5 }] }, { valor: 18, fuente: 'p' }, 18, dueno);
    assert.throws(() => O.registrarVenta(B, { renglones: [{ varianteId: m, cantidad: 1 }, { varianteId: g, cantidad: 1 }] }, tcFijo(), vendedor), /No hay piezas/);
    assert.equal(I.existencia(B, m), 1); assert.equal(B.valor('SELECT COUNT(*) FROM ventas'), 0);
  });

  test('descuento repartido, devolución al inventario y a merma', () => {
    const { B, m, g } = base();
    O.registrarCompra(B, { tcPagado: 18, renglones: [{ varianteId: m, cantidad: 3, costo: 5 }, { varianteId: g, cantidad: 3, costo: 5 }] }, { valor: 18, fuente: 'p' }, 18, dueno);
    const v = O.registrarVenta(B, { renglones: [{ varianteId: m, cantidad: 2 }, { varianteId: g, cantidad: 1 }], descuento: 60 }, tcFijo(), vendedor);
    assert.equal(v.total, 540); casi(v.renglones[0].neto, 360); casi(v.renglones[1].neto, 180);
    const d1 = O.registrarDevolucion(B, { ventaId: v.id, renglonId: v.renglones[0].id, cantidad: 1, destino: 'inventario' }, dueno);
    casi(d1.reembolso, 180); assert.equal(I.existencia(B, m), 2);
    O.registrarDevolucion(B, { ventaId: v.id, renglonId: v.renglones[1].id, cantidad: 1, destino: 'merma' }, dueno);
    assert.equal(I.existencia(B, g), 2);                                   // no regresa al estante
    assert.equal(B.valor("SELECT COUNT(*) FROM mermas WHERE origen = 'devolucion'"), 1);
    assert.throws(() => O.registrarDevolucion(B, { ventaId: v.id, renglonId: v.renglones[1].id, cantidad: 1 }, dueno), /ya se devolvió/);
    const r = R.resumen(B, T.hoy(), T.hoy());
    casi(r.ventas.netoMxn, 540 - 360); casi(r.ganancia.mxn, r.ventas.netoMxn - r.costo.mxn); casi(r.merma.mxn, 90);
  });

  test('cancelar venta regresa las piezas; anular compra solo si nada se movió', () => {
    const { B, m } = base();
    const c = O.registrarCompra(B, { tcPagado: 18, renglones: [{ varianteId: m, cantidad: 2, costo: 5 }] }, { valor: 18, fuente: 'p' }, 18, dueno);
    const v = O.registrarVenta(B, { renglones: [{ varianteId: m, cantidad: 2 }] }, tcFijo(), vendedor);
    assert.throws(() => O.anularCompra(B, c.id, dueno), /ya se vendieron/);
    assert.throws(() => O.anularVenta(B, v.id, { id: 99, rol: 'vendedor' }), /sus propias ventas/);
    O.anularVenta(B, v.id, vendedor); assert.equal(I.existencia(B, m), 2);
    O.anularCompra(B, c.id, dueno); assert.equal(I.existencia(B, m), 0);
  });

  test('merma y conteo físico (faltantes y sobrantes)', () => {
    const { B, m, g } = base();
    O.registrarCompra(B, { tcPagado: 18, renglones: [{ varianteId: m, cantidad: 5, costo: 5 }, { varianteId: g, cantidad: 5, costo: 6 }] }, { valor: 18, fuente: 'p' }, 18, dueno);
    const mm = O.registrarMerma(B, { varianteId: m, cantidad: 1, motivo: 'robo' }, dueno); casi(mm.costoMxn, 90);
    const k = O.registrarConteo(B, { renglones: [{ varianteId: m, contado: 2 }, { varianteId: g, contado: 7 }] }, 18, dueno);
    assert.equal(k.faltantes, 2); assert.equal(k.sobrantes, 2);
    assert.equal(I.existencia(B, m), 2); assert.equal(I.existencia(B, g), 7);
    casi(I.costoPromedio(B, g).mxn, 108, 0.001);                            // lo que sobra entra al costo promedio
  });

  test('una talla con piezas no se puede quitar', () => {
    const { B, pid, m } = base();
    O.registrarCompra(B, { tcPagado: 18, renglones: [{ varianteId: m, cantidad: 1, costo: 5 }] }, { valor: 18, fuente: 'p' }, 18, dueno);
    assert.throws(() => C.guardarProducto(B, { id: pid, nombre: 'Playera', precio: 200, variantes: [{ nombre: 'G' }] }), /todavía tiene piezas/);
  });
});

describe('Dólar en vivo', () => {
  const respuesta = (cuerpo, ok = true) => Promise.resolve({ ok, status: ok ? 200 : 500, json: async () => cuerpo });
  test('lee el dólar de la página de Google Finanzas', () => {
    const html = '<div class="rPF6Lc" jsname="OYCkv"><div class="ln0Gqe"><div jsname="LXPcOd" class=""><div class="AHmHk"><span class=""><div jsname="ip75Cb" class="kf1m0"><div class="YMlKec fxKbKc">18.6123</div></div></span></div></div></div><div jsname="ip75Cb" data-last-price="18.6123" data-last-normal-market-timestamp="1763600000" data-currency-code="MXN"></div></div>';
    const r = TC.leerGoogle(html); assert.equal(r.valor, 18.6123); assert.equal(r.t, new Date(1763600000 * 1000).toISOString());
    assert.equal(TC.leerGoogle('<div class="YMlKec fxKbKc">17.9050</div>').valor, 17.905);
    assert.throws(() => TC.leerGoogle('<html>consent</html>'), /no se encontró/);
  });
  test('Google es la fuente principal; si falla, usa las demás', async () => {
    const B = DB.abrir(':memory:');
    const okG = TC.crear({ B, fetch: url => Promise.resolve({ ok: true, status: 200, text: async () => '<div data-last-price="18.7001"></div>', json: async () => ({}) }), registro: { warn() { } } });
    const a = await okG.actualizar(); assert.equal(a.valor, 18.7001); assert.equal(a.fuente, 'google');
  });
  test('si Google y Yahoo fallan usa la siguiente fuente y calcula compra/recibir', async () => {
    const B = DB.abrir(':memory:');
    const pedidas = [];
    const f = url => { pedidas.push(url); if (url.includes('google') || url.includes('yahoo')) return respuesta({}, false); if (url.includes('er-api')) return respuesta({ result: 'success', rates: { MXN: 18.4321 } }); return respuesta({}); };
    const tc = TC.crear({ B, fetch: f, registro: { warn() { } } });
    const a = await tc.actualizar();
    assert.equal(a.valor, 18.4321); assert.equal(a.fuente, 'erapi');
    casi(a.compra, 18.4321 + 0.35, 1e-4); casi(a.recibir, 17.83, 0.006);
    assert.ok(pedidas[0].includes('google')); assert.ok(pedidas[1].includes('yahoo'));
  });
  test('rechaza un salto absurdo y usa el valor manual si existe', async () => {
    const B = DB.abrir(':memory:');
    const tc = TC.crear({ B, fetch: () => respuesta({ chart: { result: [{ meta: { regularMarketPrice: 35 } }] } }), registro: { warn() { } } });
    tc.registrar(18, 'prueba');
    const a = await tc.actualizar();
    assert.equal(a.valor, 18); assert.match(a.error || '', /sospechoso|No se pudo/);
    B.guardarAjuste('tc', { manual: 19.25 });
    assert.equal(tc.actual().valor, 19.25); assert.equal(tc.actual().fuente, 'manual');
  });
  test('el dólar de una compra pasada sale de las muestras o del cierre del día', async () => {
    const B = DB.abrir(':memory:');
    const tc = TC.crear({ B, sinRed: true });
    tc.registrar(18.1, 'yahoo', T.localAUTC('2026-11-10', '10:00').toISOString());
    tc.registrar(18.3, 'yahoo', T.localAUTC('2026-11-10', '16:00').toISOString());
    tc.registrar(18.9, 'yahoo');
    assert.equal((await tc.enMomento('2026-11-10', '15:00')).valor, 18.3);
    assert.equal((await tc.enMomento('2026-11-10', '22:30')).valor, 18.3);      // fuera de 3 h: cierre del día
    assert.equal((await tc.enMomento('2026-11-12', '12:00')).valor, 18.3);      // sin datos: último cierre previo
  });
});

describe('Código QR', () => {
  test('tamaño de la matriz según la versión', () => {
    assert.equal(QR.matriz('http://192.168.1.50:4300').length, 25);           // versión 2
    assert.ok(QR.svg('hola').startsWith('<svg'));
  });
});

describe('Servidor HTTP (de punta a punta)', () => {
  let app, srv, url, dir;
  before(async () => {
    dir = tmp();
    process.env.IO_SIN_RED = '1';
    const cfg = { ...require('../servidor/lib/config.js').PREDETERMINADA, datos: dir, raiz: path.resolve(__dirname, '..'), archivoBD: path.join(dir, 'p.sqlite'), sinRed: true, puerto: 0 };
    app = require('../servidor/index.js').preparar({ cfg, registro: { warn() { }, error() { }, log() { } } });
    app.tc.registrar(18.5, 'prueba');
    srv = http.createServer((q, r) => app.atender(q, r));
    await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
    url = `http://127.0.0.1:${srv.address().port}`;
  });
  after(() => { srv.close(); app.B.cerrar(); fs.rmSync(dir, { recursive: true, force: true }); });

  async function pedir(ruta, { metodo = 'GET', datos, cookie, csrf } = {}) {
    const h = {}; if (datos) h['Content-Type'] = 'application/json'; if (cookie) h.Cookie = cookie; if (csrf) h['X-CSRF'] = csrf;
    const r = await fetch(url + ruta, { method: metodo, headers: h, body: datos ? JSON.stringify(datos) : undefined });
    return { status: r.status, j: await r.json().catch(() => null), cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
  }

  test('primer uso, PIN, CSRF y permisos por papel', async () => {
    assert.equal((await pedir('/api/estado')).j.instalacion, 'instalar');
    /* Desde la misma computadora no se pide código */
    const ins = await pedir('/api/instalar', { metodo: 'POST', datos: { nombre: 'Ana', pin: '1357' } });
    assert.equal(ins.status, 200); const due = { cookie: ins.cookie, csrf: ins.j.csrf };
    assert.equal((await pedir('/api/tablero', { cookie: due.cookie })).status, 200);
    /* Sin el encabezado X-CSRF no se puede cambiar nada */
    assert.equal((await pedir('/api/usuarios', { metodo: 'POST', datos: { nombre: 'Lupe', pin: '2468' }, cookie: due.cookie })).status, 403);
    assert.equal((await pedir('/api/usuarios', { metodo: 'POST', datos: { nombre: 'Lupe', pin: '2468' }, ...due })).status, 200);
    /* PIN incorrecto */
    const usuarios = (await pedir('/api/estado')).j.usuarios, lupe = usuarios.find(u => u.nombre === 'Lupe');
    assert.equal((await pedir('/api/entrar', { metodo: 'POST', datos: { usuarioId: lupe.id, pin: '0000' } })).status, 401);
    const ent = await pedir('/api/entrar', { metodo: 'POST', datos: { usuarioId: lupe.id, pin: '2468' } });
    const ven = { cookie: ent.cookie, csrf: ent.j.csrf };
    /* El vendedor no ve el tablero ni los costos */
    assert.equal((await pedir('/api/tablero', { cookie: ven.cookie })).status, 403);
    const p = await pedir('/api/productos', { metodo: 'POST', datos: { nombre: 'Gorra', precio: 150 }, ...due });
    const vid = app.B.valor('SELECT id FROM variantes WHERE producto_id = ?', p.j.id);
    await pedir('/api/compras', { metodo: 'POST', datos: { renglones: [{ varianteId: vid, cantidad: 3, costo: 4 }], impuesto: 1 }, ...due });
    const cat = await pedir('/api/catalogo', { cookie: ven.cookie });
    assert.equal(cat.j.productos[0].existencia, 3); assert.equal(cat.j.productos[0].costoUsd, undefined);
    const v = await pedir('/api/ventas', { metodo: 'POST', datos: { clave: 'k1', renglones: [{ varianteId: vid, cantidad: 1 }], metodo: 'efectivo', recibido: 200 }, ...ven });
    assert.equal(v.status, 200); assert.equal(v.j.venta.cambio, 50); assert.equal(v.j.venta.costo_mxn, undefined);
    const t = (await pedir('/api/tablero', { cookie: due.cookie })).j;
    assert.equal(t.resumenHoy.ventas.num, 1); assert.ok(t.resumenHoy.ganancia.mxn > 0);
    const csv = await fetch(url + '/api/exportar/ventas.csv', { headers: { Cookie: due.cookie } });
    assert.match(await csv.text(), /Gorra/);
  });

  test('archivos de la página y rutas desconocidas', async () => {
    const r = await fetch(url + '/');
    assert.equal(r.status, 200); assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal((await fetch(url + '/../servidor/index.js')).status !== 200, true);
    assert.equal((await pedir('/api/no-existe')).status, 404);
  });
});
