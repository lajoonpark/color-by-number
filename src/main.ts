/**
 * Main entry point — wires up the UI to the game modules.
 */

import "./style.css";
import { processImage, rgbToHex } from "./imageProcessor";
import { generatePuzzle } from "./puzzleGenerator";
import {
  createGameState,
  fillCell,
  getProgress,
  remainingForColor,
  type GameState,
} from "./gameState";
import {
  renderBoard,
  flashWrong,
  screenToCell,
  BASE_CELL,
  type Camera,
} from "./boardRenderer";

// ---------------------------------------------------------------------------
// Difficulty presets
// ---------------------------------------------------------------------------

interface Preset {
  label: string;
  gridWidth: number;
  gridHeight: number;
  numColors: number;
}

const PRESETS: Preset[] = [
  { label: "Easy   (24×24, 6 colors)",  gridWidth: 24, gridHeight: 24, numColors: 6  },
  { label: "Medium (32×32, 10 colors)", gridWidth: 32, gridHeight: 32, numColors: 10 },
  { label: "Hard   (48×48, 16 colors)", gridWidth: 48, gridHeight: 48, numColors: 16 },
];

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const app = document.getElementById("app")!;

app.innerHTML = `
<div class="cbn-layout">
  <header class="cbn-header">
    <h1>🎨 Color by Number</h1>
  </header>

  <section class="cbn-setup" id="setup-section">
    <div class="setup-row">
      <label class="upload-label" for="file-input">
        <span>📁 Upload Image</span>
        <input type="file" id="file-input" accept="image/*" />
      </label>
      <img id="preview-img" class="preview-img hidden" alt="preview" />
    </div>

    <div class="setup-row">
      <label for="difficulty-select">Difficulty:</label>
      <select id="difficulty-select">
        ${PRESETS.map((p, i) => `<option value="${i}">${p.label}</option>`).join("")}
      </select>
    </div>

    <div class="setup-row">
      <label>Grid:</label>
      <input type="number" id="grid-width"  value="24" min="4" max="128" />
      <span>×</span>
      <input type="number" id="grid-height" value="24" min="4" max="128" />
      <label>Colors:</label>
      <input type="number" id="num-colors"  value="6"  min="2" max="32"  />
    </div>

    <div class="setup-row">
      <button id="generate-btn" disabled>Generate Puzzle</button>
    </div>
  </section>

  <section class="cbn-game hidden" id="game-section">
    <div class="cbn-game-inner">
      <div class="cbn-board-wrap" id="board-wrap">
        <canvas id="board-canvas"></canvas>
        <div class="zoom-controls" id="zoom-controls">
          <button class="zoom-btn" id="zoom-out-btn" title="Zoom Out">−</button>
          <span id="zoom-level">100%</span>
          <button class="zoom-btn" id="zoom-in-btn"  title="Zoom In">+</button>
          <button class="zoom-btn" id="zoom-fit-btn" title="Fit to screen">⊡</button>
        </div>
      </div>
      <aside class="cbn-sidebar">
        <div class="progress-box">
          <span id="progress-label">0%</span>
          <div class="progress-bar">
            <div class="progress-fill" id="progress-fill" style="width:0%"></div>
          </div>
        </div>
        <div id="palette-panel" class="palette-panel"></div>
        <button id="new-puzzle-btn" class="btn-secondary">New Puzzle</button>
      </aside>
    </div>

    <div id="completion-banner" class="completion-banner hidden">
      🎉 Puzzle complete! Well done!
    </div>
  </section>
</div>
`;

// ---------------------------------------------------------------------------
// Element handles
// ---------------------------------------------------------------------------

const fileInput        = document.getElementById("file-input")        as HTMLInputElement;
const previewImg       = document.getElementById("preview-img")       as HTMLImageElement;
const difficultySelect = document.getElementById("difficulty-select") as HTMLSelectElement;
const gridWidthInput   = document.getElementById("grid-width")        as HTMLInputElement;
const gridHeightInput  = document.getElementById("grid-height")       as HTMLInputElement;
const numColorsInput   = document.getElementById("num-colors")        as HTMLInputElement;
const generateBtn      = document.getElementById("generate-btn")      as HTMLButtonElement;
const setupSection     = document.getElementById("setup-section")!;
const gameSection      = document.getElementById("game-section")!;
const boardWrap        = document.getElementById("board-wrap")!;
const boardCanvas      = document.getElementById("board-canvas")      as HTMLCanvasElement;
const palettePanel     = document.getElementById("palette-panel")!;
const progressLabel    = document.getElementById("progress-label")!;
const progressFill     = document.getElementById("progress-fill")     as HTMLElement;
const newPuzzleBtn     = document.getElementById("new-puzzle-btn")!;
const completionBanner = document.getElementById("completion-banner")!;
const zoomInBtn        = document.getElementById("zoom-in-btn")       as HTMLButtonElement;
const zoomOutBtn       = document.getElementById("zoom-out-btn")      as HTMLButtonElement;
const zoomFitBtn       = document.getElementById("zoom-fit-btn")      as HTMLButtonElement;
const zoomLevelSpan    = document.getElementById("zoom-level")        as HTMLElement;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let uploadedImage: HTMLImageElement | null = null;
let gameState: GameState | null = null;
let animFrameId = 0;

// Camera state
let camera: Camera = { zoom: 1, panX: 0, panY: 0 };

// ---------------------------------------------------------------------------
// Zoom / pan constants
// ---------------------------------------------------------------------------

const MIN_ZOOM      = 0.05;
const MAX_ZOOM      = 20;
const ZOOM_STEP     = 1.3;
const DRAG_THRESHOLD = 5;   // CSS pixels of movement before we consider it a drag

// ---------------------------------------------------------------------------
// Setup interactions
// ---------------------------------------------------------------------------

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    uploadedImage = img;
    previewImg.src = url;
    previewImg.classList.remove("hidden");
    generateBtn.disabled = false;
  };
  img.src = url;
});

difficultySelect.addEventListener("change", () => {
  const preset = PRESETS[parseInt(difficultySelect.value)];
  gridWidthInput.value  = String(preset.gridWidth);
  gridHeightInput.value = String(preset.gridHeight);
  numColorsInput.value  = String(preset.numColors);
});

generateBtn.addEventListener("click", generatePuzzleFromUI);

// ---------------------------------------------------------------------------
// Puzzle generation
// ---------------------------------------------------------------------------

function generatePuzzleFromUI() {
  if (!uploadedImage) return;

  const gridWidth  = Math.max(4, Math.min(128, parseInt(gridWidthInput.value)  || 24));
  const gridHeight = Math.max(4, Math.min(128, parseInt(gridHeightInput.value) || 24));
  const numColors  = Math.max(2, Math.min(32,  parseInt(numColorsInput.value)  || 6));

  generateBtn.disabled = true;
  generateBtn.textContent = "Processing…";

  // Defer heavy work so the button text can update first
  requestAnimationFrame(() => {
    try {
      const quantized = processImage(uploadedImage!, gridWidth, gridHeight, numColors);
      const puzzle    = generatePuzzle(quantized);
      gameState = createGameState(puzzle);

      setupSection.classList.add("hidden");
      gameSection.classList.remove("hidden");
      completionBanner.classList.add("hidden");

      buildPalettePanel();

      // Fit board to viewport on first load (deferred so the DOM is laid out)
      requestAnimationFrame(() => {
        resizeObserver.observe(boardWrap);
        fitToScreen();
        scheduleRender();
        updateProgress();
      });
    } finally {
      generateBtn.disabled = false;
      generateBtn.textContent = "Generate Puzzle";
    }
  });
}

// ---------------------------------------------------------------------------
// Camera helpers
// ---------------------------------------------------------------------------

function clampPan() {
  if (!gameState) return;
  const { gridWidth, gridHeight } = gameState.puzzle;
  const cssW   = boardCanvas.clientWidth;
  const cssH   = boardCanvas.clientHeight;
  const boardW = gridWidth  * BASE_CELL * camera.zoom;
  const boardH = gridHeight * BASE_CELL * camera.zoom;
  const margin = 50; // keep at least this many px of the board visible
  camera.panX  = Math.max(-(boardW - margin), Math.min(cssW - margin, camera.panX));
  camera.panY  = Math.max(-(boardH - margin), Math.min(cssH - margin, camera.panY));
}

function fitToScreen() {
  if (!gameState) return;
  const { gridWidth, gridHeight } = gameState.puzzle;
  const cssW    = boardCanvas.clientWidth  || boardWrap.clientWidth;
  const cssH    = boardCanvas.clientHeight || boardWrap.clientHeight;
  if (!cssW || !cssH) return;
  const fitZoom = Math.min(cssW / (gridWidth * BASE_CELL), cssH / (gridHeight * BASE_CELL));
  camera.zoom   = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fitZoom));
  camera.panX   = (cssW - gridWidth  * BASE_CELL * camera.zoom) / 2;
  camera.panY   = (cssH - gridHeight * BASE_CELL * camera.zoom) / 2;
  updateZoomLevel();
}

function zoomAround(newZoom: number, cssPivotX: number, cssPivotY: number) {
  newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
  const ratio  = newZoom / camera.zoom;
  camera.panX  = cssPivotX - (cssPivotX - camera.panX) * ratio;
  camera.panY  = cssPivotY - (cssPivotY - camera.panY) * ratio;
  camera.zoom  = newZoom;
  clampPan();
  updateZoomLevel();
  scheduleRender();
}

function updateZoomLevel() {
  zoomLevelSpan.textContent = `${Math.round(camera.zoom * 100)}%`;
}

// ---------------------------------------------------------------------------
// Palette panel
// ---------------------------------------------------------------------------

function buildPalettePanel() {
  if (!gameState) return;
  palettePanel.innerHTML = "";
  const { palette } = gameState.puzzle;

  palette.forEach((color, idx) => {
    const item = document.createElement("div");
    item.className = "palette-item";
    item.dataset.idx = String(idx);

    const swatch = document.createElement("span");
    swatch.className = "palette-swatch";
    swatch.style.background = rgbToHex(color);

    const num = document.createElement("span");
    num.className = "palette-num";
    num.textContent = String(idx + 1);

    const cnt = document.createElement("span");
    cnt.className = "palette-count";
    cnt.id = `palette-count-${idx}`;

    item.appendChild(swatch);
    item.appendChild(num);
    item.appendChild(cnt);
    item.addEventListener("click", () => selectColor(idx));
    palettePanel.appendChild(item);
  });

  updatePaletteCounts();
}

function selectColor(idx: number) {
  if (!gameState) return;
  gameState.selectedColor = idx;

  document.querySelectorAll(".palette-item").forEach((el) => {
    (el as HTMLElement).classList.toggle("active", (el as HTMLElement).dataset.idx === String(idx));
  });

  scheduleRender();
}

function updatePaletteCounts() {
  if (!gameState) return;
  const { palette } = gameState.puzzle;
  palette.forEach((_, idx) => {
    const el = document.getElementById(`palette-count-${idx}`);
    if (el) el.textContent = String(remainingForColor(gameState!, idx));
  });
}

// ---------------------------------------------------------------------------
// Rendering loop
// ---------------------------------------------------------------------------

function scheduleRender() {
  cancelAnimationFrame(animFrameId);
  animFrameId = requestAnimationFrame(doRender);
}

function doRender() {
  if (!gameState) return;
  renderBoard(boardCanvas, gameState, camera);
}

// ---------------------------------------------------------------------------
// Board interaction — unified pointer events (mouse + touch + stylus)
// ---------------------------------------------------------------------------

/** Track all currently active pointer contacts for pinch detection. */
const activePointers = new Map<number, { x: number; y: number }>();

let dragStart: { x: number; y: number } | null = null;
let isDragging  = false;

// Pinch-to-zoom tracking
let pinchStartDist   = 0;
let pinchStartZoom   = 0;
let pinchStartPanX   = 0;
let pinchStartPanY   = 0;
let pinchStartMidCssX = 0;
let pinchStartMidCssY = 0;

function pointerDist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

boardCanvas.addEventListener("pointerdown", (e) => {
  boardCanvas.setPointerCapture(e.pointerId);
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (activePointers.size === 2) {
    // Begin pinch gesture
    const pts = [...activePointers.values()];
    pinchStartDist    = pointerDist(pts[0], pts[1]);
    pinchStartZoom    = camera.zoom;
    pinchStartPanX    = camera.panX;
    pinchStartPanY    = camera.panY;
    const rect = boardCanvas.getBoundingClientRect();
    pinchStartMidCssX = (pts[0].x + pts[1].x) / 2 - rect.left;
    pinchStartMidCssY = (pts[0].y + pts[1].y) / 2 - rect.top;
    isDragging = true; // suppress paint when fingers lift
    dragStart  = null;
  } else if (activePointers.size === 1) {
    dragStart  = { x: e.clientX, y: e.clientY };
    isDragging = false;
  }
});

boardCanvas.addEventListener("pointermove", (e) => {
  if (!activePointers.has(e.pointerId)) return;

  const prev = activePointers.get(e.pointerId)!;
  const dx   = e.clientX - prev.x;
  const dy   = e.clientY - prev.y;
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (activePointers.size >= 2) {
    // Pinch zoom
    if (pinchStartDist > 0) {
      const pts     = [...activePointers.values()];
      const newDist = pointerDist(pts[0], pts[1]);
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinchStartZoom * newDist / pinchStartDist));

      const rect = boardCanvas.getBoundingClientRect();
      const midCssX = (pts[0].x + pts[1].x) / 2 - rect.left;
      const midCssY = (pts[0].y + pts[1].y) / 2 - rect.top;

      // Keep the original pinch midpoint fixed in board space
      const ratio  = newZoom / pinchStartZoom;
      camera.panX  = midCssX - (pinchStartMidCssX - pinchStartPanX) * ratio;
      camera.panY  = midCssY - (pinchStartMidCssY - pinchStartPanY) * ratio;
      camera.zoom  = newZoom;
      clampPan();
      updateZoomLevel();
      scheduleRender();
    }
    return;
  }

  // Single pointer: drag to pan
  if (dragStart !== null) {
    if (!isDragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      isDragging = true;
      boardCanvas.style.cursor = "grabbing";
    }
    if (isDragging) {
      camera.panX += dx;
      camera.panY += dy;
      clampPan();
      scheduleRender();
    }
  }
});

boardCanvas.addEventListener("pointerup", (e) => {
  const wasLast = activePointers.size === 1; // this pointer is the last one
  activePointers.delete(e.pointerId);

  if (wasLast) {
    // All pointers lifted — treat as a tap/click if no drag occurred
    if (!isDragging && dragStart !== null && gameState && !gameState.completed) {
      paintAtPosition(e.clientX, e.clientY);
    }
    dragStart      = null;
    isDragging     = false;
    pinchStartDist = 0;
    boardCanvas.style.cursor = "crosshair";
  } else {
    // Still have at least one finger down (just finished a pinch)
    pinchStartDist = 0;
    // Let the remaining finger continue as a pan — prevent accidental paint
    const remaining = Array.from(activePointers.values())[0];
    dragStart  = { x: remaining.x, y: remaining.y };
    isDragging = true;
  }
});

boardCanvas.addEventListener("pointercancel", (e) => {
  activePointers.delete(e.pointerId);
  if (activePointers.size === 0) {
    dragStart      = null;
    isDragging     = false;
    pinchStartDist = 0;
    boardCanvas.style.cursor = "crosshair";
  }
});

// Prevent browser scroll/zoom from interfering with board interactions
boardCanvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const rect      = boardCanvas.getBoundingClientRect();
  const cssPivotX = e.clientX - rect.left;
  const cssPivotY = e.clientY - rect.top;
  // deltaY > 0 = scroll down = zoom out
  const factor = e.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
  zoomAround(camera.zoom * factor, cssPivotX, cssPivotY);
}, { passive: false });

// ---------------------------------------------------------------------------
// Paint helper
// ---------------------------------------------------------------------------

function paintAtPosition(clientX: number, clientY: number) {
  if (!gameState || gameState.completed) return;
  const coords = screenToCell(
    boardCanvas, clientX, clientY, camera,
    gameState.puzzle.gridWidth, gameState.puzzle.gridHeight,
  );
  if (!coords) return;
  const [col, row] = coords;

  const result = fillCell(gameState, col, row);

  if (result === "wrong") {
    flashWrong(col, row);
    scheduleRender();
    setTimeout(() => scheduleRender(), 450);
  } else if (result === "correct") {
    updatePaletteCounts();
    updateProgress();
    scheduleRender();
    if (gameState.completed) {
      completionBanner.classList.remove("hidden");
    }
  }
}

// ---------------------------------------------------------------------------
// Zoom buttons
// ---------------------------------------------------------------------------

zoomInBtn.addEventListener("click", () => {
  const cx = boardCanvas.clientWidth  / 2;
  const cy = boardCanvas.clientHeight / 2;
  zoomAround(camera.zoom * ZOOM_STEP, cx, cy);
});

zoomOutBtn.addEventListener("click", () => {
  const cx = boardCanvas.clientWidth  / 2;
  const cy = boardCanvas.clientHeight / 2;
  zoomAround(camera.zoom / ZOOM_STEP, cx, cy);
});

zoomFitBtn.addEventListener("click", () => {
  fitToScreen();
  scheduleRender();
});

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

function updateProgress() {
  if (!gameState) return;
  const pct = getProgress(gameState);
  progressLabel.textContent = `${pct}%`;
  progressFill.style.width  = `${pct}%`;
}

// ---------------------------------------------------------------------------
// Resize observer — re-render when the board container changes size
// ---------------------------------------------------------------------------

const resizeObserver = new ResizeObserver(() => {
  if (gameState) {
    clampPan();
    scheduleRender();
  }
});

// ---------------------------------------------------------------------------
// New puzzle
// ---------------------------------------------------------------------------

newPuzzleBtn.addEventListener("click", () => {
  cancelAnimationFrame(animFrameId);
  resizeObserver.disconnect();
  gameState = null;
  setupSection.classList.remove("hidden");
  gameSection.classList.add("hidden");
  completionBanner.classList.add("hidden");
  fileInput.value = "";
  previewImg.src  = "";
  previewImg.classList.add("hidden");
  generateBtn.disabled = true;
  uploadedImage = null;
  camera = { zoom: 1, panX: 0, panY: 0 };
});

