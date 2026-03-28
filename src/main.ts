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
  canvasPosToCellCoords,
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
      <div class="cbn-board-wrap">
        <canvas id="board-canvas"></canvas>
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

const fileInput       = document.getElementById("file-input")       as HTMLInputElement;
const previewImg      = document.getElementById("preview-img")      as HTMLImageElement;
const difficultySelect= document.getElementById("difficulty-select")as HTMLSelectElement;
const gridWidthInput  = document.getElementById("grid-width")       as HTMLInputElement;
const gridHeightInput = document.getElementById("grid-height")      as HTMLInputElement;
const numColorsInput  = document.getElementById("num-colors")       as HTMLInputElement;
const generateBtn     = document.getElementById("generate-btn")     as HTMLButtonElement;
const setupSection    = document.getElementById("setup-section")!;
const gameSection     = document.getElementById("game-section")!;
const boardCanvas     = document.getElementById("board-canvas")     as HTMLCanvasElement;
const palettePanel    = document.getElementById("palette-panel")!;
const progressLabel   = document.getElementById("progress-label")!;
const progressFill    = document.getElementById("progress-fill")    as HTMLElement;
const newPuzzleBtn    = document.getElementById("new-puzzle-btn")!;
const completionBanner= document.getElementById("completion-banner")!;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let uploadedImage: HTMLImageElement | null = null;
let gameState: GameState | null = null;
let cellSize = 16;
let animFrameId = 0;

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

      cellSize = computeCellSize(gridWidth, gridHeight);

      setupSection.classList.add("hidden");
      gameSection.classList.remove("hidden");
      completionBanner.classList.add("hidden");

      buildPalettePanel();
      scheduleRender();
      updateProgress();
    } finally {
      generateBtn.disabled = false;
      generateBtn.textContent = "Generate Puzzle";
    }
  });
}

// ---------------------------------------------------------------------------
// Cell size fitting
// ---------------------------------------------------------------------------

function computeCellSize(w: number, h: number): number {
  const maxW = Math.floor((window.innerWidth  * 0.65) / w);
  const maxH = Math.floor((window.innerHeight * 0.82) / h);
  return Math.max(8, Math.min(maxW, maxH, 32));
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
  renderBoard(boardCanvas, gameState, cellSize);
}

// ---------------------------------------------------------------------------
// Board interaction
// ---------------------------------------------------------------------------

boardCanvas.addEventListener("click", (e) => {
  if (!gameState || gameState.completed) return;
  const coords = canvasPosToCellCoords(boardCanvas, e.clientX, e.clientY, cellSize);
  if (!coords) return;
  const [col, row] = coords;

  const result = fillCell(gameState, col, row);

  if (result === "wrong") {
    flashWrong(col, row);
    scheduleRender();
    // Re-render after flash fades
    setTimeout(() => scheduleRender(), 450);
  } else if (result === "correct") {
    updatePaletteCounts();
    updateProgress();
    scheduleRender();

    if (gameState.completed) {
      completionBanner.classList.remove("hidden");
    }
  }
});

// Support touch
boardCanvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  boardCanvas.dispatchEvent(new MouseEvent("click", {
    clientX: touch.clientX,
    clientY: touch.clientY,
  }));
}, { passive: false });

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

function updateProgress() {
  if (!gameState) return;
  const pct = getProgress(gameState);
  progressLabel.textContent = `${pct}%`;
  progressFill.style.width = `${pct}%`;
}

// ---------------------------------------------------------------------------
// New puzzle
// ---------------------------------------------------------------------------

newPuzzleBtn.addEventListener("click", () => {
  cancelAnimationFrame(animFrameId);
  gameState = null;
  setupSection.classList.remove("hidden");
  gameSection.classList.add("hidden");
  completionBanner.classList.add("hidden");
  fileInput.value = "";
  previewImg.src = "";
  previewImg.classList.add("hidden");
  generateBtn.disabled = true;
  uploadedImage = null;
});
