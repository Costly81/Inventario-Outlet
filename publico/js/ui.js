/* ─────────────────────────────────────────────────────────────────────────────
   PIEZAS DE INTERFAZ REUTILIZABLES: avisos flotantes, hojas (ventanas que suben desde
   abajo en el celular y aparecen al centro en la PC), confirmaciones, teclado numérico,
   números que «cuentan», y el vuelo del producto al carrito.
   ───────────────────────────────────────────────────────────────────────────── */
import { ico } from './iconos.js';
import { esc, sinMovimiento, vibrar } from './nucleo.js';

/* ═════════ Delegación de eventos ═════════
   al(contenedor, 'click', '[data-accion]', (el, evento) => …): un solo oyente para muchos botones. */
export function al(raiz, tipo, selector, fn) {
  const h = e => { const el = e.target.closest(selector); if (el && raiz.contains(el)) fn(el, e); };
  raiz.addEventListener(tipo, h); return () => raiz.removeEventListener(tipo, h);
}
export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

/* ═════════ Avisos flotantes ═════════ */
/**
 * aviso('Venta registrada', { tipo: 'bien', accion: 'Deshacer', alAccion: fn, ms: 5000 })
 * tipo: bien | mal | info
 */
export function aviso(texto, { tipo = 'bien', accion, alAccion, ms } = {}) {
  const caja = document.getElementById('avisos'); if (!caja) return;
  const el = document.createElement('div');
  el.className = `aviso-t ${tipo}`;
  el.innerHTML = `${ico(tipo === 'mal' ? 'alerta' : tipo === 'info' ? 'info' : 'palomita')}<span class="texto">${esc(texto)}</span>${accion ? `<button type="button">${esc(accion)}</button>` : ''}`;
  caja.appendChild(el);
  while (caja.children.length > 3) caja.firstChild.remove();
  const quitar = () => { el.classList.add('saliendo'); setTimeout(() => el.remove(), 300); };
  if (accion) el.querySelector('button').onclick = () => { quitar(); alAccion && alAccion(); };
  setTimeout(quitar, ms || (accion ? 7000 : tipo === 'mal' ? 5500 : 3200));
  if (tipo === 'mal') vibrar([20, 40, 20]);
  return quitar;
}
export const avisoError = e => aviso(e && e.message ? e.message : String(e), { tipo: 'mal' });

/* ═════════ Hojas ═════════ */
let pilaHojas = [];
/**
 * Abre una hoja. Devuelve { el, cuerpo, pie, cerrar, alCerrar }.
 * o = { titulo, html, pie (html de botones), ancha, alCerrar, sinCerrar }
 */
export function hoja({ titulo = '', html = '', pie = '', ancha = false, alCerrar, cabezaExtra = '' } = {}) {
  const fondo = document.createElement('div'); fondo.className = 'fondo-hoja';
  const el = document.createElement('section'); el.className = 'hoja' + (ancha ? ' ancha' : ''); el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', titulo);
  el.innerHTML = `<div class="hoja-asa"></div>
    <header class="hoja-cabeza"><h2>${esc(titulo)}</h2>${cabezaExtra}<button class="btn btn-borde btn-icono btn-chico" data-cerrar aria-label="Cerrar">${ico('x')}</button></header>
    <div class="hoja-cuerpo">${html}</div>${pie ? `<footer class="hoja-pie">${pie}</footer>` : ''}`;
  document.body.append(fondo, el);
  const previo = document.activeElement;
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => { fondo.classList.add('visible'); el.classList.add('visible'); });
  let cerrada = false;
  const api = {
    el, cuerpo: el.querySelector('.hoja-cuerpo'), pie: el.querySelector('.hoja-pie'),
    cerrar(valor) {
      if (cerrada) return; cerrada = true;
      fondo.classList.remove('visible'); el.classList.remove('visible');
      pilaHojas = pilaHojas.filter(h => h !== api);
      if (!pilaHojas.length) document.body.style.overflow = '';
      setTimeout(() => { fondo.remove(); el.remove(); }, 420);
      try { previo && previo.focus && previo.focus({ preventScroll: true }); } catch (_) { }
      alCerrar && alCerrar(valor);
    },
    titulo(t) { el.querySelector('.hoja-cabeza h2').textContent = t; }
  };
  fondo.onclick = () => api.cerrar();
  el.querySelector('[data-cerrar]').onclick = () => api.cerrar();
  /* Deslizar hacia abajo desde el asa o la cabecera para cerrar (celular) */
  let y0 = null, dy = 0;
  const zona = el.querySelector('.hoja-asa'), cab = el.querySelector('.hoja-cabeza');
  for (const z of [zona, cab]) {
    z.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; dy = 0; el.style.transition = 'none'; }, { passive: true });
    z.addEventListener('touchmove', e => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); el.style.transform = `translateY(${dy}px)`; }, { passive: true });
    z.addEventListener('touchend', () => { el.style.transition = ''; el.style.transform = ''; if (dy > 110) api.cerrar(); y0 = null; });
  }
  pilaHojas.push(api);
  setTimeout(() => { const f = el.querySelector('[autofocus]') || el.querySelector('.hoja-cuerpo input:not([type=hidden]), .hoja-cuerpo button'); if (f && !('ontouchstart' in window)) f.focus({ preventScroll: true }); }, 380);
  return api;
}
/* Escape cierra la hoja de arriba */
document.addEventListener('keydown', e => { if (e.key === 'Escape' && pilaHojas.length) { e.preventDefault(); pilaHojas[pilaHojas.length - 1].cerrar(); } });
export const hayHojas = () => pilaHojas.length > 0;

/** Confirmación: devuelve true/false */
export function confirmar({ titulo = '¿Seguro?', texto = '', si = 'Sí', no = 'Cancelar', peligro = false } = {}) {
  return new Promise(ok => {
    let respuesta = false;
    const h = hoja({ titulo, html: `<p class="sec" style="margin:0 0 4px;font-size:var(--t-md)">${texto}</p>`,
      pie: `<button class="btn btn-borde" data-no>${esc(no)}</button><button class="btn ${peligro ? 'btn-peligro' : 'btn-primario'}" data-si>${esc(si)}</button>`,
      alCerrar: () => ok(respuesta) });
    h.el.querySelector('[data-no]').onclick = () => h.cerrar();
    h.el.querySelector('[data-si]').onclick = () => { respuesta = true; h.cerrar(); };
  });
}

/**
 * Teclado numérico grande (para precios en el celular). Devuelve el número o null.
 * o = { titulo, valor, prefijo: '$', decimales: true, ayuda }
 */
export function tecladoNumerico({ titulo = 'Escriba la cantidad', valor = '', prefijo = '$', decimales = true, ayuda = '' } = {}) {
  return new Promise(ok => {
    let txt = valor === null || valor === undefined ? '' : String(valor), resultado = null;
    const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9', decimales ? '.' : '', '0', '⌫'];
    const h = hoja({ titulo, html: `${ayuda ? `<p class="sec" style="margin:0;text-align:center">${ayuda}</p>` : ''}<div class="pantalla-teclado num" data-pantalla></div>
      <div class="teclado">${teclas.map(t => t ? `<button type="button" data-t="${t}" class="${t === '⌫' ? 'tecla-accion' : ''}" aria-label="${t === '⌫' ? 'Borrar' : t}">${t}</button>` : '<span></span>').join('')}</div>`,
      pie: `<button class="btn btn-borde" data-no>Cancelar</button><button class="btn btn-primario" data-si>Listo</button>`, alCerrar: () => ok(resultado) });
    const pantalla = h.el.querySelector('[data-pantalla]');
    const pinta = () => { pantalla.textContent = prefijo + (txt || '0'); };
    pinta();
    al(h.el, 'click', '[data-t]', b => {
      const t = b.dataset.t; vibrar(8);
      if (t === '⌫') txt = txt.slice(0, -1);
      else if (t === '.') { if (!txt.includes('.')) txt = (txt || '0') + '.'; }
      else if (txt.length < 9 && !(txt.includes('.') && txt.split('.')[1].length >= 2)) txt = txt === '0' ? t : txt + t;
      pinta();
    });
    const tecla = e => { if (/^[0-9.]$/.test(e.key)) h.el.querySelector(`[data-t="${e.key}"]`)?.click(); else if (e.key === 'Backspace') h.el.querySelector('[data-t="⌫"]').click(); else if (e.key === 'Enter') h.el.querySelector('[data-si]').click(); };
    document.addEventListener('keydown', tecla);
    h.el.querySelector('[data-no]').onclick = () => h.cerrar();
    h.el.querySelector('[data-si]').onclick = () => { resultado = txt === '' ? null : +txt; h.cerrar(); };
    const cerrarOriginal = h.cerrar; h.cerrar = v => { document.removeEventListener('keydown', tecla); cerrarOriginal(v); };
  });
}

/* ═════════ Números que cuentan hacia su valor ═════════
   <span data-contar="1234.5" data-formato="mxn">…</span> → animarNumeros(raiz, { mxn, usd, … }) */
export function animarNumeros(raiz, formatos) {
  for (const el of raiz.querySelectorAll('[data-contar]')) {
    const fin = +el.dataset.contar, f = formatos[el.dataset.formato] || (n => Math.round(n));
    if (sinMovimiento() || !isFinite(fin) || Math.abs(fin) < 1) { el.textContent = f(fin); continue; }
    const t0 = performance.now(), dur = 900;
    const paso = t => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 4); el.textContent = f(fin * e); if (p < 1) requestAnimationFrame(paso); else el.textContent = f(fin); };
    requestAnimationFrame(paso);
  }
}

/* ═════════ Vuelo al carrito ═════════
   Un emoji sale del cuadro tocado y vuela hasta el destino (la bolsa del carrito). */
export function volar(desde, hacia, contenido) {
  if (sinMovimiento() || !desde || !hacia) return;
  const a = desde.getBoundingClientRect(), b = hacia.getBoundingClientRect();
  if (!b.width) return;
  const v = document.createElement('div'); v.className = 'volador'; v.textContent = contenido;
  v.style.left = (a.left + a.width / 2 - 16) + 'px'; v.style.top = (a.top + a.height / 2 - 20) + 'px';
  document.body.appendChild(v);
  requestAnimationFrame(() => { v.style.transform = `translate(${b.left + b.width / 2 - a.left - a.width / 2}px, ${b.top + b.height / 2 - a.top - a.height / 2}px) scale(.35)`; v.style.opacity = '.4'; });
  setTimeout(() => v.remove(), 650);
}

/** Chispas alrededor del círculo de éxito */
export function chispas(el, n = 14) {
  if (sinMovimiento()) return;
  const colores = ['#0fa3e0', '#f5a524', '#0f9d6e', '#7fd3f6', '#ec4899'];
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i'); c.className = 'chispa';
    const ang = (i / n) * Math.PI * 2, r = 70 + Math.random() * 40;
    c.style.setProperty('--x', Math.cos(ang) * r + 'px'); c.style.setProperty('--y', Math.sin(ang) * r + 'px');
    c.style.background = colores[i % colores.length]; c.style.animationDelay = (Math.random() * .12) + 's';
    el.appendChild(c); setTimeout(() => c.remove(), 1200);
  }
}

/** Esqueleto de carga: n bloques de alto h */
export const esqueletos = (n = 3, h = 72) => Array.from({ length: n }, () => `<div class="esqueleto" style="height:${h}px;margin-bottom:10px"></div>`).join('');
/** Pantalla vacía que invita a actuar */
export const vacio = ({ emoji = '🌤️', titulo, texto = '', boton = '' }) => `<div class="vacio"><div class="grande">${emoji}</div><h3>${esc(titulo)}</h3>${texto ? `<p>${texto}</p>` : ''}${boton}</div>`;
/** Insignia de variación (+12 % en verde, −5 % en rojo). inverso: true cuando subir es malo */
export function insigniaVar(v, { inverso = false, sufijo = '' } = {}) {
  if (v == null || !isFinite(v)) return '<span class="insignia i-gris">sin comparación</span>';
  const bueno = inverso ? v < 0 : v > 0, nada = Math.abs(v) < 0.05;
  return `<span class="insignia ${nada ? 'i-gris' : bueno ? 'i-bien' : 'i-mal'}">${nada ? '' : ico(v > 0 ? 'sube' : 'baja')}${(v > 0 ? '+' : '') + v.toFixed(Math.abs(v) < 10 ? 1 : 0).replace('-', '−')} %${sufijo}</span>`;
}
