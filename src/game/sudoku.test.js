import assert from "node:assert/strict";
import test from "node:test";
import {
  countSolutions,
  difficulties,
  digitIsComplete,
  generateSudoku,
  isSolvedBoard,
} from "./sudoku.js";

const seeds = Array.from({ length: 12 }, (_, i) => 1000003 + i * 7919);

const isValidGrid = (grid) => {
  for (let r = 0; r < 9; r += 1) {
    const row = new Set(grid.slice(r * 9, r * 9 + 9));
    if (row.size !== 9) return false;
  }
  for (let c = 0; c < 9; c += 1) {
    const col = new Set(Array.from({ length: 9 }, (_, r) => grid[r * 9 + c]));
    if (col.size !== 9) return false;
  }
  for (let b = 0; b < 9; b += 1) {
    const values = new Set();
    const br = Math.floor(b / 3) * 3;
    const bc = (b % 3) * 3;
    for (let r = br; r < br + 3; r += 1) {
      for (let c = bc; c < bc + 3; c += 1) values.add(grid[r * 9 + c]);
    }
    if (values.size !== 9) return false;
  }
  return true;
};

test("every generated puzzle has exactly one solution", () => {
  for (const difficulty of Object.keys(difficulties)) {
    for (const seed of seeds) {
      const { puzzle, solution } = generateSudoku(difficulty, seed);
      assert.equal(puzzle.length, 81);
      assert.equal(solution.length, 81);
      assert.ok(isValidGrid(solution), `${difficulty}/${seed}: solution is not a valid grid`);
      for (let i = 0; i < 81; i += 1) {
        if (puzzle[i] !== 0) assert.equal(puzzle[i], solution[i]);
      }
      assert.equal(
        countSolutions(puzzle, 2),
        1,
        `${difficulty}/${seed}: puzzle has multiple or no solutions`,
      );
    }
  }
});

test("difficulty controls the number of blanks", () => {
  for (const difficulty of Object.keys(difficulties)) {
    const target = difficulties[difficulty];
    for (const seed of seeds) {
      const { puzzle, blanks } = generateSudoku(difficulty, seed);
      assert.equal(blanks, puzzle.filter((v) => v === 0).length);
      assert.ok(blanks <= target, `${difficulty}/${seed}: more blanks than target`);
      // Digging may stall on the hardest presets; allow a small shortfall.
      const slack = target >= difficulties.Master ? 6 : 0;
      assert.ok(
        blanks >= target - slack,
        `${difficulty}/${seed}: only ${blanks} blanks (target ${target})`,
      );
    }
  }
});

test("generation is deterministic for a seed", () => {
  const a = generateSudoku("Medium", 424242);
  const b = generateSudoku("Medium", 424242);
  assert.deepEqual(a.puzzle, b.puzzle);
  assert.deepEqual(a.solution, b.solution);
  assert.notDeepEqual(generateSudoku("Medium", 424243).puzzle, a.puzzle);
});

test("solver counts known boards", () => {
  const { puzzle, solution } = generateSudoku("Easy", 99);
  assert.equal(countSolutions(solution, 2), 1);
  assert.equal(countSolutions(puzzle, 2), 1);
  assert.equal(countSolutions(new Array(81).fill(0), 3), 3);
  assert.equal(countSolutions(new Array(80).fill(0), 2), 0);
  // Contradictory givens: two 5s in the same row.
  const bad = new Array(81).fill(0);
  bad[0] = 5;
  bad[1] = 5;
  assert.equal(countSolutions(bad, 2), 0);
});

test("completion helpers only look at the stored solution", () => {
  const { solution } = generateSudoku("Easy", 7);
  const board = [...solution];
  assert.equal(isSolvedBoard(board, solution), true);
  board[0] = 0;
  assert.equal(isSolvedBoard(board, solution), false);
  assert.equal(digitIsComplete(board, solution, solution[0]), false);

  // A full board where digit 1 sits in the wrong places must not count as complete.
  const wrong = [...solution];
  const idxOfOne = solution.indexOf(1);
  const idxOfTwo = solution.indexOf(2);
  wrong[idxOfOne] = 2;
  wrong[idxOfTwo] = 1;
  assert.equal(isSolvedBoard(wrong, solution), false);
  assert.equal(digitIsComplete(wrong, solution, 1), false);

  const offBy = [...solution];
  offBy[idxOfOne] = 0;
  assert.equal(digitIsComplete(offBy, solution, 1), false);
  assert.equal(digitIsComplete(offBy, solution, 2), true);
});
