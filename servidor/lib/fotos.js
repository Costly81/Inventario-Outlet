'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   FOTOS DE LOS PRODUCTOS (para que quien vende reconozca la prenda a la primera).

   · El celular toma la foto (cámara o galería), la achica a ~900 px y la manda como JPEG.
   · Aquí se revisa que de verdad sea una imagen (por sus primeros bytes, no por el nombre),
     se guarda en datos/fotos/ con un nombre nuevo cada vez (así el navegador nunca muestra
     una foto vieja de la caché) y se borra la anterior.
   · Se sirven solo a quien tiene sesión: GET /api/fotos/<archivo>.
   ───────────────────────────────────────────────────────────────────────────── */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const U = require('./util.js');

const MAX_BYTES = 4 * 1024 * 1024;
const NOMBRE = /^p\d+-[a-f0-9]{10}\.(jpg|png|webp)$/;

/* Tipo real de la imagen según sus primeros bytes */
function tipoImagen(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function crear({ B, datos }) {
  const carpeta = path.join(datos, 'fotos');

  /** Guarda (o reemplaza) la foto de un producto. Devuelve el nombre del archivo. */
  function guardar(productoId, buf) {
    const p = B.uno('SELECT id, foto FROM productos WHERE id = ?', productoId);
    if (!p) U.falla('No se encontró el producto.', 404);
    if (!Buffer.isBuffer(buf) || !buf.length) U.falla('No llegó ninguna foto.');
    if (buf.length > MAX_BYTES) U.falla('La foto es demasiado grande (máximo 4 MB).', 413);
    const ext = tipoImagen(buf); if (!ext) U.falla('El archivo no es una foto (JPEG, PNG o WebP).');
    fs.mkdirSync(carpeta, { recursive: true });
    const nombre = `p${p.id}-${crypto.randomBytes(5).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(carpeta, nombre), buf);
    B.run('UPDATE productos SET foto = ?, actualizado = ? WHERE id = ?', nombre, new Date().toISOString(), p.id);
    if (p.foto && NOMBRE.test(p.foto)) { try { fs.rmSync(path.join(carpeta, p.foto), { force: true }); } catch (_) { } }
    return nombre;
  }

  function quitar(productoId) {
    const p = B.uno('SELECT id, foto FROM productos WHERE id = ?', productoId);
    if (!p) U.falla('No se encontró el producto.', 404);
    B.run('UPDATE productos SET foto = NULL WHERE id = ?', p.id);
    if (p.foto && NOMBRE.test(p.foto)) { try { fs.rmSync(path.join(carpeta, p.foto), { force: true }); } catch (_) { } }
  }

  /** Ruta segura del archivo (o null) */
  function ruta(nombre) {
    if (!NOMBRE.test(String(nombre))) return null;
    const r = path.join(carpeta, nombre);
    return fs.existsSync(r) ? r : null;
  }

  return { guardar, quitar, ruta, carpeta };
}

module.exports = { crear, tipoImagen, MAX_BYTES };
