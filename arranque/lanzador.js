'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   INVENTARIO OUTLET · LANZADOR (el «vigilante» del servidor)

   · Arranca servidor/index.js y lo vuelve a arrancar si se cae (esperando un poco más cada vez).
   · Aplica las ACTUALIZACIONES: cuando el servidor sale con el código 75, cumple la orden que dejó
     (instalar la versión nueva o regresar a la anterior) y lo vuelve a encender. Si la versión nueva
     no arranca, regresa sola a la anterior (ver arranque/actualizar.js).
   · Se apaga en orden (le pide al servidor que cierre la base de datos) cuando:
       – se CIERRA LA VENTANA del sistema (señal SIGHUP, igual en macOS y Windows),
       – se presiona Control + C, o llega SIGTERM,
       – aparece el archivo datos/detener.orden (lo deja el menú).
   · Deja su número de proceso en datos/lanzador.pid.

   Normalmente lo arranca el menú (iniciar.command / iniciar.bat) DENTRO de su misma ventana.
   Uso directo (para desarrollar):  node arranque/lanzador.js   o   npm start
   ───────────────────────────────────────────────────────────────────────────── */
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ACT = require('./actualizar.js');

const RAIZ = path.resolve(__dirname, '..');
const datosDir = () => process.env.IO_DATOS ? path.resolve(process.env.IO_DATOS) : path.join(RAIZ, 'datos');
const hora = () => new Date().toLocaleString('es-MX', { hour12: false });
const decir = m => console.log(`[${hora()}] ${m}`);

function principal() {
  const DATOS = datosDir();
  const PID = path.join(DATOS, 'lanzador.pid'), ORDEN = path.join(DATOS, 'detener.orden');
  fs.mkdirSync(DATOS, { recursive: true });
  try { fs.rmSync(ORDEN, { force: true }); } catch (_) { }             // una orden vieja no debe apagar este arranque
  /* PID del lanzador y, si lo arrancó una ventana del menú, el PID de esa ventana (así otra ventana sabe que ya está abierto) */
  fs.writeFileSync(PID, JSON.stringify({ pid: process.pid, ventana: +process.env.IO_PADRE || null }));

  let hijo = null, apagando = false, caidas = [];

  function arrancar() {
    if (apagando) return;
    decir('Arrancando el servidor…');
    /* fork = proceso hijo con canal interno: así se le puede pedir que se apague en orden */
    hijo = cp.fork(path.join(RAIZ, 'servidor', 'index.js'), process.argv.slice(2), { cwd: RAIZ, execArgv: ['--disable-warning=ExperimentalWarning'], stdio: 'inherit' });
    hijo.on('exit', (codigo, senal) => {
      hijo = null;
      if (apagando) return terminar();
      /* 75 = el servidor pidió aplicar una actualización (o regresar a la versión anterior) */
      if (codigo === ACT.CODIGO_ACTUALIZAR) {
        const texto = ACT.cumplirOrden(RAIZ, DATOS);
        decir(texto || 'El servidor pidió actualizar, pero no había orden.');
        caidas = [];
        return setTimeout(arrancar, 300);
      }
      /* Si la versión recién instalada se cae antes de confirmar que arrancó, se regresa a la anterior */
      const regreso = ACT.revertirSiFallo(RAIZ, DATOS);
      if (regreso) { decir(regreso); caidas = []; return setTimeout(arrancar, 300); }
      /* Se cayó: se vuelve a intentar, cada vez esperando más (2 s, 4 s, 8 s… hasta 60 s) */
      const t = Date.now(); caidas = caidas.filter(x => t - x < 10 * 60000); caidas.push(t);
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
    /* Si en 4 s no cerró, se detiene a la fuerza (al cerrar la ventana, Windows da ~5 s) */
    setTimeout(() => { if (hijo) { try { hijo.kill('SIGKILL'); } catch (_) { } } terminar(); }, 4000).unref();
  }
  function terminar() {
    try { if (JSON.parse(fs.readFileSync(PID, 'utf8')).pid === process.pid) fs.rmSync(PID, { force: true }); } catch (_) { }
    try { fs.rmSync(ORDEN, { force: true }); } catch (_) { }
    decir('Apagado.');
    process.exit(0);
  }

  setInterval(() => { if (fs.existsSync(ORDEN)) apagar('orden del menú'); }, 1000);
  process.on('SIGTERM', () => apagar('SIGTERM'));
  process.on('SIGINT', () => apagar('Control + C'));
  /* Cerrar la ventana del sistema = apagar (macOS manda SIGHUP; Windows también, al cerrar la consola) */
  process.on('SIGHUP', () => apagar('se cerró la ventana'));
  /* Si el menú que lo arrancó desaparece (ventana cerrada a la fuerza), también se apaga */
  if (process.env.IO_PADRE) setInterval(() => { try { process.kill(+process.env.IO_PADRE, 0); } catch (e) { if (e.code === 'ESRCH') apagar('se cerró la ventana del sistema'); } }, 2000).unref();
  arrancar();
}

if (require.main === module) principal();
module.exports = { RAIZ, datosDir };
