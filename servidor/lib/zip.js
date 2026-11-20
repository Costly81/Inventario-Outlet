'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   LECTOR DE ARCHIVOS .ZIP (sin dependencias; usa zlib, que viene con Node.js).
   Lo usa «Actualizar el sistema» (Ajustes) para abrir el ZIP de una versión nueva.

   Lee el «directorio central» del ZIP (al final del archivo), que es la lista oficial de
   archivos, y de ahí cada archivo. Soporta archivos guardados sin comprimir (método 0) y
   comprimidos con Deflate (método 8), que es lo que producen GitHub, macOS y Windows.
   Rechaza ZIP64, archivos cifrados y enlaces simbólicos.
   ───────────────────────────────────────────────────────────────────────────── */
const zlib = require('zlib');

const FIN_DIRECTORIO = 0x06054b50, ENTRADA_DIRECTORIO = 0x02014b50, ENCABEZADO_LOCAL = 0x04034b50;

/**
 * Lista las entradas de un ZIP.
 * @param {Buffer} buf  el archivo completo
 * @returns {Array<{nombre:string, carpeta:boolean, enlace:boolean, modo:number, bytes:number, leer:function():Buffer}>}
 */
function leer(buf, { maxEntradas = 5000, maxBytes = 200 * 1024 * 1024 } = {}) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) throw new Error('El archivo no es un .zip válido.');
  /* El registro final está en los últimos 22 bytes + comentario (máx. 65 535) */
  let fin = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (buf.readUInt32LE(i) === FIN_DIRECTORIO) { fin = i; break; }
  if (fin < 0) throw new Error('El archivo no es un .zip válido (no se encontró su índice).');
  const total = buf.readUInt16LE(fin + 10), tamDir = buf.readUInt32LE(fin + 12), inicioDir = buf.readUInt32LE(fin + 16);
  if (total === 0xffff || inicioDir === 0xffffffff) throw new Error('El .zip es de un formato no soportado (ZIP64).');
  if (total > maxEntradas) throw new Error('El .zip tiene demasiados archivos.');
  if (inicioDir + tamDir > buf.length) throw new Error('El .zip está incompleto o dañado.');

  const entradas = []; let p = inicioDir, suma = 0;
  for (let k = 0; k < total; k++) {
    if (buf.readUInt32LE(p) !== ENTRADA_DIRECTORIO) throw new Error('El índice del .zip está dañado.');
    const banderas = buf.readUInt16LE(p + 8), metodo = buf.readUInt16LE(p + 10);
    const comprimido = buf.readUInt32LE(p + 20), bytes = buf.readUInt32LE(p + 24);
    const largoNombre = buf.readUInt16LE(p + 28), largoExtra = buf.readUInt16LE(p + 30), largoComentario = buf.readUInt16LE(p + 32);
    const atributos = buf.readUInt32LE(p + 38), local = buf.readUInt32LE(p + 42);
    const nombre = buf.toString((banderas & 0x800) ? 'utf8' : 'latin1', p + 46, p + 46 + largoNombre).replace(/\\/g, '/');
    p += 46 + largoNombre + largoExtra + largoComentario;
    if (banderas & 1) throw new Error('El .zip está protegido con contraseña.');
    const modo = (atributos >>> 16) & 0xffff;
    const enlace = (modo & 0o170000) === 0o120000;
    suma += bytes; if (suma > maxBytes) throw new Error('El contenido del .zip es demasiado grande.');
    entradas.push({
      nombre, carpeta: nombre.endsWith('/'), enlace, modo: modo & 0o777, bytes,
      leer() {
        if (buf.readUInt32LE(local) !== ENCABEZADO_LOCAL) throw new Error(`El archivo «${nombre}» del .zip está dañado.`);
        const ini = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
        const datos = buf.subarray(ini, ini + comprimido);
        let salida;
        if (metodo === 0) salida = Buffer.from(datos);
        else if (metodo === 8) salida = zlib.inflateRawSync(datos, { maxOutputLength: Math.max(bytes, 1) });
        else throw new Error(`El archivo «${nombre}» usa una compresión no soportada (${metodo}).`);
        if (salida.length !== bytes) throw new Error(`El archivo «${nombre}» del .zip está incompleto.`);
        return salida;
      }
    });
  }
  return entradas;
}

module.exports = { leer };
