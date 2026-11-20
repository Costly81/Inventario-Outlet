'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   CONFIGURACIÓN DEL SERVIDOR (lo técnico: puerto, carpeta de datos, red).
   Lo del negocio (nombre de la tienda, margen objetivo, ajustes del dólar…) NO vive
   aquí: vive en la base de datos y se cambia desde la pantalla Ajustes.

   Archivo: datos/configuracion.json (se crea solo la primera vez). Se puede editar a mano.
   Variables de entorno que ganan sobre el archivo (útiles para pruebas):
     IO_DATOS   carpeta de datos            IO_PUERTO   puerto HTTP
     IO_HOST    dirección donde escucha     IO_SIN_RED  "1" = no consultar el dólar en internet
   ───────────────────────────────────────────────────────────────────────────── */
const fs = require('fs'), path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..');

/* Puertos que esta Mac ya usa para otros programas (u otros sistemas del mismo dueño).
   Nunca se toman, aunque el otro programa esté apagado en ese momento. */
const PUERTOS_RESERVADOS = [3000, 3001, 4100, 4101, 5001, 5002, 8787, 8788, 9000, 9001];

const PREDETERMINADA = {
  puerto: 4300,            // http://<ip-de-la-mac>:4300 desde los celulares de la tienda
  host: '0.0.0.0',         // 0.0.0.0 = acepta conexiones de la red local (Wi-Fi), no solo de la Mac
  respaldosDiarios: 30,    // cuántos respaldos automáticos (uno por día) se conservan
  sesionDias: 30           // cuánto dura una sesión abierta en un celular antes de pedir el PIN otra vez
};

const datosDir = () => process.env.IO_DATOS ? path.resolve(process.env.IO_DATOS) : path.join(RAIZ, 'datos');

function leer() {
  const dir = datosDir();
  fs.mkdirSync(dir, { recursive: true });
  const archivo = path.join(dir, 'configuracion.json');
  let guardada = {};
  try { guardada = JSON.parse(fs.readFileSync(archivo, 'utf8')) || {}; }
  catch (e) {
    if (e.code === 'ENOENT') fs.writeFileSync(archivo, JSON.stringify(PREDETERMINADA, null, 2) + '\n');
    else throw new Error('datos/configuracion.json no es un JSON válido: ' + e.message);
  }
  const cfg = { ...PREDETERMINADA, ...guardada };
  if (process.env.IO_PUERTO) cfg.puerto = +process.env.IO_PUERTO;
  if (process.env.IO_HOST) cfg.host = process.env.IO_HOST;
  cfg.sinRed = process.env.IO_SIN_RED === '1';
  cfg.datos = dir;
  cfg.raiz = RAIZ;
  cfg.archivoBD = path.join(dir, 'inventario.sqlite');

  if (!Number.isInteger(cfg.puerto) || cfg.puerto < 1 || cfg.puerto > 65535) throw new Error('El puerto configurado no es válido: ' + cfg.puerto);
  if (PUERTOS_RESERVADOS.includes(cfg.puerto) && process.env.IO_PUERTO === undefined)
    throw new Error(`El puerto ${cfg.puerto} está reservado para otro programa de esta computadora. Elija otro en datos/configuracion.json (por ejemplo 4300).`);
  return cfg;
}

const version = () => { try { return fs.readFileSync(path.join(RAIZ, 'VERSION'), 'utf8').trim(); } catch (_) { return '0.0.0'; } };

module.exports = { leer, datosDir, version, RAIZ, PUERTOS_RESERVADOS, PREDETERMINADA };
