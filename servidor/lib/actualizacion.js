'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   ACTUALIZAR EL SISTEMA DESDE AJUSTES (parte del servidor).

   1. preparar(zip): revisa el .zip que subió el dueño (que sea de Inventario Outlet, que la versión
      sea más nueva, que no traiga rutas peligrosas) y lo descomprime en datos/actualizacion/pendiente.
   2. ordenar('instalar' | 'revertir'): deja la orden para el lanzador. Después, el servidor se detiene
      con el código 75 y el lanzador hace el cambio con el servidor apagado (arranque/actualizar.js).
   El .zip es el que publica GitHub en cada Release (inventario-outlet-vX.Y.Z.zip), o uno equivalente.
   ───────────────────────────────────────────────────────────────────────────── */
const fs = require('fs'), path = require('path');
const ZIP = require('./zip.js');
const U = require('./util.js');
const ACT = require('../../arranque/actualizar.js');

const SEMVER = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
const OBLIGATORIOS = ['VERSION', 'package.json', 'servidor/index.js', 'arranque/lanzador.js', 'publico/index.html'];
const comparar = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; return 0; };

/* Sección de una versión en un CHANGELOG (para mostrar «qué trae» antes de instalar) */
function novedadesDe(changelog, version) {
  const lineas = String(changelog || '').split(/\r?\n/), salida = []; let dentro = false;
  for (const l of lineas) {
    if (l.startsWith('## ')) { if (dentro) break; dentro = l.startsWith(`## ${version} `) || l.trim() === `## ${version}`; continue; }
    if (dentro) salida.push(l);
  }
  return salida.join('\n').trim();
}

function crear({ raiz, datos, version }) {
  const R = ACT.rutas(datos);

  /** Revisa y descomprime el .zip. Devuelve { version, actual, novedades }. */
  function preparar(buf) {
    let entradas;
    try { entradas = ZIP.leer(buf); } catch (e) { U.falla(e.message); }
    /* Se ignoran los archivos ocultos que agregan macOS (__MACOSX, .DS_Store) */
    entradas = entradas.filter(e => !/(^|\/)(__MACOSX|\.DS_Store)(\/|$)/.test(e.nombre));
    /* ¿Todo viene dentro de una carpeta? (los ZIP de GitHub traen «inventario-outlet/») */
    const archivos = entradas.filter(e => !e.carpeta);
    if (!archivos.length) U.falla('El .zip está vacío.');
    let prefijo = '';
    const primero = archivos[0].nombre.split('/')[0];
    if (archivos.every(e => e.nombre.startsWith(primero + '/'))) prefijo = primero + '/';
    const mapa = new Map();
    for (const e of archivos) {
      const rel = e.nombre.slice(prefijo.length);
      if (!rel || rel.startsWith('/') || rel.split('/').some(p => p === '..' || p === '.' || p === '') || /[:<>|"?*\u0000-\u001f]/.test(rel)) U.falla(`El .zip trae una ruta no permitida: ${e.nombre.slice(0, 80)}`);
      if (e.enlace) U.falla('El .zip trae un enlace simbólico; no se puede instalar.');
      if (ACT.EXCLUIR.test(rel.split('/')[0])) continue;                  // nunca trae datos/
      mapa.set(rel, e);
    }
    for (const o of OBLIGATORIOS) if (!mapa.has(o)) U.falla(`Este .zip no es una versión de Inventario Outlet (le falta ${o}). Use el archivo inventario-outlet-vX.Y.Z.zip de la Release.`);
    let paquete; try { paquete = JSON.parse(mapa.get('package.json').leer().toString('utf8')); } catch (_) { U.falla('El package.json del .zip no se puede leer.'); }
    if (paquete.name !== 'inventario-outlet') U.falla('Este .zip es de otro programa, no de Inventario Outlet.');
    const nueva = mapa.get('VERSION').leer().toString('utf8').trim();
    if (!SEMVER.test(nueva)) U.falla('La versión del .zip no es válida.');
    if (comparar(nueva, version) <= 0) U.falla(`La versión del .zip (${nueva}) no es más nueva que la instalada (${version}).`);
    const minimo = paquete.engines && /(\d+)\.(\d+)/.exec(paquete.engines.node || '');
    if (minimo) { const [a, b] = process.versions.node.split('.').map(Number); if (a < +minimo[1] || (a === +minimo[1] && b < +minimo[2])) U.falla(`La versión ${nueva} necesita Node.js ${minimo[1]}.${minimo[2]} o más reciente (esta computadora tiene ${process.versions.node}).`); }

    /* Descomprimir en una carpeta limpia */
    fs.rmSync(R.pendiente, { recursive: true, force: true });
    for (const [rel, e] of mapa) {
      const destino = path.join(R.arbol, ...rel.split('/'));
      if (!destino.startsWith(R.arbol + path.sep)) U.falla('Ruta no permitida en el .zip.');
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.writeFileSync(destino, e.leer());
      if (e.modo & 0o111) { try { fs.chmodSync(destino, 0o755); } catch (_) { } }     // iniciar.command debe seguir siendo ejecutable
    }
    const cl = mapa.get('CHANGELOG.md');
    const info = { version: nueva, actual: version, novedades: cl ? novedadesDe(cl.leer().toString('utf8'), nueva) : '', archivos: mapa.size, subido: new Date().toISOString() };
    ACT.escribirJSON(R.info, info);
    return info;
  }

  /** Estado para la pantalla de Ajustes */
  function estado() {
    const pendiente = ACT.leerJSON(R.info);
    return {
      version, puede: !!process.connected,   // solo se puede instalar si el servidor corre bajo el lanzador
      pendiente: pendiente && fs.existsSync(R.arbol) ? pendiente : null,
      previa: ACT.versionDe(R.previa),
      ultimo: ACT.leerEstado(datos),
      historial: (ACT.leerJSON(R.historial) || []).slice(0, 10)
    };
  }

  /** Deja la orden para el lanzador (el servidor se detiene después de responder) */
  function ordenar(accion) {
    if (!process.connected) U.falla('El sistema no se encendió con iniciar.command / iniciar.bat, así que no se puede actualizar desde aquí.', 409);
    if (accion === 'instalar' && !(fs.existsSync(R.arbol) && ACT.leerJSON(R.info))) U.falla('Primero suba el .zip de la versión nueva.', 409);
    if (accion === 'revertir' && !ACT.versionDe(R.previa)) U.falla('No hay una versión anterior guardada.', 409);
    ACT.escribirJSON(R.orden, { accion, t: new Date().toISOString() });
  }

  const descartar = () => fs.rmSync(R.pendiente, { recursive: true, force: true });
  const confirmar = () => ACT.confirmar(datos);

  return { preparar, estado, ordenar, descartar, confirmar };
}

module.exports = { crear, novedadesDe, comparar };
