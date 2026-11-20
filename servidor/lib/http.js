'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   UTILIDADES HTTP SIN DEPENDENCIAS: respuestas JSON, lectura del cuerpo, cookies,
   archivos estáticos (con compresión y caché), encabezados de seguridad y un
   enrutador pequeño (método + ruta con parámetros, por ejemplo /api/ventas/:id).
   ───────────────────────────────────────────────────────────────────────────── */
const fs = require('fs'), path = require('path'), zlib = require('zlib');

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8'
};
const COMPRIMIBLES = new Set(['.html', '.js', '.css', '.json', '.svg', '.webmanifest', '.txt', '.csv']);

/* Lo devuelve una ruta que ya respondió por su cuenta (descargas, eventos en vivo) */
const SIN_RESPUESTA = Symbol('sin-respuesta');

const esLocal = req => { const a = req.socket.remoteAddress || ''; return a === '::1' || a === '127.0.0.1' || a.startsWith('::ffff:127.'); };
const ip = req => (req.socket.remoteAddress || '').replace(/^::ffff:/, '');

/* Encabezados de seguridad: solo se ejecuta código de este mismo servidor, sin marcos ni recursos externos */
function seguridad(res) {
  res.setHeader('Content-Security-Policy', ["default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
    "connect-src 'self'", "font-src 'self' data:", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'", "object-src 'none'", "manifest-src 'self'"].join('; '));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
}

function enviar(req, res, status, cuerpo, tipo, extra = {}) {
  const buf = Buffer.isBuffer(cuerpo) ? cuerpo : Buffer.from(String(cuerpo));
  const h = { 'Content-Type': tipo, ...extra };
  const comprimir = extra.__comprimir; delete h.__comprimir;
  if (comprimir && buf.length > 1024 && /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) {
    const z = zlib.gzipSync(buf, { level: 6 });
    h['Content-Encoding'] = 'gzip'; h['Vary'] = 'Accept-Encoding'; h['Content-Length'] = z.length;
    res.writeHead(status, h); return res.end(req.method === 'HEAD' ? undefined : z);
  }
  h['Content-Length'] = buf.length; res.writeHead(status, h); res.end(req.method === 'HEAD' ? undefined : buf);
}
const json = (req, res, status, obj, extra = {}) => enviar(req, res, status, JSON.stringify(obj), TIPOS['.json'], { 'Cache-Control': 'no-store', __comprimir: true, ...extra });
const error = (req, res, status, mensaje) => json(req, res, status, { ok: false, error: mensaje });

/* Lee el cuerpo JSON de la petición (máximo `max` bytes) */
function leerJSON(req, max = 512 * 1024) {
  return new Promise((ok, mal) => {
    let n = 0; const partes = [];
    req.on('data', c => { n += c.length; if (n > max) { mal(Object.assign(new Error('La información enviada es demasiado grande.'), { status: 413, usuario: true })); req.destroy(); } else partes.push(c); });
    req.on('end', () => {
      if (!partes.length) return ok({});
      try { ok(JSON.parse(Buffer.concat(partes).toString('utf8'))); }
      catch (_) { mal(Object.assign(new Error('La información enviada no es válida.'), { status: 400, usuario: true })); }
    });
    req.on('error', mal);
  });
}

/* Lee el cuerpo tal cual (fotos y el .zip de una actualización) */
function leerBinario(req, max) {
  return new Promise((ok, mal) => {
    let n = 0, cortado = false; const partes = [];
    req.on('data', c => { if (cortado) return; n += c.length; if (n > max) { cortado = true; mal(Object.assign(new Error(`El archivo es demasiado grande (máximo ${Math.round(max / 1048576)} MB).`), { status: 413, usuario: true })); } else partes.push(c); });
    req.on('end', () => { if (!cortado) ok(Buffer.concat(partes)); });
    req.on('error', mal);
  });
}

function cookies(req) {
  const out = {};
  for (const par of String(req.headers.cookie || '').split(';')) { const i = par.indexOf('='); if (i > 0) out[par.slice(0, i).trim()] = decodeURIComponent(par.slice(i + 1).trim()); }
  return out;
}
function ponerCookie(res, nombre, valor, maxAgeSeg) {
  const c = `${nombre}=${encodeURIComponent(valor)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeg}`;
  const prev = res.getHeader('Set-Cookie'); res.setHeader('Set-Cookie', prev ? [].concat(prev, c) : c);
}

/* Archivos estáticos de la carpeta publico/. index.html sin caché (para que una versión nueva se vea al instante); lo demás con validación por fecha. */
function estatico(req, res, raiz, ruta) {
  let rel = decodeURIComponent(ruta.split('?')[0]);
  if (rel === '/' || !path.extname(rel)) rel = '/index.html';           // rutas de la aplicación (#/...) → index.html
  const archivo = path.normalize(path.join(raiz, rel));
  if (!archivo.startsWith(raiz + path.sep)) return error(req, res, 403, 'Ruta no permitida.');
  let st; try { st = fs.statSync(archivo); } catch (_) { return error(req, res, 404, 'No encontrado.'); }
  if (!st.isFile()) return error(req, res, 404, 'No encontrado.');
  const ext = path.extname(archivo).toLowerCase(), mod = st.mtime.toUTCString();
  const cache = ext === '.html' ? 'no-cache' : 'public, max-age=300, must-revalidate';
  if (req.headers['if-modified-since'] === mod) { res.writeHead(304, { 'Last-Modified': mod, 'Cache-Control': cache }); return res.end(); }
  enviar(req, res, 200, fs.readFileSync(archivo), TIPOS[ext] || 'application/octet-stream', { 'Last-Modified': mod, 'Cache-Control': cache, __comprimir: COMPRIMIBLES.has(ext) });
}

/* Enrutador: rutas como '/api/ventas/:id' → { id: '12' } */
function enrutador() {
  const rutas = [];
  const agregar = (metodo, patron, fn, opciones = {}) => {
    const nombres = []; const re = new RegExp('^' + patron.replace(/:[a-zA-Z]+/g, m => { nombres.push(m.slice(1)); return '([^/]+)'; }) + '$');
    rutas.push({ metodo, re, nombres, fn, opciones });
  };
  const buscar = (metodo, ruta) => {
    for (const r of rutas) {
      if (r.metodo !== metodo && !(metodo === 'HEAD' && r.metodo === 'GET')) continue;
      const m = r.re.exec(ruta); if (!m) continue;
      const params = {}; r.nombres.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
      return { ...r, params };
    }
    return null;
  };
  const existeRuta = ruta => rutas.some(r => r.re.test(ruta));
  return { get: (p, f, o) => agregar('GET', p, f, o), post: (p, f, o) => agregar('POST', p, f, o), put: (p, f, o) => agregar('PUT', p, f, o), delete: (p, f, o) => agregar('DELETE', p, f, o), buscar, existeRuta };
}

/* CSV para Excel: separador coma, BOM UTF-8 para que Excel respete los acentos */
function csv(filas, columnas) {
  const esc = v => { if (v === null || v === undefined) return ''; const s = String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const lineas = [columnas.map(c => esc(c[1])).join(',')];
  for (const f of filas) lineas.push(columnas.map(c => esc(typeof c[0] === 'function' ? c[0](f) : f[c[0]])).join(','));
  return '﻿' + lineas.join('\r\n') + '\r\n';
}

module.exports = { SIN_RESPUESTA, TIPOS, esLocal, ip, seguridad, enviar, json, error, leerJSON, leerBinario, cookies, ponerCookie, estatico, enrutador, csv };
