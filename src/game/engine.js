import { cellPeers, digitIsComplete, isSolvedBoard } from "./sudoku.js";

/**
 * Pure move engine for both Daily and Multiplayer/Solo room modes (#47).
 *
 * @param {Object} state - Current board state
 * @param {number[]} state.board - 81-length array of cell numbers
 * @param {number[][]} state.notes - 81-length array of candidate digit arrays
 * @param {number} [state.mistakes=0] - Current mistake count
 * @param {Object} action - Action descriptor
 * @param {string} action.type - "digit" | "erase" | "hint"
 * @param {number} action.cell - Target index 0..80
 * @param {number} [action.digit] - Digit 1..9 (for "digit" action)
 * @param {"value"|"note"} [action.inputMode="value"] - "value" or "note"
 * @param {number[]} puzzle - 81-length puzzle givens array
 * @param {number[]} solution - 81-length full solution array
 *
 * @returns {Object} Result of move:
 *   { changed: boolean, board: number[], notes: number[][], mistakes: number, isSolved: boolean, isCorrect: boolean | null, snapshot: Object }
 */
export function applyMove(state, action, puzzle, solution) {
  const { board: currentBoard, notes: currentNotes, mistakes: currentMistakes = 0 } = state;
  const { type, cell, digit, inputMode = "value" } = action;

  // Unchanged result helper
  const noChange = {
    changed: false,
    board: currentBoard,
    notes: currentNotes,
    mistakes: currentMistakes,
    isSolved: false,
    isCorrect: null,
    snapshot: null,
  };

  if (cell === null || cell === undefined || cell < 0 || cell >= 81) return noChange;
  if (!Array.isArray(puzzle) || puzzle.length !== 81 || !Array.isArray(solution) || solution.length !== 81) return noChange;
  if (puzzle[cell]) return noChange; // Cannot modify fixed givens

  // Deep copy snapshot before any mutation
  const snapshot = {
    board: [...currentBoard],
    notes: currentNotes.map((n) => [...n]),
  };

  if (type === "digit") {
    if (!digit || digit < 1 || digit > 9) return noChange;

    if (inputMode === "note") {
      if (currentBoard[cell]) return noChange; // Cannot add notes to filled cells
      const nextNotes = currentNotes.map((n) => [...n]);
      const cellNotes = nextNotes[cell];
      nextNotes[cell] = cellNotes.includes(digit)
        ? cellNotes.filter((n) => n !== digit)
        : [...cellNotes, digit].sort();

      return {
        changed: true,
        board: [...currentBoard],
        notes: nextNotes,
        mistakes: currentMistakes,
        isSolved: false,
        isCorrect: null,
        snapshot,
      };
    }

    // Value mode
    if (digitIsComplete(currentBoard, solution, digit)) return noChange;
    if (currentBoard[cell] === digit) return noChange;

    const nextBoard = [...currentBoard];
    const nextNotes = currentNotes.map((n) => [...n]);
    nextBoard[cell] = digit;
    nextNotes[cell] = [];

    const isCorrect = solution[cell] === digit;
    let nextMistakes = currentMistakes;

    if (isCorrect) {
      cellPeers(cell).forEach((peerIdx) => {
        nextNotes[peerIdx] = nextNotes[peerIdx].filter((n) => n !== digit);
      });
    } else {
      nextMistakes += 1;
    }

    const isSolved = isCorrect && isSolvedBoard(nextBoard, solution);

    return {
      changed: true,
      board: nextBoard,
      notes: nextNotes,
      mistakes: nextMistakes,
      isSolved,
      isCorrect,
      snapshot,
    };
  }

  if (type === "erase") {
    const hasValue = Boolean(currentBoard[cell]);
    const hasNotes = currentNotes[cell] && currentNotes[cell].length > 0;
    if (!hasValue && !hasNotes) return noChange;

    const nextBoard = [...currentBoard];
    const nextNotes = currentNotes.map((n) => [...n]);
    nextBoard[cell] = 0;
    nextNotes[cell] = [];

    return {
      changed: true,
      board: nextBoard,
      notes: nextNotes,
      mistakes: currentMistakes,
      isSolved: false,
      isCorrect: null,
      snapshot,
    };
  }

  if (type === "hint") {
    const targetDigit = solution[cell];
    if (currentBoard[cell] === targetDigit) return noChange;

    const nextBoard = [...currentBoard];
    const nextNotes = currentNotes.map((n) => [...n]);
    nextBoard[cell] = targetDigit;
    nextNotes[cell] = [];

    cellPeers(cell).forEach((peerIdx) => {
      nextNotes[peerIdx] = nextNotes[peerIdx].filter((n) => n !== targetDigit);
    });

    const isSolved = isSolvedBoard(nextBoard, solution);

    return {
      changed: true,
      board: nextBoard,
      notes: nextNotes,
      mistakes: currentMistakes,
      isSolved,
      isCorrect: true,
      snapshot,
    };
  }

  return noChange;
}

