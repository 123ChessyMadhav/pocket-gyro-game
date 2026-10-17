// Integration test: starts the real server and talks to it with real WebSocket clients.
const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const net = require('node:net');
const http = require('node:http');
const WebSocket = require('ws');

let child, port;
const freePort = () => new Promise((res) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const get = (path) => new Promise((res, rej) => http.get({ port, path }, (r) => { r.resume(); r.on('end', () => res(r.statusCode)); }).on('error', rej));
function client() {
  const ws = new WebSocket(`ws://localhost:${port}`); ws.inbox = []; ws.waiters = [];
  ws.on('message', (d) => { const m = JSON.parse(d); const w = ws.waiters.findIndex((x) => x.t === m.t); if (w >= 0) ws.waiters.splice(w, 1)[0].res(m); else ws.inbox.push(m); });
  ws.next = (t, ms = 1500) => new Promise((res, rej) => {
    const i = ws.inbox.findIndex((m) => m.t === t); if (i >= 0) return res(ws.inbox.splice(i, 1)[0]);
    const timer = setTimeout(() => rej(new Error('timeout waiting for ' + t)), ms); ws.waiters.push({ t, res: (m) => { clearTimeout(timer); res(m); } });
  });
  ws.sendJ = (o) => ws.send(JSON.stringify(o));
  return new Promise((res) => ws.on('open', () => res(ws)));
}
const quiet = (ws, ms = 150) => new Promise((r) => setTimeout(r, ms)).then(() => ws.inbox.length);

test.before(async () => {
  port = await freePort();
  child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((res, rej) => { child.stdout.on('data', (d) => String(d).includes('running on') && res()); child.on('exit', () => rej(new Error('server exited'))); });
});
test.after(() => child && child.kill());

test('serves the pages and refuses everything else', async () => {
  assert.strictEqual(await get('/'), 200);
  assert.strictEqual(await get('/controller.html'), 200);
  assert.strictEqual(await get('/logic.js'), 200);
  assert.strictEqual(await get('/%'), 400);               // malformed URL used to crash the server
  assert.strictEqual(await get('/package.json'), 404);
  assert.strictEqual(await get('/../server.js'), 404);
  assert.strictEqual(await get('/'), 200);                // still alive
});

test('laptop gets a room code and LAN addresses; phone joins; input flows both ways', async () => {
  const host = await client(); host.sendJ({ t: 'host' });
  const room = await host.next('room'); assert.match(room.code, /^[A-Z0-9]{4}$/); assert.ok(Array.isArray(room.lan));
  for (const u of room.lan) assert.match(u, /^http:\/\/\d+\.\d+\.\d+\.\d+:\d+$/);

  const phone = await client(); phone.sendJ({ t: 'join', code: 'ZZZZ' });
  assert.match((await phone.next('error')).msg, /not found/i);
  phone.sendJ({ t: 'join', code: room.code.toLowerCase() });
  await phone.next('joined'); assert.strictEqual((await host.next('phone')).connected, true);

  phone.sendJ({ t: 'tilt', x: 0.5, y: -0.25 }); assert.deepStrictEqual(await host.next('tilt'), { t: 'tilt', x: 0.5, y: -0.25 });
  phone.sendJ({ t: 'shake' }); await host.next('shake');
  phone.sendJ({ t: 'ping', ts: 42 }); await host.next('ping'); host.sendJ({ t: 'pong', ts: 42 }); assert.strictEqual((await phone.next('pong')).ts, 42);
  host.sendJ({ t: 'vibrate', ms: 40 }); assert.strictEqual((await phone.next('vibrate')).ms, 40);

  phone.sendJ({ t: 'tilt', x: 99, y: 0 }); phone.send('garbage'); phone.send('{"t":"tilt","x":"1","y":0}');
  host.sendJ({ t: 'tilt', x: 1, y: 1 });                  // laptops may not send tilt
  assert.strictEqual(await quiet(host), 0, 'invalid or wrong-direction messages must be dropped');
  assert.strictEqual(await quiet(phone, 10), 0);

  phone.close(); assert.strictEqual((await host.next('phone')).connected, false);
  const phone2 = await client(); phone2.sendJ({ t: 'join', code: room.code }); await phone2.next('joined');   // reconnect works
  host.close(); assert.strictEqual((await phone2.next('hostStatus')).connected, false);
  const host2 = await client(); host2.sendJ({ t: 'host', code: room.code }); assert.strictEqual((await host2.next('room')).code, room.code);   // same code reclaimed
  phone2.close(); host2.close();
});

test('oversized frames are rejected by the server', async () => {
  const ws = await client(); const closed = new Promise((r) => ws.on('close', r));
  ws.send('x'.repeat(5000)); await closed;
});
