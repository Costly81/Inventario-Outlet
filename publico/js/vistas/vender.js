/* ─────────────────────────────────────────────────────────────────────────────
   VENDER: pensado para el celular y para hacerlo con un dedo.
     1. Toque un producto → se agrega al carrito (si tiene tallas, elige la talla con un toque).
     2. Toque la barra oscura de abajo (o el panel de la derecha en PC) → Cobrar.
     3. Elija cómo paga (efectivo, dólares, tarjeta, transferencia) → el sistema calcula el cambio.
   Si el Wi-Fi falla al cobrar, la venta se guarda en el celular y se envía sola al volver la conexión
   (cada venta lleva una clave única, así nunca se registra dos veces).
   ───────────────────────────────────────────────────────────────────────────── */
import { estado, api, avisar, escuchar, cargarCatalogo, esc, mxn, usd, tcFmt, uuid, vibrar, NOMBRES, esDueno, fotoDe } from '../nucleo.js';
import { ico } from '../iconos.js';
import { aviso, avisoError, hoja, al, tecladoNumerico, volar, chispas, esqueletos, vacio, confirmar, $ } from '../ui.js';

let raiz, filtro = { cat: 'todo', q: '' }, quitarOyentes = [];
const COLA = 'io-pendientes';

export async function montar(el) {
  raiz = el;
  raiz.innerHTML = `
    <div class="vender">
      <div>
        <div class="titulo-vista" style="margin-bottom:12px"><div><h1>Vender</h1><p data-ayuda>Toque un producto para agregarlo</p></div><span data-pendientes></span></div>
        <div class="buscador">${ico('buscar')}<input type="search" placeholder="Buscar producto…" data-q autocomplete="off" enterkeyhint="search"></div>
        <div class="chips" data-cats style="margin-top:12px"></div>
        <div class="productos-rejilla" data-rejilla>${esqueletos(1, 0)}${Array.from({ length: 6 }, () => '<div class="esqueleto" style="aspect-ratio:3/4;border-radius:22px"></div>').join('')}</div>
      </div>
      <aside class="panel-carrito tarjeta" data-panel></aside>
    </div>
    <button class="barra-carrito" data-barra aria-label="Ver carrito y cobrar"></button>`;

  al(raiz, 'click', '[data-cat]', b => { filtro.cat = b.dataset.cat; pintarCategorias(); pintarProductos(); });
  raiz.querySelector('[data-q]').addEventListener('input', e => { filtro.q = e.target.value.trim().toLowerCase(); pintarProductos(); });
  al(raiz, 'click', '[data-prod]', (b) => tocarProducto(+b.dataset.prod, b));
  al(raiz, 'click', '[data-barra]', abrirCarrito);
  al(raiz, 'click', '[data-panel] [data-mas]', b => cambiar(+b.dataset.mas, 1));
  al(raiz, 'click', '[data-panel] [data-menos]', b => cambiar(+b.dataset.menos, -1));
  al(raiz, 'click', '[data-panel] [data-precio]', b => cambiarPrecio(+b.dataset.precio));
  al(raiz, 'click', '[data-panel] [data-cobrar]', cobrar);
  al(raiz, 'click', '[data-panel] [data-vaciar]', vaciar);
  al(raiz, 'click', '[data-enviar-pendientes]', enviarPendientes);

  quitarOyentes = [escuchar('catalogo', () => { pintarCategorias(); pintarProductos(); }), escuchar('carrito', pintarCarrito), escuchar('conexion', si => si && enviarPendientes())];
  try { await cargarCatalogo(); } catch (e) { avisoError(e); }
  pintarCategorias(); pintarProductos(); pintarCarrito(); pintarPendientes();
  enviarPendientes();
  const intervalo = setInterval(enviarPendientes, 20000);
  return () => { quitarOyentes.forEach(f => f()); clearInterval(intervalo); };
}

/* ═════════ Catálogo en cuadros ═════════ */
function pintarCategorias() {
  const c = estado.catalogo; if (!c || !raiz) return;
  const conProductos = c.categorias.filter(k => c.productos.some(p => p.categoriaId === k.id));
  raiz.querySelector('[data-cats]').innerHTML = `<button class="chip ${filtro.cat === 'todo' ? 'activo' : ''}" data-cat="todo">Todo</button>` +
    conProductos.map(k => `<button class="chip ${filtro.cat == k.id ? 'activo' : ''}" data-cat="${k.id}">${esc(k.emoji)} ${esc(k.nombre)}</button>`).join('');
}
function pintarProductos() {
  const c = estado.catalogo, caja = raiz && raiz.querySelector('[data-rejilla]'); if (!c || !caja) return;
  let lista = c.productos;
  if (filtro.cat !== 'todo') lista = lista.filter(p => p.categoriaId == filtro.cat);
  if (filtro.q) lista = lista.filter(p => (p.nombre + ' ' + (p.categoria || '') + ' ' + p.variantes.map(v => v.nombre).join(' ')).toLowerCase().includes(filtro.q));
  /* Primero lo que tiene piezas */
  lista = [...lista].sort((a, b) => (b.existencia > 0) - (a.existencia > 0));
  if (!c.productos.length) {
    caja.style.display = 'block';
    caja.innerHTML = vacio({ emoji: '👕', titulo: 'Todavía no hay productos', texto: esDueno() ? 'Registre su primera compra o dé de alta un producto. Para mercancía surtida puede crear algo como «Surtido $100».' : 'Pida al dueño que registre los productos.',
      boton: esDueno() ? '<a class="btn btn-primario" href="#/inventario/nuevo">' + ico('mas') + ' Nuevo producto</a>' : '' });
    return;
  }
  caja.style.display = '';
  if (!lista.length) { caja.innerHTML = `<div style="grid-column:1/-1">${vacio({ emoji: '🔎', titulo: 'No hay coincidencias', texto: 'Pruebe con otra palabra o elija «Todo».' })}</div>`; return; }
  caja.innerHTML = lista.map(p => {
    const enCarrito = estado.carrito.filter(l => l.productoId === p.id).reduce((s, l) => s + l.cantidad, 0);
    const precios = [...new Set(p.variantes.map(v => v.precio))];
    const precio = precios.length > 1 ? `${mxn(Math.min(...precios))}+` : mxn(p.precio);
    const tallas = p.variantes.length > 1 ? `<span class="producto-tallas insignia i-gris">${p.variantes.length} tallas</span>` : '';
    const stock = p.existencia <= 0 ? '<span class="producto-stock insignia i-gris">Agotado</span>' : `<span class="producto-stock insignia ${p.existencia <= (p.minimo ?? estado.sesion.ajustes.stockMinimo) ? 'i-aviso' : 'i-cielo'}">${p.existencia} pz${p.existencia === 1 ? '' : 's'}</span>`;
    return `<button class="producto ${p.existencia <= 0 ? 'agotado' : ''} ${enCarrito ? 'tiene' : ''}" data-prod="${p.id}" style="--c:${esc(p.color)}" aria-label="${esc(p.nombre)}, ${precio}">
      <span class="producto-ilustracion">${fotoDe(p) ? `<img class="foto" src="${fotoDe(p)}" alt="" loading="lazy" decoding="async">` : `<span class="emoji">${esc(p.emoji)}</span>`}${tallas}${stock}<span class="en-carrito">${enCarrito || ''}</span></span>
      <span class="producto-info"><span class="producto-nombre">${esc(p.nombre)}</span><span class="producto-precio">${precio}</span></span></button>`;
  }).join('');
}

/* Toque en un producto: una talla → al carrito; varias → elegir talla */
function tocarProducto(id, el) {
  const p = estado.catalogo.productos.find(x => x.id === id); if (!p) return;
  if (p.variantes.length === 1) return agregar(p, p.variantes[0], el);
  const h = hoja({ titulo: `${p.emoji} ${p.nombre}`, html: `${fotoDe(p) ? `<div class="foto-caja" style="height:200px;aspect-ratio:auto;margin-bottom:12px"><img src="${fotoDe(p)}" alt="${esc(p.nombre)}"></div>` : ''}<p class="sec" style="margin:0 0 14px">Elija la talla</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:10px">${p.variantes.map(v => {
      const enC = (estado.carrito.find(l => l.varianteId === v.id) || {}).cantidad || 0;
      return `<button class="metodo ${v.existencia <= 0 ? '' : ''}" data-v="${v.id}" style="${v.existencia <= 0 ? 'opacity:.45' : ''}">
        <span style="font-size:var(--t-xl);font-weight:800;color:var(--tinta)">${esc(v.nombre)}</span>
        <span class="insignia ${v.existencia <= 0 ? 'i-gris' : v.existencia <= 2 ? 'i-aviso' : 'i-cielo'}">${v.existencia <= 0 ? 'Agotada' : v.existencia + ' pzs'}</span>
        ${v.precio !== p.precio ? `<span style="font-size:var(--t-xs)">${mxn(v.precio)}</span>` : ''}${enC ? `<span class="insignia i-sol">${enC} en carrito</span>` : ''}</button>`;
    }).join('')}</div>` });
  al(h.el, 'click', '[data-v]', b => { const v = p.variantes.find(x => x.id === +b.dataset.v); agregar(p, v, el, b); h.cerrar(); });
}

function agregar(p, v, origen, origen2) {
  const linea = estado.carrito.find(l => l.varianteId === v.id);
  const yaHay = linea ? linea.cantidad : 0;
  if (v.existencia <= yaHay) {
    vibrar([20, 40, 20]);
    return aviso(v.existencia <= 0 ? `No hay piezas de ${p.nombre}${v.nombre !== 'Única' ? ' talla ' + v.nombre : ''} en el sistema.` : `Solo hay ${v.existencia} en el sistema.`, { tipo: 'mal' });
  }
  if (linea) linea.cantidad++;
  else estado.carrito.push({ varianteId: v.id, productoId: p.id, nombre: p.nombre, talla: v.nombre, emoji: p.emoji, foto: p.foto, color: p.color, precio: v.precio, precioLista: v.precio, cantidad: 1, existencia: v.existencia });
  vibrar(14);
  const destino = matchMedia('(min-width: 1000px)').matches ? raiz.querySelector('[data-panel]') : raiz.querySelector('[data-barra]');
  volar(origen2 || origen, destino, p.emoji);
  avisar('carrito');
  const barra = raiz.querySelector('[data-barra]'); barra.classList.remove('rebote'); void barra.offsetWidth; barra.classList.add('rebote');
  pintarProductos();
}
function cambiar(varianteId, d) {
  const l = estado.carrito.find(x => x.varianteId === varianteId); if (!l) return;
  if (d > 0 && l.cantidad >= l.existencia) return aviso(`Solo hay ${l.existencia} en el sistema.`, { tipo: 'mal' });
  l.cantidad += d; vibrar(8);
  if (l.cantidad <= 0) estado.carrito = estado.carrito.filter(x => x !== l);
  avisar('carrito'); pintarProductos();
}
async function cambiarPrecio(varianteId) {
  const l = estado.carrito.find(x => x.varianteId === varianteId); if (!l) return;
  const n = await tecladoNumerico({ titulo: 'Precio de esta pieza', valor: l.precio, ayuda: `Precio de lista: ${mxn(l.precioLista)}. Úselo para un precio especial o regateo.` });
  if (n == null) return; l.precio = Math.round(n * 100) / 100; avisar('carrito');
}
async function vaciar() {
  if (!estado.carrito.length) return;
  if (!await confirmar({ titulo: '¿Vaciar el carrito?', texto: 'Se quitan todos los artículos. No se registra nada.', si: 'Vaciar', peligro: true })) return;
  estado.carrito = []; avisar('carrito'); pintarProductos();
}

/* ═════════ Carrito ═════════ */
const totalCarrito = () => estado.carrito.reduce((s, l) => s + l.precio * l.cantidad, 0);
const piezasCarrito = () => estado.carrito.reduce((s, l) => s + l.cantidad, 0);
function lineasHTML() {
  return estado.carrito.map(l => `<div class="linea-carrito" style="--c:${esc(l.color)}">
    <span class="ico">${l.foto ? `<img class="foto" src="${fotoDe(l)}" alt="">` : esc(l.emoji)}</span>
    <span style="min-width:0"><div class="nom">${esc(l.nombre)}${l.talla !== 'Única' ? ` <span class="tenue">· ${esc(l.talla)}</span>` : ''}</div>
      <button class="pre" data-precio="${l.varianteId}">${mxn(l.precio)}${l.precio !== l.precioLista ? ' (especial)' : ''} c/u</button></span>
    <span class="paso"><button data-menos="${l.varianteId}" aria-label="Quitar uno">${ico('menos')}</button><span class="num">${l.cantidad}</span><button data-mas="${l.varianteId}" aria-label="Agregar uno">${ico('mas')}</button></span>
  </div>`).join('');
}
function pintarCarrito() {
  if (!raiz) return;
  const n = piezasCarrito(), total = totalCarrito();
  const barra = raiz.querySelector('[data-barra]');
  barra.classList.toggle('visible', n > 0);
  barra.innerHTML = `<span class="bolsa">${ico('bolsa')}<span class="cuenta">${n}</span></span><span class="texto"><small>${n} pieza${n === 1 ? '' : 's'}</small><b>${mxn(total)}</b></span><span class="ir">Cobrar ${ico('adelante', 'width="18" height="18"')}</span>`;
  const panel = raiz.querySelector('[data-panel]');
  panel.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between"><h3 style="font-size:var(--t-md)">Carrito</h3>${n ? `<button class="btn btn-borde btn-chico" data-vaciar>${ico('basura')} Vaciar</button>` : ''}</div>
    ${n ? `<div class="carrito-lista">${lineasHTML()}</div>
      <div class="totales"><div class="fila"><span>${n} pieza${n === 1 ? '' : 's'}</span><span class="num">${estado.tc && estado.tc.recibir ? '≈ ' + usd(total / estado.tc.recibir) : ''}</span></div><div class="fila total"><span>Total</span><span class="num">${mxn(total)}</span></div></div>
      <button class="btn btn-primario btn-grande btn-bloque" data-cobrar style="margin-top:14px">Cobrar ${mxn(total)}</button>`
    : `<div class="vacio-carrito">${ico('bolsa')}<div style="font-weight:800;color:var(--tinta-2)">Carrito vacío</div><div>Toque un producto para agregarlo.</div></div>`}`;
}
function abrirCarrito() {
  const h = hoja({ titulo: 'Carrito', html: `<div class="carrito-lista" data-lineas style="max-height:none">${lineasHTML()}</div><div class="totales" data-tot></div>`,
    pie: `<button class="btn btn-borde" data-seguir>Seguir</button><button class="btn btn-primario" data-ir-cobrar>Cobrar</button>` });
  const pinta = () => {
    if (!estado.carrito.length) return h.cerrar();
    h.el.querySelector('[data-lineas]').innerHTML = lineasHTML();
    const n = piezasCarrito(), t = totalCarrito();
    h.el.querySelector('[data-tot]').innerHTML = `<div class="fila"><span>${n} pieza${n === 1 ? '' : 's'}</span><span></span></div><div class="fila total"><span>Total</span><span class="num">${mxn(t)}</span></div>`;
    h.el.querySelector('[data-ir-cobrar]').textContent = 'Cobrar ' + mxn(t);
  };
  pinta();
  const quitar = escuchar('carrito', pinta);
  al(h.el, 'click', '[data-mas]', b => cambiar(+b.dataset.mas, 1));
  al(h.el, 'click', '[data-menos]', b => cambiar(+b.dataset.menos, -1));
  al(h.el, 'click', '[data-precio]', b => cambiarPrecio(+b.dataset.precio));
  h.el.querySelector('[data-seguir]').onclick = () => h.cerrar();
  h.el.querySelector('[data-ir-cobrar]').onclick = () => { h.cerrar(); setTimeout(cobrar, 250); };
  const cerrar = h.cerrar; h.cerrar = v => { quitar(); cerrar(v); };
}

/* ═════════ Cobro ═════════ */
function cobrar() {
  if (!estado.carrito.length) return;
  const tc = estado.tc || {};
  let metodo = 'efectivo', recibido = null, descuento = 0;
  const h = hoja({ titulo: 'Cobrar', html: `<div data-c></div>`, pie: `<button class="btn btn-primario btn-grande" data-confirmar style="flex:1"></button>` });
  const c = h.el.querySelector('[data-c]'), boton = h.el.querySelector('[data-confirmar]');
  const pinta = () => {
    const subtotal = totalCarrito(), total = Math.max(0, subtotal - descuento);
    const enUsd = metodo === 'dolares', tcR = tc.recibir;
    const totalUsd = enUsd && tcR ? Math.ceil(total / tcR * 100) / 100 : null;
    const recibidoMxn = recibido == null ? null : (enUsd ? recibido * tcR : recibido);
    const cambio = recibidoMxn == null ? null : recibidoMxn - total;
    const billetes = enUsd ? [['exacto', 'Exacto'], [10], [20], [50], [100]] : [['exacto', 'Exacto'], [200], [500], [1000]];
    c.innerHTML = `
      <div style="text-align:center;margin-bottom:16px"><div class="sec" style="font-weight:700">Total a cobrar</div>
        <div class="num" style="font-size:var(--t-2xl);font-weight:800;letter-spacing:-.03em;line-height:1.1">${mxn(total, true)}</div>
        ${descuento ? `<div class="insignia i-sol">Descuento ${mxn(descuento)}</div>` : ''}
        ${totalUsd ? `<div style="margin-top:6px;font-weight:800;color:#8a5600">${usd(totalUsd)} <span class="tenue" style="font-weight:600">a ${tcFmt(tcR)} por dólar</span></div>` : ''}
      </div>
      <div class="metodos">${Object.keys(NOMBRES.metodo).map(m => `<button class="metodo ${metodo === m ? 'activo' : ''}" data-m="${m}"><span class="e">${NOMBRES.metodoEmoji[m]}</span>${NOMBRES.metodo[m]}</button>`).join('')}</div>
      ${enUsd && !tcR ? `<div class="nota mal" style="margin-top:14px">${ico('alerta')}<span>No hay tipo de cambio todavía: no se pueden recibir dólares. Escriba un dólar manual en Ajustes.</span></div>` : ''}
      ${metodo === 'efectivo' || metodo === 'dolares' ? `
        <h3 style="margin:18px 0 8px;font-size:var(--t-base)">¿Con cuánto paga?</h3>
        <div class="billetes">${billetes.map(([v, t]) => `<button class="billete ${enUsd ? '' : 'mx'} ${(v === 'exacto' && recibido != null && Math.abs(recibido - (enUsd ? totalUsd : total)) < 0.001) || recibido === v ? 'activo' : ''}" data-b="${v}">${t || (enUsd ? 'US$' : '$') + v}</button>`).join('')}
          <button class="billete ${enUsd ? '' : 'mx'}" data-otro>Otro</button></div>
        ${cambio != null ? `<div class="cambio-grande ${cambio < -0.004 ? 'falta' : ''}" style="margin-top:14px"><span style="font-weight:700">${cambio < -0.004 ? 'Faltan' : 'Cambio'}${enUsd ? ' (en pesos)' : ''}</span><b>${mxn(Math.abs(cambio), true)}</b>
          <span style="font-size:var(--t-sm);font-weight:600">Recibe ${enUsd ? usd(recibido) : mxn(recibido)}</span></div>` : ''}` : ''}
      <button class="btn btn-borde btn-chico" data-desc style="margin-top:16px">${ico('lapiz')} ${descuento ? 'Cambiar descuento' : 'Aplicar descuento'}</button>`;
    const falta = cambio != null && cambio < -0.004;
    boton.disabled = falta || (enUsd && !tcR);
    boton.innerHTML = `${ico('palomita')} Cobrar ${mxn(total, true)}`;
  };
  pinta();
  al(c, 'click', '[data-m]', b => { metodo = b.dataset.m; recibido = null; vibrar(8); pinta(); });
  al(c, 'click', '[data-b]', b => {
    const total = Math.max(0, totalCarrito() - descuento);
    if (b.dataset.b === 'exacto') recibido = metodo === 'dolares' ? Math.ceil(total / tc.recibir * 100) / 100 : total;
    else recibido = +b.dataset.b;
    vibrar(8); pinta();
  });
  al(c, 'click', '[data-otro]', async () => { const n = await tecladoNumerico({ titulo: metodo === 'dolares' ? '¿Cuántos dólares recibe?' : '¿Cuánto recibe?', prefijo: metodo === 'dolares' ? 'US$' : '$' }); if (n != null) { recibido = n; pinta(); } });
  al(c, 'click', '[data-desc]', async () => { const n = await tecladoNumerico({ titulo: 'Descuento en pesos', valor: descuento || '', ayuda: 'Se resta del total de la venta.' }); if (n != null) { descuento = Math.min(n, totalCarrito()); pinta(); } });
  boton.onclick = async () => {
    boton.disabled = true;
    const datos = { clave: uuid(), metodo, recibido, descuento, renglones: estado.carrito.map(l => ({ varianteId: l.varianteId, cantidad: l.cantidad, precio: l.precio })) };
    try {
      const r = await api('/api/ventas', { metodo: 'POST', datos });
      estado.carrito = []; avisar('carrito'); h.cerrar(); pintarProductos();
      exito(r.venta);
    } catch (e) {
      if (e.status === 0) {
        /* Sin conexión: se guarda en el celular para enviarla después */
        guardarPendiente(datos); estado.carrito = []; avisar('carrito'); h.cerrar();
        aviso('Sin conexión: la venta quedó guardada en este celular y se enviará sola.', { tipo: 'info', ms: 6000 });
      } else { avisoError(e); boton.disabled = false; }
    }
  };
}

/* Pantalla de venta lista */
function exito(v) {
  vibrar([20, 30, 40]);
  const cambio = v.cambio > 0 ? `<div class="cambio-grande" style="margin:16px 0 0"><span style="font-weight:700">Cambio</span><b>${mxn(v.cambio, true)}</b></div>` : '';
  const h = hoja({ titulo: '', html: `<div class="exito"><div class="exito-circulo" data-circ><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></div>
      <h2>¡Venta lista!</h2><p class="sec" style="margin:4px 0 0">Folio ${v.folio} · ${v.piezas} pieza${v.piezas === 1 ? '' : 's'} · ${NOMBRES.metodo[v.metodo]}</p>
      <div class="num" style="font-size:var(--t-xl);font-weight:800;margin-top:8px">${mxn(v.total, true)}${v.moneda_pago === 'USD' ? ` <span class="tenue" style="font-size:var(--t-base)">(recibió ${usd(v.recibido)})</span>` : ''}</div>${cambio}</div>`,
    pie: `<button class="btn btn-borde" data-deshacer>${ico('deshacer')} Deshacer</button><button class="btn btn-primario" data-nueva>Nueva venta</button>` });
  setTimeout(() => chispas(h.el.querySelector('[data-circ]')), 250);
  h.el.querySelector('[data-nueva]').onclick = () => h.cerrar();
  h.el.querySelector('[data-deshacer]').onclick = async () => {
    if (!await confirmar({ titulo: '¿Cancelar esta venta?', texto: 'Las piezas regresan al inventario y la venta queda cancelada.', si: 'Cancelar venta', no: 'No', peligro: true })) return;
    try { await api(`/api/ventas/${v.id}/anular`, { metodo: 'POST' }); aviso('Venta cancelada: las piezas regresaron al inventario.'); h.cerrar(); } catch (e) { avisoError(e); }
  };
  setTimeout(() => h.el.isConnected && h.el.classList.contains('visible') && h.cerrar(), 15000);
}

/* ═════════ Ventas pendientes (sin conexión) ═════════ */
function leerCola() { try { return JSON.parse(localStorage.getItem(COLA) || '[]'); } catch (_) { return []; } }
function guardarPendiente(d) { const c = leerCola(); c.push({ ...d, guardada: new Date().toISOString() }); localStorage.setItem(COLA, JSON.stringify(c)); pintarPendientes(); }
function pintarPendientes() {
  const n = leerCola().length, el = raiz && raiz.querySelector('[data-pendientes]'); if (!el) return;
  el.innerHTML = n ? `<button class="insignia i-aviso" data-enviar-pendientes style="border:0;height:34px;padding:0 12px">${ico('reloj')} ${n} venta${n === 1 ? '' : 's'} sin enviar</button>` : '';
}
let enviando = false;
async function enviarPendientes() {
  const cola = leerCola(); if (!cola.length || enviando) return pintarPendientes();
  enviando = true; const quedan = [];
  for (const d of cola) {
    try { await api('/api/ventas', { metodo: 'POST', datos: d }); }
    catch (e) { if (e.status === 0) { quedan.push(d); break; } aviso(`Una venta guardada sin conexión no se pudo registrar: ${e.message}`, { tipo: 'mal', ms: 9000 }); }
  }
  const resto = cola.slice(cola.indexOf(quedan[0]) >= 0 ? cola.indexOf(quedan[0]) : cola.length);
  localStorage.setItem(COLA, JSON.stringify(quedan.length ? resto : []));
  if (!quedan.length) aviso(`${cola.length} venta${cola.length === 1 ? '' : 's'} pendiente${cola.length === 1 ? '' : 's'} enviada${cola.length === 1 ? '' : 's'}`, { tipo: 'bien' });
  enviando = false; pintarPendientes();
}

export function alCambio() { /* el catálogo se recarga solo (app.js) y repinta los cuadros */ }
