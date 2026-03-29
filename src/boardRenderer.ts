/**
 * Canvas-based board renderer with zoom/pan camera support.
 *
 * Rendering pipeline (per frame):
 *   ctx.scale(dpr, dpr)         — HiDPI compensation
 *   ctx.translate(panX, panY)   — camera pan (CSS pixels)
 *   ctx.scale(zoom, zoom)       — camera zoom
 *   draw cells at col*BASE_CELL, row*BASE_CELL  (base-unit coordinates)
 *
 * Number visibility is driven by the on-screen rendered cell size so that
 * numbers only appear when they are actually legible.
 */

import { rgbToHex } from "./imageProcessor";
import type { GameState } from "./gameState";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Cell size in CSS pixels at zoom = 1.  All board geometry is based on this. */
export const BASE_CELL = 20;

/** Font size as a fraction of BASE_CELL (in base-unit space, auto-scales). */
const FONT_SCALE = 0.50;

/**
 * Minimum rendered cell size (CSS pixels) before numbers are drawn.
 * Below this threshold numbers would be unreadable, so we hide them and let
 * the player zoom in.
 */
const MIN_CELL_FOR_NUMBER = 14;

const GRID_COLOR    = "#cccccc";
const UNFILLED_BG   = "#f5f5f5";
const WRONG_FLASH_MS = 400;

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

export interface Camera {
  /** Current zoom multiplier (1 = one cell is BASE_CELL CSS px wide). */
  zoom: number;
  /** Horizontal pan offset in CSS pixels. */
  panX: number;
  /** Vertical pan offset in CSS pixels. */
  panY: number;
}

// ---------------------------------------------------------------------------
// Module-level flash state
// ---------------------------------------------------------------------------

let wrongFlashUntil = 0;
let wrongFlashCell: [number, number] | null = null;

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

/**
 * Render the board onto the canvas using the current camera.
 * Only cells visible in the viewport are drawn for performance.
 */
export function renderBoard(
  canvas: HTMLCanvasElement,
  state: GameState,
  camera: Camera,
): void {
  const { puzzle, selectedColor } = state;
  const { gridWidth, gridHeight, cells, palette } = puzzle;
  const { zoom, panX, panY } = camera;

  const dpr  = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (!cssW || !cssH) return;

  // Keep logical canvas resolution in sync with CSS size × DPR
  const targetW = Math.round(cssW * dpr);
  const targetH = Math.round(cssH * dpr);
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width  = targetW;
    canvas.height = targetH;
  }

  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Apply camera transform: DPR → pan → zoom
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.translate(panX, panY);
  ctx.scale(zoom, zoom);

  // Visible cell range (in board coordinates)
  const invZC = 1 / (zoom * BASE_CELL);
  const startCol = Math.max(0,             Math.floor(-panX * invZC));
  const endCol   = Math.min(gridWidth  - 1, Math.ceil((-panX + cssW) * invZC));
  const startRow = Math.max(0,             Math.floor(-panY * invZC));
  const endRow   = Math.min(gridHeight - 1, Math.ceil((-panY + cssH) * invZC));

  // Rendering flags derived from current zoom
  const renderedCellSize = BASE_CELL * zoom;                     // CSS px per cell
  const showNumbers      = renderedCellSize >= MIN_CELL_FOR_NUMBER;
  const fontPx           = Math.max(6, Math.floor(BASE_CELL * FONT_SCALE)); // px at zoom=1; auto-scales via ctx transform

  if (showNumbers) {
    ctx.font         = `bold ${fontPx}px sans-serif`;
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
  }

  const now = Date.now();
  const showWrong = wrongFlashCell !== null && now < wrongFlashUntil;

  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      const cell = cells[row][col];
      const x = col * BASE_CELL;
      const y = row * BASE_CELL;

      // ---- Cell background ----
      ctx.fillStyle = cell.filled
        ? rgbToHex(palette[cell.colorIndex])
        : UNFILLED_BG;
      ctx.fillRect(x, y, BASE_CELL, BASE_CELL);

      // ---- Wrong-guess flash overlay ----
      if (showWrong && wrongFlashCell![0] === col && wrongFlashCell![1] === row) {
        ctx.fillStyle = "rgba(255,60,60,0.35)";
        ctx.fillRect(x, y, BASE_CELL, BASE_CELL);
      }

      // ---- Number label (only when cells are big enough to be readable) ----
      if (!cell.filled && showNumbers) {
        const cx = x + BASE_CELL / 2;
        const cy = y + BASE_CELL / 2;
        const isTarget = cell.colorIndex === selectedColor;
        const label    = String(cell.colorIndex + 1);

        // White halo first, then coloured/dark text — ensures contrast on any bg
        ctx.lineWidth   = fontPx * 0.3;
        ctx.lineJoin    = "round";
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.strokeText(label, cx, cy);

        ctx.fillStyle = isTarget
          ? rgbToHex(palette[cell.colorIndex])
          : "#333333";
        ctx.fillText(label, cx, cy);
      }

      // ---- Grid line (stays ~1 CSS pixel regardless of zoom) ----
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth   = 1 / zoom;
      ctx.strokeRect(x, y, BASE_CELL, BASE_CELL);
    }
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Flash
// ---------------------------------------------------------------------------

/** Flash the cell at (col, row) red briefly to signal a wrong guess. */
export function flashWrong(col: number, row: number): void {
  wrongFlashCell = [col, row];
  wrongFlashUntil = Date.now() + WRONG_FLASH_MS;
}

// ---------------------------------------------------------------------------
// Coordinate conversion
// ---------------------------------------------------------------------------

/**
 * Convert a screen (clientX/clientY) position to a board cell coordinate.
 * Accounts for the current camera (zoom + pan).
 * Returns null if the position falls outside the board bounds.
 */
export function screenToCell(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  camera: Camera,
  gridWidth: number,
  gridHeight: number,
): [number, number] | null {
  const rect   = canvas.getBoundingClientRect();
  const cssX   = clientX - rect.left;
  const cssY   = clientY - rect.top;
  const boardX = (cssX - camera.panX) / (camera.zoom * BASE_CELL);
  const boardY = (cssY - camera.panY) / (camera.zoom * BASE_CELL);
  const col    = Math.floor(boardX);
  const row    = Math.floor(boardY);
  if (col < 0 || col >= gridWidth || row < 0 || row >= gridHeight) return null;
  return [col, row];
}
