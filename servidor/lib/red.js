'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   DIRECCIONES DE LA MAC EN LA RED LOCAL (Wi-Fi o cable).
   Son las que se escriben en el celular para entrar: http://192.168.1.50:4300
   Se prefieren las direcciones privadas típicas de casa/oficina (192.168.x, 10.x, 172.16-31.x).
   ───────────────────────────────────────────────────────────────────────────── */
const os = require('os');

function direccionesLocales() {
  const out = [];
  for (const [nombre, lista] of Object.entries(os.networkInterfaces())) {
    for (const a of lista || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      if (/^169\.254\./.test(a.address)) continue;                     // sin servidor DHCP: no sirve
      const privada = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address);
      out.push({ interfaz: nombre, ip: a.address, privada, wifi: /^en[01]$/.test(nombre) });
    }
  }
  /* Primero las privadas; en una Mac, en0 suele ser el Wi-Fi */
  return out.sort((a, b) => (b.privada - a.privada) || (b.wifi - a.wifi));
}

const urls = puerto => direccionesLocales().map(d => ({ ...d, url: `http://${d.ip}:${puerto}` }));

module.exports = { direccionesLocales, urls };
