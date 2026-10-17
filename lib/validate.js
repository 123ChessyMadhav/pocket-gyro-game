// Pure message validation, shared by the server and the unit tests.
// Every message from a client is parsed here; anything unexpected returns null and is dropped.
const CODE = /^[A-Z0-9]{4}$/;
const MAX_LEN = 256;
const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const code = (v) => (typeof v === 'string' && CODE.test(v.toUpperCase()) ? v.toUpperCase() : '');

function parse(raw) {
  if (typeof raw !== 'string' && !Buffer.isBuffer(raw)) return null;
  const str = raw.toString();
  if (str.length > MAX_LEN) return null;
  let m;
  try { m = JSON.parse(str); } catch { return null; }
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  switch (m.t) {
    case 'host': return { t: 'host', code: code(m.code) };          // empty code = "give me a new room"
    case 'join': return code(m.code) ? { t: 'join', code: code(m.code) } : null;
    case 'tilt': return num(m.x, -1.5, 1.5) && num(m.y, -1.5, 1.5) ? { t: 'tilt', x: m.x, y: m.y } : null;
    case 'shake': return { t: 'shake' };
    case 'ping': case 'pong': return num(m.ts, 0, 1e12) ? { t: m.t, ts: m.ts } : null;
    case 'lat': return num(m.ms, 0, 60000) ? { t: 'lat', ms: m.ms } : null;
    case 'vibrate': return num(m.ms, 0, 1000) ? { t: 'vibrate', ms: m.ms } : null;
    default: return null;
  }
}
module.exports = { parse };
