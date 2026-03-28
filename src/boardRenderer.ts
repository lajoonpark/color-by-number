/**
 * Canvas-based board renderer.
 *
 * Draws every puzzle cell as a filled rectangle.  Unfilled cells show their
 * palette number; filled cells show their true colour.  The selected-colour
 * cell class is highlighted with a ring.
 */

import { rgbToHex } from "./imageProcessor";
import type { GameState } from "./gameState";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const FONT_SCALE = 0.5;   // font-size as fraction of cellSize
const MIN_FONT  = 7;       // minimum readable font size in px
const GRID_LINE = "#cccccc";
const UNFILLED_BG = "#f5f5f5";
const WRONG_FLASH_MS = 400;

// ---------------------------------------------------------------------------
// State kept between renders
// ---------------------------------------------------------------------------

let wrongFlashUntil = 0;
let wrongFlashCell: [number, number] | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Render the full board onto the given canvas. */
export function renderBoard(
  canvas: HTMLCanvasElement,
  state: GameState,
  cellSize: number,
): void {
  const { puzzle, selectedColor } = state;
  const { gridWidth, gridHeight, cells, palette } = puzzle;

  canvas.width  = gridWidth  * cellSize;
  canvas.height = gridHeight * cellSize;

  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const fontSize = Math.max(MIN_FONT, Math.floor(cellSize * FONT_SCALE));
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const now = Date.now();
  const showWrong = wrongFlashCell !== null && now < wrongFlashUntil;

  for (let row = 0; row < gridHeight; row++) {
    for (let col = 0; col < gridWidth; col++) {
      const cell = cells[row][col];
      const x = col * cellSize;
      const y = row * cellSize;

      // Background fill
      if (cell.filled) {
        ctx.fillStyle = rgbToHex(palette[cell.colorIndex]);
      } else {
        ctx.fillStyle = UNFILLED_BG;
      }
      ctx.fillRect(x, y, cellSize, cellSize);

      // Wrong-flash overlay
      if (
        showWrong &&
        wrongFlashCell![0] === col &&
        wrongFlashCell![1] === row
      ) {
        ctx.fillStyle = "rgba(255,60,60,0.35)";
        ctx.fillRect(x, y, cellSize, cellSize);
      }

      // Number label (unfilled cells whose matching colour is selected, or all unfilled)
      if (!cell.filled && cellSize >= 10) {
        const isTarget = cell.colorIndex === selectedColor;
        ctx.fillStyle = isTarget ? rgbToHex(palette[cell.colorIndex]) : "#888888";
        ctx.fillText(String(cell.colorIndex + 1), x + cellSize / 2, y + cellSize / 2);
      }

      // Grid line
      ctx.strokeStyle = GRID_LINE;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x, y, cellSize, cellSize);
    }
  }
}

/**
 * Flash the cell at (col, row) red briefly to signal a wrong guess.
 */
export function flashWrong(col: number, row: number): void {
  wrongFlashCell = [col, row];
  wrongFlashUntil = Date.now() + WRONG_FLASH_MS;
}

/**
 * Convert a canvas click position to a grid (col, row) pair.
 * Returns null if outside the board.
 */
export function canvasPosToCellCoords(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  cellSize: number,
): [number, number] | null {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  const col = Math.floor(((clientX - rect.left) * scaleX) / cellSize);
  const row = Math.floor(((clientY - rect.top)  * scaleY) / cellSize);
  if (col < 0 || row < 0) return null;
  return [col, row];
}
