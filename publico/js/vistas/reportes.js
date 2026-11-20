/* ─────────────────────────────────────────────────────────────────────────────
   REPORTES (solo dueño), en tres pestañas:
     · Resultados: estado de resultados del periodo (en pesos y en dólares) contra el periodo
       anterior, ventas por día, por categoría, forma de pago, vendedores y lo más vendido.
     · Proyección: a dónde va el negocio con el ritmo actual, qué resurtir y cuánto cuesta, y
       el simulador «¿y si el dólar se va a…?» con precios sugeridos.
     · Gastos y merma: registrar gastos de operación y ver lo que se perdió.
   ───────────────────────────────────────────────────────────────────────────── */
import { estado, api, esc, mxn, usd, tcFmt, pct, num, fechaCorta, hoyLocal, sumarDias, variacion, NOMBRES, retrasar } from '../nucleo.js';
import { ico } from '../iconos.js';
import { aviso, avisoError, hoja, al, confirmar, esqueletos, insigniaVar, animarNumeros } from '../ui.js';
import { barras, barrasH, activarGraficas, COLORES } from '../graficas.js';

let raiz, pestana = 'resultados', periodo = '30', rango = null, proy = { dias: 30, tc: null };

export async function montar(el, params) {
  raiz = el;
  if (['resultados', 'proyeccion', 'gastos'].includes(params[0])) pestana = params[0];
  raiz.innerHTML = `<div class="titulo-vista"><div><h1>Reportes</h1><p>¿Es rentable? ¿A dónde va? ¿Qué resurtir?</p></div>
    <div class="segmento" data-pestanas>${[['resultados', 'Resultados'], ['proyeccion', 'Proyección'], ['gastos', 'Gastos y merma']].map(([k, t]) => `<button data-p="${k}" class="${pestana === k ? 'activo' : ''}">${t}</button>`).join('')}</div></div>
    <div data-cuerpo></div>`;
  al(raiz, 'click', '[data-p]', b => { pestana = b.dataset.p; for (const x of raiz.querySelectorAll('[data-p]')) x.classList.toggle('activo', x === b); history.replaceState(null, '', '#/reportes/' + pestana); mostrar(); });
  await mostrar();
}
export function alCambio(d) { if (['venta', 'devolucion', 'merma', 'gasto', 'compra'].includes(d.que)) retrasarMostrar(); }
const retrasarMostrar = retrasar(() => mostrar(true), 800);

async function mostrar(silencioso) {
  const c = raiz.querySelector('[data-cuerpo]');
  if (!silencioso) c.innerHTML = `<div class="rejilla r-4">${esqueletos(4, 90)}</div>${esqueletos(2, 200)}`;
  try { if (pestana === 'resultados') await resultados(c); else if (pestana === 'proyeccion') await proyeccion(c); else await gastos(c); }
  catch (e) { avisoError(e); }
}

/* Rango de fechas del periodo elegido */
function fechasPeriodo() {
  const h = hoyLocal();
  switch (periodo) {
    case 'hoy': return [h, h];
    case '7': return [sumarDias(h, -6), h];
    case '30': return [sumarDias(h, -29), h];
    case 'mes': return [h.slice(0, 8) + '01', h];
    case 'mesant': { const [a, m] = h.split('-').map(Number), ini = m === 1 ? `${a - 1}-12-01` : `${a}-${String(m - 1).padStart(2, '0')}-01`; const fin = sumarDias(h.slice(0, 8) + '01', -1); return [ini, fin]; }
    case '90': return [sumarDias(h, -89), h];
    case 'otro': return rango || [sumarDias(h, -29), h];
  }
  return [sumarDias(h, -29), h];
}
const periodos = () => `<div class="chips" data-periodos style="margin-bottom:14px">${[['hoy', 'Hoy'], ['7', '7 días'], ['30', '30 días'], ['mes', 'Este mes'], ['mesant', 'Mes pasado'], ['90', '90 días'], ['otro', 'Elegir fechas']].map(([k, t]) => `<button class="chip ${periodo === k ? 'activo' : ''}" data-per="${k}">${t}</button>`).join('')}</div>`;

/* ═════════ Resultados ═════════ */
async function resultados(c) {
  const [desde, hasta] = fechasPeriodo();
  const d = await api(`/api/reportes?desde=${desde}&hasta=${hasta}`);
  const r = d.resumen, a = d.anterior;
  const kpi = (et, v, f, vAnt, inverso) => `<div class="tarjeta kpi"><span class="kpi-etiqueta">${et}</span><span class="kpi-valor" data-contar="${v}" data-formato="${f}">${f === 'usd' ? usd(v) : mxn(v)}</span><span class="kpi-sub">${insigniaVar(variacion(v, vAnt), { inverso, sufijo: ' vs antes' })}</span></div>`;
  const fila = (t, m, u, cls = '') => `<div class="r ${cls}"><span>${t}</span><span>${mxn(m)}</span><span>${usd(u)}</span></div>`;
  const serie = d.serie.map(s => ({ etiqueta: d.serie.length > 31 ? s.fecha.slice(5).replace('-', '/') : s.fecha.slice(8), valores: [Math.max(0, s.costo), Math.max(0, s.ganancia)], tip: `<b>${fechaCorta(s.fecha)}</b><br>Venta ${mxn(s.neto)} · Ganancia ${mxn(s.ganancia)}<br>${s.piezas} piezas · ${usd(s.gananciaUsd)} de ganancia` }));
  c.innerHTML = `${periodos()}
    <p class="sec" style="margin:-4px 0 14px">Del ${fechaCorta(desde)} al ${fechaCorta(hasta)} · comparado con los ${d.serie.length} días anteriores</p>
    <div class="rejilla r-4">
      ${kpi('Venta neta', r.ventas.netoMxn, 'mxn', a.ventas.netoMxn)}
      ${kpi('Ganancia', r.ganancia.mxn, 'mxn', a.ganancia.mxn)}
      ${kpi('Ganancia en dólares', r.ganancia.usd, 'usd', a.ganancia.usd)}
      ${kpi('Utilidad (después de merma y gastos)', r.utilidad.mxn, 'mxn', a.utilidad.mxn)}
    </div>
    <div class="rejilla r-lado" style="margin-top:16px">
      <section class="tarjeta"><h3>Ventas por día</h3><p class="sec" style="margin:0 0 10px;font-size:var(--t-sm)">Naranja: lo que costó la mercancía vendida. Azul: la ganancia.</p>
        ${barras(serie, { series: [{ nombre: 'Costo de lo vendido', color: COLORES.costo }, { nombre: 'Ganancia', color: COLORES.ganancia }], alto: 240, etiquetasCada: Math.ceil(serie.length / 12) })}</section>
      <section class="tarjeta"><h3>Estado de resultados</h3>
        <div class="resultado" style="margin-top:8px">
          <div class="r encabezado"><span></span><span>Pesos</span><span>Dólares</span></div>
          ${fila('Ventas', r.ventas.bruto, r.ventas.netoUsd + r.ventas.reembolsos / (r.tcPromedioVenta || 1) + r.ventas.descuentos / (r.tcPromedioVenta || 1))}
          ${r.ventas.descuentos ? fila('Descuentos', r.ventas.descuentos, r.ventas.descuentos / (r.tcPromedioVenta || 1), 'menos') : ''}
          ${r.ventas.reembolsos ? fila('Devoluciones', r.ventas.reembolsos, r.ventas.reembolsos / (r.tcPromedioVenta || 1), 'menos') : ''}
          ${fila('Venta neta', r.ventas.netoMxn, r.ventas.netoUsd, 'sub')}
          ${fila('Costo de lo vendido', r.costo.mxn, r.costo.usd, 'menos')}
          ${fila(`Ganancia bruta (${pct(r.ganancia.margen)})`, r.ganancia.mxn, r.ganancia.usd, 'sub')}
          ${fila('Merma', r.merma.mxn, r.merma.usd, 'menos')}
          ${fila('Gastos de operación', r.gastos.mxn, r.gastos.usd, 'menos')}
          ${fila('Utilidad', r.utilidad.mxn, r.utilidad.usd, 'final')}
        </div>
        <p class="tenue" style="font-size:var(--t-xs);margin:10px 0 0">${r.ventas.num} ventas · ${r.ventas.piezas} piezas · venta promedio ${mxn(r.ventas.ticket)} · dólar promedio de venta ${tcFmt(r.tcPromedioVenta)}. En dólares, cada venta se convierte con el dólar del día en que se hizo.</p>
      </section>
    </div>
    <div class="rejilla r-3" style="margin-top:16px">
      <section class="tarjeta"><h3>Por categoría</h3><div style="margin-top:10px">${d.categorias.length ? barrasH(d.categorias.map(k => ({ nombre: `${k.emoji || ''} ${k.categoria}`, valor: k.ventas, texto: mxn(k.ventas) }))) : '<p class="tenue">Sin ventas.</p>'}</div></section>
      <section class="tarjeta"><h3>Forma de pago</h3><div style="margin-top:10px">${d.metodos.length ? barrasH(d.metodos.map(m => ({ nombre: `${NOMBRES.metodoEmoji[m.metodo]} ${NOMBRES.metodo[m.metodo]}`, valor: m.total, texto: mxn(m.total) }))) : '<p class="tenue">Sin ventas.</p>'}
        ${(d.metodos.find(m => m.metodo === 'dolares') || {}).dolares ? `<p class="sec" style="font-size:var(--t-sm)">Se recibieron ${usd(d.metodos.find(m => m.metodo === 'dolares').dolares)} en efectivo.</p>` : ''}</div></section>
      <section class="tarjeta"><h3>Por vendedor</h3><div style="margin-top:10px">${d.vendedores.length ? barrasH(d.vendedores.map(v => ({ nombre: v.nombre, valor: v.total, texto: `${mxn(v.total)} · ${v.num}` }))) : '<p class="tenue">Sin ventas.</p>'}</div></section>
    </div>
    <h2 class="seccion">Lo más vendido <a class="btn btn-borde btn-chico" href="/api/exportar/ventas.csv?desde=${desde}&hasta=${hasta}" download>${ico('descargar')} Excel</a></h2>
    <div class="tabla-envoltura"><table class="tabla"><thead><tr><th>Producto</th><th>Categoría</th><th class="der">Piezas</th><th class="der">Ventas</th><th class="der">Ganancia</th><th class="der">Margen</th></tr></thead>
      <tbody>${d.ranking.map(p => `<tr><td>${esc(p.emoji)} <a href="#/inventario/p/${p.id}">${esc(p.nombre)}</a></td><td>${esc(p.categoria || '')}</td><td class="der">${p.piezas}</td><td class="der">${mxn(p.ventas)}</td><td class="der">${mxn(p.ganancia)}</td><td class="der">${pct(p.ventas ? p.ganancia / p.ventas * 100 : null)}</td></tr>`).join('') || '<tr><td colspan="6" class="tenue">Sin ventas en el periodo.</td></tr>'}</tbody></table></div>`;
  enlazarPeriodos(c);
  animarNumeros(c, { mxn: n => mxn(n, false), usd });
  activarGraficas(c);
}

function enlazarPeriodos(c) {
  al(c, 'click', '[data-per]', b => {
    if (b.dataset.per === 'otro') {
      const [d0, h0] = fechasPeriodo();
      const h = hoja({ titulo: 'Elegir fechas', html: `<div class="formulario"><div class="doble"><label class="campo"><span>Desde</span><input type="date" data-d value="${d0}" max="${hoyLocal()}"></label><label class="campo"><span>Hasta</span><input type="date" data-h value="${h0}" max="${hoyLocal()}"></label></div></div>`,
        pie: `<button class="btn btn-primario" data-ok>Ver</button>` });
      h.el.querySelector('[data-ok]').onclick = () => { const d = h.el.querySelector('[data-d]').value, ha = h.el.querySelector('[data-h]').value; if (!d || !ha || d > ha) return aviso('Revise las fechas.', { tipo: 'mal' }); rango = [d, ha]; periodo = 'otro'; h.cerrar(); mostrar(); };
      return;
    }
    periodo = b.dataset.per; mostrar();
  });
}

/* ═════════ Proyección ═════════ */
async function proyeccion(c) {
  const q = `/api/proyeccion?dias=${proy.dias}${proy.tc ? '&tc=' + proy.tc : ''}`;
  const p = await api(q);
  const tcHoy = p.tcMercado || 18, tcSim = p.tcSimulado || tcHoy;
  const minS = Math.floor((tcHoy * 0.85) * 4) / 4, maxS = Math.ceil((tcHoy * 1.2) * 4) / 4;
  const sem = p.semana.map(s => ({ etiqueta: s.dia.slice(0, 3), valores: [s.promedio], tip: `<b>${s.dia}</b><br>${mxn(s.promedio)} en promedio` }));
  const cambiaron = p.productos.filter(x => x.existencia > 0 && x.precioSugerido && Math.abs(x.precioSugerido - x.precio) >= estado.sesion.ajustes.redondeo).sort((a, b) => (a.margenSimulado ?? 99) - (b.margenSimulado ?? 99));
  c.innerHTML = `
    <div class="tarjeta" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center">
        <div><h3>Mirar hacia adelante</h3><p class="sec" style="margin:0;font-size:var(--t-sm)">Con el ritmo de los últimos ${p.ventana} días${p.tendencia != null ? ` (tendencia ${p.tendencia > 0 ? '+' : ''}${p.tendencia.toFixed(0)} % contra las 2 semanas anteriores)` : ''}.</p></div>
        <div class="segmento">${[15, 30, 60, 90].map(d => `<button data-dias="${d}" class="${proy.dias === d ? 'activo' : ''}">${d} días</button>`).join('')}</div>
      </div>
      <div style="margin-top:18px"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap"><b>¿Y si el dólar se va a…?</b><span class="num" style="font-size:var(--t-xl);font-weight:800;color:#8a5600" data-tcsim>${tcFmt(tcSim)}</span></div>
        <input type="range" class="deslizador" min="${minS}" max="${maxS}" step="0.05" value="${tcSim}" data-slider aria-label="Dólar simulado" style="margin-top:10px">
        <div style="display:flex;justify-content:space-between" class="tenue"><small>${tcFmt(minS)}</small><button class="btn btn-chico btn-borde" data-tchoy>Dólar de hoy (${tcFmt(tcHoy)})</button><small>${tcFmt(maxS)}</small></div></div>
    </div>
    <div class="rejilla r-4">
      <div class="tarjeta kpi"><span class="kpi-etiqueta">Venta en ${p.dias} días</span><span class="kpi-valor">${mxn(p.proyectado.ventas)}</span><span class="kpi-sub">${mxn(p.porDia.ventas)} por día</span></div>
      <div class="tarjeta kpi"><span class="kpi-etiqueta">Ganancia en ${p.dias} días</span><span class="kpi-valor">${mxn(p.proyectado.ganancia)}</span><span class="kpi-sub">utilidad ${mxn(p.proyectado.utilidad)} tras gastos</span></div>
      <div class="tarjeta kpi"><span class="kpi-etiqueta">Esa ganancia en dólares</span><span class="kpi-valor">${usd(p.proyectado.gananciaUsdSimulada)}</span><span class="kpi-sub">al dólar de ${tcFmt(tcSim)}</span></div>
      <div class="tarjeta kpi"><span class="kpi-etiqueta">Para resurtir ${p.dias} días</span><span class="kpi-valor">${usd(p.presupuesto.usd)}</span><span class="kpi-sub">${mxn(p.presupuesto.mxn)} comprando a ${tcFmt(p.tcCompraSimulado)}</span></div>
    </div>
    <div class="rejilla r-lado" style="margin-top:16px">
      <section><h2 class="seccion" style="margin-top:0">Qué resurtir <small>se acaba primero</small></h2>
        ${p.resurtir.length ? `<div class="tabla-envoltura"><table class="tabla"><thead><tr><th>Producto</th><th class="der">Hay</th><th class="der">Por día</th><th>Se acaba</th><th class="der">Comprar</th><th class="der">Costo aprox.</th></tr></thead>
        <tbody>${p.resurtir.map(x => `<tr><td>${esc(x.emoji)} <a href="#/inventario/p/${x.id}">${esc(x.nombre)}</a></td><td class="der">${x.existencia}</td><td class="der">${x.porDia.toFixed(1)}</td>
          <td>${x.diasRestantes === 0 ? '<span class="insignia i-mal">Ya se acabó</span>' : x.diasRestantes != null ? `<span class="insignia ${x.diasRestantes <= 7 ? 'i-aviso' : 'i-gris'}">${fechaCorta(x.agotaEl)} (${x.diasRestantes} d)</span>` : '—'}</td>
          <td class="der"><b>${x.necesarias}</b></td><td class="der">${usd(x.presupuestoUsd)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="tenue">Con lo que hay alcanza para el periodo elegido.</p>'}
      </section>
      <section class="tarjeta"><h3>¿Qué días se vende más?</h3><p class="sec" style="font-size:var(--t-sm);margin:0 0 10px">Promedio de venta por día de la semana (últimas 8 semanas).</p>
        ${barras(sem, { series: [{ nombre: 'Venta promedio', color: COLORES.venta }], alto: 220, ancho: 400 })}</section>
    </div>
    <h2 class="seccion">Precios con el dólar a ${tcFmt(tcSim)} <small>margen objetivo ${p.margenObjetivo} %</small></h2>
    ${cambiaron.length ? `<div class="tabla-envoltura"><table class="tabla"><thead><tr><th>Producto</th><th class="der">Costo USD</th><th class="der">Reponer en pesos</th><th class="der">Precio actual</th><th class="der">Margen</th><th class="der">Sugerido</th><th></th></tr></thead>
      <tbody>${cambiaron.map(x => `<tr><td>${esc(x.emoji)} ${esc(x.nombre)}</td><td class="der">${usd(x.costoUsd)}</td><td class="der">${mxn(x.costoReposicion, true)}</td><td class="der">${mxn(x.precio)}</td>
        <td class="der"><span class="insignia ${x.margenSimulado >= p.margenObjetivo ? 'i-bien' : x.margenSimulado >= p.margenObjetivo * 0.6 ? 'i-aviso' : 'i-mal'}">${pct(x.margenSimulado)}</span></td><td class="der"><b>${mxn(x.precioSugerido)}</b></td>
        <td><button class="btn btn-chico btn-suave" data-aplicar="${x.id}:${x.precioSugerido}">Usar</button></td></tr>`).join('')}</tbody></table></div>`
      : '<p class="tenue">Con este dólar, todos sus precios están cerca del margen objetivo.</p>'}`;
  const slider = c.querySelector('[data-slider]'), etiqueta = c.querySelector('[data-tcsim]');
  slider.addEventListener('input', () => { etiqueta.textContent = tcFmt(+slider.value); });
  slider.addEventListener('change', () => { proy.tc = +slider.value; mostrar(true); });
  c.querySelector('[data-tchoy]').onclick = () => { proy.tc = null; mostrar(true); };
  al(c, 'click', '[data-dias]', b => { proy.dias = +b.dataset.dias; mostrar(true); });
  al(c, 'click', '[data-aplicar]', async b => {
    const [id, precio] = b.dataset.aplicar.split(':').map(Number);
    const prod = (await api('/api/productos/' + id)).producto;
    if (!await confirmar({ titulo: `¿Cambiar precio de ${prod.nombre}?`, texto: `De ${mxn(prod.precio)} a <b>${mxn(precio)}</b>. Las tallas con precio propio no cambian.`, si: 'Cambiar precio' })) return;
    try { await api('/api/productos/' + id, { metodo: 'PUT', datos: { ...prod, precio, variantes: prod.variantes.filter(v => v.activo).map(v => ({ id: v.id, nombre: v.nombre, precio: v.precioPropio })) } }); aviso('Precio actualizado'); mostrar(true); } catch (e) { avisoError(e); }
  });
  activarGraficas(c);
}

/* ═════════ Gastos y merma ═════════ */
async function gastos(c) {
  const [desde, hasta] = fechasPeriodo();
  const [g, m] = await Promise.all([api(`/api/gastos?desde=${desde}&hasta=${hasta}`), api(`/api/mermas?desde=${desde}&hasta=${hasta}`)]);
  const totG = g.gastos.reduce((s, x) => s + x.monto_mxn, 0), totM = m.mermas.reduce((s, x) => s + x.costo_mxn, 0), pzM = m.mermas.reduce((s, x) => s + x.cantidad, 0);
  const porCat = {}; for (const x of g.gastos) porCat[x.categoria] = (porCat[x.categoria] || 0) + x.monto_mxn;
  const porMotivo = {}; for (const x of m.mermas) porMotivo[x.motivo] = (porMotivo[x.motivo] || 0) + x.costo_mxn;
  c.innerHTML = `${periodos()}
    <div class="rejilla r-lado">
      <section>
        <h2 class="seccion" style="margin-top:0">Gastos de operación <span class="grupo-botones"><a class="btn btn-borde btn-chico" href="/api/exportar/gastos.csv?desde=${desde}&hasta=${hasta}" download>${ico('descargar')} Excel</a><button class="btn btn-primario btn-chico" data-gasto>${ico('mas')} Gasto</button></span></h2>
        <div class="tarjeta kpi" style="margin-bottom:12px"><span class="kpi-etiqueta">Total del periodo</span><span class="kpi-valor">${mxn(totG)}</span><span class="kpi-sub">${g.gastos.length} gastos</span></div>
        <div class="lista">${g.gastos.map(x => `<div class="fila-lista"><span class="ico" style="--c:#8b5cf6">${ico('billete')}</span><span style="min-width:0"><div class="titulo">${esc(x.concepto)}</div><div class="detalle">${fechaCorta(x.fecha)} · ${esc(x.categoria)}${x.moneda === 'USD' ? ` · ${usd(x.monto)} a ${tcFmt(x.tc)}` : ''}</div></span>
          <span class="derecha">${mxn(x.monto_mxn)} <button class="btn btn-borde btn-icono btn-chico" data-quitar-gasto="${x.id}" aria-label="Eliminar gasto" style="margin-left:6px;vertical-align:middle">${ico('basura')}</button></span></div>`).join('') || '<p class="tenue">Sin gastos en el periodo. Registre renta, luz, bolsas, gasolina del cruce… para ver la utilidad real.</p>'}</div>
      </section>
      <section class="tarjeta"><h3>En qué se va</h3><div style="margin-top:10px">${Object.keys(porCat).length ? barrasH(Object.entries(porCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ nombre: k, valor: v, texto: mxn(v) }))) : '<p class="tenue">Sin gastos.</p>'}</div></section>
    </div>
    <h2 class="seccion">Merma <a class="btn btn-borde btn-chico" href="/api/exportar/mermas.csv?desde=${desde}&hasta=${hasta}" download>${ico('descargar')} Excel</a></h2>
    <div class="rejilla r-lado">
      <div class="tabla-envoltura"><table class="tabla"><thead><tr><th>Fecha</th><th>Producto</th><th>Motivo</th><th class="der">Piezas</th><th class="der">Costo</th></tr></thead>
        <tbody>${m.mermas.map(x => `<tr><td>${fechaCorta(x.fecha)}</td><td>${esc(x.emoji)} ${esc(x.producto)}${x.variante !== 'Única' ? ' · ' + esc(x.variante) : ''}</td><td>${esc(NOMBRES.merma[x.motivo] || x.motivo)}${x.origen !== 'manual' ? ` <span class="tenue">(${x.origen === 'conteo' ? 'conteo' : 'devolución'})</span>` : ''}</td><td class="der">${x.cantidad}</td><td class="der">${mxn(x.costo_mxn)}</td></tr>`).join('') || '<tr><td colspan="5" class="tenue">Sin merma en el periodo. 🎉</td></tr>'}</tbody></table></div>
      <section class="tarjeta"><h3>Merma del periodo</h3><div class="kpi" style="margin:8px 0 12px"><span class="kpi-valor">${mxn(totM)}</span><span class="kpi-sub">${pzM} piezas</span></div>
        ${Object.keys(porMotivo).length ? barrasH(Object.entries(porMotivo).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ nombre: NOMBRES.merma[k] || k, valor: v, texto: mxn(v) }))) : ''}</section>
    </div>`;
  enlazarPeriodos(c);
  al(c, 'click', '[data-gasto]', nuevoGasto);
  al(c, 'click', '[data-quitar-gasto]', async b => { if (!await confirmar({ titulo: '¿Eliminar este gasto?', si: 'Eliminar', peligro: true })) return; try { await api('/api/gastos/' + b.dataset.quitarGasto, { metodo: 'DELETE' }); aviso('Gasto eliminado'); mostrar(true); } catch (e) { avisoError(e); } });
}

function nuevoGasto() {
  const cats = estado.sesion.ajustes.gastosCategorias; let cat = cats[0], moneda = 'MXN';
  const h = hoja({ titulo: 'Registrar gasto', html: `<form class="formulario" data-f>
      <label class="campo"><span>Concepto</span><input name="concepto" required maxlength="80" placeholder="Renta de noviembre" autofocus></label>
      <div class="campo"><span>Categoría</span><div class="chips" style="flex-wrap:wrap" data-cats></div></div>
      <div class="doble"><label class="campo"><span>Monto</span><input name="monto" inputmode="decimal" required placeholder="0"></label>
        <div class="campo"><span>Moneda</span><div class="segmento" data-mon><button type="button" data-m="MXN" class="activo">Pesos</button><button type="button" data-m="USD">Dólares</button></div></div></div>
      <label class="campo"><span>Fecha</span><input type="date" name="fecha" value="${hoyLocal()}" max="${hoyLocal()}"></label></form>`,
    pie: `<button class="btn btn-borde" data-no>Cancelar</button><button class="btn btn-primario" data-ok>Guardar gasto</button>` });
  const pinta = () => { h.el.querySelector('[data-cats]').innerHTML = cats.map(k => `<button type="button" class="chip ${k === cat ? 'activo' : ''}" data-c="${esc(k)}">${esc(k)}</button>`).join(''); for (const b of h.el.querySelectorAll('[data-m]')) b.classList.toggle('activo', b.dataset.m === moneda); };
  pinta();
  al(h.el, 'click', '[data-c]', b => { cat = b.dataset.c; pinta(); });
  al(h.el, 'click', '[data-m]', b => { moneda = b.dataset.m; pinta(); });
  h.el.querySelector('[data-no]').onclick = () => h.cerrar();
  h.el.querySelector('[data-ok]').onclick = async () => {
    const f = new FormData(h.el.querySelector('[data-f]'));
    try { await api('/api/gastos', { metodo: 'POST', datos: { concepto: f.get('concepto'), monto: f.get('monto'), fecha: f.get('fecha'), categoria: cat, moneda } }); aviso('Gasto registrado'); h.cerrar(); mostrar(true); } catch (e) { avisoError(e); }
  };
}
