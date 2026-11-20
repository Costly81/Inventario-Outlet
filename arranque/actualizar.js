'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   INVENTARIO OUTLET · APLICAR UNA ACTUALIZACIÓN (lo usa el lanzador, con el servidor apagado)

   Cómo funciona «Actualizar el sistema» (Ajustes):
     1. El dueño sube el .zip de la versión nueva. El SERVIDOR lo revisa y lo descomprime en
        datos/actualizacion/pendiente/arbol (servidor/lib/actualizacion.js).
     2. Al tocar «Instalar», el servidor deja datos/actualizacion/orden.json y se detiene con el código 75.
     3. El LANZADOR (este módulo), con el servidor ya apagado:
          a) guarda una copia completa de lo instalado en datos/actualizacion/previa;
          b) sincroniza los archivos nuevos (solo cambia los que son distintos; borra los que ya no existen);
          c) vuelve a encender el servidor y queda «a prueba».
     4. Si el servidor nuevo arranca bien, él mismo confirma la versión. Si se cae antes de confirmar,
        el lanzador regresa solo a la copia previa.
   Nunca se toca la carpeta datos/ (ni .git, ni node_modules).
   ───────────────────────────────────────────────────────────────────────────── */
const fs = require('fs'), path = require('path');

const EXCLUIR = /^(datos.*|\.git|\.github|node_modules|\.DS_Store|entregas|Thumbs\.db)$/i;
const ahora = () => new Date().toISOString();
const quita = p => fs.rmSync(p, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 });
const leerJSON = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return null; } };
function escribirJSON(f, obj) { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(obj, null, 2) + '\n'); fs.renameSync(t, f); }
const versionDe = dir => { try { return fs.readFileSync(path.join(dir, 'VERSION'), 'utf8').trim(); } catch (_) { return null; } };

function rutas(datos) {
  const base = path.join(datos, 'actualizacion');
  return { base, pendiente: path.join(base, 'pendiente'), arbol: path.join(base, 'pendiente', 'arbol'), info: path.join(base, 'pendiente', 'info.json'),
    orden: path.join(base, 'orden.json'), previa: path.join(base, 'previa'), estado: path.join(base, 'estado.json'), historial: path.join(base, 'historial.json') };
}
const leerEstado = datos => leerJSON(rutas(datos).estado) || { estado: 'ninguno' };
const escribirEstado = (datos, e) => escribirJSON(rutas(datos).estado, { ...e, actualizado: ahora() });
function anotar(datos, entrada) {
  const r = rutas(datos), h = leerJSON(r.historial) || [];
  h.unshift({ fecha: ahora(), ...entrada }); escribirJSON(r.historial, h.slice(0, 30));
}

/* Elementos de primer nivel que pertenecen al programa (lo que se respalda y se reemplaza) */
const elementos = dir => fs.readdirSync(dir).filter(n => !EXCLUIR.test(n));

/** Copia completa de lo instalado (para poder volver atrás) */
function fotografia(raiz, destino) {
  quita(destino); fs.mkdirSync(destino, { recursive: true });
  for (const n of elementos(raiz)) fs.cpSync(path.join(raiz, n), path.join(destino, n), { recursive: true, preserveTimestamps: true });
}

/* ¿Dos archivos son iguales? (para no reescribir los que no cambian: así un .bat o .command
   que se está ejecutando en este momento no se toca si su versión nueva es idéntica) */
function iguales(a, b) {
  try { const x = fs.statSync(a), y = fs.statSync(b); if (x.size !== y.size) return false; return fs.readFileSync(a).equals(fs.readFileSync(b)); } catch (_) { return false; }
}
/** Deja `destino` idéntico a `origen` (archivos nuevos o cambiados se copian; los que sobran se borran) */
function sincronizar(origen, destino, raizDestino = true) {
  fs.mkdirSync(destino, { recursive: true });
  const nuevos = new Set(fs.readdirSync(origen).filter(n => !(raizDestino && EXCLUIR.test(n))));
  for (const n of fs.readdirSync(destino)) {
    if (raizDestino && EXCLUIR.test(n)) continue;
    if (!nuevos.has(n)) quita(path.join(destino, n));
  }
  for (const n of nuevos) {
    const o = path.join(origen, n), d = path.join(destino, n), st = fs.lstatSync(o);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) { if (fs.existsSync(d) && !fs.statSync(d).isDirectory()) quita(d); sincronizar(o, d, false); }
    else if (!iguales(o, d)) { if (fs.existsSync(d) && fs.statSync(d).isDirectory()) quita(d); fs.copyFileSync(o, d); }
    try { fs.chmodSync(d, st.mode & 0o777); } catch (_) { }
  }
}

/**
 * Cumple la orden que dejó el servidor (si hay). Devuelve un texto para el registro, o null si no había orden.
 * Se llama con el servidor APAGADO.
 */
function cumplirOrden(raiz, datos) {
  const r = rutas(datos), orden = leerJSON(r.orden);
  if (!fs.existsSync(r.orden)) return null;
  quita(r.orden);                                         // una orden se cumple una sola vez, salga bien o mal
  const desde = versionDe(raiz);
  try {
    if (!orden || !['instalar', 'revertir'].includes(orden.accion)) throw new Error('La orden no se entiende.');
    const origen = orden.accion === 'instalar' ? r.arbol : r.previa;
    const hacia = versionDe(origen);
    if (!hacia || !fs.existsSync(path.join(origen, 'servidor', 'index.js'))) throw new Error(orden.accion === 'instalar' ? 'No hay una versión nueva lista para instalar.' : 'No hay una versión anterior guardada.');
    /* 1) copia de lo actual  2) cambio  3) a prueba */
    const copia = r.previa + '.nueva';
    fotografia(raiz, copia);
    escribirEstado(datos, { estado: 'aplicando', accion: orden.accion, desde, hacia });
    try { sincronizar(origen, raiz); }
    catch (e) { try { sincronizar(copia, raiz); } catch (_) { } quita(copia); throw e; }
    quita(r.previa); fs.renameSync(copia, r.previa);
    if (orden.accion === 'instalar') quita(r.pendiente);
    escribirEstado(datos, { estado: 'probando', accion: orden.accion, desde, hacia, inicio: ahora() });
    return orden.accion === 'instalar' ? `Actualización instalada: ${desde} → ${hacia}. Encendiendo para comprobarla…` : `Se regresó a la versión ${hacia}. Encendiendo…`;
  } catch (e) {
    escribirEstado(datos, { estado: 'fallo', accion: orden && orden.accion, desde, mensaje: e.message });
    anotar(datos, { resultado: 'fallo', desde, texto: 'No se pudo aplicar: ' + e.message });
    return 'No se pudo aplicar la actualización: ' + e.message;
  }
}

/** El servidor nuevo se cayó antes de confirmar: se regresa a la copia previa. Devuelve texto o null. */
function revertirSiFallo(raiz, datos) {
  const e = leerEstado(datos), r = rutas(datos);
  if (e.estado !== 'probando') return null;
  try {
    sincronizar(r.previa, raiz);
    escribirEstado(datos, { estado: 'revertida', desde: e.hacia, hacia: e.desde, mensaje: 'La versión nueva no arrancó.' });
    anotar(datos, { resultado: 'revertida', desde: e.hacia, hacia: e.desde, texto: `La versión ${e.hacia} no arrancó; se regresó sola a la ${e.desde}.` });
    return `La versión ${e.hacia} no arrancó: se regresó a la ${e.desde}.`;
  } catch (er) { return 'No se pudo regresar a la versión anterior: ' + er.message; }
}

/** Lo llama el servidor cuando arrancó bien: la versión deja de estar «a prueba» */
function confirmar(datos) {
  const e = leerEstado(datos); if (e.estado !== 'probando') return false;
  escribirEstado(datos, { ...e, estado: 'confirmada', confirmada: ahora() });
  anotar(datos, { resultado: 'confirmada', desde: e.desde, hacia: e.hacia, texto: e.accion === 'revertir' ? `Se regresó a la versión ${e.hacia}.` : `Se instaló la versión ${e.hacia}.` });
  return true;
}

module.exports = { rutas, leerEstado, escribirJSON, leerJSON, versionDe, anotar, cumplirOrden, revertirSiFallo, confirmar, sincronizar, fotografia, EXCLUIR, CODIGO_ACTUALIZAR: 75 };
