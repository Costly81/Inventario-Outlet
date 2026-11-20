/* ─────────────────────────────────────────────────────────────────────────────
   INICIO
   · Dueño: «¿Hoy fue rentable?» contra ayer, en pesos y en dólares; el dólar; el valor del
     inventario (lo que costó contra lo que costaría reponerlo hoy); avisos y actividad en vivo.
   · Vendedor: su día (lo vendido y lo que debe haber en caja por forma de pago).
   ───────────────────────────────────────────────────────────────────────────── */
import { estado, api, esc, mxn, usd, tcFmt, pct, variacion, fechaCorta, horaDe, esDueno, NOMBRES, retrasar, num } from '../nucleo.js';
import { ico } from '../iconos.js';
import { avisoError, esqueletos, animarNumeros, insigniaVar, al } from '../ui.js';
import { barras, activarGraficas, COLORES } from '../graficas.js';

let raiz, recargar;
const saludo = () => { const h = new Date().getHours(); return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'; };
const formatos = { mxn: n => mxn(n, false), usd, num: n => num(Math.round(n)) };

export async function montar(el) {
  raiz = el;
  raiz.innerHTML = `<div class="esqueleto" style="height:220px;border-radius:28px;margin-bottom:16px"></div><div class="rejilla r-4">${esqueletos(4, 96)}</div>`;
  recargar = retrasar(() => (esDueno() ? tablero() : miDia()).catch(avisoError), 400);
  await (esDueno() ? tablero() : miDia()).catch(e => { raiz.innerHTML = ''; avisoError(e); });
}
export function alCambio(d) { if (['venta', 'devolucion', 'merma', 'compra', 'gasto', 'conteo'].includes(d.que)) recargar(); }

/* ═════════ Dueño ═════════ */
async function tablero() {
  const d = await api('/api/tablero');
  const h = d.resumenHoy, a = d.resumenAyer, tc = d.tc || {}, inv = d.inventario;
  const vVenta = variacion(h.ventas.netoMxn, a.ventas.netoMxn), vGan = variacion(h.ganancia.mxn, a.ganancia.mxn), vUsd = variacion(h.ganancia.usd, a.ganancia.usd);
  const vMes = variacion(d.mes.ganancia.mxn, d.mesAnterior.ganancia.mxn);

  /* Tono del veredicto */
  let tono = 'neutro', frase;
  if (!h.ventas.num) frase = `Todavía no hay ventas hoy. Ayer se vendieron <b>${mxn(a.ventas.netoMxn)}</b> con una ganancia de <b>${mxn(a.ganancia.mxn)}</b>.`;
  else {
    tono = h.ganancia.mxn < 0 ? 'malo' : (a.ganancia.mxn > 0 && h.ganancia.mxn < a.ganancia.mxn * 0.5 && new Date().getHours() >= 18 ? 'neutro' : '');
    frase = `Se vendieron <b>${mxn(h.ventas.netoMxn)}</b> en ${h.ventas.num} venta${h.ventas.num === 1 ? '' : 's'} (${h.ventas.piezas} pieza${h.ventas.piezas === 1 ? '' : 's'}). Esas piezas costaron <b>${mxn(h.costo.mxn)}</b>, así que el margen va en <b>${pct(h.ganancia.margen)}</b>. ` +
      (a.ventas.num ? `Ayer, el día completo, la ganancia fue de ${mxn(a.ganancia.mxn)}.` : 'Ayer no hubo ventas.');
  }
  const deltaTc = tc.cambio != null ? `${tc.cambio > 0 ? '▲' : tc.cambio < 0 ? '▼' : ''} ${Math.abs(tc.cambio * 100).toFixed(0)} ¢ contra ayer` : '';

  const serie = d.serie.map(s => ({ etiqueta: s.fecha.slice(8), valores: [Math.max(0, s.costo), Math.max(0, s.ganancia)],
    tip: `<b>${fechaCorta(s.fecha)}</b><br>Venta ${mxn(s.neto)} · Ganancia ${mxn(s.ganancia)}<br>${s.piezas} pzs${s.tc ? ' · dólar ' + tcFmt(s.tc) : ''}` }));
  const al_ = d.alertas;

  raiz.innerHTML = `
    <section class="veredicto ${tono}">
      <svg class="sol-dec" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="22" fill="currentColor"/>${Array.from({ length: 12 }, (_, i) => `<rect x="48" y="4" width="4" height="16" rx="2" fill="currentColor" transform="rotate(${i * 30} 50 50)"/>`).join('')}</svg>
      <div class="veredicto-saludo">${saludo()}, ${esc(estado.sesion.usuario.nombre)}. Ganancia de hoy</div>
      <div class="veredicto-cifra" data-contar="${h.ganancia.mxn}" data-formato="mxn">${mxn(h.ganancia.mxn)}</div>
      <p class="veredicto-frase">${frase}</p>
      <div class="veredicto-pie">
        <span class="pastilla">${usd(h.ganancia.usd)} en dólares</span>
        ${tc.valor ? `<span class="pastilla">Dólar ${tcFmt(tc.valor)} ${deltaTc}</span>` : ''}
        ${h.ventas.num ? `<span class="pastilla">Venta promedio ${mxn(h.ventas.ticket)}</span>` : ''}
      </div>
    </section>

    <div class="rejilla r-4" style="margin-top:16px">
      ${kpi('Venta neta hoy', h.ventas.netoMxn, 'mxn', insigniaVar(vVenta, { sufijo: ' vs ayer' }))}
      ${kpi('Ganancia en dólares', h.ganancia.usd, 'usd', insigniaVar(vUsd, { sufijo: ' vs ayer' }))}
      ${kpi('Piezas vendidas', h.ventas.piezas, 'num', `<span>ayer ${a.ventas.piezas}</span>`)}
      ${kpi('Ganancia del mes', d.mes.ganancia.mxn, 'mxn', insigniaVar(vMes, { sufijo: ' vs mes pasado' }))}
    </div>

    <div class="rejilla r-lado" style="margin-top:16px">
      <section class="tarjeta">
        <h3>Últimos 14 días</h3><p class="sec" style="margin:0 0 12px;font-size:var(--t-sm)">Cada barra es lo vendido: la parte naranja es lo que costó la mercancía y la azul lo que quedó de ganancia.</p>
        ${barras(serie, { series: [{ nombre: 'Costo de lo vendido', color: COLORES.costo }, { nombre: 'Ganancia', color: COLORES.ganancia }], alto: 230 })}
      </section>
      <section class="tarjeta">
        <h3>Su inventario y el dólar</h3>
        <div class="rejilla r-2" style="margin-top:12px">
          <div class="kpi"><span class="kpi-etiqueta">Piezas</span><span class="kpi-valor" data-contar="${inv.piezas}" data-formato="num">${num(inv.piezas)}</span></div>
          <div class="kpi"><span class="kpi-etiqueta">A precio de venta</span><span class="kpi-valor">${mxn(inv.valorVenta)}</span></div>
          <div class="kpi"><span class="kpi-etiqueta">Le costó</span><span class="kpi-valor">${mxn(inv.costoMxn)}</span><span class="kpi-sub">${usd(inv.costoUsd)} · dólar promedio ${tcFmt(inv.tcPromedio)}</span></div>
          <div class="kpi"><span class="kpi-etiqueta">Reponerlo hoy</span><span class="kpi-valor">${mxn(inv.reposicionMxn)}</span><span class="kpi-sub">con el dólar de compra ${tcFmt(tc.compra)}</span></div>
        </div>
        ${inv.efectoCambiario != null ? `<div class="nota ${inv.efectoCambiario >= 0 ? '' : 'aviso'}" style="margin-top:14px">${ico(inv.efectoCambiario >= 0 ? 'sube' : 'baja')}<span>${inv.efectoCambiario >= 0
          ? `Desde que compró, el dólar subió: su mercancía vale <b>${mxn(inv.efectoCambiario)}</b> más en pesos. Cuide que sus precios alcancen para reponerla.`
          : `El dólar bajó desde que compró: reponer su mercancía hoy cuesta <b>${mxn(-inv.efectoCambiario)}</b> menos. Buen momento para resurtir.`}</span></div>` : ''}
        <a class="btn btn-suave btn-bloque" href="#/dolar" style="margin-top:14px">${ico('dolar')} Ver el dólar</a>
      </section>
    </div>

    ${avisosHTML(al_)}

    <div class="rejilla r-2-md" style="margin-top:4px">
      <section><h2 class="seccion">Lo más vendido <small>7 días</small></h2>
        ${d.top.length ? `<div class="lista">${d.top.map((p, i) => `<a class="fila-lista" href="#/inventario/p/${p.id}"><span class="ico">${esc(p.emoji)}</span><span style="min-width:0"><div class="titulo">${esc(p.nombre)}</div><div class="detalle">${p.piezas} piezas · ganancia ${mxn(p.ganancia)}</div></span><span class="derecha">${mxn(p.ventas)}</span></a>`).join('')}</div>` : '<p class="tenue">Sin ventas en los últimos 7 días.</p>'}
      </section>
      <section><h2 class="seccion">Actividad <small>en vivo</small></h2>
        <div class="lista">${d.actividad.map(actividadHTML).join('') || '<p class="tenue">Todavía no hay movimientos.</p>'}</div>
      </section>
    </div>`;
  animarNumeros(raiz, formatos);
  activarGraficas(raiz);
}

function kpi(etiqueta, valor, formato, sub) {
  return `<div class="tarjeta kpi"><span class="kpi-etiqueta">${etiqueta}</span><span class="kpi-valor" data-contar="${valor}" data-formato="${formato}">${formatos[formato](valor)}</span><span class="kpi-sub">${sub}</span></div>`;
}

function avisosHTML(a) {
  const bloques = [];
  if (a.porAgotarse.length || a.agotados.length) bloques.push(`<section class="tarjeta"><h3>${ico('alerta', 'width="18" height="18" style="display:inline;vertical-align:-3px;color:var(--ambar)"')} Por agotarse</h3>
    <div class="lista" style="margin-top:10px">${[...a.agotados.map(p => ({ ...p, txt: 'Agotado', cls: 'i-mal' })), ...a.porAgotarse.map(p => ({ ...p, txt: `${p.existencia} pz${p.existencia === 1 ? '' : 's'}`, cls: 'i-aviso' }))].slice(0, 6)
      .map(p => `<a class="fila-lista" href="#/inventario/p/${p.id}" style="padding:8px"><span class="ico" style="--c:${esc(p.color)};width:38px;height:38px;font-size:1.2rem">${esc(p.emoji)}</span><span style="min-width:0"><div class="titulo">${esc(p.nombre)}</div><div class="detalle">${p.vendidas30} vendidas en 30 días</div></span><span class="insignia ${p.cls}">${p.txt}</span></a>`).join('')}</div></section>`);
  if (a.margenBajo.length) bloques.push(`<section class="tarjeta"><h3>${ico('dolar', 'width="18" height="18" style="display:inline;vertical-align:-3px;color:var(--ambar)"')} El dólar se comió el margen</h3>
    <p class="sec" style="font-size:var(--t-sm);margin:4px 0 10px">Con el dólar de hoy, reponer estas piezas deja poco margen. Considere subir el precio.</p>
    <div class="lista">${a.margenBajo.map(p => `<a class="fila-lista" href="#/inventario/p/${p.id}" style="padding:8px"><span class="ico" style="--c:${esc(p.color)};width:38px;height:38px;font-size:1.2rem">${esc(p.emoji)}</span><span style="min-width:0"><div class="titulo">${esc(p.nombre)}</div><div class="detalle">Precio ${mxn(p.precio)} · reponer ${mxn(p.costoReposicion)}</div></span><span class="insignia i-aviso">${pct(p.margenReposicion)}</span></a>`).join('')}</div></section>`);
  if (a.estancados.length) bloques.push(`<section class="tarjeta"><h3>${ico('reloj', 'width="18" height="18" style="display:inline;vertical-align:-3px;color:var(--tinta-3)"')} Sin vender en 30 días</h3>
    <p class="sec" style="font-size:var(--t-sm);margin:4px 0 10px">Dinero detenido en el estante. Una oferta puede moverlo.</p>
    <div class="lista">${a.estancados.map(p => `<a class="fila-lista" href="#/inventario/p/${p.id}" style="padding:8px"><span class="ico" style="--c:${esc(p.color)};width:38px;height:38px;font-size:1.2rem">${esc(p.emoji)}</span><span style="min-width:0"><div class="titulo">${esc(p.nombre)}</div><div class="detalle">${p.existencia} piezas detenidas</div></span><span class="derecha">${mxn(p.valorMxn)}</span></a>`).join('')}</div></section>`);
  return bloques.length ? `<h2 class="seccion">Avisos</h2><div class="rejilla r-3">${bloques.join('')}</div>` : '';
}

function actividadHTML(x) {
  const t = {
    venta: [x.anulada ? 'deshacer' : 'bolsa', x.anulada ? 'Venta cancelada' : `Venta · ${NOMBRES.metodo[x.detalle] || ''}`, mxn(x.monto), x.anulada ? '#7a909c' : '#0b8fc6'],
    devolucion: ['deshacer', `Devolución${x.detalle === 'merma' ? ' (dañada)' : ''}`, '−' + mxn(x.monto), '#c27c0e'],
    merma: ['roto', `Merma · ${NOMBRES.merma[x.detalle] || x.detalle}`, mxn(x.monto), '#e0484f'],
    compra: ['camion', x.anulada ? 'Compra anulada' : 'Compra', usd(x.monto), '#6366f1']
  }[x.tipo];
  return `<div class="fila-lista" style="padding:8px"><span class="ico" style="--c:${t[3]};width:38px;height:38px">${ico(t[0])}</span><span style="min-width:0"><div class="titulo">${t[1]}</div><div class="detalle">${horaDe(x.t)} · ${fechaCorta(x.t ? new Intl.DateTimeFormat('en-CA', { timeZone: estado.sesion.zona }).format(new Date(x.t)) : '')} · ${esc(x.usuario || '')} · ${x.piezas} pz${x.piezas === 1 ? '' : 's'}</div></span><span class="derecha" ${x.anulada ? 'style="text-decoration:line-through;color:var(--tinta-3)"' : ''}>${t[2]}</span></div>`;
}

/* ═════════ Vendedor ═════════ */
async function miDia() {
  const d = await api('/api/mi-dia'), tc = d.tc || {};
  const efectivo = d.metodos.find(m => m.metodo === 'efectivo'), dol = d.metodos.find(m => m.metodo === 'dolares');
  raiz.innerHTML = `
    <section class="veredicto">
      <svg class="sol-dec" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="22" fill="currentColor"/></svg>
      <div class="veredicto-saludo">${saludo()}, ${esc(estado.sesion.usuario.nombre)}. Hoy lleva</div>
      <div class="veredicto-cifra" data-contar="${d.total}" data-formato="mxn">${mxn(d.total)}</div>
      <p class="veredicto-frase">${d.num ? `En ${d.num} venta${d.num === 1 ? '' : 's'} y ${d.piezas} pieza${d.piezas === 1 ? '' : 's'}. ¡Siga así!` : 'Todavía no ha vendido hoy. Toque Vender para empezar.'}</p>
      <div class="veredicto-pie"><a class="btn btn-grande" href="#/vender" style="background:#fff;color:var(--cielo-hondo)">${ico('bolsa')} Vender</a></div>
    </section>
    <h2 class="seccion">Lo que debe haber en caja</h2>
    <div class="rejilla r-2">
      <div class="tarjeta kpi"><span class="kpi-etiqueta">💵 Efectivo en pesos</span><span class="kpi-valor">${mxn(efectivo ? efectivo.total : 0)}</span><span class="kpi-sub">${efectivo ? efectivo.num : 0} ventas (más el fondo de caja)</span></div>
      <div class="tarjeta kpi"><span class="kpi-etiqueta">🇺🇸 Dólares recibidos</span><span class="kpi-valor">${usd(dol ? dol.dolares : 0)}</span><span class="kpi-sub">${dol ? dol.num : 0} ventas · equivalen a ${mxn(dol ? dol.total : 0)}</span></div>
      ${d.metodos.filter(m => !['efectivo', 'dolares'].includes(m.metodo)).map(m => `<div class="tarjeta kpi"><span class="kpi-etiqueta">${NOMBRES.metodoEmoji[m.metodo]} ${NOMBRES.metodo[m.metodo]}</span><span class="kpi-valor">${mxn(m.total)}</span><span class="kpi-sub">${m.num} ventas</span></div>`).join('')}
    </div>
    <h2 class="seccion">Dólar para cobrar</h2>
    <div class="tarjeta" style="display:flex;align-items:center;gap:16px;justify-content:space-between;flex-wrap:wrap">
      <div class="kpi"><span class="kpi-etiqueta">La tienda recibe cada dólar a</span><span class="kpi-valor" style="font-size:var(--t-xl)">${tcFmt(tc.recibir)}</span><span class="kpi-sub">Mercado ${tcFmt(tc.valor)}</span></div>
      <a class="btn btn-suave" href="#/movimientos">${ico('lista')} Mis ventas</a>
    </div>`;
  animarNumeros(raiz, formatos);
}
