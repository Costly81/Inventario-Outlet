/* ─────────────────────────────────────────────────────────────────────────────
   GRÁFICAS EN SVG (sin bibliotecas).
   · barras(): una serie, o dos apiladas (costo + ganancia = venta).
   · linea(): una serie con área suave y guía al pasar el dedo o el ratón.
   · chispa(): mini línea (sparkline) para tarjetas.
   Todas traen globo informativo (tooltip): al pasar el ratón o tocar, se ve el valor exacto.
   Colores validados para daltonismo (ver docs/documentacion-tecnica.md → Gráficas).
   ───────────────────────────────────────────────────────────────────────────── */
import { esc } from './nucleo.js';

export const COLORES = { ganancia: '#0b8fc6', costo: '#e8955a', venta: '#0b8fc6', dolar: '#c98500', reja: '#e3eff5' };

/* Escala «bonita» para el eje: 0 … máximo redondeado */
function escala(max, marcas = 4) {
  if (!(max > 0)) return { max: 1, paso: 0.25 };
  const crudo = max / marcas, mag = Math.pow(10, Math.floor(Math.log10(crudo))), n = crudo / mag;
  const paso = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  return { max: Math.ceil(max / paso) * paso, paso };
}
const corto = n => { const a = Math.abs(n); return a >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '') + 'M' : a >= 1e3 ? (n / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace('.0', '') + 'k' : String(Math.round(n * 100) / 100); };

/**
 * Barras verticales. datos: [{ etiqueta, valores: [n] | [costo, ganancia], tip: 'html del globo' }]
 * o = { series: [{ nombre, color }], alto: 220, etiquetasCada: 1 }
 */
/* Ancho del dibujo: en celular más angosto, así las letras de los ejes no se ven diminutas */
const anchoBase = () => (typeof innerWidth !== 'undefined' && innerWidth < 700 ? 380 : 640);

export function barras(datos, { series = [{ nombre: 'Venta', color: COLORES.venta }], alto = 220, etiquetasCada = 1, formatoEje = corto, ancho } = {}) {
  const W = ancho || anchoBase(), H = alto, iz = 44, de = 8, ar = 12, ab = 26, n = datos.length || 1;
  const totales = datos.map(d => d.valores.reduce((s, v) => s + Math.max(0, v), 0));
  const { max, paso } = escala(Math.max(...totales, 0));
  const paso_ = (W - iz - de) / n, barra = Math.max(4, Math.min(34, paso_ * 0.62));
  const y = v => ar + (H - ar - ab) * (1 - v / max);
  let s = '';
  for (let v = 0; v <= max + 1e-9; v += paso) s += `<line class="reja" x1="${iz}" x2="${W - de}" y1="${y(v)}" y2="${y(v)}"/><text class="eje" x="${iz - 8}" y="${y(v) + 4}" text-anchor="end">${formatoEje(v)}</text>`;
  datos.forEach((d, i) => {
    const cx = iz + paso_ * i + paso_ / 2; let base = 0;
    d.valores.forEach((v, k) => {
      if (v <= 0) return;
      const y1 = y(base + v), y0 = y(base), alto = Math.max(0, y0 - y1 - (k > 0 ? 2 : 0));      // 2 px de separación entre segmentos
      const arriba = k === d.valores.length - 1 || d.valores.slice(k + 1).every(x => x <= 0);
      const r = arriba ? Math.min(4, barra / 2, alto) : 0;
      /* Esquinas redondeadas solo en la punta de la barra */
      const x0 = cx - barra / 2, x1 = cx + barra / 2, yb = y1 + alto;
      const camino = `M${x0},${yb}V${y1 + r}Q${x0},${y1} ${x0 + r},${y1}H${x1 - r}Q${x1},${y1} ${x1},${y1 + r}V${yb}Z`;
      s += `<path class="barra barra-anim" style="animation-delay:${i * 18}ms" d="${camino}" fill="${series[k] ? series[k].color : COLORES.venta}"/>`;
      base += v;
    });
    if (i % etiquetasCada === 0 || i === n - 1) s += `<text class="eje" x="${cx}" y="${H - 8}" text-anchor="middle">${esc(d.etiqueta)}</text>`;
    s += `<rect x="${iz + paso_ * i}" y="${ar}" width="${paso_}" height="${H - ar - ab}" fill="transparent" data-tip="${esc(d.tip || '')}" data-x="${cx / W}"/>`;
  });
  const leyenda = series.length > 1 ? `<div class="leyenda">${series.map(x => `<span><i style="background:${x.color}"></i>${esc(x.nombre)}</span>`).join('')}</div>` : '';
  return `${leyenda}<div class="grafica" data-grafica><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfica de barras">${s}</svg><div class="globo"></div></div>`;
}

/**
 * Línea con área. puntos: [{ etiqueta, valor, tip }]
 * o = { color, alto, minimoCero: false, formatoEje, marcas: [{ valor, texto }] (líneas de referencia) }
 */
export function linea(puntos, { color = COLORES.venta, alto = 200, minimoCero = false, formatoEje = corto, etiquetasCada, referencia = null, ancho } = {}) {
  const W = ancho || anchoBase(), H = alto, iz = 46, de = 10, ar = 12, ab = 26, n = puntos.length;
  if (n < 2) return `<div class="vacio" style="padding:24px"><p style="margin:0">Todavía no hay suficientes datos para la gráfica.</p></div>`;
  const vals = puntos.map(p => p.valor).filter(v => v != null);
  let mn = Math.min(...vals), mx = Math.max(...vals);
  if (referencia != null) { mn = Math.min(mn, referencia); mx = Math.max(mx, referencia); }
  if (minimoCero) mn = 0;
  const margen = (mx - mn) * 0.12 || Math.abs(mx) * 0.01 || 1; mn = minimoCero ? 0 : mn - margen; mx += margen;
  const x = i => iz + (W - iz - de) * (i / (n - 1)), y = v => ar + (H - ar - ab) * (1 - (v - mn) / (mx - mn));
  let s = '';
  for (let k = 0; k <= 3; k++) { const v = mn + (mx - mn) * k / 3; s += `<line class="reja" x1="${iz}" x2="${W - de}" y1="${y(v)}" y2="${y(v)}"/><text class="eje" x="${iz - 8}" y="${y(v) + 4}" text-anchor="end">${formatoEje(v)}</text>`; }
  if (referencia != null) s += `<line x1="${iz}" x2="${W - de}" y1="${y(referencia)}" y2="${y(referencia)}" stroke="#7a909c" stroke-width="1.5" stroke-dasharray="4 5"/>`;
  const pts = puntos.map((p, i) => [x(i), y(p.valor)]);
  /* Curva suave (Catmull-Rom → Bézier) */
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2, t = 0.18;
    d += `C${p1[0] + (p2[0] - p0[0]) * t},${p1[1] + (p2[1] - p0[1]) * t} ${p2[0] - (p3[0] - p1[0]) * t},${p2[1] - (p3[1] - p1[1]) * t} ${p2[0]},${p2[1]}`;
  }
  const idg = 'g' + Math.random().toString(36).slice(2, 8);
  s += `<defs><linearGradient id="${idg}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".22"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>`;
  s += `<path class="area-anim" d="${d}L${pts[n - 1][0]},${H - ab}L${pts[0][0]},${H - ab}Z" fill="url(#${idg})"/>`;
  s += `<path class="linea-anim" style="--largo:3000" d="${d}" fill="none" stroke="${color}" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/>`;
  const [ux, uy] = pts[n - 1];
  s += `<circle cx="${ux}" cy="${uy}" r="5" fill="${color}" stroke="#fff" stroke-width="2.5"/>`;
  const cada = etiquetasCada || Math.max(1, Math.ceil(n / 6));
  puntos.forEach((p, i) => { if (i % cada === 0 && i < n - Math.ceil(cada / 2)) s += `<text class="eje" x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(p.etiqueta)}</text>`; });
  s += `<text class="eje" x="${x(n - 1)}" y="${H - 8}" text-anchor="end">${esc(puntos[n - 1].etiqueta)}</text>`;
  /* Guía y punto móviles + zonas de contacto */
  s += `<line data-guia x1="0" x2="0" y1="${ar}" y2="${H - ab}" stroke="#0e2a3b" stroke-opacity=".25" stroke-width="1" style="opacity:0"/><circle data-punto r="5.5" fill="${color}" stroke="#fff" stroke-width="2.5" style="opacity:0"/>`;
  const anchoZona = (W - iz - de) / (n - 1);
  puntos.forEach((p, i) => { s += `<rect x="${x(i) - anchoZona / 2}" y="${ar}" width="${anchoZona}" height="${H - ar - ab}" fill="transparent" data-tip="${esc(p.tip || '')}" data-x="${x(i) / W}" data-px="${x(i)}" data-py="${y(p.valor)}"/>`; });
  return `<div class="grafica" data-grafica><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfica de línea">${s}</svg><div class="globo"></div></div>`;
}

/** Mini línea sin ejes para tarjetas */
export function chispa(valores, { color = COLORES.venta, ancho = 120, alto = 36 } = {}) {
  const v = valores.filter(x => x != null); if (v.length < 2) return '';
  const mn = Math.min(...v), mx = Math.max(...v), r = mx - mn || 1;
  const pts = v.map((x, i) => `${(i / (v.length - 1)) * ancho},${alto - 3 - (x - mn) / r * (alto - 6)}`).join(' ');
  return `<svg viewBox="0 0 ${ancho} ${alto}" width="${ancho}" height="${alto}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/** Barras horizontales (categorías, productos). filas: [{ nombre, valor, texto }] */
export function barrasH(filas, { formato = String } = {}) {
  const max = Math.max(...filas.map(f => f.valor), 1);
  return filas.map((f, i) => `<div class="barra-h"><span class="nom">${esc(f.nombre)}</span><span class="pista"><span class="relleno" style="width:${Math.max(2, f.valor / max * 100)}%;animation-delay:${i * 50}ms"></span></span><span class="val">${esc(f.texto ?? formato(f.valor))}</span></div>`).join('');
}

/** Activa los globos informativos de todas las gráficas dentro de `raiz` (ratón y dedo) */
export function activarGraficas(raiz) {
  for (const g of raiz.querySelectorAll('[data-grafica]')) {
    if (g.dataset.activa) continue; g.dataset.activa = '1';
    const globo = g.querySelector('.globo'), svg = g.querySelector('svg'), guia = g.querySelector('[data-guia]'), punto = g.querySelector('[data-punto]');
    const mostrar = rect => {
      const tip = rect.getAttribute('data-tip'); if (!tip) return ocultar();
      globo.innerHTML = tip; globo.classList.add('visible');
      const bx = g.getBoundingClientRect(), r = rect.getBoundingClientRect();
      let left = r.left + r.width / 2 - bx.left;
      const top = rect.dataset.py ? (+rect.dataset.py / svg.viewBox.baseVal.height) * svg.getBoundingClientRect().height : r.top - bx.top + 6;
      left = Math.max(70, Math.min(bx.width - 70, left));
      globo.style.left = left + 'px'; globo.style.top = top + 'px';
      if (guia && rect.dataset.px) { guia.setAttribute('x1', rect.dataset.px); guia.setAttribute('x2', rect.dataset.px); guia.style.opacity = 1; punto.setAttribute('cx', rect.dataset.px); punto.setAttribute('cy', rect.dataset.py); punto.style.opacity = 1; }
      for (const b of g.querySelectorAll('.barra')) b.style.opacity = '';
    };
    const ocultar = () => { globo.classList.remove('visible'); if (guia) { guia.style.opacity = 0; punto.style.opacity = 0; } };
    svg.addEventListener('pointermove', e => { const el = document.elementFromPoint(e.clientX, e.clientY); if (el && el.matches('rect[data-tip]')) mostrar(el); });
    svg.addEventListener('pointerdown', e => { const el = document.elementFromPoint(e.clientX, e.clientY); if (el && el.matches('rect[data-tip]')) mostrar(el); });
    svg.addEventListener('pointerleave', ocultar);
  }
}
