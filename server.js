// Relay server: serves the game + controller pages and pairs a phone with a laptop by 4-character room code.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');
const { parse } = require('./lib/validate');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const MAX_ROOMS = 500, MAX_MSGS_PER_SEC = 200;

const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(req.url.split('?')[0]); } catch { res.writeHead(400); return res.end('Bad request'); }
  if (p === '/healthz') { res.writeHead(200); return res.end('ok'); }
  if (p === '/') p = '/index.html';
  const type = TYPES[path.extname(p)];
  const file = path.join(PUBLIC, path.normalize(p));
  if (!type || !file.startsWith(PUBLIC + path.sep)) { res.writeHead(404); return res.end('Not found'); }   // only html/js/css inside public/
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});
server.on('error', (e) => { console.error('Server error:', e.message); process.exit(1); });

const wss = new WebSocketServer({ server, maxPayload: 1024 });
const rooms = new Map(); // code -> { host, phone, timer }
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// Addresses a phone on the same Wi-Fi can use to reach this server (never "localhost", which on a phone means the phone itself).
function lanUrls() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list || []) if ((i.family === 'IPv4' || i.family === 4) && !i.internal) out.push(`http://${i.address}:${PORT}`);
  return out;
}
const isLoopback = (a) => a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
const send = (ws, obj) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); };

function newCode() {
  let s;
  do { s = ''; for (let i = 0; i < 4; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]; } while (rooms.has(s));
  return s;
}

const PHONE_TO_HOST = new Set(['tilt', 'shake', 'lat', 'ping']);
const HOST_TO_PHONE = new Set(['pong', 'vibrate']);

wss.on('connection', (ws, req) => {
  ws.local = isLoopback(req.socket.remoteAddress);   // only a laptop running the server itself gets the LAN addresses
  ws.alive = true; ws.winStart = Date.now(); ws.count = 0;
  ws.on('pong', () => { ws.alive = true; });
  ws.on('error', () => {});

  ws.on('message', (raw) => {
    const now = Date.now();                                          // per-connection rate limit
    if (now - ws.winStart > 1000) { ws.winStart = now; ws.count = 0; }
    if (++ws.count > MAX_MSGS_PER_SEC) return;
    const m = parse(raw);
    if (!m) return;
    const room = ws.room && rooms.get(ws.room);

    if (m.t === 'host') {
      let code = m.code, r = code && rooms.get(code);
      if (!r && rooms.size >= MAX_ROOMS) return send(ws, { t: 'error', msg: 'Server is full, try again later.' });
      if (!code) code = newCode();
      if (r && r.host && r.host !== ws) { const old = r.host; r.host = null; old.room = null; old.close(); }
      if (!r) { r = { host: null, phone: null, timer: null }; rooms.set(code, r); }
      clearTimeout(r.timer);
      r.host = ws; ws.room = code; ws.role = 'host';
      send(ws, { t: 'room', code, phone: !!(r.phone && r.phone.readyState === 1), lan: ws.local ? lanUrls() : [] });
      send(r.phone, { t: 'hostStatus', connected: true });
    } else if (m.t === 'join') {
      const r = rooms.get(m.code);
      if (!r || !r.host) return send(ws, { t: 'error', msg: 'Room not found. Check the code on your laptop.' });
      if (r.phone && r.phone !== ws && r.phone.readyState === 1) { const old = r.phone; r.phone = null; old.room = null; old.close(); }
      r.phone = ws; ws.room = m.code; ws.role = 'phone';
      send(ws, { t: 'joined', code: m.code });
      send(r.host, { t: 'phone', connected: true });
    } else if (room && ws.role === 'phone' && PHONE_TO_HOST.has(m.t)) {
      send(room.host, m);                                            // re-encoded from the validated copy
    } else if (room && ws.role === 'host' && HOST_TO_PHONE.has(m.t)) {
      send(room.phone, m);
    }
  });

  ws.on('close', () => {
    const r = ws.room && rooms.get(ws.room);
    if (!r) return;
    if (ws.role === 'phone' && r.phone === ws) {
      r.phone = null; send(r.host, { t: 'phone', connected: false });
    } else if (ws.role === 'host' && r.host === ws) {
      r.host = null; send(r.phone, { t: 'hostStatus', connected: false });
      const code = ws.room;   // keep the room 2 minutes so the laptop can rejoin with the same code
      r.timer = setTimeout(() => { if (!r.host) rooms.delete(code); }, 120000);
    }
  });
});

setInterval(() => {   // heartbeat: drop dead sockets
  wss.clients.forEach((ws) => { if (!ws.alive) return ws.terminate(); ws.alive = false; ws.ping(); });
}, 15000);

server.listen(PORT, () => {
  console.log(`Pocket Gyro Game running on http://localhost:${PORT}`);
  const lan = lanUrls();
  if (lan.length) console.log(`Phone on the same Wi-Fi: ${lan.join('  or  ')}  (motion sensing additionally needs HTTPS, see README)`);
});
