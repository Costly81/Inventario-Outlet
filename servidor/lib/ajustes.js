'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   AJUSTES DEL NEGOCIO (se cambian en la pantalla Ajustes; viven en la base de datos).
   Aquí están los valores por omisión, la validación y el acceso con todo ya combinado.
   ───────────────────────────────────────────────────────────────────────────── */
const U = require('./util.js');
const T = require('./tiempo.js');

const PREDETERMINADOS = {
  tienda: { nombre: 'Mi Outlet', lema: 'Ropa americana a precio de frontera' },
  zonaHoraria: 'America/Ciudad_Juarez',
  margenObjetivo: 50,       // % de ganancia sobre el precio de venta que se busca (para sugerir precios)
  redondeo: 10,             // los precios sugeridos se redondean hacia arriba a múltiplos de esto ($10 → 189 = 190)
  stockMinimo: 2,           // a partir de cuántas piezas un producto se marca como «por agotarse»
  tc: {
    fuente: 'google',       // google (principal: el dólar que muestra Google) | auto | yahoo | banxico | erapi | frankfurter
    intervaloMin: 5,        // cada cuántos minutos se consulta el dólar
    manual: null,           // si tiene número, se usa este valor en lugar del de internet (por ejemplo, sin internet)
    ajusteCompra: 0.35,     // pesos ENCIMA del mercado que cuesta comprar un dólar en la casa de cambio
    modoRecibir: 'ajuste',  // 'ajuste' = mercado menos ajusteRecibir · 'fijo' = siempre recibirFijo
    ajusteRecibir: 0.60,    // pesos DEBAJO del mercado a los que la tienda recibe dólares de un cliente
    recibirFijo: null,
    tokenBanxico: ''        // opcional: token gratuito del SIE de Banxico para usar el FIX oficial
  },
  gastosCategorias: ['Renta', 'Luz y agua', 'Internet', 'Bolsas y empaque', 'Cruce y gasolina', 'Sueldos', 'Publicidad', 'Otro']
};

const FUENTES = ['google', 'auto', 'yahoo', 'banxico', 'erapi', 'frankfurter'];

/* Lee todos los ajustes combinados con los valores por omisión */
function leer(B) {
  const out = {};
  for (const k of Object.keys(PREDETERMINADOS)) {
    const p = PREDETERMINADOS[k], v = B.ajuste(k, undefined);
    out[k] = (p && typeof p === 'object' && !Array.isArray(p)) ? { ...p, ...(v || {}) } : (v === undefined ? p : v);
  }
  return out;
}

/* Valida y guarda un cambio parcial (solo las claves que lleguen). Devuelve los ajustes completos. */
function guardar(B, cambios) {
  if (!cambios || typeof cambios !== 'object') U.falla('No llegaron ajustes.');
  const actual = leer(B), nuevos = {};
  if (cambios.tienda) {
    nuevos.tienda = {
      nombre: U.texto(cambios.tienda.nombre ?? actual.tienda.nombre, 'El nombre de la tienda', { min: 1, max: 40 }),
      lema: U.texto(cambios.tienda.lema ?? actual.tienda.lema, 'El lema', { max: 80 })
    };
  }
  if (cambios.zonaHoraria !== undefined) { const z = U.texto(cambios.zonaHoraria, 'La zona horaria', { min: 3, max: 60 }); T.usarZona(z); nuevos.zonaHoraria = z; }
  if (cambios.margenObjetivo !== undefined) nuevos.margenObjetivo = U.numero(cambios.margenObjetivo, 'El margen objetivo', { min: 0, max: 95 });
  if (cambios.redondeo !== undefined) nuevos.redondeo = U.numero(cambios.redondeo, 'El redondeo', { min: 1, max: 100 });
  if (cambios.stockMinimo !== undefined) nuevos.stockMinimo = U.entero(cambios.stockMinimo, 'El mínimo de piezas', { min: 0, max: 999 });
  if (cambios.tc) {
    const c = cambios.tc, a = actual.tc;
    const tokenNuevo = c.tokenBanxico === undefined ? a.tokenBanxico : U.texto(c.tokenBanxico, 'El token de Banxico', { max: 80 });
    nuevos.tc = {
      fuente: U.opcion(c.fuente ?? a.fuente, 'La fuente del dólar', FUENTES),
      intervaloMin: U.numero(c.intervaloMin ?? a.intervaloMin, 'El intervalo de consulta', { min: 1, max: 120 }),
      manual: (c.manual === null || c.manual === '' ) ? null : (c.manual === undefined ? a.manual : U.r4(U.numero(c.manual, 'El dólar manual', { min: 5, max: 60 }))),
      ajusteCompra: U.r4(U.numero(c.ajusteCompra ?? a.ajusteCompra, 'El ajuste de compra', { min: -5, max: 10 })),
      modoRecibir: U.opcion(c.modoRecibir ?? a.modoRecibir, 'La forma de recibir dólares', ['ajuste', 'fijo']),
      ajusteRecibir: U.r4(U.numero(c.ajusteRecibir ?? a.ajusteRecibir, 'El ajuste para recibir dólares', { min: -5, max: 10 })),
      recibirFijo: (c.recibirFijo === null || c.recibirFijo === '') ? null : (c.recibirFijo === undefined ? a.recibirFijo : U.r2(U.numero(c.recibirFijo, 'El dólar fijo para recibir', { min: 5, max: 60 }))),
      tokenBanxico: tokenNuevo
    };
    if (nuevos.tc.modoRecibir === 'fijo' && !nuevos.tc.recibirFijo) U.falla('Para recibir dólares a un precio fijo, escriba ese precio.');
  }
  if (cambios.gastosCategorias !== undefined) {
    if (!Array.isArray(cambios.gastosCategorias) || cambios.gastosCategorias.length > 30) U.falla('Las categorías de gastos no son válidas.');
    nuevos.gastosCategorias = [...new Set(cambios.gastosCategorias.map(x => U.texto(x, 'Una categoría de gasto', { min: 1, max: 30 })))];
  }
  for (const [k, v] of Object.entries(nuevos)) B.guardarAjuste(k, v);
  return leer(B);
}

/* Lo que puede ver un vendedor (sin el token de Banxico) */
function publicos(aj) { const { tc, ...resto } = aj; const { tokenBanxico, ...tcp } = tc; return { ...resto, tc: { ...tcp, tieneTokenBanxico: !!tokenBanxico } }; }

module.exports = { PREDETERMINADOS, FUENTES, leer, guardar, publicos };
