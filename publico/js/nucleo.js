/* ─────────────────────────────────────────────────────────────────────────────
   NÚCLEO DE LA PÁGINA: comunicación con el servidor, estado compartido, avisos en vivo
   y formatos (pesos, dólares, fechas) en español de México.
   ───────────────────────────────────────────────────────────────────────────── */

/* ═════════ Estado compartido ═════════
   Un objeto simple con «suscriptores»: cuando algo cambia (el dólar, el catálogo, el carrito),
   las partes de la pantalla que lo usan se vuelven a dibujar. */
export const estado = {
  sesion: null,      // { usuario, csrf, ajustes, red, zona, hoy, ... }
  tc: null,          // dólar en vivo (ver servidor/lib/tipoCambio.js → actual())
  catalogo: null,    // { categorias, productos }
  carrito: [],       // [{ varianteId, productoId, nombre, talla, emoji, color, precio, precioLista, cantidad, existencia }]
  enLinea: true
};
const oyentes = new Map();
/** Escucha un tema ('tc', 'catalogo', 'carrito', 'cambio', 'sesion'…). Devuelve la función para dejar de escuchar. */
export function escuchar(tema, fn) { if (!oyentes.has(tema)) oyentes.set(tema, new Set()); oyentes.get(tema).add(fn); return () => oyentes.get(tema).delete(fn); }
export function avisar(tema, datos) { for (const fn of oyentes.get(tema) || []) { try { fn(datos); } catch (e) { console.error(e); } } }

/* ═════════ Servidor ═════════ */
export class ErrorApi extends Error { constructor(m, status) { super(m); this.status = status; } }

/**
 * Llama a la API. api('/api/ventas', { metodo: 'POST', datos: {...} })
 * Lanza ErrorApi con el mensaje del servidor (listo para mostrarse).
 */
export async function api(ruta, { metodo = 'GET', datos } = {}) {
  const op = { method: metodo, credentials: 'same-origin', headers: {} };
  if (datos !== undefined) { op.headers['Content-Type'] = 'application/json'; op.body = JSON.stringify(datos); }
  if (metodo !== 'GET' && estado.sesion) op.headers['X-CSRF'] = estado.sesion.csrf;
  let r;
  try { r = await fetch(ruta, op); }
  catch (_) { marcarConexion(false); throw new ErrorApi('Sin conexión con la computadora de la tienda. Revise que el celular esté en el mismo Wi-Fi.', 0); }
  marcarConexion(true);
  let j = null; try { j = await r.json(); } catch (_) { }
  if (r.status === 401 && ruta !== '/api/entrar' && ruta !== '/api/instalar') { avisar('sesion-terminada'); }
  if (!r.ok || !j || j.ok === false) throw new ErrorApi((j && j.error) || `Error ${r.status}`, r.status);
  return j;
}
function marcarConexion(si) { if (estado.enLinea !== si) { estado.enLinea = si; avisar('conexion', si); } }

/* ═════════ Avisos en vivo (Server-Sent Events) ═════════ */
let fuente = null;
export function conectarEventos() {
  if (fuente) fuente.close();
  fuente = new EventSource('/api/eventos');
  fuente.addEventListener('tc', e => { estado.tc = JSON.parse(e.data); avisar('tc', estado.tc); });
  fuente.addEventListener('cambio', e => { const d = JSON.parse(e.data); avisar('cambio', d); });
  fuente.onopen = () => marcarConexion(true);
  fuente.onerror = () => { /* el navegador reintenta solo (retry: 4000) */ };
}
export function desconectarEventos() { if (fuente) { fuente.close(); fuente = null; } }

/* ═════════ Catálogo (con caché y recarga cuando alguien cambia algo) ═════════ */
let cargandoCat = null;
export async function cargarCatalogo(forzar = false) {
  if (estado.catalogo && !forzar) return estado.catalogo;
  if (cargandoCat) return cargandoCat;
  cargandoCat = api('/api/catalogo').then(j => { estado.catalogo = { categorias: j.categorias, productos: j.productos }; avisar('catalogo', estado.catalogo); return estado.catalogo; })
    .finally(() => { cargandoCat = null; });
  return cargandoCat;
}

/* ═════════ Formatos ═════════ */
const fMxn0 = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const fMxn2 = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fUsd = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fNum = new Intl.NumberFormat('es-MX');
/** $1,234 (sin centavos si es entero o si dec = false) */
export const mxn = (n, dec) => n == null || isNaN(n) ? '—' : (dec === true || (dec !== false && Math.round(n) !== +(+n).toFixed(2)) ? fMxn2 : fMxn0).format(n);
/** US$12.50 */
export const usd = n => n == null || isNaN(n) ? '—' : (n < 0 ? '−' : '') + 'US$' + fUsd.format(Math.abs(n));
/** $18.6246 → $18.62 (o 4 decimales si se pide) */
export const tcFmt = (n, d = 2) => n == null ? '—' : '$' + (+n).toFixed(d);
export const num = n => n == null ? '—' : fNum.format(n);
export const pct = (n, signo = false) => n == null || isNaN(n) ? '—' : (signo && n > 0 ? '+' : '') + (+n).toFixed(Math.abs(n) < 10 ? 1 : 0).replace('-', '−') + ' %';
/** Variación entre dos valores en % (null si no se puede) */
export const variacion = (actual, antes) => antes ? (actual / antes - 1) * 100 : (actual ? null : 0);

const zona = () => (estado.sesion && estado.sesion.zona) || 'America/Ciudad_Juarez';
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'], MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function hoyLocal() { return new Intl.DateTimeFormat('en-CA', { timeZone: zona(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
export function sumarDias(f, n) { const [a, m, d] = f.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10); }
/** '2026-11-19' → 'hoy' | 'ayer' | 'lun 17 nov' | '17 nov 2025' */
export function fechaCorta(f) {
  if (!f) return '—'; const h = hoyLocal();
  if (f === h) return 'hoy'; if (f === sumarDias(h, -1)) return 'ayer';
  const [a, m, d] = f.split('-').map(Number), dia = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return a === +h.slice(0, 4) ? `${DIAS[dia]} ${d} ${MESES[m - 1]}` : `${d} ${MESES[m - 1]} ${a}`;
}
export const fechaLarga = f => { if (!f) return '—'; const [a, m, d] = f.split('-').map(Number); return `${d} de ${['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][m - 1]} de ${a}`; };
/** Instante ISO → '7:45 pm' en la hora de la tienda */
export const horaDe = iso => iso ? new Intl.DateTimeFormat('es-MX', { timeZone: zona(), hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) : '—';
/** 'hace 3 min' */
export function haceCuanto(iso) {
  if (!iso) return 'nunca'; const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 50) return 'hace un momento'; if (s < 3600) return `hace ${Math.round(s / 60)} min`; if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return `hace ${Math.round(s / 86400)} días`;
}
export const hora24a12 = h => { if (!h) return ''; const [x, m] = h.split(':').map(Number); return `${x % 12 || 12}:${String(m).padStart(2, '0')} ${x < 12 ? 'am' : 'pm'}`; };

/* ═════════ Utilidades ═════════ */
/** Escapa texto para insertarlo en HTML (todo lo que viene de datos pasa por aquí) */
export function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
export const retrasar = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
/** Vibración corta del celular (si lo permite) */
export const vibrar = (ms = 12) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (_) { } };
export const esDueno = () => estado.sesion && estado.sesion.usuario.rol === 'dueno';
export const esPC = () => matchMedia('(min-width: 900px)').matches;
export const sinMovimiento = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const iniciales = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
/** Nombre legible de un motivo de merma o método de pago */
export const NOMBRES = {
  metodo: { efectivo: 'Efectivo', dolares: 'Dólares', tarjeta: 'Tarjeta', transferencia: 'Transferencia' },
  metodoEmoji: { efectivo: '💵', dolares: '🇺🇸', tarjeta: '💳', transferencia: '📲' },
  merma: { danado: 'Dañada', robo: 'Robo', extravio: 'Extravío', uso: 'Uso propio', regalo: 'Regalo', faltante: 'Faltante en conteo', otro: 'Otro' },
  fuente: { google: 'Google Finanzas', yahoo: 'Yahoo Finanzas', banxico: 'Banxico (FIX)', erapi: 'ExchangeRate-API', frankfurter: 'Frankfurter (BCE)', manual: 'Manual', demo: 'Demostración', auto: 'Automático' }
};
