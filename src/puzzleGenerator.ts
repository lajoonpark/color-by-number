/**
 * Puzzle generator: converts a QuantizedImage into a flat grid of PuzzleCells.
 */

import type { QuantizedImage } from "./imageProcessor";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PuzzleCell {
  x: number;
  y: number;
  /** Index into PuzzleData.palette */
  colorIndex: number;
  /** Has the player correctly filled this cell? */
  filled: boolean;
}

export interface PuzzleData {
  cells: PuzzleCell[][];   // [row][col]
  palette: [number, number, number][];
  gridWidth: number;
  gridHeight: number;
  /** Total number of cells */
  totalCells: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function generatePuzzle(quantized: QuantizedImage): PuzzleData {
  const { width, height, palette, paletteIndices } = quantized;

  const cells: PuzzleCell[][] = [];
  for (let row = 0; row < height; row++) {
    cells[row] = [];
    for (let col = 0; col < width; col++) {
      const pixelIdx = row * width + col;
      cells[row][col] = {
        x: col,
        y: row,
        colorIndex: paletteIndices[pixelIdx],
        filled: false,
      };
    }
  }

  return {
    cells,
    palette,
    gridWidth: width,
    gridHeight: height,
    totalCells: width * height,
  };
}
