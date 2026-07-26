# Project Overview

## What This App Is

Sudoku Versus is a real-time Sudoku game built with React, Vite, Zustand, Tailwind CSS, Framer Motion, and a lightweight WebSocket room relay. It supports competitive multiplayer room play, solo play, and a date-based daily challenge mode.

The app is designed around fast puzzle play, shared room state, local persistence, and a responsive interface that works on desktop and mobile.

## Core Architecture

- Frontend UI is rendered from React in src/App.jsx and bootstrapped in src/main.jsx.
- Application state is managed with Zustand in src/game/store.js.
- Styling uses Tailwind utility classes plus custom CSS variables and component rules in src/styles.css.
- Multiplayer rooms are synchronized locally through localStorage, across tabs through BroadcastChannel, and across devices through WebSocket.
- The production server in server.js serves the built app and exposes a room relay WebSocket endpoint.
- The Vite dev server also attaches the same relay during development through vite.config.js.

## Main Functionalities

### Home Screen

- Lets the user choose a theme from Nordic, Cyberpunk, Pastel, or Sepia.
- Lets the user toggle between light and dark mode.
- Shows a landing section describing the game.
- Provides room creation for multiplayer play.
- Provides solo play that immediately starts a room locally.
- Provides room joining by code.
- Shows a daily challenge calendar with selectable dates.
- Shows a local dashboard with performance stats and best times.

### Room Creation and Joining

- Creates a new room with a randomly generated 6-character room code.
- Generates a Sudoku puzzle for the selected difficulty.
- Stores the room in localStorage so it can be recovered on the same device.
- Joins a room from localStorage when the room exists on the current device.
- Falls back to the WebSocket relay when the room must be fetched from another device.
- Supports joining by room code from the home page or from a room query parameter in the URL.
- Supports returning to a room through browser navigation and URL history updates.
- Supports copying the room code and room link.
- Shows a QR code for the room link.

### Lobby Flow

- Starts room play in a lobby state before the game begins.
- Requires players to ready up before the puzzle starts.
- Shows the readiness state for all players in the room.
- Only starts the countdown when every online player is ready and there are at least two players.
- Shows a message when the room cannot start because there are not enough players.

### Competitive Room Gameplay

- Shows a shared 9x9 Sudoku board.
- Lets the active player select cells and enter values.
- Lets the active player switch between value entry and note entry.
- Supports keyboard control with arrows, digits, Backspace, Delete, Z for undo, and Space for toggling note mode.
- Highlights the selected cell, peers in the same row, column, or box, and matching digits.
- Marks incorrect user entries visually.
- Disables interaction for spectators and eliminated players.
- Tracks mistakes per player.
- Ends the match when one player solves the puzzle first with at most two mistakes.
- Awards a winner and stores room end state.
- Allows players to continue solving after losing through continue mode.
- Allows players to spectate another active player after losing.
- Displays a winner overlay when the match is won.
- Displays an end dialog for lost or ended games.
- Displays a personal solved dialog for players who finish in continue mode.

### Countdown and Match Start

- Starts room games with a 3-second countdown.
- Shows a full-screen countdown overlay.
- Transitions the room from countdown to playing automatically when the timer expires.
- Updates the room start time when the countdown finishes.

### Pause and Resume Voting

- Supports pause and resume by vote from online players.
- Tracks who voted to pause or resume.
- Only considers currently online players as valid voters.
- Pauses the board visually and blocks interaction while paused.
- Resumes the game when all eligible voters agree.
- Tracks total paused time so the timer remains accurate.

### Rematch Flow

- Lets players vote for a rematch after a finished match.
- Starts a new puzzle only when all online players vote unanimously.
- Resets the room to a countdown state before the new round begins.
- Regenerates the puzzle for the room difficulty.
- Resets player state for the new round.

### Player Presence and Live Progress

- Tracks each player’s connected state and last seen timestamp.
- Shows online and offline indicators in the player list.
- Shows each player’s progress percentage.
- Shows each player’s mistake count.
- Shows finish time for players who complete the puzzle.
- Lets the room owner kick players during the lobby.
- Prevents the owner from kicking themself.
- Removes kicked players from the room state and marks them in kicked history.
- Notifies a player when they were removed from the room.

### Game Input and Board Editing

- Supports number-pad style input through on-screen buttons.
- Supports note-taking mode for candidate numbers.
- Supports value mode for placing actual digits.
- Supports undo of the last move.
- Supports erasing the selected cell.
- Removes peer notes automatically when a value is placed.
- Prevents duplicate placement of a number more than nine times.
- Prevents editing fixed puzzle cells.
- Tracks move history for undo and board restoration.

### Hints

- Hint logic exists in the shared game store for both room and daily modes.
- Hints fill the selected cell with the correct number.
- Hints clear conflicting peer notes.
- Hints are limited to two uses per board.
- The current visible hint buttons in the UI are disabled, so the hint action is implemented but not exposed as an active control in the present interface.

### Daily Challenge Mode

- Lets the user open a daily board by selecting a date from the calendar.
- Generates a deterministic board from the date key.
- Uses a difficulty rotation based on the day of the week.
- Blocks future dates and only allows today or past dates.
- Persists daily progress in localStorage.
- Restores the board snapshot and notes when reopening the daily challenge.
- Tracks daily status as not started, in progress, or solved.
- Tracks daily mistakes.
- Tracks daily hints used.
- Tracks daily elapsed time.
- Allows undo and erase in the daily board.
- Allows toggling between value input and note input.
- Allows pausing and resuming the daily board.
- Allows resetting the daily challenge to try again.
- Lets the user copy a shareable daily link.
- Shows a QR code for the daily link.
- Shows a completion celebration overlay when the daily board is solved.

### Daily Calendar and Daily Progress

- Displays a month grid calendar on the home screen.
- Lets the user move between months.
- Marks solved days with a check badge.
- Shows status markers for solved, in progress, and not started days.
- Disables future days.
- Shows the selected date, its difficulty, and its current progress state.
- Lets the user launch the selected daily board directly.

### Stats and Local Dashboard

- Tracks local play stats in localStorage.
- Tracks games played.
- Tracks wins.
- Tracks losses.
- Tracks win rate.
- Tracks average mistakes.
- Tracks clean runs with zero mistakes.
- Tracks best times by difficulty.
- Tracks recent mistake history.
- Visualizes recent mistake history with a bar chart.
- Shows mistake count tooltips when hovering or focusing bars.

### Keyboard and Mobile Behavior

- Supports keyboard-only play.
- Prevents keyboard shortcuts from firing inside text inputs and editable controls.
- Navigates the selected cell with arrow keys in both room and daily modes.
- Switches input mode with Space.
- Scrolls the active board into view on small screens.
- Keeps the interface usable on mobile with responsive grids and button layouts.

## Persistence and Synchronization

- Stores the current player identity in localStorage.
- Stores room state in localStorage under a room-specific key.
- Stores daily progress in localStorage under a dedicated key.
- Stores stats in localStorage.
- Uses BroadcastChannel to sync room updates between tabs on the same device.
- Uses WebSocket to sync room updates between devices when the relay is available.
- Retries WebSocket connections automatically.
- Cleans up empty stale rooms after a timeout.
- Merges room presence data so older presence states do not overwrite newer ones.
- Synchronizes URL state for room and daily modes.

## Server Behavior

- server.js serves the production build from dist.
- server.js falls back to index.html so SPA routes continue to work.
- server.js exposes a WebSocket relay at /room-ws.
- roomRelay.js stores rooms in memory for cross-device sharing during the server process lifetime.
- roomRelay.js accepts publish messages to update room state.
- roomRelay.js accepts get messages to fetch a room by code.
- roomRelay.js broadcasts updated room state to connected clients.
- roomRelay.js removes rooms after they have been empty and offline for long enough.
- vite.config.js attaches the same relay to the dev server so local development matches production behavior.

## Styling and Presentation

- Uses CSS variables to define theme colors.
- Supports four named visual themes.
- Uses custom button styles for primary, secondary, and icon actions.
- Styles Sudoku cells, notes, selected states, peer highlights, mistakes, and fixed cells.
- Adds animated feedback for wrong input, digit completion, countdowns, winner overlays, and daily completion.
- Uses a responsive two-column layout on large screens and stacked layout on smaller screens.
- Uses Framer Motion for modal, overlay, and celebration animations.

## File Map

- index.html: HTML shell that mounts the React app.
- src/main.jsx: React root bootstrap and global stylesheet import.
- src/App.jsx: Application shell, screens, room UI, daily UI, overlays, and interaction handling.
- src/game/store.js: State store, Sudoku generation, persistence, room actions, daily actions, and sync helpers.
- src/game/formatters.js: Time and player status formatting helpers.
- src/styles.css: Theme tokens, component styles, board styles, and animations.
- server.js: Production static server and WebSocket room relay host.
- roomRelay.js: In-memory WebSocket room relay and cleanup logic.
- vite.config.js: Vite build and dev configuration.
- tailwind.config.js: Tailwind configuration and theme extensions.
- postcss.config.js: PostCSS setup.