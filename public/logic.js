// Pure game logic shared by the browser pages and the unit tests (no DOM access in here).
(function (root) {
  const DIFFICULTY = {
    easy:   { label: 'Easy',   time: 75, blocks: 2, speed: 0.8, penalty: 1, perLevel: 6,  max: 6,  bonus: 6 },
    normal: { label: 'Medium', time: 60, blocks: 3, speed: 1.0, penalty: 2, perLevel: 8,  max: 8,  bonus: 5 },
    hard:   { label: 'Hard',   time: 45, blocks: 4, speed: 1.3, penalty: 3, perLevel: 10, max: 10, bonus: 3 },
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Ignore tiny tilts below `dz` (0..1), then rescale so full tilt still reaches 1.
  function deadzone(v, dz) {
    const a = Math.abs(v);
    if (a <= dz) return 0;
    return Math.sign(v) * clamp((a - dz) / (1 - dz), 0, 1);
  }

  // One smoothing step with a limit on how fast the output may change (resists sudden jumps).
  function smoothStep(current, target, alpha, maxStep) {
    return current + clamp((target - current) * alpha, -maxStep, maxStep);
  }

  // Local leaderboard: keep only well-formed entries, best first, top 5.
  function sanitizeBoard(raw) {
    let arr = raw;
    if (typeof raw === 'string') { try { arr = JSON.parse(raw); } catch (e) { return []; } }
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((e) => e && Number.isFinite(e.score) && e.score >= 0 && e.score < 1e6 && Number.isFinite(e.level) && DIFFICULTY[e.diff])
      .map((e) => ({ score: Math.floor(e.score), level: Math.floor(e.level), diff: e.diff, date: typeof e.date === 'string' ? e.date.slice(0, 10) : '' }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }
  function addScore(board, entry) {
    const next = sanitizeBoard([...sanitizeBoard(board), entry]);
    const i = next.findIndex((e) => e.score === Math.floor(entry.score) && e.diff === entry.diff && e.level === Math.floor(entry.level) && e.date === String(entry.date).slice(0, 10));
    return { board: next, rank: i + 1 };   // rank 0 = did not make the top 5
  }
  function sanitizeBests(raw) {
    let o = raw;
    if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch (e) { o = null; } }
    const out = { easy: 0, normal: 0, hard: 0 };
    if (o && typeof o === 'object') for (const k of Object.keys(out)) if (Number.isFinite(o[k]) && o[k] >= 0 && o[k] < 1e6) out[k] = Math.floor(o[k]);
    return out;
  }

  // Demo mode pilot: returns a tilt vector in -1..1 that steers toward the nearest coin
  // (spring + damper) and away from nearby red blocks.
  function autopilot(ball, coins, blocks) {
    let target = null, best = Infinity;
    for (const c of coins) { const d = Math.hypot(c.x - ball.x, c.y - ball.y); if (d < best) { best = d; target = c; } }
    let ax = 0, ay = 0;
    if (target) { ax = (target.x - ball.x) / 150 - ball.vx / 300; ay = (target.y - ball.y) / 150 - ball.vy / 300; }
    for (const b of blocks) {
      const dx = ball.x - (b.x + b.w / 2), dy = ball.y - (b.y + b.h / 2), d = Math.hypot(dx, dy) || 1;
      if (d < 130) { const f = ((130 - d) / 130) * 2.5; ax += (dx / d) * f; ay += (dy / d) * f; }
    }
    return { x: clamp(ax, -1, 1), y: clamp(ay, -1, 1) };
  }

  // Ball physics. Acceleration minus strong friction gives a terminal speed of accel / friction-rate:
  // 2200 / 3.5 = about 630 px/s at full input, and the ball stops within about a second of letting go.
  const PHYSICS = { accel: 2200, boostMul: 2.2, friction: 0.03, bounce: 0.5 };   // friction = velocity fraction left after 1 second
  function stepBall(ball, ax, ay, dt, boosted, W, H, R) {
    const k = PHYSICS.accel * (boosted ? PHYSICS.boostMul : 1);
    ball.vx += ax * k * dt; ball.vy += ay * k * dt;
    const f = Math.pow(PHYSICS.friction, dt); ball.vx *= f; ball.vy *= f;
    ball.x += ball.vx * dt; ball.y += ball.vy * dt;
    if (ball.x < R) { ball.x = R; ball.vx *= -PHYSICS.bounce; } if (ball.x > W - R) { ball.x = W - R; ball.vx *= -PHYSICS.bounce; }
    if (ball.y < R) { ball.y = R; ball.vy *= -PHYSICS.bounce; } if (ball.y > H - R) { ball.y = H - R; ball.vy *= -PHYSICS.bounce; }
  }

  const api = { DIFFICULTY, PHYSICS, clamp, deadzone, smoothStep, sanitizeBoard, addScore, sanitizeBests, autopilot, stepBall };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PGG = api;
})(typeof self !== 'undefined' ? self : this);
