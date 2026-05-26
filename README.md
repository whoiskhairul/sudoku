# Vibe

> A lightweight real-time web experience built with React, Vite, Tailwind, and LiveKit.

Vibe is a small multiplayer/room-based game or social experience that uses LiveKit for real-time audio/video and WebSocket relay for lightweight server-side logic. It's built with modern tooling (Vite + React) and Tailwind for styling.

## Features

- Real-time audio/video rooms using LiveKit
- Lightweight Node server for relay and session handling
- Modern frontend with React and Tailwind CSS
- Fast development with Vite
- QR code support for quick room joining

## Demo / How to Play

1. Start the development frontend and server locally (see Installation).
2. Open the app in your browser (default Vite host shown below).
3. Create or join a room. Share the room link or QR code with friends.
4. Use your microphone/camera to participate in real-time audio/video.

The exact in-game controls depend on the UI presented in the running app.

## Prerequisites

- Node.js 18+ (or a recent LTS release)
- npm (or yarn)
- A LiveKit deployment or account (if you want full audio/video features)

## Installation

1. Clone the repository and change into the project folder:

```bash
git clone <your-repo-url>
cd vibe
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env` in the project root to store server environment variables (if using LiveKit). Typical variables you may need:

```
LIVEKIT_API_KEY=your_key
LIVEKIT_API_SECRET=your_secret
LIVEKIT_URL=https://your-livekit-host

# Any other env vars required by your server (see server.js)
```

## Running Locally

- Start the frontend dev server:

```bash
npm run dev
```

- Start the Node relay/server (if used):

```bash
npm run server
```

The frontend Vite server runs on the host configured by Vite (by default `http://localhost:5173`). If you run both frontend and server locally, the app should connect to the server and enable room creation/join flows.

## Build for Production

```bash
npm run build
npm run preview
```

## Project Structure

- `index.html` — App entry HTML
- `src/` — React source code
- `src/main.jsx` & `src/App.jsx` — App bootstrap and main component
- `server.js` — Lightweight Node server/relay
- `roomRelay.js` — WebSocket relay helper
- `tailwind.config.js` & `postcss.config.js` — Tailwind setup
- `vite.config.js` — Vite configuration

Adjust paths and filenames as you extend the project.

## Environment & LiveKit Notes

- To enable LiveKit audio/video you need a LiveKit deployment or the hosted LiveKit cloud. Provide the API key/secret and URL in your `.env` and start the server with `npm run server` so the server can mint room/join tokens.
- If you don't configure LiveKit, the app may still run in a limited local-only mode depending on the front-end logic.

## Contributing

- Feel free to open issues or PRs.
- Follow standard GitHub workflows: fork, branch, commit, and open a PR with a clear description.

## Troubleshooting

- If you get CORS or connection errors, ensure the server is running and your environment variables are correct.
- If ports conflict, adjust Vite host/port in `vite.config.js` or start with `--port`.

## License

This project doesn't include a license in the repository by default. Add a `LICENSE` file if you want to specify one.

---

If you'd like, I can also:

- Add example `.env.example` with the most common variables
- Add a short CONTRIBUTING.md
- Add GitHub push instructions or help set up a remote and push your code

Tell me which of these you'd like next.
