# Pocket Gyro Game (Tilt Table)

Your phone becomes a motion controller for a browser game on your laptop. Tilt the phone to roll a steel ball around a felt table, collect gold coins, dodge the red blocks, and shake the phone for a speed boost. You have 60 seconds, and every 8 coins starts a new level with faster blocks, an extra block and 5 bonus seconds. Collecting coins quickly builds a combo multiplier up to x5.

## Tech stack
- **Phone app:** a mobile web app (`public/controller.html`) using the `DeviceOrientation` and `DeviceMotion` browser APIs (gyroscope and accelerometer). No install needed; it can be added to the home screen.
- **Game:** HTML5 Canvas, plain JavaScript (`public/index.html`).
- **Server:** Node.js with the `ws` WebSocket library (`server.js`). It serves both pages and relays messages between the paired devices.

## Run it
```bash
npm install
npm start
```
Open `http://localhost:3000` on the laptop.

Phone sensors only work on **HTTPS**, so for the phone use one of:
- Deploy to Render, Railway or Fly.io (they give you an `https://` URL), or
- Run a tunnel while developing: `npx localtunnel --port 3000` or `cloudflared tunnel --url http://localhost:3000`, then open the https URL on **both** devices.

## Pairing
The laptop asks the server for a 4-character room code and shows it with a QR code. The phone scans the QR code (or you type the code) and joins that room. The server only relays messages between the two devices in the same room. The code survives page refreshes (stored in `sessionStorage`), so the laptop can reconnect to the same room.

## Controls
| Phone motion | Game action |
|---|---|
| Tilt left/right (gamma) | Roll the ball left/right |
| Tilt forward/back (beta) | Roll the ball up/down |
| Shake | Speed boost (or restart after game over) |
| Calibrate button | Sets the current phone angle as the neutral position |
| Arrow keys / WASD (laptop) | Same as tilting, so the game is playable without a phone |
| P or Esc (laptop) | Pause / resume |

Landscape mode is supported: the phone rotates the tilt axes to match the screen and re-calibrates when you rotate it. Sensitivity and a mute switch are on the laptop screen.

The first sensor reading auto-calibrates. Tilt of 30 degrees from neutral counts as full speed.

## Latency approach
- WebSocket (one persistent connection, no HTTP polling), with `TCP_NODELAY` behaviour from the `ws` library defaults.
- Tilt is sent as tiny JSON messages (about 30 bytes) at up to about 60 per second, straight from the sensor event.
- The server forwards the raw message without parsing or re-encoding it.
- The game applies tilt as acceleration inside a `requestAnimationFrame` loop with delta-time, so it stays smooth even if packets arrive unevenly.
- **Live latency display:** the phone sends a ping every second; the laptop echoes it back and the phone measures the full round trip (phone to server to laptop and back). It is shown on both screens.

## Reliability
- Both clients auto-reconnect with exponential backoff (0.5 s up to 5 s).
- Connection status is shown on both devices (server, phone, latency).
- If the laptop drops, the server keeps the room for 2 minutes so it can rejoin with the same code.
- If tilt data stops for 1 second the ball stops accelerating, so a lost connection never leaves the ball running away.
- Server heartbeat removes dead sockets every 15 seconds.

## Bonus features included
- Vibration feedback on the phone when you collect a coin (short), hit a block (long) or finish (longer). Works on Android Chrome; iOS Safari does not support the Vibration API.
- Live latency display.
- Combo multiplier, levels, particle effects, screen shake and sound effects (generated with WebAudio, no asset files).
- Keyboard fallback, pause, adjustable sensitivity.
- If the phone disconnects mid-game the game pauses and resumes automatically when the phone reconnects.

## Project structure
```
server.js              WebSocket relay + static file server
public/index.html      Laptop game
public/controller.html Phone controller
```
