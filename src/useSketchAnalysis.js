import { useEffect, useRef, useState } from "react";
import { PALETTE } from "./palette";

// Sample grid: SUB samples per cell, across the 26×9 board.
const COLS = 26;
const ROWS = 9;
const SUB = 10;              // samples per cell → 260×90 sample image
const SW = COLS * SUB;       // sample width
const SH = ROWS * SUB;       // sample height

const IN_BETWEEN_DIST = 45;  // avg-colour farther than this from every palette entry → "mix on the fly"
const SIGMA = 45;            // heatmap affinity falloff (RGB distance)
const HEAT_MAX_ALPHA = 0.92;
const HEAT_COLOR = [57, 255, 20]; // neon green — a fixed highlight hue so matches pop off the sketch

const dist2 = (r, g, b, [pr, pg, pb]) => (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;

// Analyse the sketch once: sample it small, expose per-cell dominant colour
// and per-colour affinity heatmaps. All client-side, no build step.
export function useSketchAnalysis(src) {
  const [ready, setReady] = useState(false);
  const data = useRef(null);        // Uint8ClampedArray RGBA of the SW×SH sample
  const heatCache = useRef(new Map()); // colorId -> dataURL

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const c = document.createElement("canvas");
      c.width = SW; c.height = SH;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, SW, SH);
      data.current = ctx.getImageData(0, 0, SW, SH).data;
      heatCache.current.clear();
      setReady(true);
    };
    img.src = src;
    return () => { cancelled = true; };
  }, [src]);

  // Average colour of a cell → nearest + second-nearest palette entry.
  const cellColor = (row, col) => {
    const d = data.current;
    if (!d) return null;
    let r = 0, g = 0, b = 0, n = 0;
    const x0 = col * SUB, y0 = row * SUB;
    for (let y = y0; y < y0 + SUB; y++) {
      for (let x = x0; x < x0 + SUB; x++) {
        const i = (y * SW + x) * 4;
        r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
      }
    }
    r /= n; g /= n; b /= n;
    let best = null, bestD = Infinity, second = null, secondD = Infinity;
    for (const p of PALETTE) {
      const dd = dist2(r, g, b, p.rgb);
      if (dd < bestD) { secondD = bestD; second = best; bestD = dd; best = p; }
      else if (dd < secondD) { secondD = dd; second = p; }
    }
    const dist = Math.sqrt(bestD);
    return {
      rgb: [Math.round(r), Math.round(g), Math.round(b)],
      nearest: best,
      second,
      dist,
      inBetween: dist > IN_BETWEEN_DIST,
    };
  };

  // Soft affinity heatmap for one palette colour, as a small data-URL image
  // (scaled up with smoothing by the browser → a blurred glow).
  const heatmapURL = (colorId) => {
    if (!data.current) return null;
    const cached = heatCache.current.get(colorId);
    if (cached) return cached;
    const p = PALETTE.find((c) => c.id === colorId);
    if (!p) return null;
    const d = data.current;
    const [pr, pg, pb] = p.rgb;
    const [hr, hg, hb] = HEAT_COLOR;
    const c = document.createElement("canvas");
    c.width = SW; c.height = SH;
    const ctx = c.getContext("2d");
    const out = ctx.createImageData(SW, SH);
    const twoSigma2 = 2 * SIGMA * SIGMA;
    for (let i = 0; i < SW * SH; i++) {
      const j = i * 4;
      const dd = (d[j] - pr) ** 2 + (d[j + 1] - pg) ** 2 + (d[j + 2] - pb) ** 2;
      const affinity = Math.exp(-dd / twoSigma2); // 0..1 — how close this pixel is to the palette colour
      out.data[j] = hr; out.data[j + 1] = hg; out.data[j + 2] = hb; // fixed neon-green highlight
      out.data[j + 3] = Math.round(affinity * HEAT_MAX_ALPHA * 255);
    }
    ctx.putImageData(out, 0, 0);
    const url = c.toDataURL();
    heatCache.current.set(colorId, url);
    return url;
  };

  return { ready, cellColor, heatmapURL };
}
