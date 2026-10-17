const test = require('node:test');
const assert = require('node:assert');
const L = require('../public/logic.js');

test('difficulty table is ordered: harder = less time, more blocks, faster, bigger penalty', () => {
  const { easy, normal, hard } = L.DIFFICULTY;
  assert.ok(easy.time > normal.time && normal.time > hard.time);
  assert.ok(easy.blocks < normal.blocks && normal.blocks < hard.blocks);
  assert.ok(easy.speed < normal.speed && normal.speed < hard.speed);
  assert.ok(easy.penalty < normal.penalty && normal.penalty < hard.penalty);
});
test('deadzone ignores small tilt and still reaches full range', () => {
  assert.strictEqual(L.deadzone(0.05, 0.06), 0);
  assert.strictEqual(L.deadzone(-0.06, 0.06), 0);
  assert.strictEqual(L.deadzone(1, 0.06), 1);
  assert.ok(Math.abs(L.deadzone(0.5, 0.06) - 0.468) < 0.001);
  assert.ok(L.deadzone(-0.5, 0.06) < 0);
  assert.strictEqual(L.deadzone(0.3, 0), 0.3);
});
test('smoothing limits how fast the output can jump', () => {
  assert.strictEqual(L.smoothStep(0, 1, 0.4, 0.2), 0.2);       // capped step
  assert.ok(Math.abs(L.smoothStep(0, 0.1, 0.4, 0.2) - 0.04) < 1e-9);   // normal smoothing
  assert.ok(Math.abs(L.smoothStep(1, -1, 0.4, 0.2) - 0.8) < 1e-9);
});
test('leaderboard keeps the top 5, sorted, and reports rank', () => {
  let board = [];
  for (const s of [10, 50, 30, 20, 40]) board = L.addScore(board, { score: s, level: 2, diff: 'normal', date: '2026-10-17' }).board;
  assert.deepStrictEqual(board.map((e) => e.score), [50, 40, 30, 20, 10]);
  let r = L.addScore(board, { score: 45, level: 3, diff: 'hard', date: '2026-10-18' });
  assert.strictEqual(r.rank, 2); assert.strictEqual(r.board.length, 5); assert.strictEqual(r.board.at(-1).score, 20);
  r = L.addScore(r.board, { score: 1, level: 1, diff: 'easy', date: '2026-10-18' });
  assert.strictEqual(r.rank, 0);                                  // did not make the top 5
});
test('leaderboard rejects tampered or corrupt storage', () => {
  assert.deepStrictEqual(L.sanitizeBoard('not json'), []);
  assert.deepStrictEqual(L.sanitizeBoard('{"a":1}'), []);
  const dirty = [{ score: 'x', level: 1, diff: 'normal' }, { score: -5, level: 1, diff: 'normal' }, { score: 9, level: 1, diff: 'cheat' }, null, { score: 12.7, level: 2.2, diff: 'easy', date: '2026-10-17<script>' }];
  const clean = L.sanitizeBoard(dirty);
  assert.strictEqual(clean.length, 1); assert.deepStrictEqual(clean[0], { score: 12, level: 2, diff: 'easy', date: '2026-10-17' });
});
test('personal bests are sanitised per difficulty', () => {
  assert.deepStrictEqual(L.sanitizeBests('garbage'), { easy: 0, normal: 0, hard: 0 });
  assert.deepStrictEqual(L.sanitizeBests({ easy: 5, normal: -1, hard: 'x', extra: 9 }), { easy: 5, normal: 0, hard: 0 });
});
test('autopilot steers toward a coin and away from a close block', () => {
  const ball = { x: 100, y: 100, vx: 0, vy: 0 };
  let a = L.autopilot(ball, [{ x: 400, y: 100 }], []);
  assert.ok(a.x > 0.9 && Math.abs(a.y) < 0.01);
  a = L.autopilot(ball, [{ x: 400, y: 100 }], [{ x: 130, y: 80, w: 46, h: 46 }]);   // block just to the right
  assert.ok(a.x < 0.9, 'block should reduce the push toward the right');
  a = L.autopilot({ x: 100, y: 100, vx: 500, vy: 0 }, [{ x: 140, y: 100 }], []);
  assert.ok(a.x < 0, 'brakes when moving fast toward a near target');
  const none = L.autopilot(ball, [], []); assert.deepStrictEqual(none, { x: 0, y: 0 });
});

test('physics: a short tap moves the ball a small, predictable distance and it stops', () => {
  const W = 900, H = 540, R = 14, dt = 1 / 60;
  const ball = { x: 100, y: 270, vx: 0, vy: 0 };
  for (let i = 0; i < 9; i++) L.stepBall(ball, 1, 0, dt, false, W, H, R);      // 150 ms key tap
  for (let i = 0; i < 180; i++) L.stepBall(ball, 0, 0, dt, false, W, H, R);    // 3 s of letting go
  const moved = ball.x - 100;
  assert.ok(moved > 40 && moved < 160, `tap moved ${moved.toFixed(0)} px`);     // before the fix this was about 330 px
  assert.ok(Math.abs(ball.vx) < 1, 'ball should have stopped');
});
test('physics: holding a key reaches a sensible top speed, boost is faster, reversing is quick', () => {
  const W = 9000, H = 5400, R = 14, dt = 1 / 60;
  const run = (boost) => { const b = { x: 4000, y: 2000, vx: 0, vy: 0 }; for (let i = 0; i < 120; i++) L.stepBall(b, 1, 0, dt, boost, W, H, R); return b.vx; };
  const top = run(false), boosted = run(true);
  assert.ok(top > 500 && top < 700, `top speed ${top.toFixed(0)} px/s`);
  assert.ok(boosted > top * 1.8);
  const b = { x: 4000, y: 2000, vx: top, vy: 0 };
  for (let i = 0; i < 30; i++) L.stepBall(b, -1, 0, dt, false, W, H, R);       // 0.5 s of pushing the other way
  assert.ok(b.vx < 0, 'reverses direction within half a second');
});
test('physics: walls keep the ball inside and bounce it', () => {
  const b = { x: 20, y: 270, vx: -800, vy: 0 };
  L.stepBall(b, 0, 0, 1 / 60, false, 900, 540, 14);
  assert.strictEqual(b.x, 14); assert.ok(b.vx > 0);
});
test('autopilot still collects coins with the new physics', () => {
  const W = 900, H = 540, R = 14, dt = 1 / 60;
  const ball = { x: 450, y: 270, vx: 0, vy: 0 }; let coins = [{ x: 150, y: 100 }, { x: 800, y: 450 }, { x: 300, y: 480 }], got = 0;
  for (let i = 0; i < 60 * 40 && got < 3; i++) {
    const a = L.autopilot(ball, coins, []); L.stepBall(ball, a.x, a.y, dt, false, W, H, R);
    coins = coins.filter((c) => { const hit = Math.hypot(c.x - ball.x, c.y - ball.y) < R + 11; if (hit) got++; return !hit; });
  }
  assert.strictEqual(got, 3, 'autopilot collected all three coins within 40 s');
});
