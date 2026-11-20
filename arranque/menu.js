'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   INVENTARIO OUTLET · MENÚ DE ARRANQUE (lo que se ve al abrir iniciar.command en macOS
   o iniciar.bat en Windows: es el mismo menú, con las mismas opciones y números)

   · Cada opción se escribe y se CONFIRMA CON ENTER (un dedo que se equivoca de tecla no hace nada).
     Apagar, reiniciar y restablecer el PIN piden además escribir SI.
   · El sistema corre aparte, en segundo plano (arranque/lanzador.js). Cerrar esta ventana NO lo apaga:
     solo se apaga con la opción 2. Lo que escribe al trabajar queda en datos/sistema.log (opción 6).
   · Mientras está encendido, la computadora no se duerme sola (macOS: caffeinate; Windows: SetThreadExecutionState).

   Sin menú (Terminal o conexión remota):
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
  say(linea(`       ${sol(S.sol)}   ${fuerte("I N V E N T A R I O   O U T L E T")}   ${sol("$")}        `));
  say(linea(`        ${tenue('Ventas, compras en dólares y control de ropa')}    `));
  say(linea(' '.repeat(ancho)));
  say('  ' + cielo(d + h.repeat(ancho) + e));
}

/* ---------- configuración y estado ---------- */
function puerto() {
  let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(path.join(DATOS, 'configuracion.json'), 'utf8')) || {}; } catch (_) { }
  return +(process.env.IO_PUERTO || cfg.puerto || 4300);
}
function direccionesRed() {
  try { return require(path.join(RAIZ, 'servidor', 'lib', 'red.js')).urls(puerto()); } catch (_) { return []; }
}
const vivo = pid => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
function pidLanzador() { try { const n = parseInt(fs.readFileSync(PID, 'utf8'), 10); return vivo(n) ? n : 0; } catch (_) { return 0; } }
function salud() {
  return new Promise(ok => {
    const q = http.get({ host: '127.0.0.1', port: puerto(), path: '/api/salud', timeout: 1500, agent: false }, r => { let t = ''; r.on('data', x => { t += x; }); r.on('end', () => { try { const j = JSON.parse(t); ok(j && j.ok ? j : null); } catch (_) { ok(null); } }); });
    q.on('error', () => ok(null)); q.on('timeout', () => { q.destroy(); ok(null); });
  });
}
async function estado() { const s = await salud(); return { pid: pidLanzador(), salud: s, encendido: !!s, local: `http://localhost:${puerto()}` }; }
const espera = ms => new Promise(r => setTimeout(r, ms));
function ultimasLineas(n = 15) { try { return fs.readFileSync(LOG, 'utf8').split(/\r?\n/).filter(l => l.trim()).slice(-n); } catch (_) { return []; } }
function codigoInstalacion() { try { const m = /[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}/.exec(fs.readFileSync(path.join(DATOS, 'INSTALACION.txt'), 'utf8')); return m ? m[0] : ''; } catch (_) { return ''; } }
function abrir(url) {
  try {
    if (WIN) cp.spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true }).unref();
    else cp.spawn(MAC ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' }).on('error', () => { }).unref();
    say(`  ${verde(S.bien)}  Se abrió ${enlace(url)} en el navegador.`);
  } catch (_) { say(`  Abra esta dirección en el navegador: ${enlace(url)}`); }
}

/* ---------- acciones ---------- */
async function encender() {
  const e = await estado();
  if (e.encendido) { say(`  ${verde('●')}  El sistema ya está encendido (versión ${e.salud.version}).`); mostrarDirecciones(); return true; }
  if (e.pid) { say(`  ${ambar('▲')}  El sistema está arrancando o no responde todavía. Espere unos segundos y revise con la opción 6.`); return false; }
  fs.mkdirSync(DATOS, { recursive: true });
  try { if (fs.statSync(LOG).size > 2 * 1024 * 1024) fs.renameSync(LOG, LOG + '.1'); } catch (_) { }
  const fd = fs.openSync(LOG, 'a'); fs.writeSync(fd, `\n===== ${new Date().toISOString()} · encendido desde el menú · versión ${version()} =====\n`);
  const hijo = cp.spawn(NODO[0], [NODO[1], path.join(__dirname, 'lanzador.js')], { cwd: RAIZ, detached: true, windowsHide: true, stdio: ['ignore', fd, fd], env: { ...process.env, NO_COLOR: '1' } });
  fs.closeSync(fd);
  let salio = null; hijo.on('exit', cod => { salio = cod === null ? -1 : cod; }); hijo.unref();
  noDormir(hijo.pid);
  process.stdout.write(`  ${cielo('●')}  Encendiendo`);
  for (let i = 0; i < 60; i++) {
    await espera(500); if (TTY) process.stdout.write('.');
    const s = await salud();
    if (s) {
      say(); say(`  ${verde(S.bien)}  ${fuerte('El sistema está encendido')} ${tenue('(versión ' + s.version + ')')}`);
      mostrarDirecciones();
      const cod = codigoInstalacion();
      if (cod) { say(); say(`  ${sol('PRIMER USO')}: abra el sistema y cree el PIN del dueño. Desde ${EQUIPO} no se pide código;`); say(`  desde un celular escriba este código:`); say(); say('        ' + fuerte(cod)); say(); say(tenue('  (también está guardado en datos/INSTALACION.txt)')); }
      say(); say(tenue('  Puede cerrar esta ventana: el sistema sigue encendido. Para apagarlo use la opción 2.'));
      return true;
    }
    if (salio !== null) break;
  }
  say(); say(`  ${rojo(S.mal)}  ${fuerte('El sistema no pudo encender.')} Esto es lo último que escribió:`); say();
  for (const l of ultimasLineas(14)) say('     ' + tenue(l));
  if (salio === null && pidLanzador()) say(`\n  ${ambar('▲')}  Sigue intentándolo en segundo plano. Revise con la opción 6 en un momento.`);
  return false;
}

/* Que la computadora no se duerma por inactividad mientras el sistema esté encendido (la pantalla sí puede apagarse).
   macOS: caffeinate espera al proceso. Windows: un PowerShell oculto pide «sistema requerido» y espera al proceso. */
function noDormir(pid) {
  try {
    if (MAC) cp.spawn('caffeinate', ['-i', '-w', String(pid)], { detached: true, stdio: 'ignore' }).on('error', () => { }).unref();
    else if (WIN) {
      const ps = `Add-Type -Namespace IO -Name Energia -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);';` +
        `[void][IO.Energia]::SetThreadExecutionState([uint32]'0x80000001'); Wait-Process -Id ${Number(pid)} -ErrorAction SilentlyContinue`;
      cp.spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', ps], { detached: true, stdio: 'ignore', windowsHide: true }).on('error', () => { }).unref();
    }
  } catch (_) { }
}

function mostrarDirecciones() {
  say(`     ${MAC ? 'En esta Mac       ' : 'En esta computadora'} ${enlace(`http://localhost:${puerto()}`)}`);
  const red = direccionesRed();
  if (red.length) say(`     En los celulares   ${enlace(red[0].url)}   ${tenue('(mismo Wi-Fi · opción 5 para ver el código QR)')}`);
  else say(`     ${ambar('▲')}  No se encontró la dirección de red (¿${EL_EQUIPO} está conectada a la red?)`);
}

async function apagar() {
  const e = await estado();
  if (!e.encendido && !e.pid) { say(`  ${verde(S.bien)}  El sistema ya está apagado.`); return true; }
  if (!e.pid) { say(`  ${ambar('▲')}  El sistema está encendido, pero no desde este menú. Ciérrelo en la ventana donde lo abrió (Control + C).`); return false; }
  fs.writeFileSync(ORDEN, new Date().toISOString() + '\n');
  process.stdout.write(`  ${cielo('●')}  Apagando`);
  for (let i = 0; i < 40; i++) {
    await espera(500); if (TTY) process.stdout.write('.');
    if (!pidLanzador() && !(await salud())) { say(); say(`  ${verde(S.bien)}  ${fuerte('El sistema está apagado.')} Los celulares ya no pueden entrar hasta que lo encienda (opción 1).`); return true; }
  }
  const pid = pidLanzador();
  try { if (pid) { if (WIN) cp.spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' }); else { try { process.kill(-pid, 'SIGTERM'); } catch (_) { process.kill(pid, 'SIGTERM'); } } } } catch (_) { }
  try { fs.rmSync(ORDEN, { force: true }); } catch (_) { }
  await espera(2500);
  if (!pidLanzador() && !(await salud())) { say(); say(`  ${verde(S.bien)}  ${fuerte('El sistema está apagado.')}`); return true; }
  say(); say(`  ${rojo(S.mal)}  No se pudo apagar. Reinicie ${EL_EQUIPO}.`); return false;
}

/* Dirección para celulares con su código QR dibujado en la Terminal */
function celular() {
  const red = direccionesRed();
  if (!red.length) { say(`  ${ambar('▲')}  No se encontró la dirección de ${EQUIPO} en la red. Conéctela al Wi-Fi de la tienda.`); return; }
  let QR = null; try { QR = require(path.join(RAIZ, 'publico', 'js', 'qr.js')); } catch (_) { }
  say(`  Con el celular en el ${fuerte('mismo Wi-Fi')} que ${EQUIPO}, apunte la cámara a este código o escriba la dirección:`); say();
  if (QR) { for (const l of QR.terminal(red[0].url, { color: TTY }).split('\n')) say('     ' + l); say(); }
  say(`     ${enlace(red[0].url)}`);
  for (const r of red.slice(1, 3)) say(`     ${tenue('o también ' + r.url + ' (' + r.interfaz + ')')}`);
  say(); say(tenue('  En el iPhone: botón Compartir → «Agregar a pantalla de inicio» para abrirlo como una app.'));
}

function correrServidor(arg) { return cp.spawnSync(NODO[0], [NODO[1], path.join(RAIZ, 'servidor', 'index.js'), arg], { cwd: RAIZ, stdio: 'inherit' }).status === 0; }
const respaldo = () => correrServidor('--respaldo');
const restablecerPin = () => correrServidor('--restablecer-pin');

function registro() {
  const l = ultimasLineas(25);
  if (!l.length) { say('  Todavía no hay nada en el registro (se llena cuando el sistema se enciende desde este menú).'); return; }
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
  say(); say(tenue('  La guía completa está en docs/guia-de-uso.md.'));
}

/* ---------- lectura línea por línea: nada ocurre sin Enter ---------- */
let rl = null; const cola = [], esperando = [];
function iniciarLectura() {
  rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: TTY });
  rl.on('line', l => { const w = esperando.shift(); if (w) w(l); else cola.push(l); });
  rl.on('close', () => { while (esperando.length) esperando.shift()(null); cola.push(null); });
  rl.on('SIGINT', () => { say(); say(tenue('  (Control + C no apaga el sistema. Para salir del menú escriba 0 y presione Enter.)')); const w = esperando.shift(); if (w) w(''); });
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
  ['1', 'Encender el sistema'],
  ['2', 'Apagar el sistema', 'pide confirmar'],
  ['3', 'Reiniciar el sistema', 'pide confirmar'],
  ['4', 'Abrir en ' + EQUIPO],
  ['5', 'Abrir en un celular', 'dirección y código QR'],
  ['6', 'Ver lo último del registro'],
  ['7', 'Hacer un respaldo ahora'],
  ['8', 'Restablecer el PIN del dueño', 'si se olvidó; pide confirmar'],
  ['9', 'Versión y novedades'],
  ['0', 'Salir de este menú', 'el sistema sigue como está']
];
async function menu() {
  iniciarLectura();
  let aviso = '';
  for (;;) {
    limpiar(); encabezado();
    const e = await estado();
    say(`   ${tenue('versión ' + version())}`); say();
    if (e.encendido) { say(`   ${verde('●')} ${fuerte('Encendido')}`); mostrarDirecciones(); }
    else if (e.pid) say(`   ${ambar('●')} ${fuerte('Arrancando o sin responder')} ${tenue('(revise con la opción 6)')}`);
    else say(`   ${tenue('○')} ${fuerte('Apagado')}     ${tenue('Use la opción 1 para encenderlo.')}`);
    say();
    for (const [n, t, x] of OPCIONES) { if (n === '4' || n === '6' || n === '0') say(); say(`     ${cielo(n)}  ${t}${x ? '  ' + tenue('(' + x + ')') : ''}`); }
    say();
    if (aviso) { say('  ' + aviso); say(); aviso = ''; }
    const r = await preguntar(`   Escriba el número de la opción y presione ${fuerte('Enter')}: `);
    if (r === null) break;
    const op = r.trim(); if (op === '') continue;
    say();
    if (op === '0') break;
    else if (op === '1') { await encender(); await seguir(); }
    else if (op === '2') { if (await confirmar('¿Apagar el sistema? Mientras esté apagado, nadie podrá vender desde el celular.')) await apagar(); await seguir(); }
    else if (op === '3') { if (await confirmar('¿Reiniciar el sistema? Se apaga y se vuelve a encender; tarda unos segundos.') && await apagar()) { say(); await encender(); } await seguir(); }
    else if (op === '4') { const s = await estado(); if (!s.encendido) say(`  ${ambar('▲')}  El sistema está apagado: enciéndalo primero con la opción 1.`); else abrir(s.local); await espera(900); }
    else if (op === '5') { const s = await estado(); if (!s.encendido) say(`  ${ambar('▲')}  El sistema está apagado: enciéndalo primero con la opción 1.`); celular(); await seguir(); }
    else if (op === '6') { registro(); await seguir(); }
    else if (op === '7') { respaldo(); await seguir(); }
    else if (op === '8') { say('  Úselo solo si el dueño olvidó su PIN. Ventas, inventario y compras ' + fuerte('no se tocan') + '; se cierran las sesiones abiertas'); say('  y aparece un código para crear un PIN nuevo (desde ' + EQUIPO + ' no se pide el código).'); if (await confirmar('¿Restablecer el PIN del dueño?')) restablecerPin(); await seguir(); }
    else if (op === '9') { novedades(); await seguir(); }
    else aviso = `${ambar('▲')}  «${op.slice(0, 20)}» no es una opción. Escriba solo el número (por ejemplo 1) y presione Enter.`;
  }
  const e = await estado();
  say(); say(`  ${sol(S.sol)}  Menú cerrado. ${e.encendido ? 'El sistema ' + fuerte('sigue encendido') + '.' : 'El sistema está apagado.'} ${tenue('Para volver, abra ' + (WIN ? 'iniciar.bat' : 'iniciar.command') + ' otra vez.')}`); say();
  rl.close();
}

/* ---------- sin menú ---------- */
async function principal() {
  const orden = (process.argv[2] || '').toLowerCase();
  if (!orden) return menu();
  let ok = true;
  if (orden === 'encender') ok = await encender();
  else if (orden === 'apagar') ok = await apagar();
  else if (orden === 'reiniciar') ok = (await apagar()) && (await encender());
  else if (orden === 'estado') { const e = await estado(); say(e.encendido ? `encendido (versión ${e.salud.version}) · ${e.local}` : e.pid ? 'arrancando o sin responder' : 'apagado'); ok = e.encendido; }
  else if (orden === 'respaldo') ok = respaldo();
  else if (orden === 'celular') celular();
  else { say('Uso: node arranque/menu.js [encender | apagar | reiniciar | estado | respaldo | celular]   (sin nada, abre el menú)'); ok = false; }
  process.exit(ok ? 0 : 1);
}
if (require.main === module) principal().catch(e => { console.error('\n  ' + rojo(S.mal) + '  ' + (e && e.message || e)); process.exit(1); });
module.exports = { estado, puerto };
