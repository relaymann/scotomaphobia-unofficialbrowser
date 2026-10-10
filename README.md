# Scotomaphobia — Unofficial Browser Expedition

An independent browser horror game inspired by the supplied Layers 1–2 walkthrough. It uses original TypeScript gameplay code and procedural Three.js scenery; it does not include Roblox game assets.

## Play loop
- Layer 1 — The Threshold: collect three field relays, open the bunker, solve the maintenance maze, activate a checkpoint, then jump across flooded stepping stones to the descent gate.
- Layer 2 — The Monolith Field: collect seven pale crystals, find four inscription marks, enter the four-digit seal code, and reach the final gate.
- Horror mechanics: first-person exploration, jumping and falling, checkpoint recovery, a stalker that advances while it is not being watched, pause/restart, and local progress persistence.
- Controls: WASD / arrows move, mouse looks, Space jumps, Shift runs, E interacts, Escape pauses. On touch screens use the joystick, drag the right side to look, and tap E.
- Multiplayer: Socket.IO synchronizes players and shares puzzle/collectible events within the server process. Local progress is saved in the browser.

## Development
Requires Node.js 22+ and npm 10+.
Run npm install, then npm run build.
Run the Vite client and Express server separately with npm run dev --workspace client and npm run dev --workspace server.

This is playable campaign groundwork, not a byte-for-byte recreation. Environments, enemy behavior, puzzles, and progression will continue to be refined against the walkthrough.
