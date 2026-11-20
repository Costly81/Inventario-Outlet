'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   ENTRADA CON PIN, SESIONES Y PERMISOS.

   · Cada persona entra con su nombre y un PIN de 4 a 6 dígitos (cómodo en el celular).
   · Dos papeles: «dueño» (todo) y «vendedor» (vender, devolver, ver existencias y el dólar).
   · La primera vez no hay nadie: el PIN del dueño se crea DESDE LA COMPUTADORA DE LA TIENDA
     (http://localhost:4300). Lo mismo si el dueño olvida su PIN (opción del menú de arranque).
     Los celulares no pueden hacerlo: entran con el código QR y el PIN de cada quien.
   · La sesión es una cookie HttpOnly; las operaciones que cambian algo exigen además el
     encabezado X-CSRF (protege contra páginas ajenas que intenten enviar formularios).
   · Si alguien se equivoca de PIN muchas veces seguidas, esa conexión espera unos minutos.
   ───────────────────────────────────────────────────────────────────────────── */
const crypto = require('crypto');
const fs = require('fs'), path = require('path');
const U = require('./util.js');

const COOKIE = 'io_sesion';
const MAX_INTENTOS = 8, VENTANA_MS = 10 * 60000;
const COLORES = ['#0ea5e9', '#6366f1', '#14b8a6', '#f59e0b', '#ec4899', '#8b5cf6', '#22c55e', '#ef4444'];

/* ---- PIN: se guarda solo su huella (scrypt con sal), nunca el número ---- */
function huellaPin(pin) { const sal = crypto.randomBytes(16).toString('hex'); return `scrypt$${sal}$${crypto.scryptSync(pin, sal, 32).toString('hex')}`; }
function pinCorrecto(pin, guardado) {
  const [tipo, sal, h] = String(guardado || '').split('$'); if (tipo !== 'scrypt' || !sal || !h) return false;
  const a = crypto.scryptSync(String(pin), sal, 32), b = Buffer.from(h, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const validarPin = pin => { const s = String(pin ?? ''); if (!/^\d{4,6}$/.test(s)) U.falla('El PIN debe tener de 4 a 6 números.'); if (/^(\d)\1+$/.test(s)) U.falla('Elija un PIN que no sea el mismo número repetido.'); return s; };

function crear({ B, datos, sesionDias = 30 }) {
  /** Estado de la instalación: 'listo' | 'instalar' (sin usuarios) | 'restablecer' (se pidió un PIN nuevo) */
  function estado() {
    if (B.meta('restablecer') === '1') return 'restablecer';
    return B.valor('SELECT COUNT(*) FROM usuarios WHERE activo = 1') > 0 ? 'listo' : 'instalar';
  }
  /* Limpieza de versiones anteriores (1.0 y 1.1 usaban un código de instalación) */
  function limpiarCodigo() {
    try { fs.rmSync(path.join(datos, 'INSTALACION.txt'), { force: true }); } catch (_) { }
    B.run("DELETE FROM meta WHERE clave = 'codigoInstalacion'");
  }

  /** Primer uso o PIN olvidado: crea (o actualiza) al dueño. Solo desde la computadora de la tienda (local). */
  function instalar({ nombre, pin }, local) {
    const e = estado(); if (e === 'listo') U.falla('El sistema ya está configurado.', 409);
    if (!local) U.falla('Por seguridad, el PIN del dueño se crea desde la computadora de la tienda: abra el sistema en ella (opción 1 del menú).', 403);
    pin = validarPin(pin);
    const ahora = new Date().toISOString();
    return B.tx(() => {
      let id;
      if (e === 'instalar') {
        nombre = U.texto(nombre, 'Su nombre', { min: 1, max: 30 });
        id = B.insertar('INSERT INTO usuarios (nombre, rol, pin, color, creado) VALUES (?, ?, ?, ?, ?)', nombre, 'dueno', huellaPin(pin), COLORES[0], ahora);
      } else {
        const d = B.uno("SELECT id FROM usuarios WHERE rol = 'dueno' AND activo = 1 ORDER BY id LIMIT 1");
        if (d) { id = d.id; B.run('UPDATE usuarios SET pin = ? WHERE id = ?', huellaPin(pin), id); if (nombre) B.run('UPDATE usuarios SET nombre = ? WHERE id = ?', U.texto(nombre, 'Su nombre', { min: 1, max: 30 }), id); }
        else id = B.insertar('INSERT INTO usuarios (nombre, rol, pin, color, creado) VALUES (?, ?, ?, ?, ?)', U.texto(nombre || 'Dueño', 'Su nombre', { min: 1, max: 30 }), 'dueno', huellaPin(pin), COLORES[0], ahora);
        B.run('DELETE FROM sesiones');
      }
      B.run("DELETE FROM meta WHERE clave IN ('codigoInstalacion', 'restablecer')");
      B.anotar(id, e === 'instalar' ? 'instalación' : 'PIN restablecido');
      return id;
    });
  }

  /** Desde el menú de arranque: el dueño olvidó su PIN. Se cierran todas las sesiones y el PIN nuevo se crea en la computadora. */
  function pedirRestablecer() {
    B.guardarMeta('restablecer', '1');
    B.run('DELETE FROM sesiones');
    B.anotar(null, 'restablecer PIN solicitado');
  }

  /* ---- intentos fallidos ---- */
  function bloqueado(ip) {
    B.run('DELETE FROM intentos WHERE t < ?', Date.now() - VENTANA_MS);
    const r = B.uno('SELECT COUNT(*) n, MIN(t) primero FROM intentos WHERE ip = ?', ip);
    return r.n >= MAX_INTENTOS ? Math.ceil((r.primero + VENTANA_MS - Date.now()) / 60000) : 0;
  }

  /** Entrar: devuelve { token, csrf, usuario } */
  function entrar({ usuarioId, pin }, ip, agente) {
    const espera = bloqueado(ip);
    if (espera) U.falla(`Demasiados intentos. Espere ${espera} minuto${espera === 1 ? '' : 's'} y vuelva a intentar.`, 429);
    const u = B.uno('SELECT * FROM usuarios WHERE id = ? AND activo = 1', +usuarioId || 0);
    if (!u || !pinCorrecto(pin, u.pin)) {
      B.run('INSERT INTO intentos (t, ip) VALUES (?, ?)', Date.now(), ip);
      const quedan = MAX_INTENTOS - B.valor('SELECT COUNT(*) FROM intentos WHERE ip = ?', ip);
      U.falla(quedan > 0 && quedan <= 3 ? `PIN incorrecto. Le quedan ${quedan} intento${quedan === 1 ? '' : 's'}.` : 'PIN incorrecto.', 401);
    }
    B.run('DELETE FROM intentos WHERE ip = ?', ip);
    const token = crypto.randomBytes(32).toString('base64url'), csrf = crypto.randomBytes(18).toString('base64url'), ahora = Date.now();
    B.run('INSERT INTO sesiones (token, usuario_id, csrf, creado, expira, ultimo, agente) VALUES (?, ?, ?, ?, ?, ?, ?)',
      token, u.id, csrf, ahora, ahora + sesionDias * 86400000, ahora, String(agente || '').slice(0, 200));
    B.anotar(u.id, 'entrada', { ip });
    return { token, csrf, usuario: publico(u) };
  }

  /** Sesión a partir de la cookie (o null). Renueva la fecha de uso. */
  function sesion(token) {
    if (!token) return null;
    const s = B.uno('SELECT s.*, u.nombre, u.rol, u.color, u.activo FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token = ?', token);
    if (!s || !s.activo || s.expira < Date.now()) { if (s) B.run('DELETE FROM sesiones WHERE token = ?', token); return null; }
    if (Date.now() - s.ultimo > 60000) B.run('UPDATE sesiones SET ultimo = ? WHERE token = ?', Date.now(), token);
    return { token, csrf: s.csrf, usuario: { id: s.usuario_id, nombre: s.nombre, rol: s.rol, color: s.color } };
  }
  const salir = token => B.run('DELETE FROM sesiones WHERE token = ?', token);

  /* ---- usuarios (los administra el dueño) ---- */
  const publico = u => ({ id: u.id, nombre: u.nombre, rol: u.rol, color: u.color, activo: !!u.activo });
  const listarParaEntrada = () => B.todos("SELECT id, nombre, rol, color FROM usuarios WHERE activo = 1 ORDER BY rol = 'dueno' DESC, nombre");
  const listar = () => B.todos('SELECT id, nombre, rol, color, activo, creado FROM usuarios ORDER BY activo DESC, rol, nombre').map(u => ({ ...publico(u), creado: u.creado }));
  function guardarUsuario(d, quien) {
    const nombre = U.texto(d.nombre, 'El nombre', { min: 1, max: 30 });
    const rol = U.opcion(d.rol, 'El papel', ['dueno', 'vendedor'], 'vendedor');
    const color = U.color(d.color) || COLORES[(B.valor('SELECT COUNT(*) FROM usuarios') || 0) % COLORES.length];
    if (B.uno('SELECT id FROM usuarios WHERE nombre = ? COLLATE NOCASE AND id != ? AND activo = 1', nombre, d.id || 0)) U.falla('Ya hay alguien con ese nombre.');
    if (d.id) {
      const u = B.uno('SELECT * FROM usuarios WHERE id = ?', d.id); if (!u) U.falla('No se encontró la persona.', 404);
      if (u.rol === 'dueno' && rol !== 'dueno' && B.valor("SELECT COUNT(*) FROM usuarios WHERE rol = 'dueno' AND activo = 1") <= 1) U.falla('Debe quedar al menos un dueño.');
      const activo = d.activo === false ? 0 : 1;
      if (!activo && u.id === quien.id) U.falla('No puede desactivarse a sí mismo.');
      if (!activo && u.rol === 'dueno' && B.valor("SELECT COUNT(*) FROM usuarios WHERE rol = 'dueno' AND activo = 1") <= 1) U.falla('Debe quedar al menos un dueño activo.');
      B.run('UPDATE usuarios SET nombre = ?, rol = ?, color = ?, activo = ? WHERE id = ?', nombre, rol, color, activo, d.id);
      if (d.pin) B.run('UPDATE usuarios SET pin = ? WHERE id = ?', huellaPin(validarPin(d.pin)), d.id);
      if (!activo || d.pin) B.run('DELETE FROM sesiones WHERE usuario_id = ? AND token != ?', d.id, quien.token || '');
      B.anotar(quien.id, 'usuario editado', { id: d.id, nombre, rol, activo });
      return d.id;
    }
    const id = B.insertar('INSERT INTO usuarios (nombre, rol, pin, color, creado) VALUES (?, ?, ?, ?, ?)', nombre, rol, huellaPin(validarPin(d.pin)), color, new Date().toISOString());
    B.anotar(quien.id, 'usuario creado', { id, nombre, rol });
    return id;
  }
  /** Cambiar el propio PIN (pide el actual) */
  function cambiarPin(usuarioId, actual, nuevo) {
    const u = B.uno('SELECT pin FROM usuarios WHERE id = ?', usuarioId);
    if (!u || !pinCorrecto(actual, u.pin)) U.falla('El PIN actual no es correcto.', 401);
    B.run('UPDATE usuarios SET pin = ? WHERE id = ?', huellaPin(validarPin(nuevo)), usuarioId);
  }

  /* Limpieza periódica */
  const podar = () => { B.run('DELETE FROM sesiones WHERE expira < ?', Date.now()); B.run('DELETE FROM intentos WHERE t < ?', Date.now() - VENTANA_MS); };

  return { COOKIE, estado, limpiarCodigo, instalar, pedirRestablecer, entrar, sesion, salir, listarParaEntrada, listar, guardarUsuario, cambiarPin, podar };
}

module.exports = { crear, huellaPin, pinCorrecto, COLORES };
