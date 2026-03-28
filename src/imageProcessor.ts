/**
 * Image processing module: resize and quantize an uploaded image to a
 * limited colour palette using the Median-Cut algorithm.
 */

export interface QuantizedImage {
  /** Grid columns */
  width: number;
  /** Grid rows */
  height: number;
  /** Flat RGBA pixel data at grid resolution */
  pixelData: Uint8ClampedArray;
  /** Palette: array of [R, G, B] tuples */
  palette: [number, number, number][];
  /** Per-pixel palette index (length = width * height) */
  paletteIndices: number[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resize the source image to (gridWidth × gridHeight) and reduce its colours
 * to at most `numColors` distinct palette entries.
 */
export function processImage(
  img: HTMLImageElement,
  gridWidth: number,
  gridHeight: number,
  numColors: number,
): QuantizedImage {
  const pixelData = resizeImage(img, gridWidth, gridHeight);
  const pixels = extractRGB(pixelData, gridWidth * gridHeight);
  const palette = medianCut(pixels, numColors);
  const paletteIndices = mapToNearestPalette(pixels, palette);
  return { width: gridWidth, height: gridHeight, pixelData, palette, paletteIndices };
}

// ---------------------------------------------------------------------------
// Step 1: resize via an off-screen canvas
// ---------------------------------------------------------------------------

function resizeImage(
  img: HTMLImageElement,
  w: number,
  h: number,
): Uint8ClampedArray {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h).data;
}

// ---------------------------------------------------------------------------
// Step 2: pull RGB triples out of the flat RGBA buffer
// ---------------------------------------------------------------------------

function extractRGB(
  data: Uint8ClampedArray,
  count: number,
): [number, number, number][] {
  const out: [number, number, number][] = new Array(count);
  for (let i = 0; i < count; i++) {
    out[i] = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Step 3: Median-Cut colour quantization
// ---------------------------------------------------------------------------

type RGB = [number, number, number];
type Bucket = RGB[];

function medianCut(pixels: RGB[], numColors: number): RGB[] {
  if (numColors <= 0) return [];

  let buckets: Bucket[] = [pixels.slice()];

  while (buckets.length < numColors) {
    // Sort buckets descending by their colour-space range
    buckets.sort((a, b) => bucketRange(b) - bucketRange(a));

    const target = buckets.shift()!;
    if (target.length === 0) break;

    const [b1, b2] = splitBucket(target);
    buckets.push(b1, b2);
  }

  return buckets.map(averageColor);
}

/** Total RGB range of a bucket */
function bucketRange(bucket: Bucket): number {
  let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
  for (const [r, g, b] of bucket) {
    if (r < rMin) rMin = r; if (r > rMax) rMax = r;
    if (g < gMin) gMin = g; if (g > gMax) gMax = g;
    if (b < bMin) bMin = b; if (b > bMax) bMax = b;
  }
  return (rMax - rMin) + (gMax - gMin) + (bMax - bMin);
}

/** Split a bucket along its widest colour channel at the median */
function splitBucket(bucket: Bucket): [Bucket, Bucket] {
  let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
  for (const [r, g, b] of bucket) {
    if (r < rMin) rMin = r; if (r > rMax) rMax = r;
    if (g < gMin) gMin = g; if (g > gMax) gMax = g;
    if (b < bMin) bMin = b; if (b > bMax) bMax = b;
  }

  const rRange = rMax - rMin;
  const gRange = gMax - gMin;
  const bRange = bMax - bMin;
  const channel = rRange >= gRange && rRange >= bRange ? 0
    : gRange >= bRange ? 1 : 2;

  const sorted = bucket.slice().sort((a, b) => a[channel] - b[channel]);
  const mid = Math.floor(sorted.length / 2);
  return [sorted.slice(0, mid), sorted.slice(mid)];
}

function averageColor(bucket: Bucket): RGB {
  if (bucket.length === 0) return [0, 0, 0];
  let r = 0, g = 0, b = 0;
  for (const [pr, pg, pb] of bucket) { r += pr; g += pg; b += pb; }
  const n = bucket.length;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

// ---------------------------------------------------------------------------
// Step 4: map every pixel to the nearest palette entry (Euclidean distance)
// ---------------------------------------------------------------------------

function mapToNearestPalette(pixels: RGB[], palette: RGB[]): number[] {
  return pixels.map((px) => nearestIndex(px, palette));
}

function nearestIndex(px: RGB, palette: RGB[]): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const dr = px[0] - palette[i][0];
    const dg = px[1] - palette[i][1];
    const db = px[2] - palette[i][2];
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) { bestDist = dist; best = i; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Helpers exported for tests / other modules
// ---------------------------------------------------------------------------

export function rgbToHex([r, g, b]: [number, number, number]): string {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}
