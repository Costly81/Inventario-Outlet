'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   UTILIDADES COMUNES: redondeo de dinero, validación de lo que llega del navegador
   y el tipo de error que se le muestra a la persona (con un mensaje claro).
   ───────────────────────────────────────────────────────────────────────────── */

/* Error pensado para la persona que usa el sistema: el mensaje se muestra tal cual en pantalla. */
class ErrorUsuario extends Error {
  constructor(mensaje, status = 400) { super(mensaje); this.status = status; this.usuario = true; }
}
const falla = (mensaje, status) => { throw new ErrorUsuario(mensaje, status); };

/* Redondeo a centavos sin el error clásico de 1.005 → 1.00 */
const r2 = n => Math.round((+n + Number.EPSILON) * 100) / 100;
/* Tipo de cambio: 4 decimales */
const r4 = n => Math.round((+n + Number.EPSILON) * 10000) / 10000;
/* Costos unitarios de lotes: 6 decimales (un lote de 300 dólares entre 47 piezas no es exacto) */
const r6 = n => Math.round((+n + Number.EPSILON) * 1e6) / 1e6;

/* ---- validadores: devuelven el valor limpio o lanzan ErrorUsuario ---- */
function texto(v, nombre, { max = 120, min = 0, opcional = false } = {}) {
  if (v === undefined || v === null || v === '') { if (opcional || min === 0) return ''; falla(`Falta ${nombre}.`); }
  if (typeof v !== 'string' && typeof v !== 'number') falla(`${nombre} no es válido.`);
  const s = String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (s.length < min) falla(min <= 1 ? `Falta ${nombre}.` : `${nombre} debe tener al menos ${min} caracteres.`);
  if (s.length > max) falla(`${nombre} es demasiado largo (máximo ${max} caracteres).`);
  return s;
}
function numero(v, nombre, { min = -Infinity, max = Infinity, opcional = false, entero = false } = {}) {
  if (v === undefined || v === null || v === '') { if (opcional) return null; falla(`Falta ${nombre}.`); }
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n)) falla(`${nombre} debe ser un número.`);
  if (entero && !Number.isInteger(n)) falla(`${nombre} debe ser un número entero.`);
  if (n < min) falla(`${nombre} no puede ser menor que ${min}.`);
  if (n > max) falla(`${nombre} no puede ser mayor que ${max}.`);
  return n;
}
const entero = (v, nombre, o = {}) => numero(v, nombre, { ...o, entero: true });
function opcion(v, nombre, lista, porOmision) {
  if ((v === undefined || v === null || v === '') && porOmision !== undefined) return porOmision;
  if (!lista.includes(v)) falla(`${nombre} no es una opción válida.`);
  return v;
}
const color = v => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) ? v.toLowerCase() : null;
/* Emoji o símbolo corto para el cuadro del producto (máximo 4 «letras» visibles) */
const emoji = v => { if (typeof v !== 'string') return null; const s = v.trim(); return s && [...s].length <= 4 ? s : null; };

module.exports = { ErrorUsuario, falla, r2, r4, r6, texto, numero, entero, opcion, color, emoji };
