'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   AVISOS EN VIVO (Server-Sent Events).
   Cada navegador abierto mantiene una conexión a /api/eventos. Cuando alguien vende
   desde su celular o cambia el dólar, todos los demás ven el cambio al instante, sin recargar.
   ───────────────────────────────────────────────────────────────────────────── */

function crear() {
  const clientes = new Set();

  /** Conecta una respuesta HTTP como canal de eventos */
  function conectar(req, res, usuario) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 4000\n\n');
    const c = { res, usuario };
    clientes.add(c);
    req.on('close', () => clientes.delete(c));
  }

  /** Envía un evento a todos (o solo a los de un papel: 'dueno') */
  function emitir(tipo, datos, soloRol) {
    const linea = `event: ${tipo}\ndata: ${JSON.stringify(datos ?? {})}\n\n`;
    for (const c of clientes) { if (soloRol && c.usuario.rol !== soloRol) continue; try { c.res.write(linea); } catch (_) { clientes.delete(c); } }
  }

  /* Latido cada 25 s: mantiene viva la conexión a través del Wi-Fi y de los celulares que ahorran batería */
  const latido = setInterval(() => { for (const c of clientes) { try { c.res.write(': latido\n\n'); } catch (_) { clientes.delete(c); } } }, 25000);
  if (latido.unref) latido.unref();

  const cerrarTodo = () => { clearInterval(latido); for (const c of clientes) { try { c.res.end(); } catch (_) { } } clientes.clear(); };
  return { conectar, emitir, cerrarTodo, cuantos: () => clientes.size };
}

module.exports = { crear };
