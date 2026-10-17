const test = require('node:test');
const assert = require('node:assert');
const { parse } = require('../lib/validate');

test('accepts valid messages', () => {
  assert.deepStrictEqual(parse('{"t":"tilt","x":0.5,"y":-1}'), { t: 'tilt', x: 0.5, y: -1 });
  assert.deepStrictEqual(parse(Buffer.from('{"t":"join","code":"ab3d"}')), { t: 'join', code: 'AB3D' });
  assert.deepStrictEqual(parse('{"t":"host"}'), { t: 'host', code: '' });
  assert.deepStrictEqual(parse('{"t":"ping","ts":123.4}'), { t: 'ping', ts: 123.4 });
});
test('rejects bad JSON, wrong types and unknown message types', () => {
  for (const bad of ['', 'not json', '[]', 'null', '42', '{"t":"nope"}', '{"x":1}', undefined, 5, {}]) assert.strictEqual(parse(bad), null);
});
test('rejects out-of-range or non-numeric tilt (no runaway ball)', () => {
  for (const bad of ['{"t":"tilt","x":99,"y":0}', '{"t":"tilt","x":"1","y":0}', '{"t":"tilt","x":null,"y":0}', '{"t":"tilt","y":0}', '{"t":"tilt","x":1e999,"y":0}'])
    assert.strictEqual(parse(bad), null, bad);
});
test('rejects bad room codes and oversized payloads', () => {
  assert.strictEqual(parse('{"t":"join","code":"ABCDE"}'), null);
  assert.strictEqual(parse('{"t":"join","code":"AB!D"}'), null);
  assert.strictEqual(parse('{"t":"join"}'), null);
  assert.strictEqual(parse('{"t":"shake","pad":"' + 'x'.repeat(300) + '"}'), null);
});
test('strips unexpected extra fields', () => {
  assert.deepStrictEqual(parse('{"t":"shake","evil":"<script>"}'), { t: 'shake' });
});
