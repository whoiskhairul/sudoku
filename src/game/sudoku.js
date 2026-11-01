/* Pure Sudoku generation and solving helpers.
   Kept dependency-free so it can be unit tested with `node --test`. */

export const difficulties = {
  Easy: 34,
  Medium: 42,
  Hard: 48,
  Expert: 53,
  Master: 57,
  Extreme: 61,
};

const FULL_MASK = 0x1ff;

export const cellPeers = (idx) => {
  const row = Math.floor(idx / 9);
  const col = idx % 9;
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  const peers = new Set();
  for (let i = 0; i < 9; i += 1) {
    peers.add(row * 9 + i);
    peers.add(i * 9 + col);
  }
  for (let r = boxRow; r < boxRow + 3; r += 1) {
    for (let c = boxCol; c < boxCol + 3; c += 1) peers.add(r * 9 + c);
  }
  peers.delete(idx);
  return [...peers];
};

// xorshift32: better distribution than the old linear congruential generator.
export function seeded(seed) {
  let value = (Number(seed) >>> 0) || 0x9e3779b9;
  return () => {
    value ^= value << 13;
    value >>>= 0;
    value ^= value >>> 17;
    value ^= value << 5;
    value >>>= 0;
    return value / 4294967296;
  };
}

export function shuffled(items, rand) {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

const popcount = (mask) => {
  let count = 0;
  let value = mask;
  while (value) {
    value &= value - 1;
    count += 1;
  }
  return count;
};

const boxIndex = (idx) => Math.floor(idx / 27) * 3 + Math.floor((idx % 9) / 3);

/**
 * Counts solutions of a puzzle, stopping at `limit`.
 * Uses bitmask rows/columns/boxes with MRV ordering.
 */
export function countSolutions(puzzle, limit = 2) {
  const grid = Array.isArray(puzzle) ? [...puzzle] : [];
  if (grid.length !== 81) return 0;
  const rows = new Array(9).fill(0);
  const cols = new Array(9).fill(0);
  const boxes = new Array(9).fill(0);

  for (let i = 0; i < 81; i += 1) {
    const value = Number(grid[i]) || 0;
    if (!value) continue;
    if (value < 1 || value > 9) return 0;
    const bit = 1 << (value - 1);
    const r = Math.floor(i / 9);
    const c = i % 9;
    const b = boxIndex(i);
    if (rows[r] & bit || cols[c] & bit || boxes[b] & bit) return 0;
    rows[r] |= bit;
    cols[c] |= bit;
    boxes[b] |= bit;
  }

  let count = 0;
  const search = () => {
    if (count >= limit) return;
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (let i = 0; i < 81; i += 1) {
      if (grid[i]) continue;
      const r = Math.floor(i / 9);
      const c = i % 9;
      const b = boxIndex(i);
      const mask = FULL_MASK & ~(rows[r] | cols[c] | boxes[b]);
      const options = popcount(mask);
      if (options === 0) return;
      if (options < bestCount) {
        best = i;
        bestMask = mask;
        bestCount = options;
        if (options === 1) break;
      }
    }
    if (best === -1) {
      count += 1;
      return;
    }
    const r = Math.floor(best / 9);
    const c = best % 9;
    const b = boxIndex(best);
    let mask = bestMask;
    while (mask) {
      const bit = mask & -mask;
      mask ^= bit;
      const value = 32 - Math.clz32(bit);
      grid[best] = value;
      rows[r] |= bit;
      cols[c] |= bit;
      boxes[b] |= bit;
      search();
      grid[best] = 0;
      rows[r] ^= bit;
      cols[c] ^= bit;
      boxes[b] ^= bit;
      if (count >= limit) return;
    }
  };

  search();
  return count;
}

export const isSolvedBoard = (board, solution) =>
  Array.isArray(board) &&
  Array.isArray(solution) &&
  board.length === 81 &&
  solution.length === 81 &&
  board.every((value, idx) => value === solution[idx]);

// True when every position that belongs to `digit` is already correctly filled,
// so the digit can no longer be placed. Wrong entries never disable a digit.
export const digitIsComplete = (board, solution, digit) => {
  if (!Array.isArray(board) || !Array.isArray(solution)) return false;
  for (let i = 0; i < 81; i += 1) {
    if (solution[i] === digit && board[i] !== digit) return false;
  }
  return true;
};

const buildSolution = (rand) => {
  const pattern = (r, c) => (r * 3 + Math.floor(r / 3) + c) % 9;
  const rows = shuffled([0, 1, 2], rand).flatMap((group) =>
    shuffled([0, 1, 2], rand).map((r) => group * 3 + r),
  );
  const cols = shuffled([0, 1, 2], rand).flatMap((group) =>
    shuffled([0, 1, 2], rand).map((c) => group * 3 + c),
  );
  const nums = shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9], rand);
  return rows.flatMap((r) => cols.map((c) => nums[pattern(r, c)]));
};

/**
 * Generates a puzzle with a guaranteed unique solution.
 * Cells are removed only while the solution stays unique, so high
 * difficulties can end up with slightly more givens than the target.
 */
export function generateSudoku(difficulty, seed = Date.now()) {
  const targetBlanks = difficulties[difficulty] ?? difficulties.Medium;
  // Harder targets can stall during digging, so try a few full grids and keep
  // the emptiest unique puzzle. Deterministic for a given seed.
  const attempts = targetBlanks >= difficulties.Master ? 3 : 1;
  let best = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const rand = seeded((Number(seed) >>> 0) + attempt * 0x9e3779b9);
    const solution = buildSolution(rand);
    const puzzle = [...solution];
    let blanks = 0;

    for (const idx of shuffled([...Array(81).keys()], rand)) {
      if (blanks >= targetBlanks) break;
      const value = puzzle[idx];
      puzzle[idx] = 0;
      if (countSolutions(puzzle, 2) === 1) blanks += 1;
      else puzzle[idx] = value;
    }

    if (!best || blanks > best.blanks) best = { puzzle, solution, seed, blanks };
    if (best.blanks >= targetBlanks) break;
  }

  return best;
}
