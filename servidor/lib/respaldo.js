'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   RESPALDOS DE LA BASE DE DATOS.
   · Automático: uno por día (el primero que toque), en datos/respaldos/. Se conservan los
     últimos N (30 por omisión, ajustable en datos/configuracion.json → respaldosDiarios).
   · Manual: desde Ajustes o desde el menú de arranque (opción «Hacer un respaldo ahora»).
   Cada respaldo es un archivo .sqlite completo: para restaurar, se apaga el sistema y se
   copia sobre datos/inventario.sqlite (ver docs/guia-de-uso.md → Respaldos).
   ───────────────────────────────────────────────────────────────────────────── */
const fs = require('fs'), path = require('path');
const DB = require('./db.js');
const T = require('./tiempo.js');

function crear({ B, datos, conservar = 30, registro = console }) {
  const carpeta = path.join(datos, 'respaldos');

  function listar() {
    try {
      return fs.readdirSync(carpeta).filter(n => /^inventario-.*\.sqlite$/.test(n)).map(n => {
        const st = fs.statSync(path.join(carpeta, n));
        return { nombre: n, bytes: st.size, fecha: st.mtime.toISOString(), manual: !/^inventario-\d{4}-\d{2}-\d{2}\.sqlite$/.test(n) };
      }).sort((a, b) => b.fecha.localeCompare(a.fecha));
    } catch (_) { return []; }
  }

  /** Respaldo manual ahora mismo; devuelve su nombre */
  function ahora(etiqueta = 'manual') {
    const p = T.partes();
    const nombre = `inventario-${p.fecha}-${p.hora.replace(':', '')}-${etiqueta}.sqlite`;
    DB.respaldar(B, path.join(carpeta, nombre));
    return nombre;
  }

  /** Respaldo del día (si todavía no existe) y limpieza de los viejos */
  function diario() {
    try {
      const nombre = `inventario-${T.hoy()}.sqlite`, destino = path.join(carpeta, nombre);
      if (!fs.existsSync(destino)) DB.respaldar(B, destino);
      const diarios = listar().filter(r => !r.manual);
      for (const r of diarios.slice(conservar)) fs.rmSync(path.join(carpeta, r.nombre), { force: true });
      const manuales = listar().filter(r => r.manual);
      for (const r of manuales.slice(20)) fs.rmSync(path.join(carpeta, r.nombre), { force: true });   // máximo 20 manuales
    } catch (e) { registro.warn('  ▲ No se pudo hacer el respaldo diario: ' + e.message); }
  }

  /** Ruta segura de un respaldo por nombre (para descargarlo) */
  function ruta(nombre) {
    if (!/^inventario-[0-9A-Za-z-]+\.sqlite$/.test(String(nombre))) return null;
    const p = path.join(carpeta, nombre);
    return fs.existsSync(p) ? p : null;
  }

  return { listar, ahora, diario, ruta, carpeta };
}

module.exports = { crear };
