import assert from "node:assert/strict";
import test from "node:test";
import { applyMove } from "./engine.js";
import { blankNotes } from "./store.js";
import { generateSudoku } from "./sudoku.js";

const makeBoardState = (overrides = {}) => ({
  board: new Array(81).fill(0),
  notes: blankNotes(),
  mistakes: 0,
  ...overrides,
});

test("applyMove: ignores clicks on given puzzle cells", () => {
  const { puzzle, solution } = generateSudoku("Easy", 12345);
  const firstGiven = puzzle.findIndex(Boolean);
  const state = makeBoardState({ board: [...puzzle] });

  const res = applyMove(state, { type: "digit", cell: firstGiven, digit: 5, inputMode: "value" }, puzzle, solution);
  assert.equal(res.changed, false);
});

test("applyMove: toggles notes in note mode", () => {
  const { puzzle, solution } = generateSudoku("Easy", 12345);
  const blankCell = puzzle.findIndex((v) => !v);
  const state = makeBoardState({ board: [...puzzle] });

  // Add note 3
  const res1 = applyMove(state, { type: "digit", cell: blankCell, digit: 3, inputMode: "note" }, puzzle, solution);
  assert.equal(res1.changed, true);
  assert.deepEqual(res1.notes[blankCell], [3]);

  // Add note 7
  const res2 = applyMove(res1, { type: "digit", cell: blankCell, digit: 7, inputMode: "note" }, puzzle, solution);
  assert.deepEqual(res2.notes[blankCell], [3, 7]);

  // Remove note 3
  const res3 = applyMove(res2, { type: "digit", cell: blankCell, digit: 3, inputMode: "note" }, puzzle, solution);
  assert.deepEqual(res3.notes[blankCell], [7]);
});

test("applyMove: handles correct value move and clears peer notes", () => {
  const { puzzle, solution } = generateSudoku("Easy", 12345);
  const blankCell = puzzle.findIndex((v) => !v);
  const correctDigit = solution[blankCell];
  const notes = blankNotes();
  const state = makeBoardState({ board: [...puzzle], notes });

  const res = applyMove(state, { type: "digit", cell: blankCell, digit: correctDigit, inputMode: "value" }, puzzle, solution);
  assert.equal(res.changed, true);
  assert.equal(res.board[blankCell], correctDigit);
  assert.equal(res.isCorrect, true);
  assert.equal(res.mistakes, 0);
});

test("applyMove: handles incorrect value move and increments mistakes", () => {
  const { puzzle, solution } = generateSudoku("Easy", 12345);
  const blankCell = puzzle.findIndex((v) => !v);
  const wrongDigit = solution[blankCell] === 9 ? 1 : solution[blankCell] + 1;
  const state = makeBoardState({ board: [...puzzle], mistakes: 1 });

  const res = applyMove(state, { type: "digit", cell: blankCell, digit: wrongDigit, inputMode: "value" }, puzzle, solution);
  assert.equal(res.changed, true);
  assert.equal(res.board[blankCell], wrongDigit);
  assert.equal(res.isCorrect, false);
  assert.equal(res.mistakes, 2);
});

test("applyMove: erase clears value and notes", () => {
  const { puzzle, solution } = generateSudoku("Easy", 12345);
  const blankCell = puzzle.findIndex((v) => !v);
  const board = [...puzzle];
  board[blankCell] = 5;
  const notes = blankNotes();
  const state = makeBoardState({ board, notes });

  // Erase filled cell
  const res1 = applyMove(state, { type: "erase", cell: blankCell }, puzzle, solution);
  assert.equal(res1.changed, true);
  assert.equal(res1.board[blankCell], 0);
});

test("applyMove: hint reveals correct digit", () => {
  const { puzzle, solution } = generateSudoku("Easy", 12345);
  const blankCell = puzzle.findIndex((v) => !v);
  const state = makeBoardState({ board: [...puzzle] });

  const res = applyMove(state, { type: "hint", cell: blankCell }, puzzle, solution);
  assert.equal(res.changed, true);
  assert.equal(res.board[blankCell], solution[blankCell]);
  assert.equal(res.isCorrect, true);
});
