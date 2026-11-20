/* ─────────────────────────────────────────────────────────────────────────────
   VENTAS Y DEVOLUCIONES
   · Lista de ventas agrupadas por día (el vendedor ve solo las suyas de los últimos 7 días).
   · Detalle de cada venta: artículos, cobro, dólar del momento y, para el dueño, costo y ganancia.
   · Devolución de una pieza: vuelve al inventario (se puede revender) o va a merma (venía dañada).
   · Cancelar una venta completa (error al cobrar).
   ───────────────────────────────────────────────────────────────────────────── */
import { estado, api, esc, mxn, usd, tcFmt, pct, fechaCorta, hoyLocal, sumarDias, hora24a12, esDueno, NOMBRES, retrasar } from '../nucleo.js';
import { ico } from '../iconos.js';
import { aviso, avisoError, hoja, al, confirmar, esqueletos, vacio } from '../ui.js';

let raiz, dias = 7, q = '';

export async function montar(el) {
  raiz = el;
  raiz.innerHTML = `<div class="titulo-vista"><div><h1>${esDueno() ? 'Ventas' : 'Mis ventas'}</h1><p>Toque una venta para ver el detalle, devolver una pieza o cancelarla.</p></div>
    ${esDueno() ? `<div class="segmento" data-dias>${[[1, 'Hoy'], [7, '7 días'], [30, '30 días']].map(([d, t]) => `<button data-d="${d}" class="${d === dias ? 'activo' : ''}">${t}</button>`).join('')}</div>` : ''}</div>
    <div class="buscador" style="margin-bottom:14px">${ico('buscar')}<input type="search" placeholder="Buscar por folio, producto o persona…" data-q></div>
    <div data-lista>${esqueletos(5, 66)}</div>`;
  al(raiz, 'click', '[data-d]', b => { dias = +b.dataset.d; for (const x of raiz.querySelectorAll('[data-d]')) x.classList.toggle('activo', x === b); cargar(); });
  al(raiz, 'click', '[data-v]', b => detalle(+b.dataset.v));
  raiz.querySelector('[data-q]').addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); pintar(); });
  await cargar();
}
export function alCambio(d) { if (['venta', 'devolucion'].includes(d.que)) recargar(); }
const recargar = retrasar(() => cargar(), 500);

let ventas = [];
async function cargar() {
  const h = hoyLocal();
  try { ventas = (await api(`/api/ventas?desde=${sumarDias(h, -(dias - 1))}&hasta=${h}`)).ventas; pintar(); } catch (e) { avisoError(e); }
}
function pintar() {
  const caja = raiz.querySelector('[data-lista]');
  let lista = ventas;
  if (q) lista = lista.filter(v => (`${v.folio} ${v.resumen || ''} ${v.usuario || ''} ${NOMBRES.metodo[v.metodo]}`).toLowerCase().includes(q));
  if (!lista.length) { caja.innerHTML = vacio({ emoji: '🧾', titulo: q ? 'Sin coincidencias' : 'Todavía no hay ventas en este periodo', boton: q ? '' : `<a class="btn btn-primario" href="#/vender">${ico('bolsa')} Vender</a>` }); return; }
  const porDia = new Map(); for (const v of lista) { if (!porDia.has(v.fecha)) porDia.set(v.fecha, []); porDia.get(v.fecha).push(v); }
  caja.innerHTML = [...porDia].map(([f, vs]) => {
    const tot = vs.filter(v => !v.anulada).reduce((s, v) => s + v.total - v.reembolsado, 0);
    return `<h2 class="seccion">${fechaCorta(f).replace(/^./, c => c.toUpperCase())} <small>${vs.filter(v => !v.anulada).length} ventas · ${mxn(tot)}</small></h2><div class="lista">${vs.map(v => `
      <button class="fila-lista" data-v="${v.id}" style="${v.anulada ? 'opacity:.55' : ''}">
        <span class="ico" style="--c:${v.anulada ? '#7a909c' : '#0b8fc6'}">${NOMBRES.metodoEmoji[v.metodo]}</span>
        <span style="min-width:0"><div class="titulo">#${v.folio} · ${esc(v.resumen || '')}</div>
          <div class="detalle">${hora24a12(v.hora)} · ${v.piezas} pz${v.piezas === 1 ? '' : 's'} · ${NOMBRES.metodo[v.metodo]}${esDueno() && v.usuario ? ' · ' + esc(v.usuario) : ''}${v.anulada ? ' · <b>Cancelada</b>' : ''}${v.reembolsado ? ` · devuelto ${mxn(v.reembolsado)}` : ''}</div></span>
        <span class="derecha" ${v.anulada ? 'style="text-decoration:line-through"' : ''}>${mxn(v.total)}${v.moneda_pago === 'USD' ? `<small>${usd(v.recibido)}</small>` : ''}</span></button>`).join('')}</div>`;
  }).join('');
}

async function detalle(id) {
  const h = hoja({ titulo: 'Venta', html: esqueletos(3, 70) });
  let v; try { v = (await api('/api/ventas/' + id)).venta; } catch (e) { h.cerrar(); return avisoError(e); }
  const dueno = esDueno();
  h.titulo(`Venta #${v.folio}${v.anulada ? ' (cancelada)' : ''}`);
  h.cuerpo.innerHTML = `
    <p class="sec" style="margin-top:0">${fechaCorta(v.fecha)} a las ${hora24a12(v.hora)} · ${esc(v.usuario || '')} · ${NOMBRES.metodoEmoji[v.metodo]} ${NOMBRES.metodo[v.metodo]}</p>
    <div class="lista">${v.renglones.map(r => {
      const quedan = r.cantidad - r.devueltas;
      return `<div class="fila-lista"><span class="ico">${esc(r.emoji)}</span><span style="min-width:0"><div class="titulo">${esc(r.producto)}${r.variante !== 'Única' ? ' · ' + esc(r.variante) : ''}</div>
        <div class="detalle">${r.cantidad} × ${mxn(r.precio)}${r.devueltas ? ` · <b>${r.devueltas} devuelta${r.devueltas === 1 ? '' : 's'}</b>` : ''}${dueno ? ` · costo ${mxn(r.costo_mxn)}` : ''}</div></span>
        <span class="derecha">${mxn(r.neto)}${!v.anulada && quedan > 0 ? `<div><button class="btn btn-chico btn-borde" data-devolver="${r.id}" style="margin-top:4px">${ico('deshacer')} Devolver</button></div>` : ''}</span></div>`;
    }).join('')}</div>
    <div class="totales" style="margin-top:12px">
      ${v.descuento ? `<div class="fila"><span>Subtotal</span><span>${mxn(v.subtotal)}</span></div><div class="fila"><span>Descuento</span><span>−${mxn(v.descuento)}</span></div>` : ''}
      <div class="fila total"><span>Total</span><span class="num">${mxn(v.total, true)}</span></div>
      ${v.moneda_pago === 'USD' ? `<div class="fila"><span>Recibió</span><span>${usd(v.recibido)} a ${tcFmt(v.tc_cobro)}</span></div>` : v.recibido ? `<div class="fila"><span>Recibió</span><span>${mxn(v.recibido, true)}</span></div>` : ''}
      ${v.cambio ? `<div class="fila"><span>Cambio</span><span>${mxn(v.cambio, true)}</span></div>` : ''}
      <div class="fila"><span>Dólar en ese momento</span><span>${tcFmt(v.tc_mercado, 4)} · ${usd(v.total_usd)}</span></div>
      ${dueno ? `<div class="fila"><span>Costo · ganancia</span><span>${mxn(v.costo_mxn)} · <b class="${v.ganancia >= 0 ? 'bien' : 'mal'}">${mxn(v.ganancia)}</b> (${pct(v.total ? v.ganancia / v.total * 100 : null)})</span></div>` : ''}
    </div>
    ${v.devoluciones.length ? `<h2 class="seccion">Devoluciones</h2><div class="lista">${v.devoluciones.map(d => `<div class="fila-lista" style="padding:8px"><span class="ico" style="--c:#c27c0e;width:36px;height:36px">${ico('deshacer')}</span><span><div class="titulo">${d.cantidad} pieza${d.cantidad === 1 ? '' : 's'} · ${d.destino === 'inventario' ? 'regresó al inventario' : 'a merma (dañada)'}</div><div class="detalle">${fechaCorta(d.fecha)}${d.motivo ? ' · ' + esc(d.motivo) : ''}</div></span><span class="derecha">−${mxn(d.reembolso)}</span></div>`).join('')}</div>` : ''}`;
  if (!v.anulada && !v.devoluciones.length) {
    const pie = document.createElement('footer'); pie.className = 'hoja-pie';
    pie.innerHTML = `<button class="btn btn-peligro-suave" data-cancelar>${ico('x')} Cancelar venta</button>`;
    h.el.appendChild(pie);
    pie.querySelector('[data-cancelar]').onclick = async () => {
      if (!await confirmar({ titulo: '¿Cancelar la venta completa?', texto: 'Úselo si fue un error al cobrar. Todas las piezas regresan al inventario. Si el cliente devolvió algo, mejor use «Devolver».', si: 'Cancelar venta', no: 'No', peligro: true })) return;
      try { await api(`/api/ventas/${v.id}/anular`, { metodo: 'POST' }); aviso('Venta cancelada'); h.cerrar(); cargar(); } catch (e) { avisoError(e); }
    };
  }
  al(h.el, 'click', '[data-devolver]', b => { const r = v.renglones.find(x => x.id === +b.dataset.devolver); h.cerrar(); setTimeout(() => devolver(v, r), 200); });
}

function devolver(v, r) {
  const max = r.cantidad - r.devueltas, porPieza = r.neto / r.cantidad;
  let cantidad = 1, destino = 'inventario';
  const h = hoja({ titulo: 'Devolución', html: `<div data-c></div>`, pie: `<button class="btn btn-borde" data-no>Cancelar</button><button class="btn btn-primario" data-ok></button>` });
  const pinta = () => {
    h.el.querySelector('[data-c]').innerHTML = `
      <div class="fila-lista" style="margin-bottom:14px"><span class="ico">${esc(r.emoji)}</span><span><div class="titulo">${esc(r.producto)}${r.variante !== 'Única' ? ' · ' + esc(r.variante) : ''}</div><div class="detalle">Venta #${v.folio} · se cobró ${mxn(porPieza, true)} por pieza</div></span><span></span></div>
      <div class="formulario">
        ${max > 1 ? `<div class="campo"><span>Piezas que devuelve</span><span class="paso" style="align-self:flex-start"><button data-menos>${ico('menos')}</button><span class="num">${cantidad}</span><button data-mas>${ico('mas')}</button></span></div>` : ''}
        <div class="campo"><span>¿Cómo viene la pieza?</span><div class="metodos" style="grid-template-columns:1fr 1fr">
          <button class="metodo ${destino === 'inventario' ? 'activo' : ''}" data-dest="inventario"><span class="e">👍</span>Bien: se puede revender</button>
          <button class="metodo ${destino === 'merma' ? 'activo' : ''}" data-dest="merma"><span class="e">🩹</span>Dañada: va a merma</button></div></div>
        <label class="campo"><span>Motivo (opcional)</span><input data-motivo maxlength="120" placeholder="No le quedó, cambio de talla…"></label>
        <div class="cambio-grande"><span style="font-weight:700">Devolver al cliente</span><b>${mxn(porPieza * cantidad, true)}</b></div>
      </div>`;
    h.el.querySelector('[data-ok]').innerHTML = `${ico('deshacer')} Registrar devolución`;
  };
  pinta();
  al(h.el, 'click', '[data-mas]', () => { if (cantidad < max) { cantidad++; pinta(); } });
  al(h.el, 'click', '[data-menos]', () => { if (cantidad > 1) { cantidad--; pinta(); } });
  al(h.el, 'click', '[data-dest]', b => { destino = b.dataset.dest; const m = h.el.querySelector('[data-motivo]').value; pinta(); h.el.querySelector('[data-motivo]').value = m; });
  h.el.querySelector('[data-no]').onclick = () => h.cerrar();
  h.el.querySelector('[data-ok]').onclick = async () => {
    try {
      const d = (await api('/api/devoluciones', { metodo: 'POST', datos: { ventaId: v.id, renglonId: r.id, cantidad, destino, motivo: h.el.querySelector('[data-motivo]').value } })).devolucion;
      aviso(`Devolución registrada: entregue ${mxn(d.reembolso, true)} al cliente`); h.cerrar(); cargar();
    } catch (e) { avisoError(e); }
  };
}
