# Pocket Gyro Game

Tilt your phone to control a browser game on your laptop. The phone is a wireless motion controller: it reads its gyroscope and sends tilt to the laptop over WebSockets in real time.

**Objective:** roll the steel ball into the gold coins, dodge the red blocks, and score as much as you can before time runs out. Collecting coins quickly builds a combo multiplier up to x5. Hitting a block costs points and resets the combo. Every few coins starts a new level: faster blocks, one more block, bonus time.

## Modes and features

| Feature | Details |
|---|---|
| Difficulty | Easy (75 s, 2 blocks, slower, -1 per hit), Normal (60 s, 3 blocks, -2), Hard (45 s, 4 blocks, faster, -3). Harder levels need more coins per level. |
| Practice mode | No timer and no penalties; use it to learn the controls. Quit from the pause menu. |
| Demo mode | "Watch demo" (and the title screen background) shows the game playing itself with captions, so the concept can be explained without a phone. |
| Progression | New level every 6/8/10 coins (Easy/Normal/Hard): more blocks, faster blocks, bonus seconds. |
| Personal best + leaderboard | Best score per difficulty and a top-5 list, stored in your browser's `localStorage` on that device only. |
| End-of-game stats | Score, level, coins, best combo, hits, boosts. |
| Accessibility | Keyboard play, keyboard-focusable buttons, screen-reader announcements for level and game over, `prefers-reduced-motion` respected, "Reduce effects" switch, mute. |
| Phone tuning | Dead zone, smoothing and tilt range sliders on the phone; sensitivity slider on the laptop. All saved. |

## Controls

| Input | Action |
|---|---|
| Tilt the phone | Roll the ball (30 degrees from neutral = full speed) |
| Shake the phone | Speed boost; also restarts after game over |
| Calibrate (phone) | Sets the current angle as neutral (also happens automatically after rotating the phone) |
| Touch pad (phone) | Fallback steering by dragging a finger, used automatically if tilt is unavailable |
| Arrow keys / WASD (laptop) | Fallback steering, so the game is always playable |
| P or Esc (laptop) | Pause / resume |
| Sensitivity slider, Mute (laptop) | Saved in the browser |

## Run it

Requires Node.js 18 or newer.

```bash
npm install
npm start          # http://localhost:3000
npm test           # unit tests for message validation
```

1. Open `http://localhost:3000` on the laptop. A 4-character room code and QR code appear.
2. On the phone, scan the QR code (or open `/controller.html` and type the code) and tap **Connect and enable motion**.
3. Tap **Start game** on the laptop (or shake the phone).

### Connecting a phone (read this once)

`localhost` means "this device", so a phone can never open `http://localhost:3000`. The laptop page therefore shows a link built from your Mac's Wi-Fi address (the server also prints it at startup), and the QR code uses that link.

1. **Quick start (touch pad):** put the phone and the Mac on the same Wi-Fi, scan the QR code, tap Connect. Over plain `http` browsers block motion sensors, so the phone says so and gives you a touch pad that steers the ball. This works with no extra setup.
2. **Tilt (motion sensors):** browsers only allow sensors on HTTPS. Run a tunnel in a second terminal and open the **https link it prints on both the Mac and the phone**:
   ```bash
   brew install cloudflared
   cloudflared tunnel --url http://localhost:3000
   ```
   or deploy to Render/Railway. On iPhone, tap **Allow** when asked for motion access.

### Network requirements

- Phone and laptop only need to reach the server. They do not need to be on the same network if the server is deployed.
- **Phone sensors only work on HTTPS** (browser rule). `http://localhost` works on the laptop, but not for the phone. For the phone use either:
  - a deployed URL (Render, Railway or Fly.io give you `https://`; start command `npm start`, build command `npm install`), or
  - a tunnel while developing: `npx localtunnel --port 3000` or `cloudflared tunnel --url http://localhost:3000`. Open the **https URL on both devices**.
- If HTTPS is not available, the controller still works with its touch pad.
- Free hosting tiers may sleep when idle; open the page a minute before a demo.

## Architecture and data flow

```
 Phone (controller.html)          Server (server.js)            Laptop (index.html)
 deviceorientation / motion  -->  validate + relay by room  -->  game loop (canvas)
 touch pad fallback               rooms: code -> {host,phone}   keyboard fallback
        ^                                                              |
        +------------------ pong, vibrate (haptics) <------------------+
```

- **Pairing:** the laptop sends `host`; the server returns a random 4-character room code. The phone sends `join` with that code. The server only relays messages between the two sockets in the same room.
- **Phone to laptop:** the phone computes its steering value every 20 ms (calibrated, rotated for landscape, dead-zoned, smoothed, and limited so it cannot jump by more than 0.2 per step) and sends `{t:"tilt",x,y}` with values in -1..1 only when the value changed, plus a heartbeat every 250 ms. A steady phone therefore sends about 4 messages per second instead of 50. A shake sends `{t:"shake"}`.
- **Latency display:** the phone sends `ping` every second; the laptop answers `pong` with the same timestamp; the phone measures the full round trip and reports it. This measures your actual connection; no figures are hard-coded.
- **Laptop to phone:** `vibrate` messages for haptic feedback (Android Chrome only).
- **Game:** `requestAnimationFrame` loop with delta time. Input becomes acceleration (2200 px/s squared) with strong friction, so top speed is about 630 px/s, a short key tap moves the ball roughly 100 px, and the ball stops within about a second of letting go. Walls bounce it at half speed.
- **Stale input:** the game ignores tilt older than 1 second, so a lost connection cannot leave the ball running away.
- **Shared logic:** `public/logic.js` holds the pure functions (difficulty table, dead zone, smoothing, leaderboard validation, demo autopilot). It runs in the browser and in Node, which is how the unit tests exercise it.

## Reliability and security

- Every incoming message is parsed and validated in `lib/validate.js`: JSON only, known message types, numbers must be finite and in range, room codes must match `[A-Z0-9]{4}`, payloads over 256 characters are dropped, unexpected fields are stripped. The laptop validates again before using tilt.
- Server: 1 KB WebSocket payload cap, 200 messages per second per connection, at most 500 rooms, only `.html/.js/.css` files from `public/` are served, malformed URLs return 400, heartbeat removes dead sockets. Phones can only send phone-type messages and the laptop only host-type messages.
- Both clients reconnect automatically (0.5 s growing to 5 s). If the phone drops mid-game, the game pauses and resumes when it returns. The laptop keeps its room for 2 minutes and reclaims the same code on reconnect.
- No secrets, accounts, database or API keys. The only dependency is `ws`.

## Supported browsers

Target: current Chrome on Android and Safari on iOS (iOS 13+ asks for motion permission when you tap the button; the denial case is handled). The laptop page works in any current desktop browser.
Verified on real devices: *(fill in after your phone test, for example "Android Chrome on Pixel 7 via Render")*.

## Troubleshooting

| Problem | Fix |
|---|---|
| Phone says "Using the touch pad" | The page is not HTTPS, the browser has no motion sensor, or motion permission was denied. Use the https link; on iPhone close the tab, reopen the link and tap Allow. |
| "Room not found" | Check the code on the laptop. Refreshing the laptop keeps the same code. |
| Keyboard does nothing | The browser only sends keys to the window that has focus. Click the game board once. If the browser console / DevTools or another window has focus, the game pauses and says so; after 5 seconds of play with no key events it shows a red hint. Press the backtick key (`` ` ``) to open a diagnostics panel that shows live focus, keys received, input and ball speed. |
| Phone cannot open the link | Use the Wi-Fi address shown on the laptop, never `localhost`. Phone and Mac must be on the same Wi-Fi (guest or "client isolation" networks block this). |
| Ball drifts when the phone is still | Hold the phone flat and tap Calibrate. |
| Ball is too fast or slow | Adjust Sensitivity on the laptop. |
| No sound | Click or press a key on the laptop page once (browsers block audio until then), and check Mute. |
| No vibration | iOS Safari does not support the Vibration API. |
| Game paused by itself | The phone disconnected. It resumes when the phone reconnects, or play with the keyboard. |

## Tests

- `npm test` (19 tests, includes starting the real server and pairing real WebSocket clients): message validation (valid, malformed, out-of-range, oversized, unknown), difficulty ordering, dead zone, smoothing limit, leaderboard ranking and tamper-resistance, per-difficulty bests, demo autopilot behaviour.
- The game page and phone controller were also driven in a real headless Chromium during development (keyboard play, pause/resume, focus loss, touch pad over a Wi-Fi address, simulated tilt events, shake, disconnect and reconnect). Headless Chromium on Linux is not Chrome on macOS and a simulated sensor is not a real phone, so a real-phone test is still needed.

## Known limitations

- The tilt axes assume the phone is held roughly flat; rotating the phone re-calibrates automatically but you may need to tap Calibrate.
- One phone per room. Multiplayer is not implemented.
- Rooms live in server memory; restarting the server ends all sessions.
- Latency depends on your network and the hosting location.
- Game balance (speeds, level pacing, difficulty settings) has not been play-tested with other people.
- The leaderboard is local to one browser on one device. There is no online leaderboard or accounts.
- The QR code uses a small public library from a CDN; offline, type the room code instead.

## Project structure

```
server.js               static files + WebSocket relay
lib/validate.js         message validation (unit tested)
public/logic.js         shared pure game logic (unit tested)
public/index.html       laptop game
public/controller.html  phone controller
test/validate.test.js   server message tests
test/logic.test.js      game logic tests
```
