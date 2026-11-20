/* ─────────────────────────────────────────────────────────────────────────────
   INVENTARIO
   · Lista de productos con sus tallas, piezas, costo en dólares y pesos, margen y
     días que alcanza el inventario al ritmo actual.
   · Ficha de producto: cada lote (compra) con el dólar al que se pagó, costo de reponerlo
     hoy, precio sugerido para el margen objetivo y su historial.
   · Alta/edición de productos (con tallas), merma y CONTEO FÍSICO (comparar estante vs sistema).
   Un vendedor ve solo existencias y precios (sin costos).
   ───────────────────────────────────────────────────────────────────────────── */
import { estado, api, escuchar, cargarCatalogo, esc, mxn, usd, tcFmt, pct, num, fechaCorta, esDueno, NOMBRES, hora24a12, vibrar, fotoDe, achicarFoto, subirArchivo } from '../nucleo.js';
import { ico } from '../iconos.js';
import { aviso, avisoError, hoja, al, confirmar, esqueletos, vacio, $ } from '../ui.js';
import { ir } from '../app.js';

let raiz, filtro = { cat: 'todo', q: '', vista: 'todo' }, quitar = [];
const EMOJIS = ['👕', '👚', '👔', '🎽', '👖', '🩳', '👗', '👘', '🩱', '🧥', '🥼', '🦺', '🧶', '🧣', '🧤', '🧦', '👟', '👠', '👡', '🥾', '👢', '🩴', '👞', '🧢', '👒', '🎩', '👜', '👛', '🎒', '💼', '🕶️', '⌚', '💍', '🧸', '👶', '🏷️', '🛍️', '⭐', '🔥', '💎'];
const TALLAS = { 'Ropa': ['CH', 'M', 'G', 'XG'], 'Ropa extendida': ['XCH', 'CH', 'M', 'G', 'XG', 'XXG'], 'Pantalón': ['28', '30', '32', '34', '36', '38'], 'Calzado': ['5', '6', '7', '8', '9', '10'], 'Niños': ['2', '4', '6', '8', '10', '12'], 'Única': ['Única'] };

export async function montar(el, params) {
  raiz = el;
  const dueno = esDueno();
  raiz.innerHTML = `
    <div class="titulo-vista"><div><h1>${dueno ? 'Inventario' : 'Existencias'}</h1><p data-sub>&nbsp;</p></div>
      ${dueno ? `<div class="grupo-botones"><button class="btn btn-borde" data-contar>${ico('conteo')} Contar</button><button class="btn btn-borde" data-merma>${ico('roto')} Merma</button><button class="btn btn-primario" data-nuevo>${ico('mas')} Producto</button></div>` : ''}</div>
    ${dueno ? '<div class="rejilla r-4" data-resumen style="margin-bottom:16px"></div>' : ''}
    <div class="buscador">${ico('buscar')}<input type="search" placeholder="Buscar producto o talla…" data-q></div>
    <div class="chips" data-chips style="margin:12px 0 4px"></div>
    <div class="lista" data-lista style="margin-top:8px">${esqueletos(5, 70)}</div>`;
  al(raiz, 'click', '[data-nuevo]', () => formularioProducto());
  al(raiz, 'click', '[data-contar]', conteo);
  al(raiz, 'click', '[data-merma]', () => merma());
  al(raiz, 'click', '[data-f]', b => { const [k, v] = b.dataset.f.split(':'); filtro[k] = v; if (k === 'vista') filtro.cat = 'todo'; if (k === 'cat') filtro.vista = 'todo'; pintar(); });
  al(raiz, 'click', '[data-p]', b => detalle(+b.dataset.p));
  raiz.querySelector('[data-q]').addEventListener('input', e => { filtro.q = e.target.value.trim().toLowerCase(); pintar(); });
  quitar = [escuchar('catalogo', pintar)];
  try { await cargarCatalogo(true); } catch (e) { avisoError(e); }
  pintar();
  /* Atajos por dirección: #/inventario/nuevo · #/inventario/contar · #/inventario/p/12 */
  if (params[0] === 'nuevo' && dueno) formularioProducto();
  if (params[0] === 'contar' && dueno) conteo();
  if (params[0] === 'p' && params[1]) detalle(+params[1]);
  return () => quitar.forEach(f => f());
}

function pintar() {
  const c = estado.catalogo; if (!c || !raiz) return;
  const minimo = estado.sesion.ajustes.stockMinimo, dueno = esDueno();
  const todos = c.productos;
  const piezas = todos.reduce((s, p) => s + p.existencia, 0);
  raiz.querySelector('[data-sub]').textContent = `${num(piezas)} piezas en ${todos.length} producto${todos.length === 1 ? '' : 's'}`;
  if (dueno) {
    const costo = todos.reduce((s, p) => s + p.valorMxn, 0), costoUsd = todos.reduce((s, p) => s + p.valorUsd, 0), venta = todos.reduce((s, p) => s + p.valorVenta, 0);
    const repo = estado.tc && estado.tc.compra ? costoUsd * estado.tc.compra : null;
    raiz.querySelector('[data-resumen]').innerHTML = `
      <div class="tarjeta kpi"><span class="kpi-etiqueta">Le costó</span><span class="kpi-valor">${mxn(costo)}</span><span class="kpi-sub">${usd(costoUsd)}</span></div>
      <div class="tarjeta kpi"><span class="kpi-etiqueta">Reponerlo hoy</span><span class="kpi-valor">${mxn(repo)}</span><span class="kpi-sub">dólar de compra ${tcFmt(estado.tc && estado.tc.compra)}</span></div>
      <div class="tarjeta kpi"><span class="kpi-etiqueta">A precio de venta</span><span class="kpi-valor">${mxn(venta)}</span><span class="kpi-sub">ganancia posible ${mxn(venta - costo)}</span></div>
      <div class="tarjeta kpi"><span class="kpi-etiqueta">Margen promedio</span><span class="kpi-valor">${venta ? pct((venta - costo) / venta * 100) : '—'}</span><span class="kpi-sub">objetivo ${estado.sesion.ajustes.margenObjetivo} %</span></div>`;
  }
  const bajos = todos.filter(p => p.existencia > 0 && p.existencia <= (p.minimo ?? minimo)).length, agot = todos.filter(p => p.existencia <= 0).length;
  const quietos = todos.filter(p => p.existencia > 0 && p.vendidas30 === 0).length, sinFoto = todos.filter(p => !p.foto).length;
  const catsCon = c.categorias.filter(k => todos.some(p => p.categoriaId === k.id));
  raiz.querySelector('[data-chips]').innerHTML = [
    `<button class="chip ${filtro.vista === 'todo' && filtro.cat === 'todo' ? 'activo' : ''}" data-f="vista:todo">Todo <span class="cuenta">${todos.length}</span></button>`,
    bajos ? `<button class="chip ${filtro.vista === 'bajo' ? 'activo' : ''}" data-f="vista:bajo">⚠️ Por agotarse <span class="cuenta">${bajos}</span></button>` : '',
    agot ? `<button class="chip ${filtro.vista === 'agotado' ? 'activo' : ''}" data-f="vista:agotado">Agotados <span class="cuenta">${agot}</span></button>` : '',
    quietos && dueno ? `<button class="chip ${filtro.vista === 'quieto' ? 'activo' : ''}" data-f="vista:quieto">😴 Sin vender 30 días <span class="cuenta">${quietos}</span></button>` : '',
    sinFoto && dueno ? `<button class="chip ${filtro.vista === 'sinfoto' ? 'activo' : ''}" data-f="vista:sinfoto">📷 Sin foto <span class="cuenta">${sinFoto}</span></button>` : '',
    ...catsCon.map(k => `<button class="chip ${filtro.cat == k.id ? 'activo' : ''}" data-f="cat:${k.id}">${esc(k.emoji)} ${esc(k.nombre)}</button>`)
  ].join('');

  let lista = todos;
  if (filtro.cat !== 'todo') lista = lista.filter(p => p.categoriaId == filtro.cat);
  if (filtro.vista === 'bajo') lista = lista.filter(p => p.existencia > 0 && p.existencia <= (p.minimo ?? minimo));
  if (filtro.vista === 'agotado') lista = lista.filter(p => p.existencia <= 0);
  if (filtro.vista === 'quieto') lista = lista.filter(p => p.existencia > 0 && p.vendidas30 === 0);
  if (filtro.vista === 'sinfoto') lista = lista.filter(p => !p.foto);
  if (filtro.q) lista = lista.filter(p => (p.nombre + ' ' + (p.categoria || '') + ' ' + p.variantes.map(v => v.nombre).join(' ')).toLowerCase().includes(filtro.q));
  const caja = raiz.querySelector('[data-lista]');
  if (!todos.length) { caja.innerHTML = vacio({ emoji: '📦', titulo: 'El inventario está vacío', texto: dueno ? 'Lo más rápido: registre una compra (con la fecha en que se compró, para guardar el dólar de ese día). También puede crear productos y luego contarlos.' : 'Todavía no hay productos.',
    boton: dueno ? `<div class="grupo-botones" style="justify-content:center"><a class="btn btn-primario" href="#/compras/nueva">${ico('camion')} Registrar compra</a><button class="btn btn-borde" data-nuevo>${ico('mas')} Producto</button></div>` : '' }); return; }
  if (!lista.length) { caja.innerHTML = vacio({ emoji: '🔎', titulo: 'Nada con ese filtro' }); return; }
  caja.innerHTML = lista.map(p => {
    const margen = p.margen == null ? '' : `<span class="insignia ${p.margen >= estado.sesion.ajustes.margenObjetivo ? 'i-bien' : p.margen >= estado.sesion.ajustes.margenObjetivo * 0.6 ? 'i-aviso' : 'i-mal'}">${pct(p.margen)}</span>`;
    const dias = p.existencia <= 0 ? 'agotado' : p.diasInventario != null ? `alcanza ~${p.diasInventario} día${p.diasInventario === 1 ? '' : 's'}` : 'sin ventas recientes';
    return `<button class="fila-lista" data-p="${p.id}" style="--c:${esc(p.color)}">
      <span class="ico">${fotoDe(p) ? `<img class="foto" src="${fotoDe(p)}" alt="" loading="lazy">` : esc(p.emoji)}</span>
      <span style="min-width:0"><div class="titulo">${esc(p.nombre)}</div>
        <div class="detalle">${esc(p.categoria || 'Sin categoría')} · ${mxn(p.precio)}${dueno && p.costoUsd ? ` · costo ${usd(p.costoUsd)}` : ''}${dias ? ' · ' + dias : ''}</div>
        <div class="tallitas">${p.variantes.map(v => `<span class="tallita ${v.existencia <= 0 ? 'cero' : v.existencia <= 2 ? 'poco' : ''}">${v.nombre === 'Única' ? '' : esc(v.nombre) + ' · '}${v.existencia}</span>`).join('')}</div></span>
      <span class="derecha">${num(p.existencia)} <small>pzs</small>${dueno ? `<div style="margin-top:4px">${margen}</div>` : ''}</span></button>`;
  }).join('');
}

/* ═════════ Ficha del producto ═════════ */
async function detalle(id) {
  const h = hoja({ titulo: 'Producto', html: esqueletos(3, 90), ancha: true });
  let p;
  try { p = (await api('/api/productos/' + id)).producto; } catch (e) { h.cerrar(); return avisoError(e); }
  const dueno = esDueno(), aj = estado.sesion.ajustes, tc = estado.tc || {};
  h.titulo(`${p.emoji} ${p.nombre}`);
  const sugerido = p.costoReposicion ? Math.ceil(p.costoReposicion / (1 - aj.margenObjetivo / 100) / aj.redondeo) * aj.redondeo : null;
  h.cuerpo.innerHTML = `
    <div class="foto-caja foto-ficha" style="--c:${esc(p.color)}" data-foto-ficha>${fotoDe(p) ? `<img src="${fotoDe(p)}" alt="${esc(p.nombre)}">` : esc(p.emoji)}
      ${dueno ? `<div class="acciones-foto"><label class="btn btn-chico">${ico('celular')} ${p.foto ? 'Cambiar foto' : 'Tomar o elegir foto'}<input type="file" accept="image/*" data-archivo-foto hidden></label>${p.foto ? `<button class="btn btn-chico" data-quitar-foto>${ico('basura')}</button>` : ''}</div>` : ''}</div>
    <div class="rejilla r-4">
      <div class="tarjeta plana kpi"><span class="kpi-etiqueta">Piezas</span><span class="kpi-valor">${num(p.existencia)}</span><span class="kpi-sub">${p.vendidas30} vendidas en 30 días</span></div>
      <div class="tarjeta plana kpi"><span class="kpi-etiqueta">Precio</span><span class="kpi-valor">${mxn(p.precio)}</span><span class="kpi-sub">${tc.recibir ? '≈ ' + usd(p.precio / tc.recibir) : ''}</span></div>
      ${dueno ? `<div class="tarjeta plana kpi"><span class="kpi-etiqueta">Le cuesta cada una</span><span class="kpi-valor">${usd(p.costoUsd)}</span><span class="kpi-sub">${mxn(p.costoMxn, true)} · margen ${pct(p.margen)}</span></div>
      <div class="tarjeta plana kpi"><span class="kpi-etiqueta">Reponerla hoy</span><span class="kpi-valor">${mxn(p.costoReposicion, true)}</span><span class="kpi-sub">margen con reposición ${pct(p.margenReposicion)}</span></div>` : `<div class="tarjeta plana kpi"><span class="kpi-etiqueta">Categoría</span><span class="kpi-valor" style="font-size:var(--t-md)">${esc(p.categoria || '—')}</span></div>`}
    </div>
    ${dueno && sugerido && Math.abs(sugerido - p.precio) >= aj.redondeo ? `<div class="nota ${sugerido > p.precio ? 'aviso' : ''}" style="margin-top:14px">${ico('dolar')}<span style="flex:1">Para ganar el <b>${aj.margenObjetivo} %</b> con el dólar de hoy, el precio sugerido es <b>${mxn(sugerido)}</b> (hoy está en ${mxn(p.precio)}).</span><button class="btn btn-chico btn-suave" data-usar="${sugerido}">Usar ${mxn(sugerido)}</button></div>` : ''}
    <h2 class="seccion">Tallas</h2>
    <div class="tabla-envoltura"><table class="tabla"><thead><tr><th>Talla</th><th class="der">Piezas</th><th class="der">Precio</th>${dueno ? '<th class="der">Costo USD</th><th class="der">Costo MXN</th>' : ''}<th class="der">Vendidas 30 d</th></tr></thead>
      <tbody>${p.variantes.filter(v => v.activo).map(v => `<tr><td><b>${esc(v.nombre)}</b></td><td class="der">${v.existencia}</td><td class="der">${mxn(v.precio)}</td>${dueno ? `<td class="der">${usd(v.costoUsd)}</td><td class="der">${mxn(v.costoMxn, true)}</td>` : ''}<td class="der">${v.vendidas30}</td></tr>`).join('')}</tbody></table></div>
    ${dueno && p.lotes.length ? `<h2 class="seccion">Compras de este producto <small>cada lote con su dólar</small></h2>
      <div class="tabla-envoltura"><table class="tabla"><thead><tr><th>Fecha</th><th>Talla</th><th>Origen</th><th class="der">Quedan</th><th class="der">Costo USD</th><th class="der">Costo MXN</th><th class="der">Dólar pagado</th><th class="der">Hoy costaría</th></tr></thead>
      <tbody>${p.lotes.map(l => `<tr><td>${fechaCorta(l.fecha)}</td><td>${esc(l.variante)}</td><td>${l.compra_folio ? `Compra #${l.compra_folio}${l.proveedor ? ' · ' + esc(l.proveedor) : ''}` : l.origen === 'conteo' ? 'Sobrante de conteo' : esc(l.origen)}</td>
        <td class="der">${l.disponible}/${l.cantidad}</td><td class="der">${usd(l.costo_usd)}</td><td class="der">${mxn(l.costo_mxn, true)}</td><td class="der">${tcFmt(l.tc)}</td>
        <td class="der">${tc.compra ? `<span class="${l.costo_usd * tc.compra > l.costo_mxn ? 'mal' : 'bien'}">${mxn(l.costo_usd * tc.compra, true)}</span>` : '—'}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <h2 class="seccion">Movimientos</h2>
    ${p.movimientos.length ? `<div class="lista">${p.movimientos.slice(0, 25).map(m => {
      const t = { venta: ['bolsa', 'Venta', '#0b8fc6', `−${m.cantidad}`], merma: ['roto', 'Merma · ' + (NOMBRES.merma[m.ref] || m.ref), '#e0484f', `−${m.cantidad}`], devolucion: ['deshacer', 'Devolución' + (m.ref === 'merma' ? ' (dañada)' : ''), '#c27c0e', m.ref === 'merma' ? '±0' : `+${m.cantidad}`], entrada: ['camion', m.ref === 'conteo' ? 'Sobrante de conteo' : 'Entrada por compra', '#6366f1', `+${m.cantidad}`] }[m.tipo];
      return `<div class="fila-lista" style="padding:8px"><span class="ico" style="--c:${t[2]};width:36px;height:36px">${ico(t[0])}</span><span style="min-width:0"><div class="titulo">${t[1]}${m.variante !== 'Única' ? ' · ' + esc(m.variante) : ''}</div><div class="detalle">${fechaCorta(m.fecha)}${m.tipo === 'venta' ? ' · folio ' + m.ref + ' · ' + mxn(m.importe) : ''}</div></span><span class="derecha">${t[3]}</span></div>`;
    }).join('')}</div>` : '<p class="tenue">Sin movimientos todavía.</p>'}
    ${p.notas ? `<div class="nota" style="margin-top:16px">${ico('info')}<span>${esc(p.notas)}</span></div>` : ''}`;
  if (dueno) {
    /* Foto desde la ficha: cámara o galería del celular */
    const inp = h.el.querySelector('[data-archivo-foto]');
    if (inp) inp.onchange = async () => { const f = inp.files[0]; if (!f) return; if (await subirFoto(p.id, f, h.el.querySelector('[data-foto-ficha]'))) { h.cerrar(); setTimeout(() => detalle(p.id), 250); } };
    const q = h.el.querySelector('[data-quitar-foto]');
    if (q) q.onclick = async () => { if (!await confirmar({ titulo: '¿Quitar la foto?', si: 'Quitar', peligro: true })) return; try { await api(`/api/productos/${p.id}/foto`, { metodo: 'DELETE' }); await cargarCatalogo(true); h.cerrar(); setTimeout(() => detalle(p.id), 250); } catch (e) { avisoError(e); } };
    const pie = document.createElement('footer'); pie.className = 'hoja-pie';
    pie.innerHTML = `<button class="btn btn-borde" data-archivar>${ico(p.activo ? 'basura' : 'recargar')} ${p.activo ? 'Archivar' : 'Reactivar'}</button><button class="btn btn-borde" data-mermar>${ico('roto')} Merma</button><button class="btn btn-primario" data-editar>${ico('lapiz')} Editar</button>`;
    h.el.appendChild(pie);
    pie.querySelector('[data-editar]').onclick = () => { h.cerrar(); setTimeout(() => formularioProducto(p), 200); };
    pie.querySelector('[data-mermar]').onclick = () => { h.cerrar(); setTimeout(() => merma(p), 200); };
    pie.querySelector('[data-archivar]').onclick = async () => {
      if (p.activo && !await confirmar({ titulo: '¿Archivar producto?', texto: 'Deja de aparecer para vender. Sus números e historial se conservan y puede reactivarlo cuando quiera.', si: 'Archivar' })) return;
      try { await api(`/api/productos/${p.id}/activo`, { metodo: 'POST', datos: { activo: !p.activo } }); aviso(p.activo ? 'Producto archivado' : 'Producto reactivado'); h.cerrar(); cargarCatalogo(true); } catch (e) { avisoError(e); }
    };
    al(h.el, 'click', '[data-usar]', async b => {
      const prod = { ...p, precio: +b.dataset.usar, categoriaId: p.categoriaId, variantes: p.variantes.filter(v => v.activo).map(v => ({ id: v.id, nombre: v.nombre, precio: v.precioPropio })) };
      try { await api('/api/productos/' + p.id, { metodo: 'PUT', datos: prod }); aviso(`Precio actualizado a ${mxn(+b.dataset.usar)}`); h.cerrar(); cargarCatalogo(true); } catch (e) { avisoError(e); }
    });
  }
}

/* ═════════ Alta y edición de producto ═════════ */
export function formularioProducto(p = null, alGuardar) {
  const c = estado.catalogo || { categorias: [] };
  let emoji = p ? p.emoji : '👕', categoriaId = p ? p.categoriaId : (c.categorias[0] || {}).id;
  let tallas = p ? p.variantes.filter(v => v.activo !== false).map(v => ({ id: v.id, nombre: v.nombre, precio: v.precioPropio ?? '' })) : TALLAS['Ropa'].map(n => ({ nombre: n, precio: '' }));
  let fotoNueva = null;      // foto elegida para un producto nuevo (se sube al guardarlo)
  const h = hoja({ titulo: p ? 'Editar producto' : 'Nuevo producto', html: `
    <form class="formulario" data-f>
      <div class="foto-caja" data-foto-form style="height:190px;aspect-ratio:auto">${p && p.foto ? `<img src="${fotoDe(p)}" alt="">` : `<span data-emoji-grande>${esc(emoji)}</span>`}
        <div class="acciones-foto"><label class="btn btn-chico">${ico('celular')} ${p && p.foto ? 'Cambiar foto' : 'Tomar o elegir foto'}<input type="file" accept="image/*" data-archivo hidden></label></div></div>
      <small class="sec" style="margin-top:-6px">La foto ayuda a quien vende a reconocer la prenda. Con el celular puede tomarla con la cámara o elegirla de la galería.</small>
      <label class="campo"><span>Nombre</span><input name="nombre" required maxlength="60" value="${esc(p ? p.nombre : '')}" placeholder="Por ejemplo: Playera estampada" autofocus></label>
      <div class="campo"><span>Categoría</span><div class="chips" data-cats style="flex-wrap:wrap"></div></div>
      <div class="doble"><label class="campo"><span>Precio de venta</span><div class="con-prefijo"><i>$</i><input name="precio" inputmode="decimal" required value="${p ? p.precio : ''}" placeholder="199"></div></label>
        <label class="campo"><span>Avisar cuando queden</span><input name="minimo" inputmode="numeric" value="${p && p.minimo != null ? p.minimo : ''}" placeholder="${estado.sesion.ajustes.stockMinimo} (general)"></label></div>
      <div class="campo"><span>Dibujo</span><div class="emojis" data-emojis></div></div>
      <div class="campo"><span>Tallas</span>
        <div class="chips" style="flex-wrap:wrap" data-presets>${Object.keys(TALLAS).map(k => `<button type="button" class="chip" data-preset="${k}">${k}</button>`).join('')}</div>
        <div class="tallitas" data-tallas style="gap:8px;margin-top:6px"></div>
        <div style="display:flex;gap:8px;margin-top:6px"><input class="entrada" data-nueva-talla placeholder="Agregar talla (ej. XL, 7.5, 14)" maxlength="20" style="flex:1"><button type="button" class="btn btn-suave" data-agregar-talla>${ico('mas')}</button></div>
        <small>Toque una talla para quitarla. Si todas cuestan lo mismo, no escriba precios por talla.</small>
      </div>
      <details><summary class="sec" style="cursor:pointer;font-weight:700">Precio distinto por talla y notas</summary>
        <div data-precios-talla class="tallas-cantidades" style="margin:12px 0"></div>
        <label class="campo"><span>Notas</span><textarea name="notas" maxlength="300">${esc(p ? p.notas || '' : '')}</textarea></label></details>
    </form>`, pie: `<button class="btn btn-borde" data-cancelar>Cancelar</button><button class="btn btn-primario" data-guardar>${ico('palomita')} Guardar</button>` });
  const f = h.el.querySelector('[data-f]');
  const pintaCats = () => { h.el.querySelector('[data-cats]').innerHTML = c.categorias.map(k => `<button type="button" class="chip ${k.id === categoriaId ? 'activo' : ''}" data-cat="${k.id}">${esc(k.emoji)} ${esc(k.nombre)}</button>`).join(''); };
  const pintaEmojis = () => { h.el.querySelector('[data-emojis]').innerHTML = EMOJIS.map(e => `<button type="button" class="${e === emoji ? 'activo' : ''}" data-e="${e}">${e}</button>`).join(''); };
  const pintaTallas = () => {
    h.el.querySelector('[data-tallas]').innerHTML = tallas.map((t, i) => `<button type="button" class="chip" data-quitar-talla="${i}" title="Quitar">${esc(t.nombre)} ${ico('x', 'width="14" height="14"')}</button>`).join('') || '<span class="tenue">Sin tallas: se usará «Única».</span>';
    h.el.querySelector('[data-precios-talla]').innerHTML = tallas.map((t, i) => `<label>${esc(t.nombre)}<input inputmode="decimal" data-precio-talla="${i}" value="${t.precio}" placeholder="$"></label>`).join('');
  };
  pintaCats(); pintaEmojis(); pintaTallas();
  /* Elegir foto: en un producto existente se sube al momento; en uno nuevo, al guardar */
  h.el.querySelector('[data-archivo]').onchange = async ev => {
    const f = ev.target.files[0]; if (!f) return;
    const caja = h.el.querySelector('[data-foto-form]');
    if (p) { if (await subirFoto(p.id, f, caja)) { p.foto = (estado.catalogo.productos.find(x => x.id === p.id) || {}).foto; caja.querySelector('img, [data-emoji-grande]').outerHTML = `<img src="${fotoDe(p)}" alt="">`; } return; }
    try { fotoNueva = await achicarFoto(f); const url = URL.createObjectURL(fotoNueva); const actual = caja.querySelector('img, [data-emoji-grande]'); actual.outerHTML = `<img src="${url}" alt="">`; }
    catch (e) { avisoError(e); }
  };
  al(h.el, 'click', '[data-cat]', b => { categoriaId = +b.dataset.cat; const k = c.categorias.find(x => x.id === categoriaId); if (k && !p) { emoji = k.emoji; pintaEmojis(); } pintaCats(); });
  al(h.el, 'click', '[data-e]', b => { emoji = b.dataset.e; pintaEmojis(); vibrar(6); const g = h.el.querySelector('[data-emoji-grande]'); if (g) g.textContent = emoji; });
  al(h.el, 'click', '[data-preset]', b => { tallas = TALLAS[b.dataset.preset].map(n => ({ ...(tallas.find(t => t.nombre === n) || {}), nombre: n, precio: (tallas.find(t => t.nombre === n) || {}).precio || '' })); pintaTallas(); });
  al(h.el, 'click', '[data-quitar-talla]', b => { tallas.splice(+b.dataset.quitarTalla, 1); pintaTallas(); });
  const agregarTalla = () => { const i = h.el.querySelector('[data-nueva-talla]'); const n = i.value.trim(); if (!n) return; if (!tallas.some(t => t.nombre.toLowerCase() === n.toLowerCase())) tallas.push({ nombre: n, precio: '' }); i.value = ''; pintaTallas(); };
  h.el.querySelector('[data-agregar-talla]').onclick = agregarTalla;
  h.el.querySelector('[data-nueva-talla]').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); agregarTalla(); } });
  h.el.addEventListener('input', e => { if (e.target.dataset.precioTalla !== undefined) tallas[+e.target.dataset.precioTalla].precio = e.target.value; });
  h.el.querySelector('[data-cancelar]').onclick = () => h.cerrar();
  const guardar = async () => {
    const d = new FormData(f);
    const datos = { nombre: d.get('nombre'), precio: d.get('precio'), minimo: d.get('minimo'), notas: d.get('notas'), categoriaId, emoji, variantes: tallas.map(t => ({ id: t.id, nombre: t.nombre, precio: t.precio })) };
    try {
      const r = p ? await api('/api/productos/' + p.id, { metodo: 'PUT', datos }) : await api('/api/productos', { metodo: 'POST', datos });
      if (!p && fotoNueva) { try { await subirArchivo(`/api/productos/${r.id}/foto`, fotoNueva, 'image/jpeg'); } catch (e) { aviso('El producto se creó, pero la foto no se pudo subir: ' + e.message, { tipo: 'mal' }); } }
      aviso(p ? 'Producto guardado' : `«${datos.nombre}» creado`); h.cerrar(); await cargarCatalogo(true);
      alGuardar && alGuardar(r.id);
      if (!p && !alGuardar && location.hash.includes('/nuevo')) history.replaceState(null, '', '#/inventario');
    } catch (e) { avisoError(e); }
  };
  h.el.querySelector('[data-guardar]').onclick = guardar;
  f.onsubmit = e => { e.preventDefault(); guardar(); };
  return h;
}

/* ═════════ Merma ═════════ */
function merma(p = null) {
  const c = estado.catalogo; if (!c) return;
  const opciones = c.productos.filter(x => x.existencia > 0).flatMap(x => x.variantes.filter(v => v.existencia > 0).map(v => ({ id: v.id, texto: `${x.emoji} ${x.nombre}${v.nombre !== 'Única' ? ' · ' + v.nombre : ''} (${v.existencia})`, pid: x.id })));
  if (!opciones.length) return aviso('No hay piezas en existencia.', { tipo: 'mal' });
  let motivo = 'danado';
  const h = hoja({ titulo: 'Registrar merma', html: `
    <p class="sec" style="margin-top:0">Piezas que se pierden: dañadas, robadas, extraviadas o que se usaron. Se descuentan del inventario y su costo cuenta como pérdida.</p>
    <form class="formulario" data-f>
      <label class="campo"><span>Artículo</span><select name="varianteId">${opciones.map(o => `<option value="${o.id}" ${p && o.pid === p.id && !opciones.find(z => z.pid === p.id && z.id < o.id) ? 'selected' : ''}>${esc(o.texto)}</option>`).join('')}</select></label>
      <div class="campo"><span>Motivo</span><div class="chips" style="flex-wrap:wrap" data-motivos></div></div>
      <div class="doble"><label class="campo"><span>Piezas</span><input name="cantidad" inputmode="numeric" value="1" required></label><label class="campo"><span>Nota (opcional)</span><input name="notas" maxlength="200"></label></div>
    </form>`, pie: `<button class="btn btn-borde" data-cancelar>Cancelar</button><button class="btn btn-peligro" data-ok>Registrar merma</button>` });
  const motivos = Object.entries(NOMBRES.merma).filter(([k]) => k !== 'faltante');
  const pinta = () => { h.el.querySelector('[data-motivos]').innerHTML = motivos.map(([k, t]) => `<button type="button" class="chip ${k === motivo ? 'activo' : ''}" data-m="${k}">${t}</button>`).join(''); };
  pinta(); al(h.el, 'click', '[data-m]', b => { motivo = b.dataset.m; pinta(); });
  h.el.querySelector('[data-cancelar]').onclick = () => h.cerrar();
  h.el.querySelector('[data-ok]').onclick = async () => {
    const d = new FormData(h.el.querySelector('[data-f]'));
    try { const r = await api('/api/mermas', { metodo: 'POST', datos: { varianteId: d.get('varianteId'), cantidad: d.get('cantidad'), motivo, notas: d.get('notas') } }); aviso(`Merma registrada: ${r.merma.cantidad} pieza(s), costo ${mxn(r.merma.costoMxn)}`); h.cerrar(); cargarCatalogo(true); }
    catch (e) { avisoError(e); }
  };
}

/* ═════════ Conteo físico ═════════ */
function conteo() {
  const c = estado.catalogo; if (!c) return;
  let cat = 'todo';
  const contados = new Map();   // varianteId → número contado
  const h = hoja({ titulo: 'Contar inventario', ancha: true, html: `
    <div class="nota" style="margin-bottom:12px">${ico('info')}<span>Cada renglón empieza con lo que dice el sistema. Cuente lo que hay en el estante y corrija solo lo que no coincida (se marca en amarillo). Al guardar: si faltan piezas se registran como merma; si sobran, se agregan al inventario.</span></div>
    <div class="chips" data-cats></div><div class="lista" data-filas style="margin-top:10px"></div>`,
    pie: `<span data-resumen class="sec" style="flex:2;align-self:center;font-weight:700;font-size:var(--t-sm)"></span><button class="btn btn-primario" data-guardar>Guardar conteo</button>` });
  const variantes = c.productos.flatMap(p => p.variantes.map(v => ({ ...v, p })));
  const pintaCats = () => { h.el.querySelector('[data-cats]').innerHTML = `<button class="chip ${cat === 'todo' ? 'activo' : ''}" data-c="todo">Todo</button>` + c.categorias.filter(k => c.productos.some(p => p.categoriaId === k.id)).map(k => `<button class="chip ${cat == k.id ? 'activo' : ''}" data-c="${k.id}">${esc(k.emoji)} ${esc(k.nombre)}</button>`).join(''); };
  const filaHTML = v => { const n = contados.has(v.id) ? contados.get(v.id) : v.existencia; return `<div class="conteo-fila ${n !== v.existencia ? 'cambiado' : ''}" data-fila="${v.id}">
      <span style="min-width:0"><div style="font-weight:800">${esc(v.p.emoji)} ${esc(v.p.nombre)}${v.nombre !== 'Única' ? ` <span class="tenue">· ${esc(v.nombre)}</span>` : ''}</div><div class="sec" style="font-size:var(--t-xs)">Sistema: ${v.existencia}${n !== v.existencia ? ` · <b class="${n < v.existencia ? 'mal' : 'bien'}">${n > v.existencia ? '+' : ''}${n - v.existencia}</b>` : ''}</div></span>
      <span class="paso"><button data-r="${v.id}" aria-label="Menos">${ico('menos')}</button><input inputmode="numeric" value="${n}" data-n="${v.id}" aria-label="Contadas"><button data-s="${v.id}" aria-label="Más">${ico('mas')}</button></span></div>`; };
  const pintaFilas = () => {
    const lista = variantes.filter(v => cat === 'todo' || v.p.categoriaId == cat);
    h.el.querySelector('[data-filas]').innerHTML = lista.map(filaHTML).join('');
    resumen();
  };
  const resumen = () => {
    let falt = 0, sobr = 0; for (const v of variantes) { if (!contados.has(v.id)) continue; const d = contados.get(v.id) - v.existencia; if (d < 0) falt -= d; else sobr += d; }
    h.el.querySelector('[data-resumen]').textContent = falt || sobr ? `${falt} faltante${falt === 1 ? '' : 's'} · ${sobr} sobrante${sobr === 1 ? '' : 's'}` : 'Todo coincide hasta ahora';
  };
  const poner = (id, n) => { const v = variantes.find(x => x.id === id); n = Math.max(0, n | 0); if (n === v.existencia) contados.delete(id); else contados.set(id, n);
    /* Solo se redibuja ese renglón (así no se pierde el renglón que se está escribiendo) */
    const fila = h.el.querySelector(`[data-fila="${id}"]`); if (fila) fila.outerHTML = filaHTML(v); resumen(); };
  pintaCats(); pintaFilas();
  al(h.el, 'click', '[data-c]', b => { cat = b.dataset.c; pintaCats(); pintaFilas(); });
  al(h.el, 'click', '[data-r]', b => { const id = +b.dataset.r; const v = variantes.find(x => x.id === id); poner(id, (contados.has(id) ? contados.get(id) : v.existencia) - 1); vibrar(6); });
  al(h.el, 'click', '[data-s]', b => { const id = +b.dataset.s; const v = variantes.find(x => x.id === id); poner(id, (contados.has(id) ? contados.get(id) : v.existencia) + 1); vibrar(6); });
  h.el.addEventListener('change', e => { if (e.target.dataset.n) poner(+e.target.dataset.n, +e.target.value); });
  h.el.querySelector('[data-guardar]').onclick = async () => {
    if (!contados.size) { aviso('Todo coincide: no hay nada que corregir.', { tipo: 'info' }); return h.cerrar(); }
    const renglones = [...contados].map(([varianteId, contado]) => ({ varianteId, contado }));
    if (!await confirmar({ titulo: 'Guardar conteo', texto: `Se corregirán ${renglones.length} talla(s). ${h.el.querySelector('[data-resumen]').textContent}.`, si: 'Guardar' })) return;
    try {
      const r = (await api('/api/conteos', { metodo: 'POST', datos: { renglones } })).conteo;
      aviso(`Conteo guardado: ${r.faltantes} faltantes, ${r.sobrantes} sobrantes`); h.cerrar(); cargarCatalogo(true);
      if (r.sinCosto.length) aviso(`Sin costo conocido: ${r.sinCosto.join(', ')}. Registre su compra para tener su costo.`, { tipo: 'info', ms: 9000 });
      if (location.hash.includes('/contar')) history.replaceState(null, '', '#/inventario');
    } catch (e) { avisoError(e); }
  };
}

/* ═════════ Subir la foto de un producto (achicada en el celular) ═════════ */
async function subirFoto(productoId, archivo, caja) {
  const capa = document.createElement('div'); capa.className = 'subiendo'; capa.textContent = 'Preparando foto…';
  if (caja) caja.appendChild(capa);
  try {
    const blob = await achicarFoto(archivo);
    await subirArchivo(`/api/productos/${productoId}/foto`, blob, 'image/jpeg', f => { capa.textContent = `Subiendo ${Math.round(f * 100)} %`; });
    await cargarCatalogo(true);
    aviso('Foto guardada');
    return true;
  } catch (e) { avisoError(e); return false; }
  finally { capa.remove(); }
}
