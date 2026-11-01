# Sudostrike

> Real-time competitive multiplayer Sudoku and daily challenge web app built with React 19, Vite, Zustand, and WebSockets.

Sudostrike is a fast, modern Sudoku application featuring real-time multiplayer racing, a daily calendar puzzle mode, solo play, and extensive keyboard and accessibility support.

---

## Game Modes

- **Multiplayer Match:** Create a private room with a 6-character code, share a direct URL or QR code, and race head-to-head in real time. Features live opponent progress tracking, mistake counters, unanimous pause/resume voting, player kicking in lobby, and rematch flow.
- **Solo Mode:** Instantly jump into a local match to practice or play at your own pace without waiting for a lobby.
- **Daily Challenge:** A calendar-based daily puzzle deterministically seeded by date, with difficulty rotating across days of the week. Progress, completion times, and mistakes are automatically tracked across the month.

---

## Key Features

- **Guaranteed Unique Puzzles:** Every generated puzzle is verified by a bitmask backtracking solver to ensure exactly one valid solution.
- **5 Difficulty Levels:** Easy, Medium, Hard, Master, and Extreme.
- **Input Modes & Notes:** Value placement and pencil (candidate) note-taking with automatic removal of conflicting peer notes.
- **Mistake Tracking & Hints:** Tracks mistakes per player (3 mistakes results in elimination, with spectate and continue modes available); up to 2 hints available per game.
- **Themes & Sound:** Four visual themes (Nordic, Cyberpunk, Pastel, Sepia) with light and dark modes. Web Audio sound effects with persistent mute toggle and gesture unlocking.
- **Local Stats Dashboard:** Tracks games played, wins, losses, win rate, best times per difficulty, and recent mistake trends with a visual chart.
- **Full Keyboard Navigation:** Navigate the 9x9 grid with arrow keys, enter numbers with 1–9, toggle note mode with Space, undo with Z, and erase with Backspace/Delete.

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18+ (Node.js 20+ recommended)
- `npm` v9+

---

## Getting Started

1. Clone the repository and enter the project directory:

```bash
git clone <repository-url>
cd sudoku
```

2. Install dependencies:

```bash
npm install
```

3. Run the development server:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser. Vite automatically attaches the room relay WebSocket endpoint during local development.

---

## Running Tests

Run the built-in Node test suite:

```bash
npm test
```

Tests cover puzzle generation uniqueness, bitmask solving, the move engine (`applyMove`), state normalization, monotonic room relay revision merges, presence resolution, date key validation, and time tracking.

---

## Production Build & Server

Build the client assets:

```bash
npm run build
```

Run the production server (serves static assets and provides the WebSocket relay at `/room-ws`):

```bash
npm start
# or: npm run server
```

By default, the server listens on `http://0.0.0.0:5174`. Set `PORT` in your environment or `.env` to customize the listening port.

---

## Project Architecture

```
sudoku/
├── server.js              # Production static file server + WebSocket relay host
├── roomRelay.js           # In-memory WebSocket room relay with room revision tracking
├── vite.config.js         # Vite configuration with embedded dev WebSocket relay
├── src/
│   ├── main.jsx           # React root bootstrap and error boundary
│   ├── App.jsx            # Application shell, screens, overlays, and board UI
│   ├── styles.css         # Theme CSS variables, Tailwind styles, and grid rules
│   ├── audio/
│   │   └── sound.js       # Web Audio API singleton with mute toggle & audio unlock
│   ├── persist/
│   │   └── storage.js     # Safe localStorage wrapper with quota guards
│   └── game/
│       ├── engine.js      # Pure Sudoku move engine (applyMove)
│       ├── engine.test.js # Move engine unit tests
│       ├── formatters.js  # Time and player status formatting helpers
│       ├── relay.test.js  # Monotonic relay revision & merge tests
│       ├── store.js       # Zustand store: rooms, daily challenge, stats & snacks
│       ├── store.test.js  # Store normalization, presence, & timer unit tests
│       ├── sudoku.js      # Sudoku generator and bitmask solver
│       └── sudoku.test.js # Solver uniqueness, blanks, & seed determinism tests
```

---

## Relay Protocol & Synchronization

- **Local Discovery:** When playing across multiple tabs on the same device, rooms synchronize immediately via `BroadcastChannel`.
- **Cross-Device Relay:** Connected clients publish state updates and subscribe to room codes via `/room-ws`.
- **Monotonic Revisioning:** Room states carry monotonic revision counters (`rev`) to reject stale snapshots and resolve concurrent updates cleanly.
- **Heartbeat & Presence:** Clients exchange lightweight presence heartbeats every 2.5 seconds to track online/offline voters and spectator states without rebroadcasting full board snapshots.
