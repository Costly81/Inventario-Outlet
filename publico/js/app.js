/* ─────────────────────────────────────────────────────────────────────────────
   APLICACIÓN: arranque, entrada con PIN, marco de navegación y rutas.

   Navegación (sin el típico menú lateral):
     · Celular → «dock» flotante abajo con el botón grande de VENDER al centro.
     · PC      → «isla» flotante arriba, con un marcador que se desliza a la opción activa,
                 y la paleta de comandos (Ctrl/⌘ + K) para ir a cualquier parte con el teclado.
   Las rutas viven en el «#» de la dirección (#/vender, #/inventario…), así el botón Atrás funciona.
   ───────────────────────────────────────────────────────────────────────────── */
import { estado, api, avisar, escuchar, conectarEventos, desconectarEventos, cargarCatalogo, esc, esDueno, iniciales, tcFmt, mxn, vibrar, haceCuanto } from './nucleo.js';
import { ico } from './iconos.js';
import { aviso, avisoError, hoja, al, confirmar, hayHojas } from './ui.js';

const app = document.getElementById('app');

/* ═════════ Rutas ═════════ */
const RUTAS = {
  inicio: { titulo: 'Inicio', icono: 'casa', cargar: () => import('./vistas/inicio.js') },
  vender: { titulo: 'Vender', icono: 'bolsa', cargar: () => import('./vistas/vender.js') },
  inventario: { titulo: 'Inventario', tituloVendedor: 'Existencias', icono: 'caja', cargar: () => import('./vistas/inventario.js') },
  compras: { titulo: 'Compras', icono: 'camion', dueno: true, cargar: () => import('./vistas/compras.js') },
  dolar: { titulo: 'Dólar', icono: 'dolar', cargar: () => import('./vistas/dolar.js') },
  reportes: { titulo: 'Reportes', icono: 'grafica', dueno: true, cargar: () => import('./vistas/reportes.js') },
  movimientos: { titulo: 'Ventas', icono: 'lista', cargar: () => import('./vistas/movimientos.js') },
  ajustes: { titulo: 'Ajustes', icono: 'engrane', dueno: true, cargar: () => import('./vistas/ajustes.js') }
};
const nombreRuta = r => esDueno() ? RUTAS[r].titulo : (RUTAS[r].tituloVendedor || RUTAS[r].titulo);
let vistaActual = { nombre: null, modulo: null, limpiar: null };

function rutaDeHash() {
  const [nombre, ...resto] = location.hash.replace(/^#\/?/, '').split('/');
  const r = RUTAS[nombre] && (!RUTAS[nombre].dueno || esDueno()) ? nombre : (esDueno() ? 'inicio' : 'vender');
  return { nombre: r, params: resto.map(decodeURIComponent) };
}
export const ir = (ruta) => { if (location.hash !== '#/' + ruta) location.hash = '#/' + ruta; else mostrarRuta(); };

async function mostrarRuta() {
  if (!estado.sesion) return;
  const { nombre, params } = rutaDeHash();
  const anterior = document.getElementById('vista'); if (!anterior) return;
  if (vistaActual.limpiar) { try { vistaActual.limpiar(); } catch (_) { } }
  /* Contenedor nuevo en cada pantalla: así los oyentes de la pantalla anterior desaparecen con ella */
  const contenedor = anterior.cloneNode(false); anterior.replaceWith(contenedor);
  vistaActual = { nombre, modulo: null, limpiar: null };
  marcarNavegacion(nombre);
  document.title = `${nombreRuta(nombre)} · ${estado.sesion.ajustes.tienda.nombre}`;
  contenedor.className = 'contenido';
  window.scrollTo({ top: 0 });
  try {
    const m = await RUTAS[nombre].cargar();
    if (vistaActual.nombre !== nombre) return;          // se cambió de pantalla mientras cargaba
    vistaActual.modulo = m;
    contenedor.innerHTML = '';
    void contenedor.offsetWidth; contenedor.classList.add('vista-entra');
    vistaActual.limpiar = await m.montar(contenedor, params) || null;
  } catch (e) { console.error(e); contenedor.innerHTML = `<div class="vacio"><div class="grande">⛅</div><h3>No se pudo abrir esta pantalla</h3><p>${esc(e.message)}</p><button class="btn btn-primario" onclick="location.reload()">Recargar</button></div>`; }
}

/* ═════════ Marco: encabezado, isla, dock ═════════ */
function marco() {
  const s = estado.sesion, dueno = esDueno(), t = s.ajustes.tienda;
  const navPC = dueno ? ['inicio', 'vender', 'inventario', 'compras', 'dolar', 'reportes', 'movimientos'] : ['inicio', 'vender', 'inventario', 'movimientos', 'dolar'];
  const dock = dueno ? ['inicio', 'inventario', 'vender', 'dolar', 'mas'] : ['inicio', 'inventario', 'vender', 'movimientos', 'dolar'];
  const logo = `<span class="marca-logo">${ico('gancho')}</span>`;
  app.innerHTML = `
    <header class="cabeza" id="cabeza">
      <a class="marca" href="#/inicio">${logo}<span class="marca-texto"><span class="marca-nombre">${esc(t.nombre)}</span><span class="marca-sub">${esc(s.usuario.nombre)} · ${dueno ? 'Dueño' : 'Ventas'}</span></span></a>
      <a class="dolar sin-dato" href="#/dolar" data-dolar aria-label="Dólar en vivo"></a>
    </header>
    <nav class="isla" aria-label="Secciones">
      <a class="marca" href="#/inicio">${logo}<span class="marca-texto"><span class="marca-nombre">${esc(t.nombre)}</span></span></a>
      <div class="isla-nav"><span class="isla-marcador" data-marcador></span>
        ${navPC.map(r => `<a class="isla-item ${r === 'vender' ? 'isla-vender' : ''}" href="#/${r}" data-ruta="${r}">${ico(RUTAS[r].icono)}<span class="rotulo">${nombreRuta(r)}</span></a>`).join('')}
      </div>
      <span class="isla-sep"></span>
      <button class="isla-buscar" data-paleta>${ico('buscar', 'width="16" height="16"')}<span>Buscar</span><kbd>${/Mac/.test(navigator.platform) ? '⌘' : 'Ctrl'} K</kbd></button>
      <a class="dolar sin-dato" href="#/dolar" data-dolar aria-label="Dólar en vivo"></a>
      ${dueno ? `<a class="isla-item" href="#/ajustes" data-ruta="ajustes" aria-label="Ajustes">${ico('engrane')}</a>` : ''}
      <button class="isla-usuario" data-usuario style="background:${esc(s.usuario.color || '#0ea5e9')}" aria-label="Mi cuenta">${esc(iniciales(s.usuario.nombre))}</button>
    </nav>
    <main id="vista" class="contenido"></main>
    <nav class="dock" aria-label="Secciones">
      ${dock.map(r => r === 'mas'
        ? `<button class="dock-item" data-mas>${ico('puntos')}<span>Más</span></button>`
        : `<a class="dock-item ${r === 'vender' ? 'dock-vender' : ''}" href="#/${r}" data-ruta="${r}">${ico(RUTAS[r].icono)}<span>${r === 'inventario' && !dueno ? 'Existencias' : nombreRuta(r)}</span>${r === 'vender' ? '<span class="dock-insignia oculto" data-cuenta-carrito></span>' : ''}</a>`).join('')}
    </nav>`;
  pintarDolar();
  pintarCuentaCarrito();
  al(app, 'click', '[data-mas]', menuMas);
  al(app, 'click', '[data-usuario]', menuUsuario);
  al(app, 'click', '[data-paleta]', paleta);
  /* El encabezado del celular se vuelve «vidrio» al desplazarse */
  const cab = document.getElementById('cabeza');
  const alDesplazar = () => cab.classList.toggle('flotando', scrollY > 8);
  addEventListener('scroll', alDesplazar, { passive: true });
}

function marcarNavegacion(nombre) {
  for (const a of app.querySelectorAll('[data-ruta]')) a.classList.toggle('activo', a.dataset.ruta === nombre);
  const marcador = app.querySelector('[data-marcador]'), act = app.querySelector(`.isla-nav [data-ruta="${nombre}"]`);
  if (marcador) {
    if (act && nombre !== 'vender') { marcador.style.opacity = 1; marcador.style.left = act.offsetLeft + 'px'; marcador.style.width = act.offsetWidth + 'px'; }
    else marcador.style.opacity = 0;
  }
}
addEventListener('resize', () => vistaActual.nombre && marcarNavegacion(vistaActual.nombre));

/* La píldora del dólar: valor, flecha contra ayer y un «latido» cuando cambia */
let ultimoValor = null;
function pintarDolar() {
  const tc = estado.tc;
  for (const el of app.querySelectorAll('[data-dolar]')) {
    if (!tc || !tc.valor) { el.className = 'dolar sin-dato'; el.innerHTML = `<span class="dolar-sello">$</span><span class="dolar-valor">—</span>`; el.title = 'Sin tipo de cambio todavía'; continue; }
    const dir = tc.cambio > 0.00005 ? 'sube' : tc.cambio < -0.00005 ? 'baja' : '';
    el.className = 'dolar ' + dir;
    el.innerHTML = `<span class="dolar-sello">$</span><span class="dolar-valor">${tcFmt(tc.valor)}</span>${tc.porcentaje != null ? `<span class="dolar-delta">${ico(dir === 'baja' ? 'baja' : 'sube')}${Math.abs(tc.porcentaje).toFixed(2)}%</span>` : ''}`;
    el.title = `Dólar ${tc.manual ? 'manual' : 'de mercado'} · ${tc.nombreFuente || ''} · ${haceCuanto(tc.t)}`;
    if (ultimoValor !== null && ultimoValor !== tc.valor) { el.classList.remove('latido'); void el.offsetWidth; el.classList.add('latido'); }
  }
  ultimoValor = tc && tc.valor;
}
function pintarCuentaCarrito() {
  const n = estado.carrito.reduce((s, l) => s + l.cantidad, 0);
  for (const el of app.querySelectorAll('[data-cuenta-carrito]')) { el.textContent = n; el.classList.toggle('oculto', !n); }
}

/* Menú «Más» del celular (dueño) */
function menuMas() {
  const op = [['compras', 'camion', 'Compras', 'Lo que se compró en dólares'], ['reportes', 'grafica', 'Reportes y proyección', 'Ganancia, merma, gastos, qué resurtir'],
    ['movimientos', 'lista', 'Ventas y devoluciones', 'Historial y cancelaciones'], ['ajustes', 'engrane', 'Ajustes', 'Tienda, dólar, personas, respaldos']];
  const h = hoja({ titulo: 'Más opciones', html: `<div class="lista">${op.map(([r, i, t, d]) => `<a class="fila-lista" href="#/${r}" data-ir>${`<span class="ico">${ico(i)}</span>`}<span><div class="titulo">${t}</div><div class="detalle">${d}</div></span>${ico('adelante', 'width="18" height="18" style="color:var(--tinta-3)"')}</a>`).join('')}
    <button class="fila-lista" data-cuenta><span class="ico" style="--c:${esc(estado.sesion.usuario.color)}">${ico('persona')}</span><span><div class="titulo">${esc(estado.sesion.usuario.nombre)}</div><div class="detalle">Cambiar PIN o salir</div></span>${ico('adelante', 'width="18" height="18" style="color:var(--tinta-3)"')}</button></div>` });
  al(h.el, 'click', '[data-ir]', () => h.cerrar());
  h.el.querySelector('[data-cuenta]').onclick = () => { h.cerrar(); setTimeout(menuUsuario, 200); };
}

/* Mi cuenta: cambiar PIN, salir */
function menuUsuario() {
  const u = estado.sesion.usuario;
  const h = hoja({ titulo: 'Mi cuenta', html: `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px"><span class="avatar" style="background:${esc(u.color)};color:${esc(u.color)}"><span style="color:#fff">${esc(iniciales(u.nombre))}</span></span>
      <div><div style="font-weight:800;font-size:var(--t-lg)">${esc(u.nombre)}</div><div class="sec">${u.rol === 'dueno' ? 'Dueño: ve y controla todo' : 'Ventas: vende, devuelve y consulta existencias'}</div></div></div>
    <form class="formulario" data-pin>
      <h3 style="margin:0">Cambiar mi PIN</h3>
      <div class="doble"><label class="campo"><span>PIN actual</span><input type="password" inputmode="numeric" maxlength="6" name="actual" autocomplete="current-password" required></label>
      <label class="campo"><span>PIN nuevo</span><input type="password" inputmode="numeric" maxlength="6" name="nuevo" autocomplete="new-password" required></label></div>
      <button class="btn btn-suave">Guardar PIN nuevo</button>
    </form>
    <p class="tenue" style="font-size:var(--t-xs);margin-top:18px">Versión ${esc(estado.sesion.version)}</p>`,
    pie: `<button class="btn btn-peligro-suave" data-salir>${ico('salir')} Salir</button>` });
  h.el.querySelector('[data-pin]').onsubmit = async e => {
    e.preventDefault(); const f = new FormData(e.target);
    try { await api('/api/mi-pin', { metodo: 'POST', datos: { actual: f.get('actual'), nuevo: f.get('nuevo') } }); aviso('PIN actualizado'); h.cerrar(); } catch (er) { avisoError(er); }
  };
  h.el.querySelector('[data-salir]').onclick = async () => { h.cerrar(); await salir(); };
}

async function salir() {
  try { await api('/api/salir', { metodo: 'POST' }); } catch (_) { }
  estado.sesion = null; desconectarEventos(); pantallaEntrar();
}

/* ═════════ Paleta de comandos (Ctrl/⌘ + K) ═════════ */
async function paleta() {
  if (hayHojas()) return;
  const acciones = Object.entries(RUTAS).filter(([, r]) => !r.dueno || esDueno()).map(([k, r]) => ({ texto: nombreRuta(k), icono: r.icono, hacer: () => ir(k), extra: 'Ir' }));
  if (esDueno()) acciones.push({ texto: 'Nueva compra', icono: 'camion', hacer: () => ir('compras/nueva'), extra: 'Acción' }, { texto: 'Contar inventario', icono: 'conteo', hacer: () => ir('inventario/contar'), extra: 'Acción' },
    { texto: 'Nuevo producto', icono: 'mas', hacer: () => ir('inventario/nuevo'), extra: 'Acción' });
  const cat = await cargarCatalogo().catch(() => null);
  const h = hoja({ titulo: 'Ir a…', html: `<div class="buscador">${ico('buscar')}<input data-q placeholder="Pantalla, acción o producto" autofocus></div><div class="paleta-lista" data-l></div>` });
  const lista = h.el.querySelector('[data-l]'), q = h.el.querySelector('[data-q]'); let items = [], sel = 0;
  const pinta = () => {
    const t = q.value.trim().toLowerCase();
    items = acciones.filter(a => a.texto.toLowerCase().includes(t));
    if (t && cat) items = items.concat(cat.productos.filter(p => p.nombre.toLowerCase().includes(t)).slice(0, 8).map(p => ({ texto: `${p.emoji} ${p.nombre}`, extra: `${p.existencia} pzs`, hacer: () => ir('inventario/p/' + p.id) })));
    sel = Math.min(sel, Math.max(0, items.length - 1));
    lista.innerHTML = items.map((a, i) => `<button class="paleta-item ${i === sel ? 'activo' : ''}" data-i="${i}">${a.icono ? ico(a.icono) : ''}<span>${esc(a.texto)}</span><small>${esc(a.extra || '')}</small></button>`).join('') || '<p class="tenue" style="padding:10px">Sin resultados</p>';
  };
  pinta();
  q.addEventListener('input', () => { sel = 0; pinta(); });
  q.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); pinta(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); pinta(); e.preventDefault(); }
    if (e.key === 'Enter' && items[sel]) { h.cerrar(); items[sel].hacer(); }
  });
  al(lista, 'click', '[data-i]', b => { h.cerrar(); items[+b.dataset.i].hacer(); });
}
document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && estado.sesion) { e.preventDefault(); paleta(); } });

/* ═════════ Entrada ═════════ */
async function pantallaEntrar(mensaje) {
  let e;
  try { e = await api('/api/estado'); } catch (er) { return pantallaSinConexion(er); }
  if (e.instalacion !== 'listo') return pantallaInstalar(e);
  const t = e.tienda;
  app.innerHTML = `<div class="entrada-pantalla"><div class="entrada-caja vista-entra">
    <div class="marca-logo">${ico('gancho')}</div>
    <h1>${esc(t.nombre)}</h1><p>${mensaje ? esc(mensaje) : '¿Quién va a usar el sistema?'}</p>
    <div class="personas" data-personas>${e.usuarios.map(u => `<button class="persona" data-u="${u.id}"><span class="avatar" style="background:${esc(u.color)};color:${esc(u.color)}"><span style="color:#fff">${esc(iniciales(u.nombre))}</span></span>${esc(u.nombre)}<small>${u.rol === 'dueno' ? 'Dueño' : 'Ventas'}</small></button>`).join('')}</div>
    <div data-pinbox></div>
  </div></div>`;
  const elegir = id => {
    const u = e.usuarios.find(x => x.id === +id);
    app.querySelector('[data-personas]').style.display = 'none';
    app.querySelector('.entrada-caja > p').innerHTML = `Hola, <b>${esc(u.nombre)}</b>. Escriba su PIN.`;
    tecladoPin(app.querySelector('[data-pinbox]'), async pin => {
      const r = await api('/api/entrar', { metodo: 'POST', datos: { usuarioId: u.id, pin } });
      await iniciarSesion(r.csrf);
    }, () => pantallaEntrar());
  };
  al(app, 'click', '[data-u]', b => elegir(b.dataset.u));
  if (e.usuarios.length === 1) elegir(e.usuarios[0].id);
}

/* Teclado de PIN con puntos: enviar(pin) debe lanzar error si es incorrecto */
function tecladoPin(caja, enviar, volver) {
  let pin = '';
  caja.innerHTML = `<div class="puntos-pin" data-puntos>${'<i></i>'.repeat(4)}</div>
    <div class="teclado" style="max-width:320px;margin:0 auto">${['1', '2', '3', '4', '5', '6', '7', '8', '9', 'volver', '0', 'borrar'].map(k =>
      k === 'volver' ? `<button class="tecla-accion" data-k="volver">${volver ? 'Cambiar' : ''}</button>` : k === 'borrar' ? `<button class="tecla-accion" data-k="borrar" aria-label="Borrar">⌫</button>` : `<button data-k="${k}">${k}</button>`).join('')}</div>
    <button class="btn btn-primario btn-grande btn-bloque" data-entrar style="max-width:320px;margin:18px auto 0" disabled>Entrar</button>`;
  const puntos = caja.querySelector('[data-puntos]'), boton = caja.querySelector('[data-entrar]');
  const pinta = () => { const n = Math.max(4, pin.length); puntos.innerHTML = Array.from({ length: n }, (_, i) => `<i class="${i < pin.length ? 'lleno' : ''}"></i>`).join(''); boton.disabled = pin.length < 4; };
  const probar = async () => {
    if (pin.length < 4) return; boton.disabled = true;
    try { await enviar(pin); }
    catch (er) { puntos.classList.remove('error'); void puntos.offsetWidth; puntos.classList.add('error'); vibrar([30, 50, 30]); aviso(er.message, { tipo: 'mal' }); pin = ''; setTimeout(pinta, 450); }
  };
  caja.addEventListener('click', ev => {
    const b = ev.target.closest('[data-k]'); if (!b) return; const k = b.dataset.k; vibrar(8);
    if (k === 'borrar') pin = pin.slice(0, -1); else if (k === 'volver') { volver && volver(); return; } else if (pin.length < 6) pin += k;
    pinta();
  });
  boton.onclick = probar;
  const tecla = ev => { if (!caja.isConnected) return document.removeEventListener('keydown', tecla); if (/^\d$/.test(ev.key) && pin.length < 6) { pin += ev.key; pinta(); } else if (ev.key === 'Backspace') { pin = pin.slice(0, -1); pinta(); } else if (ev.key === 'Enter') probar(); };
  document.addEventListener('keydown', tecla);
  pinta();
}

/* Primer uso (o PIN olvidado): crear el PIN del dueño */
function pantallaInstalar(e) {
  const restablecer = e.instalacion === 'restablecer';
  app.innerHTML = `<div class="entrada-pantalla"><div class="entrada-caja vista-entra" style="text-align:left">
    <div class="marca-logo">${ico('gancho')}</div>
    <h1 style="text-align:center">${restablecer ? 'PIN nuevo del dueño' : 'Bienvenido'}</h1>
    <p style="text-align:center">${restablecer ? 'Se pidió restablecer el PIN desde el menú de arranque.' : 'Vamos a dejar listo el sistema de la tienda. Toma un minuto.'}</p>
    <form class="formulario tarjeta" data-f>
      ${e.local ? '<div class="nota">' + ico('info') + '<span>Está en la computadora de la tienda: no hace falta el código.</span></div>' : `<label class="campo"><span>Código de instalación</span><input name="codigo" autocomplete="off" placeholder="XXXX-XXXX-XXXX" required style="text-transform:uppercase;letter-spacing:.08em"><small>Aparece en la ventana del menú de arranque de la Mac (y en datos/INSTALACION.txt).</small></label>`}
      <label class="campo"><span>${restablecer ? 'Nombre (opcional)' : 'Su nombre'}</span><input name="nombre" autocomplete="name" ${restablecer ? '' : 'required'} maxlength="30" placeholder="Por ejemplo: Ana"></label>
      <div class="doble"><label class="campo"><span>PIN (4 a 6 números)</span><input name="pin" type="password" inputmode="numeric" maxlength="6" pattern="\\d{4,6}" required autocomplete="new-password"></label>
      <label class="campo"><span>Repita el PIN</span><input name="pin2" type="password" inputmode="numeric" maxlength="6" required autocomplete="new-password"></label></div>
      <button class="btn btn-primario btn-grande">${restablecer ? 'Guardar PIN y entrar' : 'Crear y entrar'}</button>
    </form></div></div>`;
  app.querySelector('[data-f]').onsubmit = async ev => {
    ev.preventDefault(); const f = new FormData(ev.target);
    if (f.get('pin') !== f.get('pin2')) return aviso('Los dos PIN no coinciden.', { tipo: 'mal' });
    try { const r = await api('/api/instalar', { metodo: 'POST', datos: { codigo: f.get('codigo'), nombre: f.get('nombre'), pin: f.get('pin') } }); await iniciarSesion(r.csrf); aviso('¡Listo! El sistema es suyo.'); }
    catch (er) { avisoError(er); }
  };
}

function pantallaSinConexion(er) {
  app.innerHTML = `<div class="entrada-pantalla"><div class="entrada-caja">${'<div class="vacio"><div class="grande">📡</div><h3>No hay conexión con la tienda</h3><p>' + esc(er.message) + '</p><button class="btn btn-primario" data-r>Intentar de nuevo</button></div>'}</div></div>`;
  app.querySelector('[data-r]').onclick = () => pantallaEntrar();
}

/* ═════════ Sesión ═════════ */
async function iniciarSesion() {
  const s = await api('/api/sesion');
  estado.sesion = s;
  try { estado.carrito = JSON.parse(localStorage.getItem('io-carrito-' + s.usuario.id) || '[]'); } catch (_) { estado.carrito = []; }
  const tc = await api('/api/tc').catch(() => null); estado.tc = tc && tc.tc;
  marco();
  conectarEventos();
  cargarCatalogo(true).catch(() => { });
  mostrarRuta();
}

/* ═════════ Eventos globales ═════════ */
escuchar('tc', pintarDolar);
escuchar('carrito', () => { pintarCuentaCarrito(); if (estado.sesion) { try { localStorage.setItem('io-carrito-' + estado.sesion.usuario.id, JSON.stringify(estado.carrito)); } catch (_) { } } });
escuchar('sesion-terminada', () => { if (estado.sesion) { estado.sesion = null; desconectarEventos(); pantallaEntrar('Su sesión terminó. Entre otra vez.'); } });
escuchar('conexion', si => { if (!si) aviso('Sin conexión con la computadora de la tienda', { tipo: 'mal' }); else aviso('Conexión recuperada', { tipo: 'info' }); });
/* Alguien cambió algo en otro dispositivo: el catálogo se recarga y la pantalla actual decide si se actualiza */
escuchar('cambio', d => {
  if (['venta', 'compra', 'catalogo', 'devolucion', 'merma', 'conteo'].includes(d.que)) cargarCatalogo(true).catch(() => { });
  if (vistaActual.modulo && vistaActual.modulo.alCambio) { try { vistaActual.modulo.alCambio(d); } catch (e) { console.error(e); } }
  if (d.que === 'venta' && !d.anulada && esDueno() && d.usuario && d.usuario !== estado.sesion.usuario.nombre) aviso(`${d.usuario} vendió ${mxn(d.total)} (${d.piezas} pza${d.piezas === 1 ? '' : 's'})`, { tipo: 'info' });
});
addEventListener('hashchange', mostrarRuta);
/* Al volver a la pestaña después de un rato, se refresca el dólar */
document.addEventListener('visibilitychange', async () => { if (!document.hidden && estado.sesion) { try { const j = await api('/api/tc'); estado.tc = j.tc; avisar('tc', estado.tc); } catch (_) { } } });

/* ═════════ Arranque ═════════ */
(async () => {
  try { await iniciarSesion(); }
  catch (e) { if (e.status === 401 || e.status === 403) pantallaEntrar(); else pantallaSinConexion(e); }
})();

export { RUTAS, confirmar };
