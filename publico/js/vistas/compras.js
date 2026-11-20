/* ─────────────────────────────────────────────────────────────────────────────
   COMPRAS (solo dueño): lo que se compra al mayoreo, normalmente en dólares en EE. UU.

   Asistente de 3 pasos:
     1. Cuándo y dónde: la fecha y hora de la compra (puede ser de días atrás) → el sistema busca
        a cuánto estaba el dólar en ese momento (hora de la tienda) y pregunta a cuánto lo pagó
        usted en la casa de cambio.
     2. Qué compró: productos y piezas por talla, con costo por pieza, o un total por lote surtido.
     3. Impuesto y gastos (sales tax, puente, gasolina…) → se reparten entre las piezas para que
        cada una tenga su costo REAL «puesta en la tienda», en dólares y en pesos.
   ───────────────────────────────────────────────────────────────────────────── */
import { estado, api, cargarCatalogo, esc, mxn, usd, tcFmt, num, fechaCorta, hoyLocal, retrasar, hora24a12, NOMBRES } from '../nucleo.js';
import { ico } from '../iconos.js';
import { aviso, avisoError, hoja, al, confirmar, esqueletos, vacio } from '../ui.js';
import { formularioProducto } from './inventario.js';
import { ir } from '../app.js';

let raiz;

export async function montar(el, params) {
  raiz = el;
  raiz.innerHTML = `<div class="titulo-vista"><div><h1>Compras</h1><p>Mercancía comprada, con el dólar de cada día</p></div>
    <button class="btn btn-primario" data-nueva>${ico('mas')} Nueva compra</button></div>
    <div class="rejilla r-4" data-resumen style="margin-bottom:16px">${esqueletos(1, 90)}</div><div class="lista" data-lista>${esqueletos(4, 70)}</div>`;
  al(raiz, 'click', '[data-nueva]', () => asistente());
  al(raiz, 'click', '[data-compra]', b => detalle(+b.dataset.compra));
  await cargar();
  if (params[0] === 'nueva') asistente();
}
export function alCambio(d) { if (d.que === 'compra') cargar(); }

async function cargar() {
  let j; try { j = await api('/api/compras'); } catch (e) { return avisoError(e); }
  const compras = j.compras, activas = compras.filter(c => !c.anulada);
  const hace30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10), mes = activas.filter(c => c.fecha >= hace30);
  const usdMes = mes.reduce((s, c) => s + c.total_usd, 0), mxnMes = mes.reduce((s, c) => s + c.total_mxn, 0), pz = mes.reduce((s, c) => s + c.piezas, 0);
  raiz.querySelector('[data-resumen]').innerHTML = `
    <div class="tarjeta kpi"><span class="kpi-etiqueta">Comprado en 30 días</span><span class="kpi-valor">${usd(usdMes)}</span><span class="kpi-sub">${mxn(mxnMes)}</span></div>
    <div class="tarjeta kpi"><span class="kpi-etiqueta">Piezas</span><span class="kpi-valor">${num(pz)}</span><span class="kpi-sub">${mes.length} compra${mes.length === 1 ? '' : 's'}</span></div>
    <div class="tarjeta kpi"><span class="kpi-etiqueta">Costo promedio por pieza</span><span class="kpi-valor">${pz ? usd(usdMes / pz) : '—'}</span><span class="kpi-sub">${pz ? mxn(mxnMes / pz, true) : ''}</span></div>
    <div class="tarjeta kpi"><span class="kpi-etiqueta">Dólar promedio pagado</span><span class="kpi-valor">${usdMes ? tcFmt(mxnMes / usdMes) : '—'}</span><span class="kpi-sub">hoy compra ${tcFmt(estado.tc && estado.tc.compra)}</span></div>`;
  raiz.querySelector('[data-lista]').innerHTML = compras.length ? compras.map(c => `
    <button class="fila-lista" data-compra="${c.id}" style="--c:#6366f1;${c.anulada ? 'opacity:.55' : ''}">
      <span class="ico">${ico('camion')}</span>
      <span style="min-width:0"><div class="titulo">Compra #${c.folio}${c.proveedor ? ' · ' + esc(c.proveedor) : ''}${c.anulada ? ' <span class="insignia i-gris">Anulada</span>' : ''}</div>
        <div class="detalle">${fechaCorta(c.fecha)}${c.hora ? ' ' + hora24a12(c.hora) : ''} · ${c.piezas} piezas · dólar pagado ${tcFmt(c.tc_pagado)}${c.tc_mercado ? ` (mercado ${tcFmt(c.tc_mercado)})` : ''}</div></span>
      <span class="derecha">${usd(c.total_usd)}<small>${mxn(c.total_mxn)}</small></span></button>`).join('')
    : vacio({ emoji: '🚚', titulo: 'Sin compras registradas', texto: 'Registre lo que compró, aunque haya sido hace días: el sistema guarda el dólar de esa fecha para calcular su costo real en pesos.', boton: `<button class="btn btn-primario" data-nueva>${ico('mas')} Registrar compra</button>` });
}

/* ═════════ Detalle de una compra ═════════ */
async function detalle(id) {
  const h = hoja({ titulo: 'Compra', html: esqueletos(3, 80), ancha: true });
  let c; try { c = (await api('/api/compras/' + id)).compra; } catch (e) { h.cerrar(); return avisoError(e); }
  const tc = estado.tc || {};
  h.titulo(`Compra #${c.folio}${c.anulada ? ' (anulada)' : ''}`);
  const hoyCostaria = tc.compra ? c.total_usd * tc.compra : null;
  h.cuerpo.innerHTML = `
    <div class="rejilla r-4">
      <div class="tarjeta plana kpi"><span class="kpi-etiqueta">Fecha</span><span class="kpi-valor" style="font-size:var(--t-md)">${fechaCorta(c.fecha)} ${c.hora ? hora24a12(c.hora) : ''}</span><span class="kpi-sub">${esc(c.proveedor || 'Sin proveedor')}${c.lugar ? ' · ' + esc(c.lugar) : ''}</span></div>
      <div class="tarjeta plana kpi"><span class="kpi-etiqueta">Total</span><span class="kpi-valor">${usd(c.total_usd)}</span><span class="kpi-sub">${mxn(c.total_mxn, true)}</span></div>
      <div class="tarjeta plana kpi"><span class="kpi-etiqueta">Dólar</span><span class="kpi-valor">${tcFmt(c.tc_pagado)}</span><span class="kpi-sub">mercado ${tcFmt(c.tc_mercado)} · ${esc(NOMBRES.fuente[c.tc_fuente] || c.tc_fuente || '')}</span></div>
      <div class="tarjeta plana kpi"><span class="kpi-etiqueta">Hoy costaría</span><span class="kpi-valor">${mxn(hoyCostaria)}</span><span class="kpi-sub ${hoyCostaria > c.total_mxn ? 'mal' : 'bien'}">${hoyCostaria ? (hoyCostaria >= c.total_mxn ? '+' : '−') + mxn(Math.abs(hoyCostaria - c.total_mxn)) + ' contra lo que pagó' : ''}</span></div>
    </div>
    <div class="nota" style="margin-top:14px">${ico('info')}<span>Subtotal ${c.moneda === 'USD' ? usd(c.subtotal) : mxn(c.subtotal)} · impuesto ${c.moneda === 'USD' ? usd(c.impuesto) : mxn(c.impuesto)} · gastos ${usd(c.gastos_usd)} y ${mxn(c.gastos_mxn)} · reparto ${c.reparto === 'valor' ? 'por valor de cada pieza' : 'parejo por pieza (lote surtido)'}${c.notas ? ' · ' + esc(c.notas) : ''}</span></div>
    <h2 class="seccion">Piezas</h2>
    <div class="tabla-envoltura"><table class="tabla"><thead><tr><th>Producto</th><th>Talla</th><th class="der">Piezas</th><th class="der">Quedan</th><th class="der">Costo USD</th><th class="der">Costo MXN</th></tr></thead>
    <tbody>${c.lotes.map(l => `<tr><td>${esc(l.emoji)} ${esc(l.producto)}</td><td>${esc(l.variante)}</td><td class="der">${l.cantidad}</td><td class="der">${l.disponible}</td><td class="der">${usd(l.costo_usd)}</td><td class="der">${mxn(l.costo_mxn, true)}</td></tr>`).join('')}</tbody></table></div>`;
  if (!c.anulada) {
    const pie = document.createElement('footer'); pie.className = 'hoja-pie';
    pie.innerHTML = `<button class="btn btn-peligro-suave" data-anular>${ico('basura')} Anular compra</button>`;
    h.el.appendChild(pie);
    pie.querySelector('[data-anular]').onclick = async () => {
      if (!await confirmar({ titulo: '¿Anular esta compra?', texto: 'Se quitan sus piezas del inventario. Solo se puede si ninguna se ha vendido ni movido.', si: 'Anular', peligro: true })) return;
      try { await api(`/api/compras/${c.id}/anular`, { metodo: 'POST' }); aviso('Compra anulada'); h.cerrar(); cargar(); cargarCatalogo(true); } catch (e) { avisoError(e); }
    };
  }
}

/* ═════════ Asistente de compra ═════════ */
async function asistente() {
  await cargarCatalogo().catch(() => { });
  const proveedores = await api('/api/proveedores').then(j => j.proveedores).catch(() => []);
  const ahora = new Date(), hh = String(ahora.getHours()).padStart(2, '0') + ':' + String(ahora.getMinutes()).padStart(2, '0');
  const st = { paso: 1, fecha: hoyLocal(), hora: hh, proveedor: '', lugar: (proveedores[0] || {}).lugar || 'El Paso, TX', moneda: 'USD', tcPagado: '', momento: null,
    reparto: 'valor', subtotal: '', impuesto: '', gastosUsd: '', gastosMxn: '', notas: '', renglones: [], calculo: null };
  const h = hoja({ titulo: 'Nueva compra', ancha: true, html: '<div data-c></div>', pie: `<button class="btn btn-borde" data-atras>Atrás</button><button class="btn btn-primario" data-sig>Siguiente</button>` });
  const c = h.el.querySelector('[data-c]'), atras = h.el.querySelector('[data-atras]'), sig = h.el.querySelector('[data-sig]');
  const pasos = () => `<div class="pasos">${[1, 2, 3].map(n => `<span class="p ${n <= st.paso ? 'hecho' : ''}"></span>`).join('')}</div>`;

  /* --- Paso 1: cuándo, dónde y el dólar --- */
  const buscarDolar = retrasar(async () => {
    const caja = c.querySelector('[data-momento]'); if (!caja) return;
    caja.innerHTML = '<div class="esqueleto" style="height:60px"></div>';
    try {
      const m = await api(`/api/tc/momento?fecha=${st.fecha}&hora=${st.hora}`);
      const cambioTc = st.momento && st.tcPagado && +st.tcPagado === st.momento.compraSugerido;
      st.momento = m; if (!st.tcPagado || cambioTc) st.tcPagado = st.moneda === 'USD' ? m.compraSugerido : m.valor;
      /* Solo se actualiza la tarjeta del dólar y el campo (no se redibuja todo: no se pierde lo que se está escribiendo) */
      caja.innerHTML = momentoHTML();
      const campo = c.querySelector('[data-k="tcPagado"]'); if (campo) campo.value = st.tcPagado;
    } catch (e) { caja.innerHTML = `<div class="nota mal">${ico('alerta')}<span>${esc(e.message)}</span></div>`; }
  }, 350);
  const momentoHTML = () => st.momento ? `<div class="dolar-heroe" style="padding:16px"><div class="moneda-dec"></div>
          <div class="sec" style="font-weight:700">${esc(st.momento.detalle)} · ${fechaCorta(st.momento.fecha)} ${hora24a12(st.momento.hora)}</div>
          <div class="cifra" style="font-size:var(--t-2xl)">${tcFmt(st.momento.valor, 4)} <small>MXN por dólar</small></div>
          <div class="tenue" style="font-size:var(--t-xs)">Fuente: ${esc(NOMBRES.fuente[st.momento.fuente] || st.momento.fuente)}</div></div>` : '';
  const paso1 = () => `${pasos()}<h3 style="margin:0 0 4px">¿Cuándo y dónde compró?</h3><p class="sec" style="margin:0 0 14px">Si la compra fue hace días, ponga esa fecha: el sistema usa el dólar de ese momento.</p>
    <div class="formulario">
      <div class="doble"><label class="campo"><span>Fecha</span><input type="date" data-k="fecha" value="${st.fecha}" max="${hoyLocal()}"></label><label class="campo"><span>Hora (aprox.)</span><input type="time" data-k="hora" value="${st.hora}"></label></div>
      <div class="doble"><label class="campo"><span>Proveedor o tienda</span><input data-k="proveedor" list="lista-prov" value="${esc(st.proveedor)}" placeholder="Por ejemplo: Liquidaciones El Paso"><datalist id="lista-prov">${proveedores.map(p => `<option value="${esc(p.nombre)}">`).join('')}</datalist></label>
        <label class="campo"><span>Lugar</span><input data-k="lugar" value="${esc(st.lugar)}" placeholder="El Paso, TX"></label></div>
      <div class="campo"><span>Pagó en</span><div class="segmento"><button type="button" class="${st.moneda === 'USD' ? 'activo' : ''}" data-moneda="USD">🇺🇸 Dólares</button><button type="button" class="${st.moneda === 'MXN' ? 'activo' : ''}" data-moneda="MXN">🇲🇽 Pesos</button></div></div>
      <div data-momento>${momentoHTML()}</div>
      <label class="campo"><span>${st.moneda === 'USD' ? '¿A cuánto pagó cada dólar? (casa de cambio)' : 'Dólar para convertir a dólares'}</span><div class="con-prefijo"><i>$</i><input data-k="tcPagado" inputmode="decimal" value="${st.tcPagado}"></div>
        <small>${st.moneda === 'USD' ? `Sugerido: mercado + su ajuste de casa de cambio (${tcFmt(estado.sesion.ajustes.tc.ajusteCompra)}). Cámbielo si pagó otro precio.` : 'Se usa para ver esta compra también en dólares.'}</small></label>
    </div>`;

  /* --- Paso 2: qué compró --- */
  const cat = () => estado.catalogo || { productos: [], categorias: [] };
  const opcionesProductos = (sel) => `<option value="">Elija un producto…</option>` + cat().categorias.map(k => {
    const ps = cat().productos.filter(p => p.categoriaId === k.id); if (!ps.length) return '';
    return `<optgroup label="${esc(k.emoji + ' ' + k.nombre)}">${ps.map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.emoji + ' ' + p.nombre)}</option>`).join('')}</optgroup>`;
  }).join('') + cat().productos.filter(p => !p.categoriaId).map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('');
  const resumenRenglon = r => { const mon = st.moneda === 'USD' ? 'US$' : '$'; return `${piezasRenglon(r)} piezas${st.reparto === 'valor' && r.costo ? ` · ${mon}${(piezasRenglon(r) * r.costo).toFixed(2)}` : ''}`; };
  const piezasRenglon = r => Object.values(r.cantidades).reduce((s, n) => s + (+n || 0), 0);
  const paso2 = () => {
    const mon = st.moneda === 'USD' ? 'US$' : '$';
    const totPz = st.renglones.reduce((s, r) => s + piezasRenglon(r), 0);
    return `${pasos()}<h3 style="margin:0 0 4px">¿Qué compró?</h3><p class="sec" style="margin:0 0 12px">Elija cada producto y escriba cuántas piezas llegaron de cada talla.</p>
    <div class="campo" style="margin-bottom:12px"><span>¿Cómo le cobraron?</span><div class="segmento"><button type="button" class="${st.reparto === 'valor' ? 'activo' : ''}" data-reparto="valor">Precio por pieza</button><button type="button" class="${st.reparto === 'piezas' ? 'activo' : ''}" data-reparto="piezas">Un total por lote surtido</button></div></div>
    ${st.reparto === 'piezas' ? `<label class="campo" style="margin-bottom:12px"><span>Total pagado por el lote (sin impuesto)</span><div class="con-prefijo"><i>${mon}</i><input data-k="subtotal" inputmode="decimal" value="${st.subtotal}" placeholder="300"></div><small>Se reparte parejo entre todas las piezas.</small></label>` : ''}
    <div style="display:grid;gap:12px" data-renglones>${st.renglones.map((r, i) => {
      const p = cat().productos.find(x => x.id === r.productoId);
      return `<div class="renglon-compra" data-i="${i}">
        <div style="display:flex;gap:8px;align-items:flex-end"><label class="campo" style="flex:1"><span>Producto</span><select data-prod="${i}">${opcionesProductos(r.productoId)}</select></label>
          <button type="button" class="btn btn-borde btn-icono" data-quitar="${i}" aria-label="Quitar renglón">${ico('basura')}</button></div>
        ${p ? `<div class="tallas-cantidades">${p.variantes.map(v => `<label>${esc(v.nombre)}<input inputmode="numeric" data-cant="${i}:${v.id}" value="${r.cantidades[v.id] || ''}" placeholder="0"></label>`).join('')}</div>
          ${st.reparto === 'valor' ? `<label class="campo"><span>Costo por pieza</span><div class="con-prefijo"><i>${mon}</i><input data-costo="${i}" inputmode="decimal" value="${r.costo}" placeholder="5.00"></div></label>` : ''}
          <div class="sec" style="font-size:var(--t-sm)" data-resumen-r="${i}">${resumenRenglon(r)}</div>` : ''}
      </div>`;
    }).join('')}</div>
    <div class="grupo-botones" style="margin-top:12px"><button type="button" class="btn btn-suave" data-agregar>${ico('mas')} Agregar producto</button><button type="button" class="btn btn-borde" data-nuevo-prod>${ico('mas')} Crear producto nuevo</button></div>
    <p class="sec" style="font-weight:700;margin-top:14px" data-total-pz>${totPz} piezas en total</p>`;
  };

  /* --- Paso 3: impuesto, gastos y resumen --- */
  const calcular = retrasar(async () => {
    try { const j = await api('/api/compras/calcular', { metodo: 'POST', datos: datosCompra() }); st.calculo = j.calculo; } catch (e) { st.calculo = { error: e.message }; }
    if (st.paso === 3) pintarResumen();
  }, 300);
  const paso3 = () => {
    const mon = st.moneda === 'USD' ? 'US$' : '$';
    return `${pasos()}<h3 style="margin:0 0 4px">Impuesto y gastos</h3><p class="sec" style="margin:0 0 12px">Se reparten entre las piezas para que cada una tenga su costo real puesta en la tienda.</p>
    <div class="formulario">
      <div class="doble"><label class="campo"><span>Impuesto (sales tax)</span><div class="con-prefijo"><i>${mon}</i><input data-k="impuesto" inputmode="decimal" value="${st.impuesto}" placeholder="0.00"></div>
          ${st.moneda === 'USD' ? `<button type="button" class="btn btn-chico btn-suave" data-tax style="margin-top:6px;align-self:flex-start">Calcular 8.25 % (Texas)</button>` : ''}</label>
        <label class="campo"><span>Otros gastos en dólares</span><div class="con-prefijo"><i>US$</i><input data-k="gastosUsd" inputmode="decimal" value="${st.gastosUsd}" placeholder="0.00"></div><small>Envío, bolsas, propinas…</small></label></div>
      <label class="campo"><span>Gastos en pesos</span><div class="con-prefijo"><i>$</i><input data-k="gastosMxn" inputmode="decimal" value="${st.gastosMxn}" placeholder="0"></div><small>Puente, gasolina, aduana, flete…</small></label>
      <label class="campo"><span>Notas</span><input data-k="notas" value="${esc(st.notas)}" maxlength="300"></label>
    </div><div data-resumen style="margin-top:16px">${esqueletos(2, 80)}</div>`;
  };
  const pintarResumen = () => {
    const caja = c.querySelector('[data-resumen]'), k = st.calculo; if (!caja || !k) return;
    if (k.error) { caja.innerHTML = `<div class="nota mal">${ico('alerta')}<span>${esc(k.error)}</span></div>`; sig.disabled = true; return; }
    sig.disabled = false;
    const nombre = vid => { for (const p of cat().productos) { const v = p.variantes.find(x => x.id === vid); if (v) return `${p.emoji} ${p.nombre}${v.nombre !== 'Única' ? ' · ' + v.nombre : ''}`; } return '—'; };
    caja.innerHTML = `<div class="dolar-heroe" style="padding:18px"><div class="moneda-dec"></div>
      <div class="sec" style="font-weight:700">Total puesto en la tienda</div>
      <div class="cifra" style="font-size:var(--t-2xl)">${usd(k.totalUsd)}</div>
      <div style="font-weight:800;font-size:var(--t-lg)">${mxn(k.totalMxn, true)}</div>
      <div class="dolar-tres"><div><span>Piezas</span><b>${k.piezas}</b></div><div><span>Dólar pagado</span><b>${tcFmt(k.tcPagado)}</b></div><div><span>Costo promedio</span><b>${usd(k.totalUsd / k.piezas)}</b></div></div>
      ${k.sobrecostoCambio > 0.5 ? `<p class="sec" style="font-size:var(--t-sm);margin:12px 0 0">Comprar los dólares arriba del mercado (${tcFmt(k.tcMercado)}) le costó ${mxn(k.sobrecostoCambio)} extra.</p>` : ''}</div>
      <div class="tabla-envoltura" style="margin-top:12px"><table class="tabla"><thead><tr><th>Artículo</th><th class="der">Piezas</th><th class="der">Costo real c/u</th><th class="der">En pesos</th></tr></thead>
      <tbody>${k.renglones.map(r => `<tr><td>${esc(nombre(r.varianteId))}</td><td class="der">${r.cantidad}</td><td class="der">${usd(r.costoUsd)}</td><td class="der">${mxn(r.costoMxn, true)}</td></tr>`).join('')}</tbody></table></div>`;
  };

  const datosCompra = () => ({
    fecha: st.fecha, hora: st.hora, proveedor: st.proveedor, lugar: st.lugar, moneda: st.moneda, tcPagado: st.tcPagado, reparto: st.reparto, subtotal: st.subtotal,
    impuesto: st.impuesto || 0, gastosUsd: st.gastosUsd || 0, gastosMxn: st.gastosMxn || 0, notas: st.notas,
    renglones: st.renglones.flatMap(r => Object.entries(r.cantidades).filter(([, n]) => +n > 0).map(([vid, n]) => ({ varianteId: +vid, cantidad: +n, costo: r.costo })))
  });

  function pintar() {
    c.innerHTML = st.paso === 1 ? paso1() : st.paso === 2 ? paso2() : paso3();
    atras.textContent = st.paso === 1 ? 'Cancelar' : 'Atrás';
    sig.innerHTML = st.paso === 3 ? `${ico('palomita')} Guardar compra` : 'Siguiente';
    sig.disabled = false;
    if (st.paso === 1 && !st.momento) buscarDolar();
    if (st.paso === 3) { pintarResumen(); calcular(); }
  }
  /* Entradas: se guardan en el estado al escribir */
  c.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.k) { st[t.dataset.k] = t.value; if (t.dataset.k === 'fecha' || t.dataset.k === 'hora') { buscarDolar(); } if (st.paso === 3) calcular(); }
    /* Piezas y costo: se actualizan solo los totales (sin redibujar, para no cerrar el teclado del celular) */
    const i = t.dataset.cant ? +t.dataset.cant.split(':')[0] : t.dataset.costo !== undefined ? +t.dataset.costo : null;
    if (t.dataset.cant) { const vid = t.dataset.cant.split(':')[1]; st.renglones[i].cantidades[vid] = t.value; }
    if (t.dataset.costo !== undefined) st.renglones[i].costo = t.value;
    if (i !== null) {
      const res = c.querySelector(`[data-resumen-r="${i}"]`); if (res) res.textContent = resumenRenglon(st.renglones[i]);
      const tot = c.querySelector('[data-total-pz]'); if (tot) tot.textContent = `${st.renglones.reduce((s, r) => s + piezasRenglon(r), 0)} piezas en total`;
    }
  });
  c.addEventListener('change', e => {
    if (e.target.dataset.prod !== undefined) { const r = st.renglones[+e.target.dataset.prod]; r.productoId = +e.target.value || null; r.cantidades = {}; const p = cat().productos.find(x => x.id === r.productoId); if (p && !r.costo && p.costoUsd && st.moneda === 'USD') r.costo = (p.costoUsd / 1.0825).toFixed(2); pintar(); }
  });
  al(c, 'click', '[data-moneda]', b => { st.moneda = b.dataset.moneda; st.tcPagado = st.momento ? (st.moneda === 'USD' ? st.momento.compraSugerido : st.momento.valor) : st.tcPagado; pintar(); });
  al(c, 'click', '[data-reparto]', b => { st.reparto = b.dataset.reparto; pintar(); });
  al(c, 'click', '[data-agregar]', () => { st.renglones.push({ productoId: null, costo: '', cantidades: {} }); pintar(); });
  al(c, 'click', '[data-quitar]', b => { st.renglones.splice(+b.dataset.quitar, 1); pintar(); });
  al(c, 'click', '[data-nuevo-prod]', () => formularioProducto(null, id => { st.renglones.push({ productoId: id, costo: '', cantidades: {} }); pintar(); }));
  al(c, 'click', '[data-tax]', () => {
    const sub = st.reparto === 'piezas' ? +st.subtotal : st.renglones.reduce((s, r) => s + piezasRenglon(r) * (+r.costo || 0), 0);
    st.impuesto = (Math.round(sub * 0.0825 * 100) / 100).toFixed(2); pintar();
  });
  atras.onclick = () => { if (st.paso === 1) h.cerrar(); else { st.paso--; pintar(); } };
  sig.onclick = async () => {
    if (st.paso === 1) {
      if (!st.fecha) return aviso('Escriba la fecha de la compra.', { tipo: 'mal' });
      if (!(+st.tcPagado > 5)) return aviso('Escriba a cuánto pagó el dólar.', { tipo: 'mal' });
      if (!st.renglones.length) st.renglones.push({ productoId: null, costo: '', cantidades: {} });
      st.paso = 2; return pintar();
    }
    if (st.paso === 2) {
      const d = datosCompra();
      if (!d.renglones.length) return aviso('Agregue al menos un producto con piezas.', { tipo: 'mal' });
      if (st.reparto === 'valor' && st.renglones.some(r => piezasRenglon(r) > 0 && !(+r.costo > 0))) return aviso('Falta el costo por pieza de algún producto.', { tipo: 'mal' });
      if (st.reparto === 'piezas' && !(+st.subtotal > 0)) return aviso('Escriba el total que pagó por el lote.', { tipo: 'mal' });
      st.paso = 3; return pintar();
    }
    sig.disabled = true;
    try {
      const j = await api('/api/compras', { metodo: 'POST', datos: datosCompra() });
      aviso(`Compra #${j.compra.folio} guardada: ${j.compra.piezas} piezas por ${usd(j.compra.totalUsd)}`);
      h.cerrar(); cargar(); cargarCatalogo(true);
      if (location.hash.includes('/nueva')) history.replaceState(null, '', '#/compras');
    } catch (e) { avisoError(e); sig.disabled = false; }
  };
  pintar();
}
