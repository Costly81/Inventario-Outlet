'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   TIPO DE CAMBIO DÓLAR → PESO, EN VIVO.

   Fuentes (gratuitas, se prueban en orden hasta que una responda):
     google       Google Finanzas (USD-MXN): el mismo dólar que sale al buscar «dólar» en Google. PRINCIPAL.
     yahoo        Yahoo Finanzas (MXN=X): precio de mercado casi en tiempo real (respaldo).
     banxico      FIX oficial de Banxico (serie SF43718). Solo si se escribe un token gratuito en Ajustes.
     erapi        open.er-api.com: se actualiza una vez al día.
     frankfurter  Banco Central Europeo vía frankfurter.dev: una vez al día; también da el histórico.

   Cada consulta exitosa se guarda como MUESTRA (tc_muestras) con su instante y su día local, y
   se resume por día (tc_dias: apertura, cierre, mínimo, máximo). Así se puede responder:
     · ¿Cuánto está hoy y cuánto cambió contra ayer?
     · ¿A cuánto estaba el dólar el día (y la hora) de una compra?

   Tres precios distintos que el sistema maneja (en la frontera no es lo mismo):
     mercado  → el de internet (o el manual de Ajustes, si se escribió uno).
     compra   → lo que USTED paga por cada dólar en la casa de cambio  = mercado + ajusteCompra.
     recibir  → a cuánto la tienda le toma un dólar a un cliente         = mercado − ajusteRecibir (o un fijo).
   ───────────────────────────────────────────────────────────────────────────── */
const T = require('./tiempo.js');
const U = require('./util.js');
const A = require('./ajustes.js');

const NAVEGADOR = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const RANGO = v => Number.isFinite(v) && v > 5 && v < 60;    // un dólar fuera de este rango es un dato roto

/* ---------- proveedores: cada uno devuelve { valor, t } o lanza un Error ---------- */
async function obtenerJSON(fetchFn, url, encabezados = {}) {
  const r = await fetchFn(url, { headers: { 'User-Agent': NAVEGADOR, Accept: 'application/json', ...encabezados }, signal: AbortSignal.timeout(9000) });
  if (!r.ok) throw new Error(`respondió ${r.status}`);
  return r.json();
}
/* Página de Google Finanzas (HTML): el precio viene en el atributo data-last-price del encabezado de la cotización */
async function obtenerTexto(fetchFn, url) {
  const r = await fetchFn(url, { headers: { 'User-Agent': NAVEGADOR, Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.8', Cookie: 'CONSENT=YES+' }, signal: AbortSignal.timeout(9000) });
  if (!r.ok) throw new Error(`respondió ${r.status}`);
  return r.text();
}
/** Saca el precio de la página de Google Finanzas. Se exporta para probarlo con una página de ejemplo. */
function leerGoogle(html) {
  const s = String(html || '');
  /* 1) atributo de datos (lo más estable)  2) el número grande del encabezado (clase YMlKec) */
  const m = /data-last-price="([0-9]+(?:\.[0-9]+)?)"/.exec(s) || /class="YMlKec fxKbKc">\$?([0-9]+(?:\.[0-9]+)?)</.exec(s);
  const v = m ? +m[1] : NaN;
  if (!RANGO(v)) throw new Error('no se encontró el precio en la página');
  const ts = /data-last-normal-market-timestamp="(\d{9,11})"/.exec(s);
  return { valor: v, t: ts ? new Date(+ts[1] * 1000).toISOString() : T.ahoraISO() };
}

const PROVEEDORES = {
  google: {
    nombre: 'Google Finanzas', vivo: true,
    async consultar(f) { return leerGoogle(await obtenerTexto(f, 'https://www.google.com/finance/quote/USD-MXN?hl=en')); }
  },
  yahoo: {
    nombre: 'Yahoo Finanzas', vivo: true,
    async consultar(f) {
      const j = await obtenerJSON(f, 'https://query1.finance.yahoo.com/v8/finance/chart/MXN=X?interval=5m&range=1d');
      const m = j && j.chart && j.chart.result && j.chart.result[0] && j.chart.result[0].meta;
      const v = m && +m.regularMarketPrice;
      if (!RANGO(v)) throw new Error('sin precio');
      return { valor: v, t: m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString() : T.ahoraISO() };
    }
  },
  banxico: {
    nombre: 'Banxico (FIX)', vivo: false, necesitaToken: true,
    async consultar(f, token) {
      if (!token) throw new Error('sin token');
      const j = await obtenerJSON(f, 'https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF43718/datos/oportuno', { 'Bmx-Token': token });
      const d = j && j.bmx && j.bmx.series && j.bmx.series[0] && j.bmx.series[0].datos && j.bmx.series[0].datos[0];
      const v = d && +String(d.dato).replace(',', '');
      if (!RANGO(v)) throw new Error('sin dato');
      return { valor: v, t: T.ahoraISO() };
    }
  },
  erapi: {
    nombre: 'ExchangeRate-API', vivo: false,
    async consultar(f) {
      const j = await obtenerJSON(f, 'https://open.er-api.com/v6/latest/USD');
      const v = j && j.result === 'success' && j.rates && +j.rates.MXN;
      if (!RANGO(v)) throw new Error('sin dato');
      return { valor: v, t: T.ahoraISO() };
    }
  },
  frankfurter: {
    nombre: 'Frankfurter (BCE)', vivo: false,
    async consultar(f) {
      const j = await obtenerJSON(f, 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=MXN');
      const v = j && j.rates && +j.rates.MXN;
      if (!RANGO(v)) throw new Error('sin dato');
      return { valor: v, t: T.ahoraISO() };
    }
  }
};
const ORDEN_AUTO = ['google', 'yahoo', 'banxico', 'erapi', 'frankfurter'];

/**
 * Crea el servicio de tipo de cambio.
 * @param {object} o
 * @param {object} o.B         base de datos (lib/db.js)
 * @param {function} o.emitir  avisa a los navegadores abiertos (lib/eventos.js)
 * @param {boolean} o.sinRed   true = no consultar internet (pruebas)
 * @param {function} o.fetch   función fetch (se puede sustituir en pruebas)
 */
function crear({ B, emitir = () => { }, sinRed = false, fetch: fetchFn = globalThis.fetch, registro = console }) {
  let temporizador = null, consultando = null, ultimoError = null, ultimoIntento = null;

  const ajustesTC = () => A.leer(B).tc;

  /* Guarda una muestra y actualiza el resumen del día */
  function registrar(valor, fuente, t = T.ahoraISO()) {
    valor = U.r4(valor);
    const fecha = T.partes(new Date(t)).fecha;
    B.tx(() => {
      B.run('INSERT INTO tc_muestras (t, fecha, valor, fuente) VALUES (?, ?, ?, ?)', t, fecha, valor, fuente);
      const d = B.uno('SELECT * FROM tc_dias WHERE fecha = ?', fecha);
      if (!d) B.run('INSERT INTO tc_dias (fecha, apertura, cierre, minimo, maximo, muestras, fuente) VALUES (?, ?, ?, ?, ?, 1, ?)', fecha, valor, valor, valor, valor, fuente);
      else B.run('UPDATE tc_dias SET cierre = ?, minimo = MIN(minimo, ?), maximo = MAX(maximo, ?), muestras = muestras + 1, fuente = ? WHERE fecha = ?', valor, valor, valor, fuente, fecha);
    });
    return { valor, fuente, t, fecha };
  }

  /* El último valor de mercado conocido (de internet), sin aplicar el manual */
  const ultimaMuestra = () => B.uno('SELECT valor, fuente, t, fecha FROM tc_muestras ORDER BY t DESC, id DESC LIMIT 1');

  /* Cierre del día anterior (el último día con datos antes de hoy) */
  function cierreAnterior(hoy = T.hoy()) {
    return B.uno('SELECT fecha, cierre, apertura, minimo, maximo FROM tc_dias WHERE fecha < ? ORDER BY fecha DESC LIMIT 1', hoy);
  }

  /** Estado completo del dólar para mostrar en pantalla */
  function actual() {
    const aj = ajustesTC(), m = ultimaMuestra(), hoy = T.hoy();
    const manual = aj.manual ? +aj.manual : null;
    const mercado = manual || (m ? m.valor : null);
    const dia = B.uno('SELECT * FROM tc_dias WHERE fecha = ?', hoy);
    const prev = cierreAnterior(hoy);
    const out = {
      valor: mercado, fuente: manual ? 'manual' : (m ? m.fuente : null), nombreFuente: manual ? 'Valor manual (Ajustes)' : (m ? (PROVEEDORES[m.fuente] || {}).nombre || m.fuente : null),
      t: manual ? T.ahoraISO() : (m ? m.t : null), manual: !!manual,
      hoy: dia ? { apertura: dia.apertura, minimo: dia.minimo, maximo: dia.maximo, muestras: dia.muestras } : null,
      anterior: prev ? { fecha: prev.fecha, cierre: prev.cierre } : null,
      cambio: null, porcentaje: null, compra: null, recibir: null,
      error: ultimoError, ultimoIntento
    };
    if (mercado) {
      out.compra = U.r4(mercado + (+aj.ajusteCompra || 0));
      out.recibir = aj.modoRecibir === 'fijo' && aj.recibirFijo ? +aj.recibirFijo : U.r2(mercado - (+aj.ajusteRecibir || 0));
      if (prev) { out.cambio = U.r4(mercado - prev.cierre); out.porcentaje = U.r2((mercado / prev.cierre - 1) * 100); }
    }
    return out;
  }

  /** Valor de mercado que se usa en una operación de ahora mismo. Si nunca se ha podido consultar, error claro. */
  function mercadoAhora() {
    const a = actual();
    if (!a.valor) U.falla('Todavía no hay tipo de cambio: revise la conexión a internet o escriba un dólar manual en Ajustes.', 409);
    return a;
  }

  /** Consulta internet ahora (respeta la fuente preferida y prueba las demás si falla) */
  async function actualizar() {
    if (sinRed) return actual();
    if (consultando) return consultando;
    consultando = (async () => {
      const aj = ajustesTC(); ultimoIntento = T.ahoraISO();
      const orden = aj.fuente === 'auto' ? ORDEN_AUTO : [aj.fuente, ...ORDEN_AUTO.filter(x => x !== aj.fuente)];
      const previo = ultimaMuestra(), errores = [];
      for (const id of orden) {
        const p = PROVEEDORES[id];
        if (p.necesitaToken && !aj.tokenBanxico) continue;
        try {
          const r = await p.consultar(fetchFn, aj.tokenBanxico);
          /* Un salto mayor a 15 % contra el último dato es casi seguro un error de la fuente: se prueba la siguiente */
          if (previo && Math.abs(r.valor / previo.valor - 1) > 0.15) throw new Error(`valor sospechoso (${r.valor})`);
          registrar(r.valor, id, T.ahoraISO());
          ultimoError = null;
          const a = actual(); emitir('tc', a); return a;
        } catch (e) { errores.push(`${p.nombre}: ${e.message}`); }
      }
      ultimoError = 'No se pudo consultar el dólar (' + errores.join(' · ') + ')';
      registro.warn('  ▲ ' + ultimoError);
      const a = actual(); emitir('tc', a); return a;
    })();
    try { return await consultando; } finally { consultando = null; }
  }

  /** Llena el histórico diario (últimos `dias`) desde Frankfurter, solo los días que falten. Para que las gráficas tengan pasado desde el primer día. */
  async function llenarHistorico(dias = 120) {
    if (sinRed) return 0;
    const desde = T.sumarDias(T.hoy(), -dias), hasta = T.sumarDias(T.hoy(), -1);
    const tiene = B.valor('SELECT COUNT(*) FROM tc_dias WHERE fecha >= ?', desde);
    if (tiene >= dias * 0.6) return 0;
    try {
      const j = await obtenerJSON(fetchFn, `https://api.frankfurter.dev/v1/${desde}..${hasta}?base=USD&symbols=MXN`);
      let n = 0;
      B.tx(() => {
        for (const [fecha, r] of Object.entries((j && j.rates) || {})) {
          const v = U.r4(+r.MXN); if (!RANGO(v)) continue;
          const x = B.run('INSERT OR IGNORE INTO tc_dias (fecha, apertura, cierre, minimo, maximo, muestras, fuente) VALUES (?, ?, ?, ?, ?, 0, ?)', fecha, v, v, v, v, 'frankfurter');
          n += Number(x.changes);
        }
      });
      return n;
    } catch (e) { registro.warn('  ▲ No se pudo traer el histórico del dólar: ' + e.message); return 0; }
  }

  /**
   * ¿A cuánto estaba el dólar en una fecha y hora LOCALES? (para compras registradas después).
   * Devuelve { valor, fuente, detalle } y nunca lanza error si hay al menos un valor actual.
   */
  async function enMomento(fecha, hora = '12:00') {
    const instante = T.localAUTC(fecha, hora), ahora = Date.now();
    /* Es de hace unos minutos (o es «ahora»): el actual */
    if (Math.abs(ahora - instante.getTime()) < 20 * 60000) { const a = mercadoAhora(); return { valor: a.valor, fuente: a.fuente, detalle: 'Dólar de este momento' }; }
    /* La muestra guardada más cercana a ese instante (máximo 3 horas de diferencia) */
    const iso = instante.toISOString(), margen = 3 * 3600000;
    const cerca = B.uno(`SELECT valor, fuente, t FROM tc_muestras WHERE t BETWEEN ? AND ?
                        ORDER BY ABS(julianday(t) - julianday(?)) LIMIT 1`,
      new Date(instante.getTime() - margen).toISOString(), new Date(instante.getTime() + margen).toISOString(), iso);
    if (cerca) return { valor: cerca.valor, fuente: cerca.fuente, detalle: `Dólar registrado a las ${T.partes(new Date(cerca.t)).hora}` };
    /* El resumen de ese día, o del último día hábil anterior (fines de semana no hay cierre) */
    const dia = B.uno('SELECT fecha, cierre, fuente FROM tc_dias WHERE fecha <= ? AND fecha >= ? ORDER BY fecha DESC LIMIT 1', fecha, T.sumarDias(fecha, -5));
    if (dia) return { valor: dia.cierre, fuente: dia.fuente || 'historico', detalle: dia.fecha === fecha ? 'Cierre de ese día' : `Último cierre disponible (${dia.fecha})` };
    /* Preguntar a Frankfurter por ese día */
    if (!sinRed) {
      try {
        const j = await obtenerJSON(fetchFn, `https://api.frankfurter.dev/v1/${fecha}?base=USD&symbols=MXN`);
        const v = j && j.rates && U.r4(+j.rates.MXN);
        if (RANGO(v)) {
          B.run('INSERT OR IGNORE INTO tc_dias (fecha, apertura, cierre, minimo, maximo, muestras, fuente) VALUES (?, ?, ?, ?, ?, 0, ?)', j.date || fecha, v, v, v, v, 'frankfurter');
          return { valor: v, fuente: 'frankfurter', detalle: `Cierre oficial del ${j.date || fecha}` };
        }
      } catch (_) { /* sin internet: se usa el actual */ }
    }
    const a = mercadoAhora();
    return { valor: a.valor, fuente: a.fuente, detalle: 'No hay dato de ese día: se usa el dólar de hoy' };
  }

  /** Historial diario (para gráficas) */
  const historial = (dias = 90) => B.todos('SELECT fecha, apertura, cierre, minimo, maximo FROM tc_dias WHERE fecha >= ? ORDER BY fecha', T.sumarDias(T.hoy(), -dias));
  /** Muestras de un día (gráfica de hoy) */
  const intradia = (fecha = T.hoy()) => B.todos('SELECT t, valor FROM tc_muestras WHERE fecha = ? ORDER BY t', fecha);

  /* Programa la siguiente consulta según el intervalo de Ajustes */
  function programar() {
    clearTimeout(temporizador);
    const min = Math.max(1, +ajustesTC().intervaloMin || 5);
    temporizador = setTimeout(async () => { try { await actualizar(); } catch (_) { } programar(); }, min * 60000);
    if (temporizador.unref) temporizador.unref();
  }
  async function iniciar() {
    if (sinRed) return;
    llenarHistorico().catch(() => { });
    try { await actualizar(); } catch (_) { }
    programar();
  }
  const detener = () => clearTimeout(temporizador);

  /* Limpieza: las muestras de más de un año se borran (el resumen diario se queda para siempre) */
  function podar() { B.run('DELETE FROM tc_muestras WHERE t < ?', new Date(Date.now() - 400 * 86400000).toISOString()); }

  return { actual, mercadoAhora, actualizar, enMomento, historial, intradia, registrar, llenarHistorico, iniciar, detener, programar, podar, PROVEEDORES };
}

module.exports = { crear, PROVEEDORES, leerGoogle };
