# Sudoku

> A clean, responsive Sudoku web game built with React, Vite, and Tailwind.

Sudoku is a classic single-player logic puzzle implemented as a modern web app. This project provides a responsive UI, puzzle generation, keyboard support, and helpful gameplay tools (hints, pencil marks, undo, and timer).

## Features

- Multiple difficulty levels (Easy, Medium, Hard, Expert)
- Puzzle generator with unique-solution puzzles
- Intuitive keyboard and mouse input
- Pencil (candidate) marks and quick notes
- Hints, undo/redo, and puzzle reset
- Responsive layout for desktop and mobile
- Save/load your current puzzle in local storage

## How to Play

1. Choose a difficulty or load a saved puzzle.
2. Fill the 9x9 grid so each row, column, and 3x3 box contains the digits 1 through 9 exactly once.
3. Use pencil mode to jot candidate numbers, use hints for help, and use undo to backtrack.

This app focuses on a smooth, distraction-free Sudoku experience—rules are enforced by the UI to prevent invalid entries.

## Prerequisites

- Node.js 18+ (or a recent LTS release)
- npm (or yarn)

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

## Running Locally

- Start the frontend dev server:

```bash
npm run dev
```

Open the app in your browser at the address shown by Vite (by default `http://localhost:5173`).

## Build for Production

```bash
npm run build
npm run preview
```

## Project Structure

- `index.html` — App entry HTML
- `src/` — React source code
- `src/main.jsx` & `src/App.jsx` — App bootstrap and main component
- `src/styles.css` — Tailwind styles and game UI styling
- `vite.config.js` — Vite configuration

Adjust paths and filenames as you extend the project.

## Contributing

- Open issues or PRs for bugs, improvements, or new features.
- Use feature branches and provide a clear description of changes.

## Troubleshooting

- If the dev server fails to start, ensure Node and npm are installed and re-run `npm install`.
- If UI styling looks incorrect, verify `tailwind.config.js` and `postcss.config.js` are present and configured.


