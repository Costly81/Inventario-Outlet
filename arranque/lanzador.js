'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   INVENTARIO OUTLET · LANZADOR (el «vigilante» del servidor)

   · Arranca servidor/index.js y lo vuelve a arrancar si se cae (esperando un poco más cada vez).
   · Se apaga en orden cuando aparece el archivo datos/detener.orden (lo deja el menú, opción 2)
     o cuando recibe Control + C / SIGTERM: le pide al servidor que cierre la base de datos y luego sale.
   · Deja su número de proceso en datos/lanzador.pid para que el menú sepa si está encendido.

   Normalmente lo arranca el menú (iniciar.command) en segundo plano, con su salida en datos/sistema.log.
   Uso directo (primer plano, para desarrollar):  node arranque/lanzador.js   o   npm start
   ───────────────────────────────────────────────────────────────────────────── */
const fs = require('fs'), path = require('path'), cp = require('child_process');

const RAIZ = path.resolve(__dirname, '..');
const datosDir = () => process.env.IO_DATOS ? path.resolve(process.env.IO_DATOS) : path.join(RAIZ, 'datos');
const DATOS = datosDir();
const PID = path.join(DATOS, 'lanzador.pid'), ORDEN = path.join(DATOS, 'detener.orden');
const SERVIDOR = path.join(RAIZ, 'servidor', 'index.js');
const hora = () => new Date().toLocaleString('es-MX', { hour12: false });
const decir = m => console.log(`[${hora()}] ${m}`);

function principal() {
  fs.mkdirSync(DATOS, { recursive: true });
  try { fs.rmSync(ORDEN, { force: true }); } catch (_) { }            // una orden vieja no debe apagar este arranque
  fs.writeFileSync(PID, String(process.pid));

  let hijo = null, apagando = false, caidas = [];

  function arrancar() {
    if (apagando) return;
    decir('Arrancando el servidor…');
    /* fork = proceso hijo con canal interno: así se le puede pedir que se apague en orden */
    hijo = cp.fork(SERVIDOR, process.argv.slice(2), { cwd: RAIZ, execArgv: ['--disable-warning=ExperimentalWarning'], stdio: 'inherit' });
    hijo.on('exit', (codigo, senal) => {
      hijo = null;
      if (apagando) return terminar();
      /* Se cayó: se vuelve a intentar, cada vez esperando más (2 s, 4 s, 8 s… hasta 60 s) */
      const ahora = Date.now(); caidas = caidas.filter(t => ahora - t < 10 * 60000); caidas.push(ahora);
      const espera = Math.min(60, 2 ** Math.min(caidas.length, 6)) * 1000;
      decir(`El servidor se detuvo (código ${codigo ?? senal}). Se reintenta en ${espera / 1000} s. (${caidas.length} caída(s) en 10 min)`);
      setTimeout(arrancar, espera);
    });
  }

  function apagar(motivo) {
    if (apagando) return; apagando = true;
    decir(`Apagando (${motivo})…`);
    if (!hijo) return terminar();
    try { hijo.send('apagar'); } catch (_) { try { hijo.kill('SIGTERM'); } catch (_) { } }
    /* Si en 8 s no cerró, se detiene a la fuerza */
    setTimeout(() => { if (hijo) { try { hijo.kill('SIGKILL'); } catch (_) { } } terminar(); }, 8000).unref();
  }
  function terminar() {
    try { if (fs.readFileSync(PID, 'utf8').trim() === String(process.pid)) fs.rmSync(PID, { force: true }); } catch (_) { }
    try { fs.rmSync(ORDEN, { force: true }); } catch (_) { }
    decir('Apagado.');
    process.exit(0);
  }

  /* La orden de apagar llega como archivo (funciona igual desde cualquier ventana o conexión remota) */
  setInterval(() => { if (fs.existsSync(ORDEN)) apagar('orden del menú'); }, 1000);
  process.on('SIGTERM', () => apagar('SIGTERM'));
  process.on('SIGINT', () => apagar('Control + C'));
  process.on('SIGHUP', () => { /* cerrar la ventana de la Terminal no apaga el sistema */ });
  arrancar();
}

if (require.main === module) principal();
module.exports = { RAIZ, datosDir };
