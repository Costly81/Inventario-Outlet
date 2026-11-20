'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   DATOS DE DEMOSTRACIÓN (para probar y para conocer el sistema sin tocar datos reales).
   Se cargan SOLO si la base está vacía:  node servidor/index.js --demo
   Recomendado en una carpeta aparte:     IO_DATOS=./datos-demo node servidor/index.js --demo

   Crea: un dueño (PIN 1357) y una vendedora (PIN 2468), 14 productos genéricos, 4 compras en
   dólares en distintas fechas, ~5 semanas de ventas, algunas devoluciones, merma, gastos y el
   historial del dólar. Es reproducible: siempre genera lo mismo.
   ───────────────────────────────────────────────────────────────────────────── */
const T = require('./lib/tiempo.js');
const U = require('./lib/util.js');
const C = require('./lib/catalogo.js');
const O = require('./lib/operaciones.js');
const I = require('./lib/inventario.js');
const { huellaPin } = require('./lib/auth.js');

/* Números pseudoaleatorios con semilla fija (mulberry32) */
function azar(semilla) { return () => { semilla |= 0; semilla = semilla + 0x6D2B79F5 | 0; let t = Math.imul(semilla ^ semilla >>> 15, 1 | semilla); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const PRODUCTOS = [
  // nombre, categoría, emoji, precio MXN, tallas, costo USD por pieza
  ['Playera básica', 'Playeras', '👕', 149, ['CH', 'M', 'G', 'XG'], 3.2],
  ['Playera estampada', 'Playeras', '👕', 189, ['CH', 'M', 'G'], 4.5],
  ['Blusa casual', 'Playeras', '👚', 199, ['CH', 'M', 'G'], 4.8],
  ['Jeans corte recto', 'Pantalones', '👖', 429, ['28', '30', '32', '34', '36'], 11],
  ['Jogger deportivo', 'Pantalones', '👖', 299, ['CH', 'M', 'G'], 7.5],
  ['Leggins', 'Pantalones', '🩱', 149, ['CH', 'M', 'G'], 3],
  ['Vestido floral', 'Vestidos', '👗', 279, ['CH', 'M', 'G'], 6.5],
  ['Sudadera con capucha', 'Sudaderas y chamarras', '🧥', 389, ['M', 'G', 'XG'], 9.5],
  ['Chamarra acolchada', 'Sudaderas y chamarras', '🧥', 749, ['M', 'G'], 22],
  ['Short deportivo', 'Shorts', '🩳', 179, ['CH', 'M', 'G'], 4],
  ['Tenis de lona', 'Calzado', '👟', 549, ['5', '6', '7', '8', '9'], 15],
  ['Conjunto infantil', 'Niños', '🧸', 169, ['2', '4', '6', '8'], 3.8],
  ['Bolsa de mano', 'Accesorios', '👜', 459, ['Única'], 12],
  ['Gorra béisbol', 'Gorras', '🧢', 199, ['Única'], 4.2]
];

function sembrar(B) {
  if (B.valor('SELECT COUNT(*) FROM usuarios') > 0 || B.valor('SELECT COUNT(*) FROM productos') > 0) return 0;
  const rnd = azar(81), entre = (a, b) => a + rnd() * (b - a), elige = l => l[Math.floor(rnd() * l.length)];
  const hoy = T.hoy(), ahora = T.ahoraISO();
  C.sembrarCategorias(B);

  const duenoId = B.insertar("INSERT INTO usuarios (nombre, rol, pin, color, creado) VALUES ('Ana', 'dueno', ?, '#0ea5e9', ?)", huellaPin('1357'), ahora);
  const vendId = B.insertar("INSERT INTO usuarios (nombre, rol, pin, color, creado) VALUES ('Lupita', 'vendedor', ?, '#ec4899', ?)", huellaPin('2468'), ahora);
  const dueno = { id: duenoId, rol: 'dueno' }, vendedora = { id: vendId, rol: 'vendedor' };
  B.guardarAjuste('tienda', { nombre: 'Outlet Frontera', lema: 'Ropa americana a precio de frontera' });

  /* Dólar: caminata aleatoria de 120 días alrededor de 18.6 */
  const tcDia = new Map(); let v = 18.35;
  B.tx(() => {
    for (let k = 120; k >= 0; k--) {
      const f = T.sumarDias(hoy, -k); const ap = v; v = Math.min(19.6, Math.max(17.6, v + entre(-0.11, 0.12)));
      const mn = Math.min(ap, v) - entre(0, 0.06), mx = Math.max(ap, v) + entre(0, 0.06);
      tcDia.set(f, U.r4(v));
      B.run('INSERT INTO tc_dias (fecha, apertura, cierre, minimo, maximo, muestras, fuente) VALUES (?, ?, ?, ?, ?, ?, ?)', f, U.r4(ap), U.r4(v), U.r4(mn), U.r4(mx), k ? 0 : 1, k ? 'frankfurter' : 'google');
    }
    /* Muestras de hoy cada 15 minutos desde las 7:00 */
    const ap = B.uno('SELECT apertura FROM tc_dias WHERE fecha = ?', hoy).apertura; let x = ap; const p = T.partes();
    for (let m = 7 * 60; m <= p.h * 60 + p.m; m += 15) {
      x = U.r4(x + entre(-0.02, 0.021));
      const hh = String(Math.floor(m / 60)).padStart(2, '0'), mm = String(m % 60).padStart(2, '0');
      B.run('INSERT INTO tc_muestras (t, fecha, valor, fuente) VALUES (?, ?, ?, ?)', T.localAUTC(hoy, `${hh}:${mm}`).toISOString(), hoy, x, 'google');
    }
    const r = B.uno('SELECT MIN(valor) mn, MAX(valor) mx, COUNT(*) n FROM tc_muestras WHERE fecha = ?', hoy);
    if (r.n) { B.run('UPDATE tc_dias SET cierre = ?, minimo = ?, maximo = ?, muestras = ? WHERE fecha = ?', x, Math.min(ap, r.mn), Math.max(ap, r.mx), r.n, hoy); tcDia.set(hoy, x); }
  });

  /* Productos */
  const cats = new Map(B.todos('SELECT id, nombre FROM categorias').map(c => [c.nombre, c.id]));
  const prods = PRODUCTOS.map(([nombre, cat, emoji, precio, tallas, costo]) => {
    const id = C.guardarProducto(B, { nombre, categoriaId: cats.get(cat), emoji, precio, variantes: tallas.map(t => ({ nombre: t })) });
    return { id, nombre, precio, costo, variantes: B.todos('SELECT id, nombre FROM variantes WHERE producto_id = ?', id) };
  });

  /* Cronología: compras en ciertos días y ventas todos los días después de la primera compra */
  const compras = { 45: { proveedor: 'Liquidaciones El Paso', lugar: 'El Paso, TX', factor: 1 }, 30: { proveedor: 'Mayoreo Cielo Vista', lugar: 'El Paso, TX', factor: 0.6 },
    16: { proveedor: 'Liquidaciones El Paso', lugar: 'El Paso, TX', factor: 0.8 }, 5: { proveedor: 'Bodega Montana', lugar: 'El Paso, TX', factor: 0.5 } };
  let ventas = 0;
  for (let k = 45; k >= 0; k--) {
    const f = T.sumarDias(hoy, -k), tcF = tcDia.get(f) || v;
    if (compras[k]) {
      const c = compras[k], renglones = [];
      for (const p of prods) for (const va of p.variantes) {
        const n = Math.round(entre(3, 9) * c.factor * (va.nombre === 'Única' ? 2 : 1)); if (n > 0) renglones.push({ varianteId: va.id, cantidad: n, costo: U.r2(p.costo * entre(0.85, 1.15)) });
      }
      const sub = renglones.reduce((s, r) => s + r.cantidad * r.costo, 0);
      O.registrarCompra(B, { fecha: f, hora: '11:30', proveedor: c.proveedor, lugar: c.lugar, moneda: 'USD', reparto: 'valor', impuesto: U.r2(sub * 0.0825), gastosMxn: Math.round(entre(350, 700)), renglones },
        { valor: tcF, fuente: 'demo' }, U.r4(tcF + 0.35), dueno);
    }
    if (k === 45) continue;
    const esFinde = [0, 6].includes(new Date(f + 'T12:00:00Z').getUTCDay());
    const nVentas = Math.round(entre(3, 9) * (esFinde ? 1.6 : 1) * (k < 14 ? 1.15 : 1));
    for (let i = 0; i < nVentas && (k > 0 || i < 6); i++) {
      const renglones = [], usados = new Set();
      for (let j = 0, n = rnd() < 0.65 ? 1 : (rnd() < 0.7 ? 2 : 3); j < n; j++) {
        const p = elige(prods), va = elige(p.variantes);
        if (usados.has(va.id) || I.existencia(B, va.id) < 1) continue; usados.add(va.id);
        renglones.push({ varianteId: va.id, cantidad: 1, precio: rnd() < 0.15 ? U.r2(p.precio * 0.9) : p.precio });
      }
      if (!renglones.length) continue;
      const metodo = rnd() < 0.55 ? 'efectivo' : rnd() < 0.45 ? 'dolares' : rnd() < 0.6 ? 'tarjeta' : 'transferencia';
      const tcEstado = { valor: tcF, recibir: U.r2(tcF - 0.6) };
      const vta = O.registrarVenta(B, { renglones, metodo, descuento: rnd() < 0.1 ? 20 : 0 }, tcEstado, rnd() < 0.7 ? vendedora : dueno);
      const hora = `${String(10 + Math.floor(rnd() * 10)).padStart(2, '0')}:${String(Math.floor(rnd() * 60)).padStart(2, '0')}`;
      const t = T.localAUTC(f, hora).toISOString();
      B.run('UPDATE ventas SET t = ?, fecha = ?, hora = ? WHERE id = ?', t, f, hora, vta.id);
      ventas++;
      /* Una devolución de vez en cuando */
      if (rnd() < 0.03) { const r = vta.renglones[0]; const d = O.registrarDevolucion(B, { ventaId: vta.id, renglonId: r.id, cantidad: 1, destino: rnd() < 0.7 ? 'inventario' : 'merma', motivo: 'No le quedó' }, dueno); B.run('UPDATE devoluciones SET fecha = ?, t = ? WHERE id = ?', f, t, d.id); B.run("UPDATE mermas SET fecha = ?, t = ? WHERE origen = 'devolucion' AND fecha = ?", f, t, hoy); }
    }
    /* Merma ocasional */
    if (rnd() < 0.08) { const p = elige(prods), va = elige(p.variantes); if (I.existencia(B, va.id) > 0) { const m = O.registrarMerma(B, { varianteId: va.id, cantidad: 1, motivo: elige(['danado', 'robo', 'extravio']) }, dueno); B.run('UPDATE mermas SET fecha = ?, t = ? WHERE id = ?', f, T.localAUTC(f, '18:00').toISOString(), m.id); } }
  }
  /* Gastos del mes */
  const gasto = (dias, concepto, categoria, monto, moneda = 'MXN') => { const f = T.sumarDias(hoy, -dias); O.registrarGasto(B, { fecha: f, concepto, categoria, monto, moneda }, { valor: tcDia.get(f) || v }, dueno); };
  gasto(40, 'Renta del local', 'Renta', 6500); gasto(10, 'Renta del local', 'Renta', 6500); gasto(25, 'Recibo de luz', 'Luz y agua', 780);
  gasto(20, 'Bolsas con logo', 'Bolsas y empaque', 45, 'USD'); gasto(16, 'Gasolina y puente', 'Cruce y gasolina', 420); gasto(5, 'Gasolina y puente', 'Cruce y gasolina', 380);
  return ventas;
}

module.exports = { sembrar };
