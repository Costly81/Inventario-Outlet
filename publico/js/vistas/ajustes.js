/* ─────────────────────────────────────────────────────────────────────────────
   AJUSTES (solo dueño)
   · Tienda: nombre, lema y zona horaria.
   · Dólar: fuente, cada cuánto se consulta, dólar manual, ajuste de la casa de cambio y a
     cuánto se reciben dólares de los clientes.
   · Precios: margen objetivo, redondeo de precios sugeridos y mínimo de piezas para avisar.
   · Personas (vendedores con su PIN), categorías, abrir en el celular (QR), respaldos y Excel.
   ───────────────────────────────────────────────────────────────────────────── */
import { estado, api, avisar, cargarCatalogo, esc, mxn, tcFmt, fechaCorta, iniciales, NOMBRES } from '../nucleo.js';
import { ico } from '../iconos.js';
import { aviso, avisoError, hoja, al, confirmar, esqueletos } from '../ui.js';

let raiz, aj, proveedoresTC;
const COLORES = ['#0ea5e9', '#6366f1', '#14b8a6', '#f59e0b', '#ec4899', '#8b5cf6', '#22c55e', '#ef4444'];

export async function montar(el) {
  raiz = el;
  raiz.innerHTML = `<div class="titulo-vista"><div><h1>Ajustes</h1><p>Su tienda, el dólar, las personas y los respaldos</p></div></div>${esqueletos(4, 120)}`;
  try { const j = await api('/api/ajustes'); aj = j.ajustes; proveedoresTC = j.proveedoresTC; } catch (e) { return avisoError(e); }
  pintar();
}

function pintar() {
  const tc = aj.tc, red = estado.sesion.red || [];
  raiz.innerHTML = `<div class="titulo-vista"><div><h1>Ajustes</h1><p>Su tienda, el dólar, las personas y los respaldos</p></div></div>
  <div class="rejilla r-2-md" style="align-items:start">
    <section class="tarjeta"><h3>${ico('celular', 'width="18" height="18" style="display:inline;vertical-align:-3px"')} Abrir en el celular</h3>
      ${red.length ? `<p class="sec" style="font-size:var(--t-sm)">Con el celular conectado al <b>mismo Wi-Fi</b> que esta Mac, apunte la cámara al código o escriba la dirección.</p>
        <div class="qr" data-qr></div><p class="url-grande" style="margin:12px 0 4px">${esc(red[0].url)}</p>
        ${red.length > 1 ? `<p class="tenue" style="text-align:center;font-size:var(--t-xs)">Otras: ${red.slice(1).map(r => esc(r.url)).join(' · ')}</p>` : ''}
        <p class="sec" style="font-size:var(--t-sm)">En el iPhone: Compartir → <b>Agregar a pantalla de inicio</b>, y se abre como una app.</p>`
      : '<p class="sec">No se encontró la dirección de red de la Mac. Revise que esté conectada al Wi-Fi.</p>'}
    </section>
    <form class="tarjeta formulario" data-tienda><h3>${ico('tienda', 'width="18" height="18" style="display:inline;vertical-align:-3px"')} Tienda</h3>
      <label class="campo"><span>Nombre</span><input name="nombre" value="${esc(aj.tienda.nombre)}" maxlength="40" required></label>
      <label class="campo"><span>Lema</span><input name="lema" value="${esc(aj.tienda.lema)}" maxlength="80"></label>
      <label class="campo"><span>Zona horaria</span><select name="zona">${['America/Ciudad_Juarez', 'America/Chihuahua', 'America/Ojinaga', 'America/Tijuana', 'America/Hermosillo', 'America/Mazatlan', 'America/Monterrey', 'America/Matamoros', 'America/Mexico_City', 'America/Cancun'].map(z => `<option ${z === aj.zonaHoraria ? 'selected' : ''}>${z}</option>`).join('')}</select><small>Define qué es «hoy» y «ayer», y la hora de cada compra para buscar su dólar.</small></label>
      <button class="btn btn-suave">Guardar</button>
    </form>
  </div>

  <form class="tarjeta formulario" data-dolar style="margin-top:16px"><h3>${ico('dolar', 'width="18" height="18" style="display:inline;vertical-align:-3px"')} Dólar</h3>
    <div class="rejilla r-3">
      <label class="campo"><span>Fuente preferida</span><select name="fuente"><option value="auto" ${tc.fuente === 'auto' ? 'selected' : ''}>Automático (la mejor disponible)</option>${proveedoresTC.map(p => `<option value="${p.id}" ${tc.fuente === p.id ? 'selected' : ''}>${esc(p.nombre)}${p.vivo ? ' · en vivo' : ' · diario'}</option>`).join('')}</select><small>Si falla, se prueban las demás.</small></label>
      <label class="campo"><span>Consultar cada (minutos)</span><input name="intervaloMin" inputmode="numeric" value="${tc.intervaloMin}"></label>
      <label class="campo"><span>Dólar manual (opcional)</span><div class="con-prefijo"><i>$</i><input name="manual" inputmode="decimal" value="${tc.manual ?? ''}" placeholder="vacío = el de internet"></div><small>Para cuando no hay internet o quiere fijar uno.</small></label>
      <label class="campo"><span>La casa de cambio le cobra encima</span><div class="con-prefijo"><i>+$</i><input name="ajusteCompra" inputmode="decimal" value="${tc.ajusteCompra}"></div><small>Lo que paga de más por dólar al comprar mercancía. Hoy: ${tcFmt(estado.tc && estado.tc.compra)}.</small></label>
      <label class="campo"><span>Recibir dólares de clientes</span><select name="modoRecibir"><option value="ajuste" ${tc.modoRecibir === 'ajuste' ? 'selected' : ''}>Mercado menos un ajuste</option><option value="fijo" ${tc.modoRecibir === 'fijo' ? 'selected' : ''}>A un precio fijo</option></select></label>
      <label class="campo" data-recibir-ajuste ${tc.modoRecibir === 'fijo' ? 'hidden' : ''}><span>Ajuste al recibir</span><div class="con-prefijo"><i>−$</i><input name="ajusteRecibir" inputmode="decimal" value="${tc.ajusteRecibir}"></div><small>Hoy se reciben a ${tcFmt(estado.tc && estado.tc.recibir)}.</small></label>
      <label class="campo" data-recibir-fijo ${tc.modoRecibir === 'fijo' ? '' : 'hidden'}><span>Precio fijo al recibir</span><div class="con-prefijo"><i>$</i><input name="recibirFijo" inputmode="decimal" value="${tc.recibirFijo ?? ''}"></div></label>
      <label class="campo"><span>Token de Banxico (opcional)</span><input name="tokenBanxico" placeholder="${tc.tieneTokenBanxico ? '•••••• (guardado; escriba otro para cambiarlo)' : 'Para usar el FIX oficial'}" autocomplete="off"><small>Gratis en banxico.org.mx → SIE API.</small></label>
    </div>
    <div class="grupo-botones"><button class="btn btn-suave">Guardar dólar</button></div>
  </form>

  <form class="tarjeta formulario" data-precios style="margin-top:16px"><h3>${ico('grafica', 'width="18" height="18" style="display:inline;vertical-align:-3px"')} Precios y avisos</h3>
    <div class="rejilla r-3">
      <label class="campo"><span>Margen objetivo (%)</span><input name="margenObjetivo" inputmode="decimal" value="${aj.margenObjetivo}"><small>Ganancia sobre el precio de venta. Con 50 %, una pieza que cuesta $100 se vende en $200.</small></label>
      <label class="campo"><span>Redondear precios sugeridos a</span><div class="con-prefijo"><i>$</i><input name="redondeo" inputmode="numeric" value="${aj.redondeo}"></div><small>Con $10: 187 → 190.</small></label>
      <label class="campo"><span>Avisar cuando queden (piezas)</span><input name="stockMinimo" inputmode="numeric" value="${aj.stockMinimo}"><small>Cada producto puede tener su propio mínimo.</small></label>
    </div><div class="grupo-botones"><button class="btn btn-suave">Guardar</button></div>
  </form>

  <div class="rejilla r-2-md" style="margin-top:16px;align-items:start">
    <section class="tarjeta"><div style="display:flex;justify-content:space-between;align-items:center"><h3>${ico('personas', 'width="18" height="18" style="display:inline;vertical-align:-3px"')} Personas</h3><button class="btn btn-primario btn-chico" data-persona>${ico('mas')} Agregar</button></div>
      <p class="sec" style="font-size:var(--t-sm)">Cada quien entra con su PIN. Los vendedores no ven costos ni ganancias.</p><div class="lista" data-personas>${esqueletos(2, 60)}</div></section>
    <section class="tarjeta"><div style="display:flex;justify-content:space-between;align-items:center"><h3>${ico('rejilla', 'width="18" height="18" style="display:inline;vertical-align:-3px"')} Categorías</h3><button class="btn btn-primario btn-chico" data-categoria>${ico('mas')} Agregar</button></div>
      <div class="lista" data-categorias style="margin-top:10px">${esqueletos(2, 50)}</div></section>
  </div>

  <div class="rejilla r-2-md" style="margin-top:16px;align-items:start">
    <section class="tarjeta"><div style="display:flex;justify-content:space-between;align-items:center"><h3>${ico('respaldo', 'width="18" height="18" style="display:inline;vertical-align:-3px"')} Respaldos</h3><button class="btn btn-primario btn-chico" data-respaldar>Respaldar ahora</button></div>
      <p class="sec" style="font-size:var(--t-sm)">Se hace uno automático cada día en la carpeta <code>datos/respaldos</code> de la Mac. Descargue uno de vez en cuando y guárdelo en otro lugar (USB, nube).</p><div class="lista" data-respaldos>${esqueletos(2, 50)}</div></section>
    <section class="tarjeta"><h3>${ico('descargar', 'width="18" height="18" style="display:inline;vertical-align:-3px"')} Exportar a Excel</h3>
      <p class="sec" style="font-size:var(--t-sm)">Archivos .csv que abren en Excel o Numbers.</p>
      <div class="grupo-botones">${[['ventas', 'Ventas'], ['inventario', 'Inventario'], ['compras', 'Compras'], ['mermas', 'Merma'], ['gastos', 'Gastos'], ['dolar', 'Historial del dólar']].map(([k, t]) => `<a class="btn btn-borde btn-chico" href="/api/exportar/${k}.csv" download>${t}</a>`).join('')}</div>
      <p class="tenue" style="font-size:var(--t-xs);margin-top:18px">Inventario Outlet ${esc(estado.sesion.version)} · Zona ${esc(estado.sesion.zona)} · Puerto ${estado.sesion.puerto}</p></section>
  </div>`;

  /* QR */
  const qr = raiz.querySelector('[data-qr]'); if (qr && window.QR && red[0]) qr.innerHTML = window.QR.svg(red[0].url);
  /* Guardar secciones */
  const guardar = async (cambios, msg = 'Ajustes guardados') => {
    try { const j = await api('/api/ajustes', { metodo: 'PUT', datos: cambios }); aj = j.ajustes; estado.sesion.ajustes = j.ajustes; const t = await api('/api/tc'); estado.tc = t.tc; avisar('tc', t.tc); aviso(msg); pintar(); }
    catch (e) { avisoError(e); }
  };
  raiz.querySelector('[data-tienda]').onsubmit = e => { e.preventDefault(); const f = new FormData(e.target); guardar({ tienda: { nombre: f.get('nombre'), lema: f.get('lema') }, zonaHoraria: f.get('zona') }, 'Tienda guardada. Recargue para ver el nombre nuevo arriba.'); };
  const fd = raiz.querySelector('[data-dolar]');
  fd.querySelector('[name=modoRecibir]').onchange = e => { fd.querySelector('[data-recibir-ajuste]').hidden = e.target.value === 'fijo'; fd.querySelector('[data-recibir-fijo]').hidden = e.target.value !== 'fijo'; };
  fd.onsubmit = e => {
    e.preventDefault(); const f = new FormData(e.target);
    const c = { fuente: f.get('fuente'), intervaloMin: f.get('intervaloMin'), manual: f.get('manual') || null, ajusteCompra: f.get('ajusteCompra'), modoRecibir: f.get('modoRecibir'), ajusteRecibir: f.get('ajusteRecibir'), recibirFijo: f.get('recibirFijo') || null };
    if (f.get('tokenBanxico')) c.tokenBanxico = f.get('tokenBanxico');
    guardar({ tc: c }, 'Ajustes del dólar guardados');
  };
  raiz.querySelector('[data-precios]').onsubmit = e => { e.preventDefault(); const f = new FormData(e.target); guardar({ margenObjetivo: f.get('margenObjetivo'), redondeo: f.get('redondeo'), stockMinimo: f.get('stockMinimo') }); };
  al(raiz, 'click', '[data-persona]', b => persona(b.dataset.persona ? JSON.parse(b.dataset.persona) : null));
  al(raiz, 'click', '[data-categoria]', b => categoria(b.dataset.categoria ? JSON.parse(b.dataset.categoria) : null));
  al(raiz, 'click', '[data-respaldar]', async () => { try { const j = await api('/api/respaldos', { metodo: 'POST' }); aviso('Respaldo creado: ' + j.nombre); cargarRespaldos(); } catch (e) { avisoError(e); } });
  cargarPersonas(); cargarCategorias(); cargarRespaldos();
}

async function cargarPersonas() {
  const caja = raiz.querySelector('[data-personas]');
  try {
    const { usuarios } = await api('/api/usuarios');
    caja.innerHTML = usuarios.map(u => `<button class="fila-lista" data-persona='${esc(JSON.stringify(u))}' style="${u.activo ? '' : 'opacity:.5'}"><span class="avatar" style="width:46px;height:46px;font-size:1.1rem;background:${esc(u.color)};color:${esc(u.color)}"><span style="color:#fff">${esc(iniciales(u.nombre))}</span></span>
      <span><div class="titulo">${esc(u.nombre)}</div><div class="detalle">${u.rol === 'dueno' ? 'Dueño' : 'Ventas'}${u.activo ? '' : ' · desactivado'}</div></span>${ico('lapiz', 'width="18" height="18" style="color:var(--tinta-3)"')}</button>`).join('');
  } catch (e) { avisoError(e); }
}
function persona(u) {
  let rol = u ? u.rol : 'vendedor', color = u ? u.color : COLORES[1];
  const h = hoja({ titulo: u ? 'Editar persona' : 'Agregar persona', html: `<form class="formulario" data-f>
      <label class="campo"><span>Nombre</span><input name="nombre" value="${esc(u ? u.nombre : '')}" maxlength="30" required autofocus></label>
      <div class="campo"><span>Papel</span><div class="metodos" style="grid-template-columns:1fr 1fr"><button type="button" class="metodo" data-rol="vendedor"><span class="e">🛍️</span>Ventas<small style="font-weight:600">Vende, devuelve y consulta</small></button><button type="button" class="metodo" data-rol="dueno"><span class="e">🔑</span>Dueño<small style="font-weight:600">Todo, incluidos costos</small></button></div></div>
      <div class="campo"><span>Color</span><div style="display:flex;gap:10px;flex-wrap:wrap" data-colores></div></div>
      <label class="campo"><span>${u ? 'PIN nuevo (vacío = no cambiar)' : 'PIN (4 a 6 números)'}</span><input name="pin" type="password" inputmode="numeric" maxlength="6" ${u ? '' : 'required'} autocomplete="new-password"></label>
      ${u ? `<label class="interruptor"><span><b>Activo</b><br><small class="sec">Si lo desactiva, ya no puede entrar.</small></span><input type="checkbox" name="activo" ${u.activo ? 'checked' : ''}></label>` : ''}
    </form>`, pie: `<button class="btn btn-borde" data-no>Cancelar</button><button class="btn btn-primario" data-ok>Guardar</button>` });
  const pinta = () => {
    for (const b of h.el.querySelectorAll('[data-rol]')) b.classList.toggle('activo', b.dataset.rol === rol);
    h.el.querySelector('[data-colores]').innerHTML = COLORES.map(c => `<button type="button" data-color="${c}" aria-label="Color" style="width:38px;height:38px;border-radius:50%;border:0;background:${c};box-shadow:${c === color ? '0 0 0 3px #fff, 0 0 0 5px ' + c : 'none'}"></button>`).join('');
  };
  pinta();
  al(h.el, 'click', '[data-rol]', b => { rol = b.dataset.rol; pinta(); });
  al(h.el, 'click', '[data-color]', b => { color = b.dataset.color; pinta(); });
  h.el.querySelector('[data-no]').onclick = () => h.cerrar();
  h.el.querySelector('[data-ok]').onclick = async () => {
    const f = new FormData(h.el.querySelector('[data-f]'));
    const datos = { nombre: f.get('nombre'), rol, color, pin: f.get('pin') || undefined, activo: u ? f.get('activo') === 'on' : true };
    try { if (u) await api('/api/usuarios/' + u.id, { metodo: 'PUT', datos }); else await api('/api/usuarios', { metodo: 'POST', datos }); aviso(u ? 'Persona actualizada' : `${datos.nombre} ya puede entrar con su PIN`); h.cerrar(); cargarPersonas(); }
    catch (e) { avisoError(e); }
  };
}

async function cargarCategorias() {
  const caja = raiz.querySelector('[data-categorias]');
  try {
    const { categorias } = await cargarCatalogo(true);
    caja.innerHTML = categorias.map(k => `<button class="fila-lista" data-categoria='${esc(JSON.stringify(k))}' style="padding:8px"><span class="ico" style="--c:${esc(k.color)};width:40px;height:40px;font-size:1.3rem">${esc(k.emoji)}</span><span><div class="titulo">${esc(k.nombre)}</div><div class="detalle">${k.productos} producto${k.productos === 1 ? '' : 's'}</div></span>${ico('lapiz', 'width="18" height="18" style="color:var(--tinta-3)"')}</button>`).join('');
  } catch (e) { avisoError(e); }
}
function categoria(k) {
  const h = hoja({ titulo: k ? 'Editar categoría' : 'Nueva categoría', html: `<form class="formulario" data-f>
      <div class="doble" style="grid-template-columns:90px 1fr"><label class="campo"><span>Dibujo</span><input name="emoji" value="${esc(k ? k.emoji : '🏷️')}" maxlength="4" style="text-align:center;font-size:1.4rem"></label>
      <label class="campo"><span>Nombre</span><input name="nombre" value="${esc(k ? k.nombre : '')}" maxlength="40" required autofocus></label></div>
      <label class="campo"><span>Color</span><input type="color" name="color" value="${esc(k ? k.color : '#38bdf8')}" style="height:48px;padding:4px"></label></form>`,
    pie: `${k ? `<button class="btn btn-peligro-suave" data-quitar>${ico('basura')}</button>` : ''}<button class="btn btn-borde" data-no>Cancelar</button><button class="btn btn-primario" data-ok>Guardar</button>` });
  h.el.querySelector('[data-no]').onclick = () => h.cerrar();
  if (k) h.el.querySelector('[data-quitar]').onclick = async () => { if (!await confirmar({ titulo: '¿Quitar la categoría?', texto: 'Solo se puede si ya no tiene productos.', si: 'Quitar', peligro: true })) return; try { await api('/api/categorias/' + k.id, { metodo: 'DELETE' }); aviso('Categoría quitada'); h.cerrar(); cargarCategorias(); } catch (e) { avisoError(e); } };
  h.el.querySelector('[data-ok]').onclick = async () => {
    const f = new FormData(h.el.querySelector('[data-f]')); const datos = { nombre: f.get('nombre'), emoji: f.get('emoji'), color: f.get('color') };
    try { if (k) await api('/api/categorias/' + k.id, { metodo: 'PUT', datos }); else await api('/api/categorias', { metodo: 'POST', datos }); aviso('Categoría guardada'); h.cerrar(); cargarCategorias(); } catch (e) { avisoError(e); }
  };
}

async function cargarRespaldos() {
  const caja = raiz.querySelector('[data-respaldos]');
  try {
    const { respaldos } = await api('/api/respaldos');
    caja.innerHTML = respaldos.slice(0, 6).map(r => `<a class="fila-lista" href="/api/respaldos/${encodeURIComponent(r.nombre)}" download style="padding:8px"><span class="ico" style="width:40px;height:40px">${ico('respaldo')}</span><span style="min-width:0"><div class="titulo" style="font-size:var(--t-sm)">${esc(r.nombre)}</div><div class="detalle">${(r.bytes / 1024).toFixed(0)} KB${r.manual ? ' · manual' : ' · automático'}</div></span>${ico('descargar', 'width="18" height="18" style="color:var(--tinta-3)"')}</a>`).join('') || '<p class="tenue">Todavía no hay respaldos.</p>';
  } catch (e) { avisoError(e); }
}
