/* ─────────────────────────────────────────────────────────────────────────────
   CÓDIGO QR SIN DEPENDENCIAS (modo byte, corrección de errores M, versiones 1 a 40).
   Sirve para abrir el sistema en un celular apuntando la cámara: lo usan la pantalla
   «Abrir en el celular» (navegador) y el menú de arranque (Terminal, con caracteres de bloque).

   Funciona en los dos lados:
     · Navegador:  <script src="/js/qr.js"></script>  →  window.QR.svg('http://…')
     · Node.js:    const QR = require('../publico/js/qr.js')  →  QR.matriz('http://…')

   Basado en el estándar ISO/IEC 18004 (mismo método que la biblioteca de referencia de Nayuki).
   ───────────────────────────────────────────────────────────────────────────── */
(function (raiz) {
  'use strict';

  /* Tablas del estándar por nivel [L, M, Q, H] y versión (índice 0 sin uso) */
  const ECC_POR_BLOQUE = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
  ];
  const BLOQUES = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
  ];
  const NIVEL = { L: 0, M: 1, Q: 2, H: 3 }, BITS_FORMATO = [1, 0, 3, 2];

  const bit = (x, i) => ((x >>> i) & 1) !== 0;
  function modulosCrudos(v) { let r = (16 * v + 128) * v + 64; if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; } return r; }
  const palabrasDatos = (v, n) => Math.floor(modulosCrudos(v) / 8) - ECC_POR_BLOQUE[n][v] * BLOQUES[n][v];

  /* Aritmética en GF(256) con el polinomio 0x11D */
  function mult(x, y) { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z; }
  function divisor(grado) { const r = new Array(grado).fill(0); r[grado - 1] = 1; let raizG = 1; for (let i = 0; i < grado; i++) { for (let j = 0; j < r.length; j++) { r[j] = mult(r[j], raizG); if (j + 1 < r.length) r[j] ^= r[j + 1]; } raizG = mult(raizG, 0x02); } return r; }
  function residuo(datos, div) { const r = div.map(() => 0); for (const b of datos) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= mult(c, f); }); } return r; }

  /** Matriz de módulos (true = oscuro) para un texto */
  function matriz(texto, nivel = 'M') {
    const n = NIVEL[nivel] ?? 1;
    const bytes = Array.from(typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(texto) : Buffer.from(texto, 'utf8'));
    /* Versión más pequeña donde quepa */
    let v = 1;
    for (; v <= 40; v++) { const cuenta = v <= 9 ? 8 : 16; if (4 + cuenta + bytes.length * 8 <= palabrasDatos(v, n) * 8) break; }
    if (v > 40) throw new Error('Texto demasiado largo para un código QR');
    const cuentaBits = v <= 9 ? 8 : 16, capacidad = palabrasDatos(v, n) * 8;
    /* Flujo de bits: modo byte (0100) + longitud + datos + terminador + relleno */
    const bits = [];
    const poner = (val, largo) => { for (let i = largo - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    poner(4, 4); poner(bytes.length, cuentaBits); for (const b of bytes) poner(b, 8);
    poner(0, Math.min(4, capacidad - bits.length)); poner(0, (8 - bits.length % 8) % 8);
    for (let p = 0xEC; bits.length < capacidad; p ^= 0xEC ^ 0x11) poner(p, 8);
    const datos = []; for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; datos.push(b); }

    /* Bloques con su corrección de errores, intercalados */
    const nb = BLOQUES[n][v], eccLen = ECC_POR_BLOQUE[n][v], total = Math.floor(modulosCrudos(v) / 8);
    const cortos = nb - total % nb, largoCorto = Math.floor(total / nb), div = divisor(eccLen), bloques = [];
    for (let i = 0, k = 0; i < nb; i++) {
      const d = datos.slice(k, k + largoCorto - eccLen + (i < cortos ? 0 : 1)); k += d.length;
      const e = residuo(d, div); if (i < cortos) d.push(0); bloques.push(d.concat(e));
    }
    const finales = [];
    for (let i = 0; i < bloques[0].length; i++) bloques.forEach((b, j) => { if (i !== largoCorto - eccLen || j >= cortos) finales.push(b[i]); });

    /* Dibujo de la matriz */
    const tam = v * 4 + 17;
    const m = Array.from({ length: tam }, () => new Array(tam).fill(false));
    const fija = Array.from({ length: tam }, () => new Array(tam).fill(false));
    const fijar = (x, y, o) => { m[y][x] = o; fija[y][x] = true; };
    for (let i = 0; i < tam; i++) { fijar(6, i, i % 2 === 0); fijar(i, 6, i % 2 === 0); }
    const buscador = (x, y) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)), xx = x + dx, yy = y + dy; if (xx >= 0 && xx < tam && yy >= 0 && yy < tam) fijar(xx, yy, d !== 2 && d !== 4); } };
    buscador(3, 3); buscador(tam - 4, 3); buscador(3, tam - 4);
    if (v > 1) {
      const na = Math.floor(v / 7) + 2, paso = v === 32 ? 26 : Math.ceil((v * 4 + 4) / (na * 2 - 2)) * 2, pos = [6];
      for (let p = tam - 7; pos.length < na; p -= paso) pos.splice(1, 0, p);
      for (let i = 0; i < na; i++) for (let j = 0; j < na; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) fijar(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
    const formato = mascara => {
      const d = BITS_FORMATO[n] << 3 | mascara; let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      const b = (d << 10 | r) ^ 0x5412;
      for (let i = 0; i <= 5; i++) fijar(8, i, bit(b, i));
      fijar(8, 7, bit(b, 6)); fijar(8, 8, bit(b, 7)); fijar(7, 8, bit(b, 8));
      for (let i = 9; i < 15; i++) fijar(14 - i, 8, bit(b, i));
      for (let i = 0; i < 8; i++) fijar(tam - 1 - i, 8, bit(b, i));
      for (let i = 8; i < 15; i++) fijar(8, tam - 15 + i, bit(b, i));
      fijar(8, tam - 8, true);
    };
    formato(0);
    if (v >= 7) { let r = v; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25); const b = v << 12 | r; for (let i = 0; i < 18; i++) { const a = tam - 11 + i % 3, c = Math.floor(i / 3); fijar(a, c, bit(b, i)); fijar(c, a, bit(b, i)); } }
    /* Datos en zigzag */
    let i = 0;
    for (let der = tam - 1; der >= 1; der -= 2) {
      if (der === 6) der = 5;
      for (let vert = 0; vert < tam; vert++) for (let j = 0; j < 2; j++) {
        const x = der - j, arriba = ((der + 1) & 2) === 0, y = arriba ? tam - 1 - vert : vert;
        if (!fija[y][x] && i < finales.length * 8) { m[y][x] = bit(finales[i >>> 3], 7 - (i & 7)); i++; }
      }
    }
    /* Máscara: se prueba cada una y se queda la de menor penalización */
    const invierte = (k, x, y) => [(x + y) % 2 === 0, y % 2 === 0, x % 3 === 0, (x + y) % 3 === 0, (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, x * y % 2 + x * y % 3 === 0, (x * y % 2 + x * y % 3) % 2 === 0, ((x + y) % 2 + x * y % 3) % 2 === 0][k];
    const aplicar = k => { for (let y = 0; y < tam; y++) for (let x = 0; x < tam; x++) if (!fija[y][x] && invierte(k, x, y)) m[y][x] = !m[y][x]; };
    const penal = () => {
      let p = 0, oscuros = 0;
      const lineas = []; for (let a = 0; a < tam; a++) { lineas.push(m[a]); lineas.push(m.map(f => f[a])); }
      for (const l of lineas) {
        let corrida = 1; for (let k = 1; k <= tam; k++) { if (k < tam && l[k] === l[k - 1]) corrida++; else { if (corrida >= 5) p += corrida - 2; corrida = 1; } }
        const s = l.map(c => c ? '1' : '0').join('');
        for (const patron of ['10111010000', '00001011101']) { let idx = s.indexOf(patron); while (idx >= 0) { p += 40; idx = s.indexOf(patron, idx + 1); } }
      }
      for (let y = 0; y < tam - 1; y++) for (let x = 0; x < tam - 1; x++) { const c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3; }
      for (const f of m) for (const c of f) if (c) oscuros++;
      return p + Math.floor(Math.abs(oscuros * 100 / (tam * tam) - 50) / 5) * 10;
    };
    let mejor = 0, menor = Infinity;
    for (let k = 0; k < 8; k++) { aplicar(k); formato(k); const p = penal(); if (p < menor) { menor = p; mejor = k; } aplicar(k); }
    aplicar(mejor); formato(mejor);
    return m;
  }

  /** SVG listo para insertar (oscuro = color de tinta) */
  function svg(texto, { borde = 2, color = '#0e2a3b' } = {}) {
    const m = matriz(texto), tam = m.length + borde * 2; let d = '';
    m.forEach((f, y) => f.forEach((c, x) => { if (c) d += `M${x + borde},${y + borde}h1v1h-1z`; }));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${tam} ${tam}" shape-rendering="crispEdges" role="img" aria-label="Código QR"><rect width="${tam}" height="${tam}" fill="#fff"/><path d="${d}" fill="${color}"/></svg>`;
  }

  /** Texto para la Terminal: cada carácter dibuja dos filas (▀ ▄ █).
      Con color (lo normal) se fuerza tinta negra sobre fondo blanco, así se lee igual en Terminal clara u oscura. */
  function terminal(texto, { borde = 2, color = true } = {}) {
    const m = matriz(texto), tam = m.length, at = (x, y) => x >= 0 && y >= 0 && x < tam && y < tam && m[y][x];
    const lineas = [];
    for (let y = -borde; y < tam + borde; y += 2) {
      let l = '';
      for (let x = -borde; x < tam + borde; x++) {
        const a = at(x, y), b = at(x, y + 1);
        /* con color: el carácter dibuja lo OSCURO; sin color se asume letra clara sobre fondo oscuro y se dibuja lo CLARO */
        l += color ? (a && b ? '█' : a ? '▀' : b ? '▄' : ' ') : (a && b ? ' ' : a ? '▄' : b ? '▀' : '█');
      }
      lineas.push(color ? '\x1b[30;107m' + l + '\x1b[0m' : l);
    }
    return lineas.join('\n');
  }

  const QR = { matriz, svg, terminal };
  if (typeof module !== 'undefined' && module.exports) module.exports = QR; else raiz.QR = QR;
})(typeof self !== 'undefined' ? self : this);
