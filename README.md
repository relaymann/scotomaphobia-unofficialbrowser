# Scotomaphobia — Unofficial Browser Remake

Independent browser horror exploration project inspired by the reference walkthrough. Original code and procedural placeholder assets; no Roblox assets are included.

## Stack
- Vite + TypeScript + Three.js browser client
- Node.js + Express + Socket.IO realtime service
- Supabase PostgreSQL schema for future authenticated saved progress
- Netlify frontend; Render realtime service

## Local setup
Node.js 22+ and npm 10+:
```sh
npm install
npm run build
```
Run client and server separately with `npm run dev --workspace client` and `npm run dev --workspace server`.

## Hosting
Netlify: build `npm run build:client`, publish `client/dist`.
Render: build `npm install && npm run build:server`, start `npm run start:server`.
Set `VITE_SERVER_URL` to the Render URL and `CLIENT_ORIGIN` to the Netlify URL. Apply the SQL migration in Supabase.

This is an initial foundation/blockout, not a complete recreation. Puzzle logic, full level maps, authoritative movement, accounts, and saved-game integration remain future work. Never put service-role secrets in browser environment variables.
