'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   INVENTARIO OUTLET · SERVIDOR
   Un solo programa que:
     · guarda todo en datos/inventario.sqlite,
     · atiende la página (carpeta publico/) a la Mac y a los celulares de la red local,
     · consulta el dólar cada pocos minutos y avisa en vivo a las pantallas abiertas,
     · hace un respaldo diario.

   Normalmente lo arranca y vigila arranque/lanzador.js (el menú de iniciar.command lo hace por usted).
   Uso directo:
     node servidor/index.js                    arrancar
     node servidor/index.js --restablecer-pin  el dueño olvidó su PIN: genera un código para crear uno nuevo
     node servidor/index.js --respaldo         hace un respaldo y termina
     node servidor/index.js --codigo           muestra el código de instalación (si hace falta)
     node servidor/index.js --demo             si la base está vacía, la llena con datos de demostración
   ───────────────────────────────────────────────────────────────────────────── */
const http = require('http'), path = require('path');
const CFG = require('./lib/config.js');
const DB = require('./lib/db.js');
const H = require('./lib/http.js');
const T = require('./lib/tiempo.js');
const A = require('./lib/ajustes.js');
const C = require('./lib/catalogo.js');
const Auth = require('./lib/auth.js');
const TC = require('./lib/tipoCambio.js');
const Eventos = require('./lib/eventos.js');
const Respaldo = require('./lib/respaldo.js');
const Red = require('./lib/red.js');
const Rutas = require('./rutas.js');

/**
 * Prepara todo (base, servicios, rutas) sin abrir el puerto. Lo usan el arranque normal y las pruebas.
 * @param {object} o  { cfg, fetch, registro }
 */
function preparar({ cfg = CFG.leer(), fetch, registro = console } = {}) {
  const B = DB.abrir(cfg.archivoBD);
  try { T.usarZona(A.leer(B).zonaHoraria); } catch (_) { /* zona inválida guardada: se queda la de omisión */ }
  C.sembrarCategorias(B);
  const eventos = Eventos.crear();
  const auth = Auth.crear({ B, datos: cfg.datos, sesionDias: cfg.sesionDias });
  const tc = TC.crear({ B, emitir: eventos.emitir, sinRed: cfg.sinRed, fetch, registro });
  const respaldos = Respaldo.crear({ B, datos: cfg.datos, conservar: cfg.respaldosDiarios, registro });
  const ctx = { B, cfg, auth, tc, eventos, respaldos, version: CFG.version() };
  const rutas = Rutas.registrar(ctx);
  const publico = path.join(cfg.raiz, 'publico');

  /* Atiende una petición HTTP */
  async function atender(req, res) {
    H.seguridad(res);
    const url = new URL(req.url, 'http://x');
    const ruta = url.pathname;
    if (!ruta.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return H.error(req, res, 405, 'Método no permitido.');
      return H.estatico(req, res, publico, ruta);
    }
    const r = rutas.buscar(req.method, ruta);
    if (!r) return H.error(req, res, rutas.existeRuta(ruta) ? 405 : 404, 'No existe esa función.');
    try {
      /* Sesión y permisos */
      let sesion = null;
      if (!r.opciones.publica) {
        sesion = auth.sesion(H.cookies(req)[auth.COOKIE]);
        if (!sesion) return H.error(req, res, 401, 'Su sesión terminó. Entre otra vez con su PIN.');
        if (r.opciones.rol && sesion.usuario.rol !== r.opciones.rol) return H.error(req, res, 403, 'Esta función es solo para el dueño.');
        if (req.method !== 'GET' && req.method !== 'HEAD' && !r.opciones.sinCsrf && req.headers['x-csrf'] !== sesion.csrf)
          return H.error(req, res, 403, 'La página está desactualizada. Recárguela e intente de nuevo.');
      }
      const cuerpo = (req.method === 'POST' || req.method === 'PUT') ? await H.leerJSON(req) : {};
      const salida = await r.fn(req, res, sesion, cuerpo, url.searchParams, r.params);
      if (salida === H.SIN_RESPUESTA) return;
      return H.json(req, res, 200, { ok: true, ...(salida || {}) });
    } catch (e) {
      if (e && e.usuario) return H.error(req, res, e.status || 400, e.message);
      registro.error('  ✗ Error en ' + req.method + ' ' + ruta + ':', e && e.stack || e);
      return H.error(req, res, 500, 'Ocurrió un error inesperado. Intente de nuevo; si se repite, revise el registro (opción 6 del menú).');
    }
  }

  return { ...ctx, atender };
}

/** Arranque normal: abre el puerto y programa las tareas periódicas */
async function iniciar() {
  const cfg = CFG.leer();
  const app = preparar({ cfg });
  const { B, auth, tc, respaldos, eventos } = app;

  if (process.argv.includes('--demo')) {
    const n = require('./demo.js').sembrar(B);
    console.log(n ? `  ✓ Datos de demostración cargados (${n} ventas).` : '  · La base ya tenía datos: no se cargó la demostración.');
  }

  const codigo = auth.prepararCodigo();
  const servidor = http.createServer((req, res) => { app.atender(req, res).catch(e => { console.error(e); try { H.error(req, res, 500, 'Error inesperado.'); } catch (_) { } }); });
  servidor.keepAliveTimeout = 65000;
  servidor.requestTimeout = 60000;

  await new Promise((ok, mal) => {
    servidor.once('error', e => mal(e.code === 'EADDRINUSE'
      ? new Error(`El puerto ${cfg.puerto} ya está ocupado (¿el sistema ya está encendido en otra ventana?). Cámbielo en datos/configuracion.json si es otro programa.`)
      : e));
    servidor.listen(cfg.puerto, cfg.host, ok);
  });

  console.log(`\n  ✓ Inventario Outlet ${app.version} encendido · ${T.zona()} · ${T.partes().fecha} ${T.partes().hora}`);
  console.log(`    En esta Mac:      http://localhost:${cfg.puerto}`);
  for (const u of Red.urls(cfg.puerto).slice(0, 3)) console.log(`    En los celulares: ${u.url}   (${u.interfaz})`);
  if (codigo) console.log(`\n  PRIMER USO: código para crear el PIN del dueño: ${codigo}  (desde la Mac no se pide)`);

  /* Tareas: dólar, respaldo diario, limpieza */
  tc.iniciar().catch(() => { });
  respaldos.diario();
  const cadaHora = setInterval(() => { respaldos.diario(); auth.podar(); tc.podar(); }, 3600000);

  /* Apagado ordenado: termina de atender, cierra la base y sale */
  let cerrando = false;
  const apagar = (motivo) => {
    if (cerrando) return; cerrando = true;
    console.log(`  · Apagando (${motivo})…`);
    clearInterval(cadaHora); tc.detener(); eventos.cerrarTodo();
    servidor.close(() => { B.cerrar(); process.exit(0); });
    setTimeout(() => { B.cerrar(); process.exit(0); }, 4000).unref();
  };
  process.on('SIGTERM', () => apagar('SIGTERM'));
  process.on('SIGINT', () => apagar('Control + C'));
  process.on('message', m => { if (m === 'apagar') apagar('orden del lanzador'); });   // canal interno con arranque/lanzador.js
  process.on('disconnect', () => apagar('el lanzador se cerró'));
}

/* ---- órdenes de una sola vez (sin abrir el puerto) ---- */
function ordenUnica() {
  const cfg = CFG.leer();
  const B = DB.abrir(cfg.archivoBD);
  try { T.usarZona(A.leer(B).zonaHoraria); } catch (_) { }
  const auth = Auth.crear({ B, datos: cfg.datos });
  try {
    if (process.argv.includes('--restablecer-pin')) {
      const c = auth.pedirRestablecer();
      console.log(`\n  ✓ Listo. Se cerraron las sesiones abiertas.\n\n  Abra el sistema y escriba este código para crear el PIN nuevo del dueño:\n\n        ${c}\n\n  (Desde la propia Mac no se pide el código. También quedó en datos/INSTALACION.txt)\n`);
    } else if (process.argv.includes('--respaldo')) {
      const r = Respaldo.crear({ B, datos: cfg.datos });
      console.log('  ✓ Respaldo creado: datos/respaldos/' + r.ahora());
    } else if (process.argv.includes('--codigo')) {
      const c = auth.prepararCodigo();
      console.log(c ? c : '(no hace falta código: el sistema ya está configurado)');
    }
  } finally { B.cerrar(); }
}

if (require.main === module) {
  if (['--restablecer-pin', '--respaldo', '--codigo'].some(x => process.argv.includes(x))) {
    try { ordenUnica(); } catch (e) { console.error('  ✗ ' + e.message); process.exit(1); }
  } else {
    iniciar().catch(e => { console.error('\n  ✗ ' + (e && e.message || e)); process.exit(1); });
  }
}

module.exports = { preparar };
