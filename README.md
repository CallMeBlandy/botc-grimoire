# Blood on the Clocktower — Personal Grimoire

A self-hosted digital grimoire for **Blood on the Clocktower**. One device runs
a small server on your WiFi; everyone else joins from their phone's browser — no
app install, no internet needed once set up. A **human Storyteller** runs the
game; the app is their grimoire plus private role reveals to each player.

Supports all three base scripts: **Trouble Brewing**, **Bad Moon Rising**, and
**Sects & Violets**.

> Character text and token art are © The Pandemonium Institute. This project
> ships none of it — `npm run fetch-roles` downloads it onto your machine from
> the open community dataset for personal play. Please support the official game.

## First-time setup

```bash
npm install
npm run fetch-roles   # downloads character data + token icons (needs internet, once)
```

## Play a game

```bash
npm run serve         # builds the UI and starts the server
```

The console prints URLs, e.g. `http://192.168.1.20:3000`.

- **Storyteller:** open that URL on your laptop/tablet → *Storyteller* → pick a
  script → *Create game*. Tap the code chip to show a **QR code** for players.
- **Players:** scan the QR (or open the URL and type the 4-letter code), enter a
  name, and wait. Their role appears on their phone once you reveal it.

Everyone must be on the **same WiFi**. Game state is saved to `data/rooms.json`,
so restarting the server or refreshing a phone keeps the game going.

## What the Storyteller can do

- Seat players (auto-seated as they join, or add empty seats)
- Assign characters, and privately **reveal** each to that player's phone
- Set the 3 **demon bluffs**
- Add/remove **reminder tokens** on any seat
- Mark players **dead/alive**; track **ghost votes**
- Step through **Night / Day** phases
- Open the **night order** sheet (first night / other nights) for in-play roles
- Run **nominations & voting**; players vote from their phones, tally updates live

## Development

```bash
npm run dev           # Vite on :5173 (client) + Node on :3000 (API/WS), hot reload
```

Use `npm run serve` for actual play — it serves everything from one port so
phones can reach it.

## How it works

- `server/` — Node + Express + `ws`. Rooms, per-recipient state filtering
  (host sees the full grimoire; players see only public info + their own revealed
  role), JSON persistence.
- `src/` — React + TypeScript. Storyteller grimoire and the player phone view.
- `scripts/fetch-roles.mjs` — pulls character data + icons locally.
- `scripts/smoke-ws.mjs` — end-to-end WebSocket test (`node scripts/smoke-ws.mjs`
  against a running server).

## Roadmap ideas

- Drag-to-reorder seats; drag reminders onto seats
- Push evil-team info & bluffs to the Demon/Minions automatically at night
- Fabled, Travellers polish, and homebrew/custom scripts
- Timers, execution history, and a game log
