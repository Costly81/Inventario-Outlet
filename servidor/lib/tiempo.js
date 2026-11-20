'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   FECHAS Y HORAS EN LA ZONA DE LA TIENDA.
   Todo se guarda en dos formas:
     · t      → instante exacto en UTC (ISO 8601), para ordenar y no perder precisión.
     · fecha  → el día LOCAL de la tienda (AAAA-MM-DD), para agrupar «hoy», «ayer», «este mes».
   La zona por omisión es America/Ciudad_Juarez (se cambia en Ajustes). Usa Intl, que viene
   integrado en Node.js, así que respeta horario de verano y cambios de ley sin hacer nada.
   ───────────────────────────────────────────────────────────────────────────── */

let ZONA = 'America/Ciudad_Juarez';
const fmtCache = new Map();

/* Cambia la zona (desde Ajustes). Si no es válida, se queda la anterior y avisa con un Error. */
function usarZona(z) {
  try { new Intl.DateTimeFormat('en-CA', { timeZone: z }).format(new Date()); }
  catch (_) { throw new Error('Zona horaria no válida: ' + z); }
  ZONA = z; fmtCache.clear();
}
const zona = () => ZONA;

function formateador() {
  if (!fmtCache.has(ZONA)) fmtCache.set(ZONA, new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }));
  return fmtCache.get(ZONA);
}

/* Partes locales de un instante: { fecha: '2026-11-19', hora: '19:23', anio, mes, dia, h, m } */
function partes(d = new Date()) {
  const p = {}; for (const x of formateador().formatToParts(d)) p[x.type] = x.value;
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}`, anio: +p.year, mes: +p.month, dia: +p.day, h: +p.hour, m: +p.minute, s: +p.second };
}
const hoy = () => partes().fecha;
const ahoraISO = () => new Date().toISOString();

/* Suma (o resta) días a una fecha AAAA-MM-DD sin pasar por zonas horarias (aritmética de calendario pura). */
function sumarDias(fecha, n) {
  const [a, m, d] = fecha.split('-').map(Number);
  const x = new Date(Date.UTC(a, m - 1, d + n));
  return x.toISOString().slice(0, 10);
}
const ayer = () => sumarDias(hoy(), -1);

/* Días entre dos fechas AAAA-MM-DD (b − a) */
function diasEntre(a, b) {
  const [x, y] = [a, b].map(f => { const [Y, M, D] = f.split('-').map(Number); return Date.UTC(Y, M - 1, D); });
  return Math.round((y - x) / 86400000);
}

/* Convierte una fecha y hora LOCALES (de la tienda) a un instante UTC.
   Se usa cuando alguien registra una compra «del martes a las 3 pm»: hay que saber qué instante fue para buscar el dólar de ese momento.
   Método: se parte de suponer que la hora local es UTC y se corrige con la diferencia que da Intl (dos pasadas cubren el cambio de horario). */
function localAUTC(fecha, hora = '12:00') {
  const [a, m, d] = fecha.split('-').map(Number), [h, mi] = hora.split(':').map(Number);
  const objetivo = Date.UTC(a, m - 1, d, h, mi);
  let t = objetivo;
  for (let i = 0; i < 2; i++) {
    const p = partes(new Date(t));
    const visto = Date.UTC(p.anio, p.mes - 1, p.dia, p.h, p.m);
    t += objetivo - visto;
  }
  return new Date(t);
}

const esFecha = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));
const esHora = s => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

module.exports = { usarZona, zona, partes, hoy, ayer, ahoraISO, sumarDias, diasEntre, localAUTC, esFecha, esHora };
