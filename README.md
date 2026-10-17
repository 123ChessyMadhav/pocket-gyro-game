# Pocket Gyro Game

Tilt your phone to control a browser game on your laptop. The phone is a wireless motion controller: it reads its gyroscope and sends tilt to the laptop over WebSockets in real time.

**Objective:** roll the steel ball into the gold coins, dodge the red blocks, and score as much as you can in 60 seconds. Every 8 coins starts a new level (faster blocks, one more block, +5 seconds). Collecting coins quickly builds a combo multiplier up to x5. Hitting a block costs 2 points and resets the combo.

## Controls

| Input | Action |
|---|---|
| Tilt the phone | Roll the ball (30 degrees from neutral = full speed) |
| Shake the phone | Speed boost; also restarts after game over |
| Calibrate (phone) | Sets the current angle as neutral |
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
- **Phone to laptop:** about every 20 ms the phone sends `{t:"tilt",x,y}` with values in -1..1. The values are already calibrated, rotated for landscape, dead-zoned (6%) and smoothed. A shake sends `{t:"shake"}`.
- **Latency display:** the phone sends `ping` every second; the laptop answers `pong` with the same timestamp; the phone measures the full round trip and reports it. This measures your actual connection; no figures are hard-coded.
- **Laptop to phone:** `vibrate` messages for haptic feedback (Android Chrome only).
- **Game:** `requestAnimationFrame` loop with delta time. Tilt becomes acceleration; friction and wall bounces are applied per frame.
- **Stale input:** the phone sends a steady heartbeat, and the game ignores tilt older than 1 second, so a lost connection cannot leave the ball running away.

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
| Ball drifts when the phone is still | Hold the phone flat and tap Calibrate. |
| Ball is too fast or slow | Adjust Sensitivity on the laptop. |
| No sound | Click or press a key on the laptop page once (browsers block audio until then), and check Mute. |
| No vibration | iOS Safari does not support the Vibration API. |
| Game paused by itself | The phone disconnected. It resumes when the phone reconnects, or play with the keyboard. |

## Tests

- `npm test`: unit tests for message validation (accepts valid messages, rejects malformed, out-of-range, oversized and unknown ones).
- Game, controller and server logic were also exercised with simulated browser and WebSocket objects during development (pairing, forwarding, rate limiting, countdown, pause/resume, disconnects, level-up, touch fallback, permission denial). These simulations are not a substitute for a real-phone test.

## Known limitations

- The tilt axes assume the phone is held roughly flat; rotating the phone re-calibrates automatically but you may need to tap Calibrate.
- One phone per room. Multiplayer is not implemented.
- Rooms live in server memory; restarting the server ends all sessions.
- Latency depends on your network and the hosting location.
- Game balance (speeds, level pacing) has not been play-tested with other people.

## Project structure

```
server.js               static files + WebSocket relay
lib/validate.js         message validation (unit tested)
public/index.html       laptop game
public/controller.html  phone controller
test/validate.test.js   unit tests
```
