// Relay server: serves the game + controller pages and pairs phone <-> laptop by room code.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(PUBLIC, path.normalize(p));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
const rooms = new Map(); // code -> { host, phone, timer }
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newCode() {
  let s;
  do {
    s = '';
    for (let i = 0; i < 4; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  } while (rooms.has(s));
  return s;
}
const send = (ws, obj) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); };

// message types allowed to be forwarded as-is (raw string, no re-encoding, for low latency)
const PHONE_TO_HOST = new Set(['tilt', 'shake', 'lat', 'ping']);
const HOST_TO_PHONE = new Set(['pong', 'vibrate']);

wss.on('connection', (ws) => {
  ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const room = ws.room && rooms.get(ws.room);

    if (m.t === 'host') {
      let code = String(m.code || '').toUpperCase();
      if (!/^[A-Z0-9]{4}$/.test(code)) code = newCode();
      let r = rooms.get(code);
      if (r && r.host && r.host !== ws) { const old = r.host; r.host = null; old.room = null; old.close(); }
      if (!r) { r = { host: null, phone: null, timer: null }; rooms.set(code, r); }
      clearTimeout(r.timer);
      r.host = ws; ws.room = code; ws.role = 'host';
      send(ws, { t: 'room', code, phone: !!(r.phone && r.phone.readyState === 1) });
      send(r.phone, { t: 'hostStatus', connected: true });
    } else if (m.t === 'join') {
      const code = String(m.code || '').toUpperCase();
      const r = rooms.get(code);
      if (!r || !r.host) return send(ws, { t: 'error', msg: 'Room not found. Check the code on your laptop.' });
      if (r.phone && r.phone !== ws && r.phone.readyState === 1) r.phone.close();
      r.phone = ws; ws.room = code; ws.role = 'phone';
      send(ws, { t: 'joined', code });
      send(r.host, { t: 'phone', connected: true });
    } else if (room && ws.role === 'phone' && PHONE_TO_HOST.has(m.t)) {
      if (room.host && room.host.readyState === 1) room.host.send(raw.toString());
    } else if (room && ws.role === 'host' && HOST_TO_PHONE.has(m.t)) {
      if (room.phone && room.phone.readyState === 1) room.phone.send(raw.toString());
    }
  });

  ws.on('close', () => {
    const r = ws.room && rooms.get(ws.room);
    if (!r) return;
    if (ws.role === 'phone' && r.phone === ws) {
      r.phone = null;
      send(r.host, { t: 'phone', connected: false });
    } else if (ws.role === 'host' && r.host === ws) {
      r.host = null;
      send(r.phone, { t: 'hostStatus', connected: false });
      const code = ws.room;
      // keep the room for 2 minutes so the laptop can reconnect with the same code
      r.timer = setTimeout(() => { if (!r.host) rooms.delete(code); }, 120000);
    }
  });
});

// drop dead connections
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.alive) return ws.terminate();
    ws.alive = false;
    ws.ping();
  });
}, 15000);

server.listen(PORT, () => console.log(`Tilt controller running on http://localhost:${PORT}`));
