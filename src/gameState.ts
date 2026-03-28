/**
 * Gameplay state: tracks selected colour, fill attempts, and progress.
 */

import type { PuzzleData } from "./puzzleGenerator";

export interface GameState {
  puzzle: PuzzleData;
  /** Currently active palette index (-1 = none) */
  selectedColor: number;
  filledCount: number;
  completed: boolean;
}

export type FillResult = "correct" | "wrong" | "already";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createGameState(puzzle: PuzzleData): GameState {
  return {
    puzzle,
    selectedColor: -1,
    filledCount: 0,
    completed: false,
  };
}

/**
 * Attempt to fill the cell at (col, row) with the currently selected colour.
 * Returns the outcome so the renderer can give feedback.
 */
export function fillCell(
  state: GameState,
  col: number,
  row: number,
): FillResult {
  if (state.selectedColor < 0) return "wrong";

  const cell = state.puzzle.cells[row]?.[col];
  if (!cell) return "wrong";
  if (cell.filled) return "already";

  if (cell.colorIndex !== state.selectedColor) return "wrong";

  cell.filled = true;
  state.filledCount++;

  if (state.filledCount >= state.puzzle.totalCells) {
    state.completed = true;
  }

  return "correct";
}

/** Progress as a value between 0 and 100 */
export function getProgress(state: GameState): number {
  if (state.puzzle.totalCells === 0) return 0;
  return Math.round((state.filledCount / state.puzzle.totalCells) * 100);
}

/**
 * Return the number of unfilled cells for a given palette index.
 */
export function remainingForColor(state: GameState, colorIndex: number): number {
  let count = 0;
  for (const row of state.puzzle.cells) {
    for (const cell of row) {
      if (cell.colorIndex === colorIndex && !cell.filled) count++;
    }
  }
  return count;
}
