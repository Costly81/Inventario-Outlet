'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   BASE DE DATOS (SQLite integrado en Node.js: no hay nada que instalar).

   Archivo: datos/inventario.sqlite. Se puede abrir con cualquier visor de SQLite
   (por ejemplo «DB Browser for SQLite») para revisar o exportar.

   Ideas clave del modelo:
   · Un PRODUCTO (ej. «Playera Nike») tiene una o varias VARIANTES (tallas: CH, M, G… o «Única»).
     Todo lo que entra o sale del inventario se cuenta por variante.
   · Cada COMPRA crea LOTES: «llegaron 12 piezas de esta variante, cada una costó X dólares
     y X pesos, con el dólar a tal precio». Los lotes se van gastando del más viejo al más nuevo
     (FIFO: primero en entrar, primero en salir). Así cada pieza vendida sabe su costo real.
   · Un CONSUMO une una salida (venta, merma, ajuste) con el lote del que salió. Si la pieza
     se devuelve, regresa al mismo lote, con el mismo costo.
   · El dinero se guarda en pesos (MXN) y en dólares (USD) al mismo tiempo, con el tipo de
     cambio de ese momento, para poder comparar en las dos monedas sin recalcular la historia.

   Las MIGRACIONES se aplican solas al arrancar, en orden; nunca se edita una ya publicada:
   para cambiar algo se agrega una nueva al final de la lista.
   ───────────────────────────────────────────────────────────────────────────── */
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs'), path = require('path');

const MIGRACIONES = [
  /* 1 · versión 1.0.0 */ `
  CREATE TABLE meta (clave TEXT PRIMARY KEY, valor TEXT NOT NULL);
  CREATE TABLE ajustes (clave TEXT PRIMARY KEY, valor TEXT NOT NULL);

  -- Personas que entran al sistema. rol: 'dueno' (todo) o 'vendedor' (vender, devolver, ver existencias).
  CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, rol TEXT NOT NULL CHECK (rol IN ('dueno','vendedor')),
    pin TEXT NOT NULL, color TEXT, activo INTEGER NOT NULL DEFAULT 1, creado TEXT NOT NULL);
  CREATE TABLE sesiones (
    token TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id), csrf TEXT NOT NULL,
    creado INTEGER NOT NULL, expira INTEGER NOT NULL, ultimo INTEGER NOT NULL, agente TEXT);
  CREATE TABLE intentos (t INTEGER NOT NULL, ip TEXT NOT NULL);
  CREATE INDEX intentos_t ON intentos(t);

  -- Catálogo
  CREATE TABLE categorias (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL UNIQUE, emoji TEXT, color TEXT, orden INTEGER NOT NULL DEFAULT 0, activo INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE productos (
    id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, categoria_id INTEGER REFERENCES categorias(id),
    emoji TEXT, color TEXT, precio REAL NOT NULL DEFAULT 0, minimo INTEGER, notas TEXT,
    activo INTEGER NOT NULL DEFAULT 1, creado TEXT NOT NULL, actualizado TEXT);
  CREATE TABLE variantes (
    id INTEGER PRIMARY KEY, producto_id INTEGER NOT NULL REFERENCES productos(id), nombre TEXT NOT NULL,
    precio REAL, orden INTEGER NOT NULL DEFAULT 0, activo INTEGER NOT NULL DEFAULT 1, UNIQUE (producto_id, nombre));
  CREATE TABLE proveedores (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL UNIQUE, lugar TEXT, notas TEXT);

  -- Compras (normalmente en dólares, en Estados Unidos)
  CREATE TABLE compras (
    id INTEGER PRIMARY KEY, folio INTEGER NOT NULL, t TEXT NOT NULL, fecha TEXT NOT NULL, hora TEXT,
    proveedor_id INTEGER REFERENCES proveedores(id), moneda TEXT NOT NULL CHECK (moneda IN ('USD','MXN')),
    subtotal REAL NOT NULL, impuesto REAL NOT NULL DEFAULT 0, gastos_usd REAL NOT NULL DEFAULT 0, gastos_mxn REAL NOT NULL DEFAULT 0,
    tc_mercado REAL, tc_fuente TEXT, tc_pagado REAL NOT NULL,
    total_usd REAL NOT NULL, total_mxn REAL NOT NULL, piezas INTEGER NOT NULL, reparto TEXT NOT NULL DEFAULT 'valor',
    notas TEXT, usuario_id INTEGER, anulada INTEGER NOT NULL DEFAULT 0, creado TEXT NOT NULL);
  CREATE INDEX compras_fecha ON compras(fecha);

  -- Lotes de existencias: de dónde salió cada pieza y cuánto costó (ya con impuestos y gastos repartidos)
  CREATE TABLE lotes (
    id INTEGER PRIMARY KEY, compra_id INTEGER REFERENCES compras(id), variante_id INTEGER NOT NULL REFERENCES variantes(id),
    origen TEXT NOT NULL DEFAULT 'compra', fecha TEXT NOT NULL, t TEXT NOT NULL,
    cantidad INTEGER NOT NULL, disponible INTEGER NOT NULL, costo_usd REAL NOT NULL, costo_mxn REAL NOT NULL, tc REAL NOT NULL);
  CREATE INDEX lotes_variante ON lotes(variante_id, disponible);

  -- Ventas (en pesos; se pueden cobrar en dólares)
  CREATE TABLE ventas (
    id INTEGER PRIMARY KEY, folio INTEGER NOT NULL, clave TEXT UNIQUE, t TEXT NOT NULL, fecha TEXT NOT NULL, hora TEXT,
    usuario_id INTEGER, piezas INTEGER NOT NULL, subtotal REAL NOT NULL, descuento REAL NOT NULL DEFAULT 0, total REAL NOT NULL,
    metodo TEXT NOT NULL, moneda_pago TEXT NOT NULL DEFAULT 'MXN', recibido REAL, cambio REAL,
    tc_mercado REAL, tc_cobro REAL, total_usd REAL, costo_mxn REAL NOT NULL DEFAULT 0, costo_usd REAL NOT NULL DEFAULT 0,
    notas TEXT, anulada INTEGER NOT NULL DEFAULT 0);
  CREATE INDEX ventas_fecha ON ventas(fecha);
  CREATE TABLE renglones (
    id INTEGER PRIMARY KEY, venta_id INTEGER NOT NULL REFERENCES ventas(id), variante_id INTEGER NOT NULL REFERENCES variantes(id),
    cantidad INTEGER NOT NULL, precio REAL NOT NULL, importe REAL NOT NULL, neto REAL NOT NULL,
    costo_mxn REAL NOT NULL DEFAULT 0, costo_usd REAL NOT NULL DEFAULT 0, devueltas INTEGER NOT NULL DEFAULT 0);
  CREATE INDEX renglones_venta ON renglones(venta_id);
  CREATE INDEX renglones_variante ON renglones(variante_id);

  -- De qué lote salió cada pieza (tipo: 'venta' → renglones.id, 'merma' → mermas.id)
  CREATE TABLE consumos (
    id INTEGER PRIMARY KEY, tipo TEXT NOT NULL, ref_id INTEGER NOT NULL, lote_id INTEGER NOT NULL REFERENCES lotes(id),
    cantidad INTEGER NOT NULL, devuelto INTEGER NOT NULL DEFAULT 0, costo_usd REAL NOT NULL, costo_mxn REAL NOT NULL);
  CREATE INDEX consumos_ref ON consumos(tipo, ref_id);

  CREATE TABLE devoluciones (
    id INTEGER PRIMARY KEY, venta_id INTEGER NOT NULL REFERENCES ventas(id), renglon_id INTEGER NOT NULL REFERENCES renglones(id),
    t TEXT NOT NULL, fecha TEXT NOT NULL, cantidad INTEGER NOT NULL, reembolso REAL NOT NULL, destino TEXT NOT NULL,
    motivo TEXT, costo_mxn REAL NOT NULL DEFAULT 0, costo_usd REAL NOT NULL DEFAULT 0, usuario_id INTEGER);
  CREATE INDEX devoluciones_fecha ON devoluciones(fecha);

  -- Merma: piezas que se pierden (dañadas, robo, extravío, uso propio, faltante en conteo)
  CREATE TABLE mermas (
    id INTEGER PRIMARY KEY, t TEXT NOT NULL, fecha TEXT NOT NULL, variante_id INTEGER NOT NULL REFERENCES variantes(id),
    cantidad INTEGER NOT NULL, motivo TEXT NOT NULL, notas TEXT, costo_mxn REAL NOT NULL DEFAULT 0, costo_usd REAL NOT NULL DEFAULT 0,
    origen TEXT NOT NULL DEFAULT 'manual', usuario_id INTEGER);
  CREATE INDEX mermas_fecha ON mermas(fecha);

  -- Conteo físico del inventario (comparar lo que hay en el estante con lo que dice el sistema)
  CREATE TABLE conteos (
    id INTEGER PRIMARY KEY, t TEXT NOT NULL, fecha TEXT NOT NULL, usuario_id INTEGER, notas TEXT,
    piezas_sistema INTEGER NOT NULL, piezas_contadas INTEGER NOT NULL, faltantes INTEGER NOT NULL, sobrantes INTEGER NOT NULL);
  CREATE TABLE conteo_renglones (conteo_id INTEGER NOT NULL REFERENCES conteos(id), variante_id INTEGER NOT NULL, sistema INTEGER NOT NULL, contado INTEGER NOT NULL);

  -- Gastos de operación (renta, luz, bolsas, gasolina del cruce…)
  CREATE TABLE gastos (
    id INTEGER PRIMARY KEY, t TEXT NOT NULL, fecha TEXT NOT NULL, concepto TEXT NOT NULL, categoria TEXT,
    monto REAL NOT NULL, moneda TEXT NOT NULL, tc REAL NOT NULL, monto_mxn REAL NOT NULL, monto_usd REAL NOT NULL, usuario_id INTEGER);
  CREATE INDEX gastos_fecha ON gastos(fecha);

  -- Tipo de cambio: cada consulta (muestra) y un resumen por día local
  CREATE TABLE tc_muestras (id INTEGER PRIMARY KEY, t TEXT NOT NULL, fecha TEXT NOT NULL, valor REAL NOT NULL, fuente TEXT NOT NULL);
  CREATE INDEX tc_muestras_t ON tc_muestras(t);
  CREATE TABLE tc_dias (fecha TEXT PRIMARY KEY, apertura REAL NOT NULL, cierre REAL NOT NULL, minimo REAL NOT NULL, maximo REAL NOT NULL, muestras INTEGER NOT NULL, fuente TEXT);

  CREATE TABLE bitacora (id INTEGER PRIMARY KEY AUTOINCREMENT, t TEXT NOT NULL, usuario_id INTEGER, evento TEXT NOT NULL, detalle TEXT);
  `,
  /* 2 · versión 1.2.0: foto de cada producto (nombre del archivo en datos/fotos/) */ `
  ALTER TABLE productos ADD COLUMN foto TEXT;
  `
];

/* Abre (o crea) la base y aplica las migraciones pendientes. Devuelve un objeto con atajos. */
function abrir(archivo) {
  if (archivo !== ':memory:') fs.mkdirSync(path.dirname(archivo), { recursive: true });
  const db = new DatabaseSync(archivo);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
  const v = db.prepare('PRAGMA user_version').get().user_version;
  if (v > MIGRACIONES.length) throw new Error(`La base de datos es de una versión más nueva del programa (esquema ${v}). Instale la versión más reciente.`);
  for (let k = v; k < MIGRACIONES.length; k++) {
    db.exec('BEGIN');
    try { db.exec(MIGRACIONES[k]); db.exec(`PRAGMA user_version = ${k + 1}`); db.exec('COMMIT'); }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  }

  /* Caché de sentencias preparadas: cada SQL se prepara una sola vez */
  const cache = new Map();
  const prep = sql => { let s = cache.get(sql); if (!s) { s = db.prepare(sql); cache.set(sql, s); } return s; };

  const B = {
    db,
    archivo,
    /** Una fila (o undefined) */
    uno: (sql, ...p) => prep(sql).get(...p),
    /** Todas las filas */
    todos: (sql, ...p) => prep(sql).all(...p),
    /** Ejecuta; devuelve { changes, lastInsertRowid } */
    run: (sql, ...p) => prep(sql).run(...p),
    /** Inserta y devuelve el id nuevo como número */
    insertar: (sql, ...p) => Number(prep(sql).run(...p).lastInsertRowid),
    /** Valor de la primera columna de la primera fila */
    valor: (sql, ...p) => { const r = prep(sql).get(...p); return r ? Object.values(r)[0] : undefined; },
    /** Transacción: todo o nada. Si fn lanza un error, nada de lo que hizo queda guardado. */
    tx(fn) {
      if (B._enTx) return fn();               // transacciones anidadas: se unen a la de afuera
      db.exec('BEGIN IMMEDIATE'); B._enTx = true;
      try { const r = fn(); db.exec('COMMIT'); return r; }
      catch (e) { try { db.exec('ROLLBACK'); } catch (_) { } throw e; }
      finally { B._enTx = false; }
    },
    _enTx: false,
    cerrar: () => { try { db.close(); } catch (_) { } }
  };

  /* Ajustes del negocio: JSON por clave */
  B.ajuste = (clave, porOmision) => { const r = B.uno('SELECT valor FROM ajustes WHERE clave = ?', clave); if (!r) return porOmision; try { return JSON.parse(r.valor); } catch (_) { return porOmision; } };
  B.guardarAjuste = (clave, valor) => B.run('INSERT INTO ajustes (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor', clave, JSON.stringify(valor));
  B.meta = clave => B.valor('SELECT valor FROM meta WHERE clave = ?', clave);
  B.guardarMeta = (clave, valor) => B.run('INSERT INTO meta (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor', clave, String(valor));
  /* Bitácora: qué pasó, quién y cuándo (para revisar después) */
  B.anotar = (usuarioId, evento, detalle) => B.run('INSERT INTO bitacora (t, usuario_id, evento, detalle) VALUES (?, ?, ?, ?)', new Date().toISOString(), usuarioId || null, evento, detalle == null ? null : typeof detalle === 'string' ? detalle : JSON.stringify(detalle));

  return B;
}

/* Copia de seguridad consistente (aunque el sistema esté en uso) con VACUUM INTO */
function respaldar(B, destino) {
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  try { fs.rmSync(destino, { force: true }); } catch (_) { }
  B.db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
  return destino;
}

module.exports = { abrir, respaldar, ESQUEMA: MIGRACIONES.length };
