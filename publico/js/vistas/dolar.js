/* ─────────────────────────────────────────────────────────────────────────────
   DÓLAR EN VIVO
   · Valor actual, cambio contra el cierre de ayer, apertura/mínimo/máximo de hoy.
   · Los tres precios que importan en la frontera: mercado, lo que usted paga (compra)
     y a cuánto la tienda recibe dólares de un cliente.
   · Gráfica de hoy y del historial (7 días a 1 año), convertidor, y para el dueño:
     su inventario y sus compras comparadas con el dólar de hoy.
   ───────────────────────────────────────────────────────────────────────────── */
import { estado, api, escuchar, avisar, esc, mxn, usd, tcFmt, num, fechaCorta, horaDe, haceCuanto, esDueno, NOMBRES } from '../nucleo.js';
import { ico } from '../iconos.js';
import { aviso, avisoError, al, esqueletos } from '../ui.js';
import { linea, activarGraficas, COLORES } from '../graficas.js';

let raiz, rango = 30, historial = null, quitar = [], conv = { usd: 100, tasa: 'valor', dir: 'usd' };

export async function montar(el) {
  raiz = el;
  raiz.innerHTML = `<div class="titulo-vista"><div><h1>Dólar</h1><p data-sub>Tipo de cambio en vivo</p></div>${esDueno() ? `<button class="btn btn-borde" data-act>${ico('recargar')} Consultar ahora</button>` : ''}</div>
    <div data-heroe>${esqueletos(1, 220)}</div>
    <div class="rejilla r-lado" style="margin-top:16px">
      <section class="tarjeta"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><h3>Historial del dólar</h3>
        <div class="segmento" data-rangos>${[[1, 'Hoy'], [7, '7 días'], [30, '30 días'], [90, '90 días'], [365, '1 año']].map(([d, t]) => `<button data-r="${d}" class="${d === rango ? 'activo' : ''}">${t}</button>`).join('')}</div></div>
        <div data-graf style="margin-top:12px">${esqueletos(1, 200)}</div><div data-hist-resumen class="sec" style="font-size:var(--t-sm);margin-top:6px"></div></section>
      <section class="tarjeta"><h3>Convertidor</h3><div data-conv style="margin-top:12px"></div></section>
    </div>
    ${esDueno() ? `<h2 class="seccion">Sus compras contra el dólar de hoy</h2><div data-compras>${esqueletos(3, 60)}</div>` : ''}`;
  al(raiz, 'click', '[data-r]', b => { rango = +b.dataset.r; for (const x of raiz.querySelectorAll('[data-r]')) x.classList.toggle('activo', x === b); pintarGrafica(); });
  al(raiz, 'click', '[data-act]', async b => { b.disabled = true; try { const j = await api('/api/tc/actualizar', { metodo: 'POST' }); estado.tc = j.tc; avisar('tc', j.tc); aviso(j.tc.error ? j.tc.error : 'Dólar actualizado', { tipo: j.tc.error ? 'mal' : 'bien' }); cargarHistorial(); } catch (e) { avisoError(e); } b.disabled = false; });
  quitar = [escuchar('tc', () => { pintarHeroe(); pintarConvertidor(); cargarHistorial(); })];
  pintarHeroe(); pintarConvertidor();
  await cargarHistorial();
  if (esDueno()) cargarCompras();
  const reloj = setInterval(() => { const s = raiz.querySelector('[data-hace]'); if (s && estado.tc) s.textContent = haceCuanto(estado.tc.t); }, 30000);
  return () => { quitar.forEach(f => f()); clearInterval(reloj); };
}

function pintarHeroe() {
  const tc = estado.tc, caja = raiz.querySelector('[data-heroe]'); if (!caja) return;
  if (!tc || !tc.valor) { caja.innerHTML = `<div class="nota mal">${ico('alerta')}<span>${esc((tc && tc.error) || 'Todavía no se ha podido consultar el dólar.')} ${esDueno() ? 'Revise la conexión a internet de la computadora de la tienda o escriba un dólar manual en Ajustes.' : ''}</span></div>`; return; }
  const dir = tc.cambio > 0 ? 'sube' : tc.cambio < 0 ? 'baja' : '';
  const aj = estado.sesion.ajustes.tc;
  caja.innerHTML = `<section class="dolar-heroe"><div class="moneda-dec"></div>
    <div class="sec" style="font-weight:700">1 dólar estadounidense = </div>
    <div class="cifra">${tcFmt(tc.valor, 4).replace(/(\.\d\d)(\d\d)$/, '$1<small>$2</small>')} <small>MXN</small></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px">
      ${tc.cambio != null ? `<span class="insignia ${dir === 'sube' ? 'i-bien' : dir === 'baja' ? 'i-mal' : 'i-gris'}">${ico(dir === 'baja' ? 'baja' : 'sube')}${tc.cambio > 0 ? '+' : ''}${(tc.cambio).toFixed(4)} (${tc.porcentaje > 0 ? '+' : ''}${tc.porcentaje.toFixed(2)} %) contra el cierre de ayer ${tcFmt(tc.anterior.cierre, 4)}</span>` : ''}
      <span class="insignia i-gris">${ico('reloj')}<span data-hace>${haceCuanto(tc.t)}</span></span>
      <span class="insignia ${tc.manual ? 'i-aviso' : 'i-cielo'}">${esc(tc.nombreFuente || '')}</span>
    </div>
    ${tc.hoy ? `<p class="sec" style="font-size:var(--t-sm);margin:10px 0 0">Hoy: abrió en ${tcFmt(tc.hoy.apertura, 4)}, mínimo ${tcFmt(tc.hoy.minimo, 4)}, máximo ${tcFmt(tc.hoy.maximo, 4)}.</p>` : ''}
    <div class="dolar-tres">
      <div><span>Mercado</span><b>${tcFmt(tc.valor)}</b><span>referencia</span></div>
      <div><span>Usted compra</span><b>${tcFmt(tc.compra)}</b><span>mercado ${aj.ajusteCompra >= 0 ? '+' : '−'} ${tcFmt(Math.abs(aj.ajusteCompra))}</span></div>
      <div><span>Tienda recibe</span><b>${tcFmt(tc.recibir)}</b><span>${aj.modoRecibir === 'fijo' ? 'precio fijo' : 'mercado − ' + tcFmt(aj.ajusteRecibir)}</span></div>
    </div>
    ${tc.error ? `<div class="nota aviso" style="margin-top:12px">${ico('alerta')}<span>${esc(tc.error)}</span></div>` : ''}
  </section>`;
  raiz.querySelector('[data-sub]').textContent = tc.manual ? 'Usando un valor manual (Ajustes)' : `Se consulta cada ${aj.intervaloMin} min · ${NOMBRES.fuente[aj.fuente] || aj.fuente}`;
}

async function cargarHistorial() {
  try { historial = await api('/api/tc/historial?dias=400'); pintarGrafica(); } catch (e) { avisoError(e); }
}
function pintarGrafica() {
  const caja = raiz.querySelector('[data-graf]'); if (!caja || !historial) return;
  let puntos;
  if (rango === 1) puntos = historial.hoy.map(m => ({ etiqueta: horaDe(m.t).replace(/\s?[ap]\.?\s?m\.?/i, ''), valor: m.valor, tip: `<b>${tcFmt(m.valor, 4)}</b><br>${horaDe(m.t)}` }));
  else {
    const desde = new Date(Date.now() - rango * 864e5).toISOString().slice(0, 10);
    puntos = historial.dias.filter(d => d.fecha >= desde).map(d => ({ etiqueta: rango > 90 ? fechaCorta(d.fecha).replace(/^\S+ /, '') : d.fecha.slice(8) + '/' + d.fecha.slice(5, 7), valor: d.cierre, tip: `<b>${tcFmt(d.cierre, 4)}</b><br>${fechaCorta(d.fecha)}${d.minimo !== d.maximo ? `<br>mín ${tcFmt(d.minimo)} · máx ${tcFmt(d.maximo)}` : ''}` }));
  }
  caja.innerHTML = linea(puntos, { color: COLORES.dolar, alto: 230, formatoEje: v => v.toFixed(2), referencia: estado.tc && estado.tc.anterior && rango === 1 ? estado.tc.anterior.cierre : null });
  activarGraficas(caja);
  const vals = puntos.map(p => p.valor);
  const res = raiz.querySelector('[data-hist-resumen]');
  if (vals.length > 1) { const d = vals[vals.length - 1] - vals[0]; res.textContent = `${rango === 1 ? 'Hoy' : `En ${rango} días`} el dólar ${d > 0 ? 'subió' : d < 0 ? 'bajó' : 'no cambió'} ${tcFmt(Math.abs(d), 4).replace('$', '')} pesos (de ${tcFmt(vals[0], 2)} a ${tcFmt(vals[vals.length - 1], 2)}). Mínimo ${tcFmt(Math.min(...vals))}, máximo ${tcFmt(Math.max(...vals))}.${rango === 1 ? ' La línea punteada es el cierre de ayer.' : ''}`; }
  else res.textContent = '';
}

function pintarConvertidor() {
  const caja = raiz.querySelector('[data-conv]'), tc = estado.tc; if (!caja) return;
  if (!tc || !tc.valor) { caja.innerHTML = '<p class="tenue">Sin tipo de cambio.</p>'; return; }
  const tasa = tc[conv.tasa] || tc.valor;
  const valUsd = conv.dir === 'usd' ? conv.usd : conv.mxn / tasa, valMxn = conv.dir === 'usd' ? conv.usd * tasa : conv.mxn;
  caja.innerHTML = `<div class="segmento" style="margin-bottom:14px">${[['valor', 'Mercado'], ['compra', 'Compra'], ['recibir', 'Recibir']].map(([k, t]) => `<button data-tasa="${k}" class="${conv.tasa === k ? 'activo' : ''}">${t}</button>`).join('')}</div>
    <div class="convertidor">
      <label class="campo"><span>🇺🇸 Dólares</span><input class="entrada" inputmode="decimal" data-usd value="${conv.dir === 'usd' ? conv.usd : (Math.round(valUsd * 100) / 100)}"></label>
      <span class="girar">${ico('recargar')}</span>
      <label class="campo"><span>🇲🇽 Pesos</span><input class="entrada" inputmode="decimal" data-mxn value="${conv.dir === 'mxn' ? conv.mxn : (Math.round(valMxn * 100) / 100)}"></label>
    </div>
    <p class="sec" style="font-size:var(--t-sm);margin:12px 0 0">A ${tcFmt(tasa, 4)} por dólar. ${conv.tasa === 'recibir' ? 'Así cobra la tienda a un cliente que paga en dólares.' : conv.tasa === 'compra' ? 'Lo que le cuesta comprar dólares en la casa de cambio.' : 'Precio de referencia del mercado.'}</p>`;
  caja.querySelector('[data-usd]').oninput = e => { conv.dir = 'usd'; conv.usd = +e.target.value || 0; caja.querySelector('[data-mxn]').value = (Math.round(conv.usd * tasa * 100) / 100); };
  caja.querySelector('[data-mxn]').oninput = e => { conv.dir = 'mxn'; conv.mxn = +e.target.value || 0; caja.querySelector('[data-usd]').value = (Math.round(conv.mxn / tasa * 100) / 100); };
  al(caja, 'click', '[data-tasa]', b => { conv.tasa = b.dataset.tasa; pintarConvertidor(); });
}

async function cargarCompras() {
  const caja = raiz.querySelector('[data-compras]'); if (!caja) return;
  try {
    const { compras } = await api('/api/tc/compras');
    if (!compras.length) { caja.innerHTML = '<p class="tenue">Cuando registre compras, aquí verá si las hizo con el dólar caro o barato comparado con hoy.</p>'; return; }
    const total = compras.reduce((s, c) => s + (c.diferencia || 0), 0);
    caja.innerHTML = `<div class="nota ${total > 0 ? '' : 'aviso'}" style="margin-bottom:12px">${ico('info')}<span>Si hoy volviera a hacer estas ${compras.length} compras, pagaría <b>${mxn(Math.abs(total))} ${total > 0 ? 'más' : 'menos'}</b> en pesos que lo que pagó. ${total > 0 ? 'Compró con un dólar más barato que el de hoy.' : 'Hoy el dólar está más barato que cuando compró.'}</span></div>
    <div class="tabla-envoltura"><table class="tabla"><thead><tr><th>Compra</th><th>Fecha</th><th class="der">Dólares</th><th class="der">Pagó en pesos</th><th class="der">Dólar pagado</th><th class="der">Hoy costaría</th><th class="der">Diferencia</th></tr></thead>
    <tbody>${compras.map(c => `<tr><td>#${c.folio}${c.proveedor ? ' · ' + esc(c.proveedor) : ''}</td><td>${fechaCorta(c.fecha)}</td><td class="der">${usd(c.total_usd)}</td><td class="der">${mxn(c.total_mxn)}</td><td class="der">${tcFmt(c.tc_pagado)}</td><td class="der">${mxn(c.mxnHoy)}</td>
      <td class="der ${c.diferencia > 0 ? 'bien' : 'mal'}">${c.diferencia > 0 ? '+' : '−'}${mxn(Math.abs(c.diferencia))}</td></tr>`).join('')}</tbody></table></div>
    <p class="tenue" style="font-size:var(--t-xs)">«Diferencia» positiva: usted ahorró al comprar antes (el dólar subió desde entonces).</p>`;
  } catch (e) { avisoError(e); }
}
