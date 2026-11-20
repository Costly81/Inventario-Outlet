'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   INVENTARIO OUTLET · VENTANA DEL SISTEMA Y MENÚ
   (lo que se ve al abrir iniciar.command en macOS o iniciar.bat en Windows: el mismo menú)

   ESTA VENTANA ES EL SISTEMA:
   · Al abrirla, el sistema enciende solo y la ventana se minimiza (sigue trabajando abajo, en el Dock
     o en la barra de tareas).
   · Si se CIERRA la ventana, el sistema SE APAGA por completo (no queda nada corriendo escondido).
     También se apaga con la opción 0.
   · Cada opción se escribe y se confirma con Enter. Apagar, reiniciar y restablecer el PIN piden además SI.
   · Lo que el sistema escribe al trabajar queda en datos/sistema.log (opción 4), así la ventana se ve limpia.
   · Mientras está encendido, la computadora no se duerme sola (macOS: caffeinate; Windows: SetThreadExecutionState).

   Órdenes sin ventana (conexión remota o pruebas automáticas; el sistema queda en segundo plano):
     node arranque/menu.js encender | apagar | reiniciar | estado | respaldo | celular
   ───────────────────────────────────────────────────────────────────────────── */
const fs = require('fs'), path = require('path'), cp = require('child_process'), http = require('http'), readline = require('readline');
const L = require('./lanzador.js');

const RAIZ = L.RAIZ, DATOS = L.datosDir(), MAC = process.platform === 'darwin', WIN = process.platform === 'win32';
const PID = path.join(DATOS, 'lanzador.pid'), ORDEN = path.join(DATOS, 'detener.orden'), LOG = path.join(DATOS, 'sistema.log');
const NODO = [process.execPath, '--disable-warning=ExperimentalWarning'];
/* Cómo se llama el equipo en los mensajes, y símbolos que la consola clásica de Windows sí sabe dibujar */
const EQUIPO = MAC ? 'esta Mac' : 'esta computadora', EL_EQUIPO = MAC ? 'la Mac' : 'la computadora';
const S = WIN ? { bien: '√', mal: '×', sol: '*', punto: '•', caja: ['╔', '╗', '═', '║', '╚', '╝'] } : { bien: '✓', mal: '✗', sol: '☀', punto: '•', caja: ['╭', '╮', '─', '│', '╰', '╯'] };
const version = () => { try { return fs.readFileSync(path.join(RAIZ, 'VERSION'), 'utf8').trim(); } catch (_) { return '?'; } };

/* ---------- apariencia (colores solo si la ventana los admite) ---------- */
const TTY = !!process.stdout.isTTY && !process.env.NO_COLOR;
const c = (n, s) => TTY ? `\x1b[${n}m${s}\x1b[0m` : s;
const fuerte = s => c('1', s), tenue = s => c('2', s), cielo = s => c('38;5;39', s), sol = s => c('38;5;214', s), verde = s => c('32', s), ambar = s => c('33', s), rojo = s => c('31', s), enlace = s => c('1;36', s);
const say = (s = '') => process.stdout.write(s + '\n');
const limpiar = () => { if (TTY) process.stdout.write('\x1b[2J\x1b[3J\x1b[H'); };
function encabezado() {
  const [a, b, h, v, d, e] = S.caja, ancho = 56, linea = t => `  ${cielo(v)}${t}${cielo(v)}`;
  say(); say('  ' + cielo(a + h.repeat(ancho) + b));
  say(linea(' '.repeat(ancho)));
  say(linea(`       ${sol(S.sol)}   ${fuerte('I N V E N T A R I O   O U T L E T')}   ${sol('$')}        `));
  say(linea(`        ${tenue('Ventas, compras en dólares y control de ropa')}    `));
  say(linea(' '.repeat(ancho)));
  say('  ' + cielo(d + h.repeat(ancho) + e));
}

/* ---------- estado ---------- */
function puerto() {
  let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(path.join(DATOS, 'configuracion.json'), 'utf8')) || {}; } catch (_) { }
  return +(process.env.IO_PUERTO || cfg.puerto || 4300);
}
function direccionesRed() { try { return require(path.join(RAIZ, 'servidor', 'lib', 'red.js')).urls(puerto()); } catch (_) { return []; } }
const vivo = pid => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
/* El archivo de PID es JSON { pid, ventana } desde la 1.2 (antes era solo el número) */
function infoLanzador() {
  try {
    const t = fs.readFileSync(PID, 'utf8').trim(); let j; try { j = JSON.parse(t); } catch (_) { j = { pid: parseInt(t, 10) }; }
    if (typeof j === 'number') j = { pid: j };
    return vivo(j.pid) ? { pid: j.pid, ventana: j.ventana && vivo(j.ventana) ? j.ventana : null } : null;
  } catch (_) { return null; }
}
function salud() {
  return new Promise(ok => {
    const q = http.get({ host: '127.0.0.1', port: puerto(), path: '/api/salud', timeout: 1500, agent: false }, r => { let t = ''; r.on('data', x => { t += x; }); r.on('end', () => { try { const j = JSON.parse(t); ok(j && j.ok ? j : null); } catch (_) { ok(null); } }); });
    q.on('error', () => ok(null)); q.on('timeout', () => { q.destroy(); ok(null); });
  });
}
async function estado() { const s = await salud(); const l = infoLanzador(); return { lanzador: l, salud: s, encendido: !!s, local: `http://localhost:${puerto()}` }; }
const espera = ms => new Promise(r => setTimeout(r, ms));
function ultimasLineas(n = 15) { try { return fs.readFileSync(LOG, 'utf8').split(/\r?\n/).filter(l => l.trim()).slice(-n); } catch (_) { return []; } }
function abrir(url) {
  try {
    if (WIN) cp.spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true }).unref();
    else cp.spawn(MAC ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' }).on('error', () => { }).unref();
    say(`  ${verde(S.bien)}  Se abrió ${enlace(url)} en el navegador.`);
  } catch (_) { say(`  Abra esta dirección en el navegador: ${enlace(url)}`); }
}

/* ---------- ventana: minimizar y no dormir ---------- */
function minimizar() {
  if (!TTY) return;
  try {
    if (WIN) {
      /* PowerShell comparte esta misma consola: le pide a Windows minimizar su ventana */
      const ps = `Add-Type -Namespace IO -Name Ventana -MemberDefinition '[DllImport("kernel32.dll")] public static extern System.IntPtr GetConsoleWindow(); [DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h, int n);'; [void][IO.Ventana]::ShowWindow([IO.Ventana]::GetConsoleWindow(), 6)`;
      cp.spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'ignore' }).on('error', () => { });
    } else process.stdout.write('\x1b[2t');          // secuencia estándar «minimizar ventana» (Terminal de macOS, iTerm2)
  } catch (_) { }
}
function noDormir(pid) {
  try {
    if (MAC) cp.spawn('caffeinate', ['-i', '-w', String(pid)], { stdio: 'ignore' }).on('error', () => { });
    else if (WIN) {
      const ps = `Add-Type -Namespace IO -Name Energia -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);';` +
        `[void][IO.Energia]::SetThreadExecutionState([uint32]'0x80000001'); Wait-Process -Id ${Number(pid)} -ErrorAction SilentlyContinue`;
      cp.spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', ps], { stdio: 'ignore', windowsHide: true }).on('error', () => { });
    }
  } catch (_) { }
}

/* ═════════ El sistema DENTRO de esta ventana ═════════ */
let hijo = null;          // el lanzador, hijo de esta ventana (si esta ventana se cierra, se apaga)

function abrirLog() {
  fs.mkdirSync(DATOS, { recursive: true });
  try { if (fs.statSync(LOG).size > 2 * 1024 * 1024) fs.renameSync(LOG, LOG + '.1'); } catch (_) { }
  const fd = fs.openSync(LOG, 'a'); fs.writeSync(fd, `\n===== ${new Date().toISOString()} · encendido · versión ${version()} =====\n`); return fd;
}

/** Enciende el sistema como hijo de esta ventana y espera a que responda */
async function encenderAqui() {
  const fd = abrirLog();
  hijo = cp.spawn(NODO[0], [NODO[1], path.join(__dirname, 'lanzador.js')], { cwd: RAIZ, stdio: ['ignore', fd, fd], windowsHide: true, env: { ...process.env, NO_COLOR: '1', IO_PADRE: String(process.pid) } });
  fs.closeSync(fd);
  const yo = hijo; hijo.on('exit', () => { if (hijo === yo) hijo = null; });
  noDormir(hijo.pid);
  process.stdout.write(`  ${cielo('●')}  Encendiendo`);
  for (let i = 0; i < 60; i++) {
    await espera(500); if (TTY) process.stdout.write('.');
    const s = await salud(); if (s) { say(); return s; }
    if (!hijo) break;
  }
  say(); say(`  ${rojo(S.mal)}  ${fuerte('El sistema no pudo encender.')} Esto es lo último que escribió:`); say();
  for (const l of ultimasLineas(14)) say('     ' + tenue(l));
  return null;
}

/** Apaga el sistema de esta ventana (en orden: el lanzador cierra el servidor y la base de datos) */
async function apagarAqui() {
  if (!hijo) return true;
  const h = hijo;
  try { fs.writeFileSync(ORDEN, new Date().toISOString() + '\n'); } catch (_) { }
  for (let i = 0; i < 24 && hijo === h; i++) await espera(250);
  if (hijo === h) { try { h.kill(); } catch (_) { } await espera(500); }
  return true;
}

function mostrarDirecciones() {
  say(`     ${MAC ? 'En esta Mac       ' : 'En esta computadora'} ${enlace(`http://localhost:${puerto()}`)}`);
  const red = direccionesRed();
  if (red.length) say(`     En los celulares   ${enlace(red[0].url)}   ${tenue('(mismo Wi-Fi · opción 2 para ver el código QR)')}`);
  else say(`     ${ambar('▲')}  No se encontró la dirección de red (¿${EL_EQUIPO} está conectada al Wi-Fi?)`);
}

/* Dirección para celulares con su código QR dibujado en la ventana */
function celular() {
  const red = direccionesRed();
  if (!red.length) { say(`  ${ambar('▲')}  No se encontró la dirección de ${EQUIPO} en la red. Conéctela al Wi-Fi de la tienda.`); return; }
  let QR = null; try { QR = require(path.join(RAIZ, 'publico', 'js', 'qr.js')); } catch (_) { }
  say(`  Con el celular en el ${fuerte('mismo Wi-Fi')} que ${EQUIPO}, apunte la cámara a este código:`); say();
  if (QR) { for (const l of QR.terminal(red[0].url, { color: TTY }).split('\n')) say('     ' + l); say(); }
  say(`     ${enlace(red[0].url)}`);
  for (const r of red.slice(1, 3)) say(`     ${tenue('o también ' + r.url + ' (' + r.interfaz + ')')}`);
  say(); say(tenue('  Luego cada quien entra con su nombre y su PIN. En el iPhone: Compartir → «Agregar a pantalla de inicio».'));
}

function correrServidor(arg) { return cp.spawnSync(NODO[0], [NODO[1], path.join(RAIZ, 'servidor', 'index.js'), arg], { cwd: RAIZ, stdio: 'inherit' }).status === 0; }
const respaldo = () => correrServidor('--respaldo');
const restablecerPin = () => correrServidor('--restablecer-pin');
function registro() {
  const l = ultimasLineas(25);
  if (!l.length) { say('  Todavía no hay nada en el registro.'); return; }
  say(tenue(`  Últimas líneas de ${path.relative(RAIZ, LOG)}:`)); say(); for (const x of l) say('    ' + x);
}
function novedades() {
  say(`  ${fuerte('Inventario Outlet')} versión ${fuerte(version())}`); say();
  try {
    const t = fs.readFileSync(path.join(RAIZ, 'CHANGELOG.md'), 'utf8'), i = t.indexOf('\n## '), j = t.indexOf('\n## ', i + 4);
    const sec = t.slice(i + 1, j < 0 ? undefined : j).replace(/\*\*|`/g, '').split('\n');
    say('  ' + fuerte(sec[0].replace(/^## /, 'Novedades de la ')));
    for (const l of sec.slice(1)) if (l.trim()) say('  ' + l.replace(/^- /, `  ${cielo(S.punto)} `));
  } catch (_) { say('  (No se encontró CHANGELOG.md.)'); }
  say(); say(tenue('  Para instalar una versión nueva: en el sistema, Ajustes → Actualizar el sistema (arrastre el .zip).'));
}

/* ---------- lectura línea por línea: nada ocurre sin Enter ---------- */
let rl = null; const cola = [], esperando = [];
function iniciarLectura(alCerrar) {
  rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: TTY });
  rl.on('line', l => { const w = esperando.shift(); if (w) w(l); else cola.push(l); });
  rl.on('close', () => { while (esperando.length) esperando.shift()(null); cola.push(null); alCerrar && alCerrar(); });
  rl.on('SIGINT', () => { say(); say(tenue('  (Para apagar escriba 0 y presione Enter, o cierre la ventana.)')); const w = esperando.shift(); if (w) w(''); });
}
function preguntar(texto) {
  const i = texto.lastIndexOf('\n'); if (i >= 0) process.stdout.write(texto.slice(0, i + 1));
  rl.setPrompt(texto.slice(i + 1)); rl.prompt();
  const eco = l => { if (!TTY) say(l === null ? '' : l); return l; };
  return new Promise(ok => { if (cola.length) ok(eco(cola.shift())); else esperando.push(l => ok(eco(l))); });
}
const seguir = () => preguntar(`\n  Presione ${fuerte('Enter')} para volver al menú… `);
async function confirmar(que) {
  const r = await preguntar(`\n  ${ambar('▲')}  ${que}\n     Escriba ${fuerte('SI')} y presione ${fuerte('Enter')} para confirmar (solo Enter = cancelar): `);
  const ok = r !== null && /^s[ií]$/i.test(r.trim());
  if (!ok) say(`  ${verde(S.bien)}  Cancelado: no se hizo ningún cambio.`);
  return ok;
}

const OPCIONES = [
  ['1', 'Abrir en ' + EQUIPO],
  ['2', 'Abrir en un celular', 'código QR'],
  ['3', 'Reiniciar el sistema', 'pide confirmar'],
  ['4', 'Ver lo último del registro'],
  ['5', 'Hacer un respaldo ahora'],
  ['6', 'Restablecer el PIN del dueño', 'si se olvidó; pide confirmar'],
  ['7', 'Versión y novedades'],
  ['8', 'Minimizar esta ventana'],
  ['0', 'Apagar y cerrar', 'pide confirmar']
];

/** Modo ventana: enciende aquí, minimiza y muestra el menú. Cerrar la ventana = apagar. */
async function ventana() {
  if (TTY) process.stdout.write('\x1b]0;Inventario Outlet\x07');
  let saliendo = false;
  const salir = async (motivo) => { if (saliendo) return; saliendo = true; if (hijo) { say(); say(`  ${cielo('●')}  Apagando (${motivo})…`); await apagarAqui(); } process.exit(0); };
  /* Cerrar la ventana: macOS y Windows mandan SIGHUP; también se pierde la entrada del teclado */
  process.on('SIGHUP', () => salir('se cerró la ventana'));
  process.on('SIGTERM', () => salir('SIGTERM'));
  iniciarLectura(() => salir('se cerró la ventana'));

  limpiar(); encabezado(); say(`   ${tenue('versión ' + version())}`); say();

  /* ¿Ya estaba encendido? */
  const previo = await estado();
  if (previo.lanzador && previo.lanzador.ventana && previo.lanzador.ventana !== process.pid) {
    say(`  ${ambar('▲')}  ${fuerte('El sistema ya está abierto en otra ventana.')} Búsquela en ${MAC ? 'el Dock' : 'la barra de tareas'}.`);
    say(tenue('     (Solo puede haber una ventana del sistema. Esta se puede cerrar sin problema.)'));
    if (previo.encendido) { say(); mostrarDirecciones(); }
    await preguntar(`\n  Presione ${fuerte('Enter')} para cerrar… `); process.exit(0);
  }
  if (previo.lanzador || previo.encendido) {
    say(`  ${cielo('●')}  El sistema estaba encendido en segundo plano: se pasa a esta ventana…`);
    if (!(await apagarSegundoPlano(true))) { await preguntar(`\n  Presione ${fuerte('Enter')} para cerrar… `); process.exit(1); }
  }

  let s = await encenderAqui(), primera = true, aviso = '';
  for (;;) {
    if (!primera) { limpiar(); encabezado(); say(`   ${tenue('versión ' + version())}`); say(); }
    const e = await estado();
    if (e.encendido && hijo) {
      say(`   ${verde('●')} ${fuerte('Encendido')} ${tenue('(versión ' + e.salud.version + ')')}`); mostrarDirecciones();
      say(); say(`   ${sol(S.sol)} ${fuerte('Esta ventana es el sistema.')} Puede minimizarla; ${fuerte('si la cierra, el sistema se apaga.')}`);
      if (e.salud.instalado === false) say(`   ${ambar('▲')}  Primer uso: elija la opción 1 para crear el PIN del dueño en ${EQUIPO}.`);
    } else if (hijo) say(`   ${ambar('●')} ${fuerte('Arrancando o sin responder')} ${tenue('(revise con la opción 4)')}`);
    else say(`   ${tenue('○')} ${fuerte('Apagado')}     ${tenue('Escriba 9 para encenderlo.')}`);
    say();
    for (const [n, t, x] of OPCIONES) { if (n === '3' || n === '7' || n === '0') say(); say(`     ${cielo(n)}  ${t}${x ? '  ' + tenue('(' + x + ')') : ''}`); }
    if (!hijo) say(`     ${cielo('9')}  ${fuerte('Encender el sistema')}`);
    say();
    if (aviso) { say('  ' + aviso); say(); aviso = ''; }
    if (primera && s) setTimeout(minimizar, 3500);      // la primera vez, la ventana se minimiza sola
    primera = false;
    const r = await preguntar(`   Escriba el número de la opción y presione ${fuerte('Enter')}: `);
    if (r === null) return salir('se cerró la ventana');
    const op = r.trim(); if (op === '') continue;
    say();
    if (op === '0') { if (await confirmar('¿Apagar el sistema y cerrar? Mientras esté apagado, nadie podrá entrar desde el celular.')) { await apagarAqui(); say(`  ${verde(S.bien)}  ${fuerte('El sistema está apagado.')} ${WIN ? '' : 'Ya puede cerrar esta ventana.'}`); say(); process.exit(0); } await seguir(); }
    else if (op === '1') { if (!(await salud())) aviso = `${ambar('▲')}  El sistema no está encendido.`; else abrir(`http://localhost:${puerto()}`); await espera(800); }
    else if (op === '2') { celular(); await seguir(); }
    else if (op === '3') { if (await confirmar('¿Reiniciar el sistema? Se apaga y se vuelve a encender; tarda unos segundos.')) { await apagarAqui(); s = await encenderAqui(); } await seguir(); }
    else if (op === '4') { registro(); await seguir(); }
    else if (op === '5') { respaldo(); await seguir(); }
    else if (op === '6') { say('  Úselo solo si el dueño olvidó su PIN. Ventas, inventario y compras ' + fuerte('no se tocan') + '; se cierran las sesiones abiertas'); say(`  y el PIN nuevo se crea abriendo el sistema en ${EQUIPO} (opción 1).`); if (await confirmar('¿Restablecer el PIN del dueño?')) restablecerPin(); await seguir(); }
    else if (op === '7') { novedades(); await seguir(); }
    else if (op === '8') { minimizar(); }
    else if (op === '9' && !hijo) { s = await encenderAqui(); await espera(600); }
    else aviso = `${ambar('▲')}  «${op.slice(0, 20)}» no es una opción. Escriba solo el número (por ejemplo 1) y presione Enter.`;
  }
}

/* ═════════ Órdenes sin ventana (segundo plano: conexión remota y pruebas) ═════════ */
async function encenderSegundoPlano() {
  const e = await estado();
  if (e.encendido) { say(`  ${verde('●')}  El sistema ya está encendido (versión ${e.salud.version}).`); mostrarDirecciones(); return true; }
  if (e.lanzador) { say(`  ${ambar('▲')}  El sistema está arrancando o no responde todavía.`); return false; }
  const fd = abrirLog();
  const h = cp.spawn(NODO[0], [NODO[1], path.join(__dirname, 'lanzador.js')], { cwd: RAIZ, detached: true, windowsHide: true, stdio: ['ignore', fd, fd], env: { ...process.env, NO_COLOR: '1' } });
  fs.closeSync(fd); h.unref(); noDormir(h.pid);
  process.stdout.write(`  ${cielo('●')}  Encendiendo en segundo plano`);
  for (let i = 0; i < 60; i++) {
    await espera(500); if (TTY) process.stdout.write('.');
    const s = await salud(); if (s) { say(); say(`  ${verde(S.bien)}  ${fuerte('El sistema está encendido')} ${tenue('(versión ' + s.version + ')')}`); mostrarDirecciones(); say(tenue('  (Se apaga con: node arranque/menu.js apagar)')); return true; }
  }
  say(); say(`  ${rojo(S.mal)}  El sistema no pudo encender. Revise datos/sistema.log.`); return false;
}
async function apagarSegundoPlano(silencioso = false) {
  const e = await estado();
  if (!e.encendido && !e.lanzador) { if (!silencioso) say(`  ${verde(S.bien)}  El sistema ya está apagado.`); return true; }
  if (!e.lanzador) { say(`  ${ambar('▲')}  El sistema responde, pero no se encontró quién lo encendió. Ciérrelo en la ventana donde se abrió.`); return false; }
  fs.writeFileSync(ORDEN, new Date().toISOString() + '\n');
  if (!silencioso) process.stdout.write(`  ${cielo('●')}  Apagando`);
  for (let i = 0; i < 40; i++) {
    await espera(500); if (TTY && !silencioso) process.stdout.write('.');
    if (!infoLanzador() && !(await salud())) { if (!silencioso) { say(); say(`  ${verde(S.bien)}  ${fuerte('El sistema está apagado.')}`); } return true; }
  }
  const pid = e.lanzador.pid;
  try { if (WIN) cp.spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' }); else { try { process.kill(-pid, 'SIGTERM'); } catch (_) { process.kill(pid, 'SIGTERM'); } } } catch (_) { }
  try { fs.rmSync(ORDEN, { force: true }); } catch (_) { }
  await espera(2500);
  if (!infoLanzador() && !(await salud())) { if (!silencioso) { say(); say(`  ${verde(S.bien)}  ${fuerte('El sistema está apagado.')}`); } return true; }
  say(); say(`  ${rojo(S.mal)}  No se pudo apagar. Reinicie ${EL_EQUIPO}.`); return false;
}

async function principal() {
  const orden = (process.argv[2] || '').toLowerCase();
  if (!orden) return ventana();
  let ok = true;
  if (orden === 'encender') ok = await encenderSegundoPlano();
  else if (orden === 'apagar') ok = await apagarSegundoPlano();
  else if (orden === 'reiniciar') ok = (await apagarSegundoPlano()) && (await encenderSegundoPlano());
  else if (orden === 'estado') { const e = await estado(); say(e.encendido ? `encendido (versión ${e.salud.version}) · ${e.local}` : e.lanzador ? 'arrancando o sin responder' : 'apagado'); ok = e.encendido; }
  else if (orden === 'respaldo') ok = respaldo();
  else if (orden === 'celular') celular();
  else { say('Uso: node arranque/menu.js [encender | apagar | reiniciar | estado | respaldo | celular]   (sin nada: ventana del sistema)'); ok = false; }
  process.exit(ok ? 0 : 1);
}
if (require.main === module) principal().catch(e => { console.error('\n  ' + rojo(S.mal) + '  ' + (e && e.message || e)); process.exit(1); });
module.exports = { estado, puerto };
