'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   ENTRADA CON PIN, SESIONES Y PERMISOS.

   · Cada persona entra con su nombre y un PIN de 4 a 6 dígitos (cómodo en el celular).
   · Dos papeles: «dueño» (todo) y «vendedor» (vender, devolver, ver existencias y el dólar).
   · La primera vez no hay nadie: se crea el dueño con el CÓDIGO DE INSTALACIÓN que muestra el
     menú de arranque (también queda en datos/INSTALACION.txt). Desde la propia Mac no se pide código.
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

/* ---- código de instalación (o de restablecer el PIN) ---- */
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function nuevoCodigo() { const b = crypto.randomBytes(12); let s = ''; for (let i = 0; i < 12; i++) { s += ALFABETO[b[i] % ALFABETO.length]; if (i === 3 || i === 7) s += '-'; } return s; }
function escribirArchivoCodigo(datos, codigo, motivo) {
  fs.writeFileSync(path.join(datos, 'INSTALACION.txt'),
    `INVENTARIO OUTLET · ${motivo}\n\nCódigo: ${codigo}\n\nAbra el sistema en el navegador y escríbalo donde lo pide para crear el PIN del dueño.\n` +
    `Desde la propia Mac (http://localhost) no se pide código. Este archivo se borra solo cuando ya se usó.\n`);
}

function crear({ B, datos, sesionDias = 30 }) {
  /** Estado de la instalación: 'listo' | 'instalar' (sin usuarios) | 'restablecer' (se pidió un PIN nuevo) */
  function estado() {
    if (B.meta('restablecer') === '1') return 'restablecer';
    return B.valor('SELECT COUNT(*) FROM usuarios WHERE activo = 1') > 0 ? 'listo' : 'instalar';
  }
  /* Asegura que exista el código cuando hace falta (lo llama el servidor al arrancar) */
  function prepararCodigo() {
    const e = estado();
    if (e === 'listo') { try { fs.rmSync(path.join(datos, 'INSTALACION.txt'), { force: true }); } catch (_) { } return null; }
    let c = B.meta('codigoInstalacion');
    if (!c) { c = nuevoCodigo(); B.guardarMeta('codigoInstalacion', c); }
    escribirArchivoCodigo(datos, c, e === 'instalar' ? 'PRIMER USO' : 'RESTABLECER PIN');
    return c;
  }

  /** Primer uso o PIN olvidado: crea (o actualiza) al dueño. local = la petición viene de la misma Mac. */
  function instalar({ codigo, nombre, pin }, local) {
    const e = estado(); if (e === 'listo') U.falla('El sistema ya está configurado.', 409);
    const guardado = B.meta('codigoInstalacion');
    if (!local) {
      const limpio = String(codigo || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!guardado || limpio !== guardado.replace(/-/g, '')) U.falla('El código no coincide. Está en la ventana del menú de arranque (o en datos/INSTALACION.txt).', 403);
    }
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
      try { fs.rmSync(path.join(datos, 'INSTALACION.txt'), { force: true }); } catch (_) { }
      return id;
    });
  }

  /** Desde el menú de arranque: el dueño olvidó su PIN */
  function pedirRestablecer() {
    B.guardarMeta('restablecer', '1');
    const c = nuevoCodigo(); B.guardarMeta('codigoInstalacion', c);
    escribirArchivoCodigo(datos, c, 'RESTABLECER PIN');
    B.anotar(null, 'restablecer PIN solicitado');
    return c;
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

  return { COOKIE, estado, prepararCodigo, instalar, pedirRestablecer, entrar, sesion, salir, listarParaEntrada, listar, guardarUsuario, cambiarPin, podar };
}

module.exports = { crear, huellaPin, pinCorrecto, COLORES };
