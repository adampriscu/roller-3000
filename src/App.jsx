import { useEffect, useRef, useState, memo } from "react";
import SKETCH from "./assets/sketch.png";
import { PALETTE } from "./palette";
import { useSketchAnalysis } from "./useSketchAnalysis";
import { PaletteStrip, RecipeCard } from "./ColorMap";

// ── Configuration ──────────────────────────────────────────────
const ROWS = 9;
const COLS = 26;

// Swipe tuning.
const FLICK_SPEED = 0.5;      // px/ms at release — above this a short gesture counts as a swipe
const FLICK_MAX_CELLS = 1.3;  // only short gestures become a one-cell step
const INVERT_SWIPE = false;   // false = canvas feel (swipe up → cell below) · true = d-pad

// Zoom + reveal tuning.
const ZOOM_MAX = 2.5;         // how far you can zoom in
const OVERVIEW_MARGIN = 1.35; // overview switches on when zoom ≤ fitAll × this
const DARK_ALPHA = 0.74;      // dimming of unfocused cells
const STAGGER = 15;           // ms of reveal delay per cell of distance from focus
const REVEAL_MS = 340;        // per-cell brighten duration

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ── Dimming / reveal overlay (memoised so pinch-zoom never re-renders 234 tiles) ──
const TileOverlay = memo(function TileOverlay({ overview, collapse, scrubbing, focusRow, focusCol, cw, ch }) {
  // Distance to the furthest corner, so the inward collapse starts from the rim.
  const maxD = Math.max(
    Math.hypot(focusRow, focusCol),
    Math.hypot(focusRow, COLS - 1 - focusCol),
    Math.hypot(ROWS - 1 - focusRow, focusCol),
    Math.hypot(ROWS - 1 - focusRow, COLS - 1 - focusCol),
  );
  const tiles = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const isFocus = r === focusRow && c === focusCol;
      const revealed = overview || scrubbing || isFocus;
      const dist = Math.hypot(r - focusRow, c - focusCol);
      let delay = 0;
      if (scrubbing) delay = 0;                       // quick navigation → no wave
      else if (overview) delay = dist * STAGGER;       // zoom out → bloom outward from focus
      else if (collapse) delay = (maxD - dist) * STAGGER; // zoom in → collapse inward to focus
      tiles.push(
        <div key={`${r}-${c}`}
             style={{
               position: "absolute", left: c * cw, top: r * ch, width: cw, height: ch,
               background: "rgb(2,6,23)",
               opacity: revealed ? 0 : DARK_ALPHA,
               transition: `opacity ${REVEAL_MS}ms ease ${delay}ms`,
             }} />
      );
    }
  }
  return <div className="absolute top-0 left-0" style={{ pointerEvents: "none" }}>{tiles}</div>;
});

export default function App() {
  const viewportRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [offset, setOffset] = useState(null); // artwork translate, screen px
  const [zoom, setZoom] = useState(1);
  const [panning, setPanning] = useState(false);
  const [pinching, setPinching] = useState(false);
  const [focus, setFocus] = useState({ row: 4, col: 12 });
  const [live, setLive] = useState({ row: 4, col: 12 });
  const [src] = useState(SKETCH);
  const [aspect, setAspect] = useState(4605 / 1593);
  const [activeColor, setActiveColor] = useState(null); // manually selected palette id

  // Colour analysis: per-cell dominant colour + per-colour affinity heatmaps.
  const { ready: analysisReady, cellColor, heatmapURL } = useSketchAnalysis(SKETCH);

  // Load the fixed sketch once and pick up its real aspect ratio.
  useEffect(() => {
    const img = new Image();
    img.onload = () => setAspect(img.width / img.height);
    img.src = SKETCH;
  }, []);

  const pointers = useRef(new Map()); // id -> {x,y}
  const gesture = useRef(null);       // {type:'pan'|'pinch', ...}
  const samples = useRef([]);         // recent {t,x,y} for flick velocity
  const reduce = useRef(false);
  useEffect(() => { reduce.current = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches; }, []);

  // Play the inward collapse wave when zooming in out of overview.
  const prevOverview = useRef(false);
  const [collapse, setCollapse] = useState(false);

  // Base geometry (zoom = 1 reference). One cell ≈ 72% of the short viewport side.
  const cellAspect = aspect * (ROWS / COLS);
  const targetPx = 0.72 * Math.min(size.w || 1, size.h || 1);
  let baseCellW, baseCellH;
  if (cellAspect >= 1) { baseCellW = targetPx; baseCellH = targetPx / cellAspect; }
  else { baseCellH = targetPx; baseCellW = targetPx * cellAspect; }
  const baseContentW = baseCellW * COLS;
  const baseContentH = baseCellH * ROWS;

  const fitAll = baseContentW > 0 ? Math.min(size.w / baseContentW, size.h / baseContentH) : 0.1;
  const zoomMin = fitAll * 0.85;
  const revealZoom = fitAll * OVERVIEW_MARGIN;
  const overview = zoom <= revealZoom;
  const scrubbing = panning && !pinching;

  useEffect(() => {
    const was = prevOverview.current;
    prevOverview.current = overview;
    if (was && !overview) { // left overview → collapse light back to the focused cell
      setCollapse(true);
      const t = setTimeout(() => setCollapse(false), Math.hypot(ROWS, COLS) * STAGGER + REVEAL_MS + 60);
      return () => clearTimeout(t);
    }
  }, [overview]);

  // ── Geometry helpers (screen px ↔ cells) ──
  const clampZoom = (z) => clamp(z, zoomMin, ZOOM_MAX);
  const clampOffset = (o, z) => {
    const onW = baseContentW * z, onH = baseContentH * z;
    return {
      x: clamp(o.x, size.w / 2 - onW, size.w / 2),
      y: clamp(o.y, size.h / 2 - onH, size.h / 2),
    };
  };
  const offsetForCell = (row, col, z) => ({
    x: size.w / 2 - (col + 0.5) * baseCellW * z,
    y: size.h / 2 - (row + 0.5) * baseCellH * z,
  });
  const cellAtCentre = (o, z) => {
    const bx = (size.w / 2 - o.x) / z;
    const by = (size.h / 2 - o.y) / z;
    return {
      row: clamp(Math.round(by / baseCellH - 0.5), 0, ROWS - 1),
      col: clamp(Math.round(bx / baseCellW - 0.5), 0, COLS - 1),
    };
  };

  // Measure viewport.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Initialise once size is known.
  useEffect(() => {
    if (size.w && size.h && offset === null && baseCellW) {
      setOffset({ x: size.w / 2 - (focus.col + 0.5) * baseCellW, y: size.h / 2 - (focus.row + 0.5) * baseCellH });
    }
  }, [size.w, size.h, offset, baseCellW, baseCellH, focus.row, focus.col]);

  // ── Pointer handling: 1 finger = pan, 2 fingers = pinch ──
  const twoPointsDist = () => {
    const p = [...pointers.current.values()];
    return { d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1,
             mid: { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 } };
  };

  const onPointerDown = (e) => {
    if (!offset) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const n = pointers.current.size;
    if (n === 1) {
      gesture.current = { type: "pan", startX: e.clientX, startY: e.clientY, startOffset: offset };
      samples.current = [{ t: performance.now(), x: e.clientX, y: e.clientY }];
      setPanning(true);
    } else if (n === 2) {
      const { d, mid } = twoPointsDist();
      gesture.current = { type: "pinch", dist0: d, z0: zoom,
        cp: { x: (mid.x - offset.x) / zoom, y: (mid.y - offset.y) / zoom } };
      setPinching(true);
      setPanning(true);
    }
  };

  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;

    if (g.type === "pinch" && pointers.current.size >= 2) {
      const { d, mid } = twoPointsDist();
      const z = clampZoom(g.z0 * d / g.dist0);
      setZoom(z);
      setOffset(clampOffset({ x: mid.x - g.cp.x * z, y: mid.y - g.cp.y * z }, z));
    } else if (g.type === "pan") {
      const o = clampOffset({ x: g.startOffset.x + (e.clientX - g.startX), y: g.startOffset.y + (e.clientY - g.startY) }, zoom);
      setOffset(o);
      setLive(cellAtCentre(o, zoom));
      const s = samples.current;
      s.push({ t: performance.now(), x: e.clientX, y: e.clientY });
      if (s.length > 6) s.shift();
    }
  };

  const handleUp = (e) => {
    const hadTwo = pointers.current.size >= 2;
    pointers.current.delete(e.pointerId);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    const remaining = pointers.current.size;

    // Two fingers → one: hand off to a fresh pan baseline (no snap, no jump).
    if (remaining === 1 && hadTwo) {
      const rem = [...pointers.current.values()][0];
      gesture.current = { type: "pan", startX: rem.x, startY: rem.y, startOffset: offset };
      samples.current = [{ t: performance.now(), x: rem.x, y: rem.y }];
      setPinching(false);
      return;
    }
    if (remaining >= 1) return;

    const g = gesture.current;
    gesture.current = null;
    setPinching(false);

    if (g && g.type === "pinch") {
      if (zoom > revealZoom) { // settled in focus range → re-centre nearest cell
        const cell = cellAtCentre(offset, zoom);
        setFocus(cell);
        setOffset(offsetForCell(cell.row, cell.col, zoom));
      }
      setPanning(false);
      return;
    }

    // Pan ended. In overview we just stop — focusing a single cell is irrelevant there.
    if (overview) { setPanning(false); return; }

    // Focus-mode pan: flick to a neighbour, or snap to nearest.
    const s = samples.current, now = performance.now();
    let vx = 0, vy = 0;
    if (s.length >= 2) {
      const last = s[s.length - 1]; let first = s[0];
      for (let i = s.length - 1; i >= 0; i--) { if (now - s[i].t <= 110) first = s[i]; else break; }
      const dt = Math.max(1, last.t - first.t);
      vx = (last.x - first.x) / dt; vy = (last.y - first.y) / dt;
    }
    const speed = Math.hypot(vx, vy);
    const vertical = Math.abs(vy) >= Math.abs(vx);
    const cellSpan = (vertical ? baseCellH : baseCellW) * zoom;
    const travel = Math.abs(vertical ? offset.y - g.startOffset.y : offset.x - g.startOffset.x);

    let next;
    if (speed > FLICK_SPEED && travel < FLICK_MAX_CELLS * cellSpan) {
      const dir = INVERT_SWIPE ? -1 : 1;
      let { row, col } = focus;
      if (vertical) row -= dir * Math.sign(vy);
      else          col -= dir * Math.sign(vx);
      next = { row: clamp(row, 0, ROWS - 1), col: clamp(col, 0, COLS - 1) };
    } else {
      next = cellAtCentre(offset, zoom);
    }
    setFocus(next);
    setOffset(offsetForCell(next.row, next.col, zoom));
    setPanning(false);
  };

  // ── View toggles ──
  const showAll = () => {
    setPanning(false);
    setZoom(fitAll);
    setOffset({ x: (size.w - baseContentW * fitAll) / 2, y: (size.h - baseContentH * fitAll) / 2 });
  };
  const focusOne = () => {
    setPanning(false);
    setZoom(1);
    setOffset(offsetForCell(focus.row, focus.col, 1));
  };

  const snapTransition = !panning && !reduce.current ? "transform 280ms cubic-bezier(.22,.61,.36,1)" : "none";
  const ready = offset && baseCellW;
  const onCellW = baseCellW * zoom, onCellH = baseCellH * zoom;

  // Dominant palette colour of the focused cell (focus mode only).
  const focusCell = (analysisReady && !overview) ? cellColor(focus.row, focus.col) : null;
  // Which swatch reads as "active": the manual pick, else the focused cell's colour.
  const stripActiveId = activeColor ?? (focusCell && !focusCell.inBetween ? focusCell.nearest.id : null);
  // Heatmap image for the selected colour.
  const heatUrl = (analysisReady && activeColor) ? heatmapURL(activeColor) : null;
  const activeColorObj = activeColor ? PALETTE.find((c) => c.id === activeColor) : null;

  window.__dbg = () => ({ zoom, offset, panning, pinching, overview, focus, revealZoom, zoomMin, fitAll, gestureType: gesture.current?.type, pointerCount: pointers.current.size });
  window.__handlers = { onPointerDown, onPointerMove, handleUp };

  return (
    <div dir="rtl" className="w-full h-screen bg-slate-950 text-slate-100 flex flex-col select-none"
         style={{ fontFamily: "system-ui, 'Segoe UI', sans-serif" }}>
      {/* Header */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <button onClick={overview ? focusOne : showAll}
                  className="text-xs px-3 py-2 rounded-lg bg-sky-400/90 text-slate-950 font-semibold hover:bg-sky-300 transition-colors">
            {overview ? "חזרה למשבצת" : "כל הסקיצה"}
          </button>
        </div>
        <span className="text-xl font-black italic tracking-tight bg-gradient-to-l from-sky-300 via-blue-400 to-indigo-500 bg-clip-text text-transparent drop-shadow-[0_2px_10px_rgba(56,189,248,0.35)]">
          ROLLER 3000<sup className="not-italic text-[0.5em] align-super mr-0.5 text-sky-300/80">TM</sup>
        </span>
        <div className="flex justify-end">
          <PaletteStrip palette={PALETTE} activeId={stripActiveId} onSelect={setActiveColor} />
        </div>
      </div>

      {/* Viewport */}
      <div ref={viewportRef}
           className="relative flex-1 overflow-hidden touch-none cursor-grab active:cursor-grabbing"
           onPointerDown={onPointerDown} onPointerMove={onPointerMove}
           onPointerUp={handleUp} onPointerCancel={handleUp}>
        {ready && (
          <>
            {/* Content layer: single transform for pan + zoom */}
            <div className="absolute top-0 left-0"
                 style={{
                   width: baseContentW, height: baseContentH, transformOrigin: "0 0",
                   transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})`,
                   transition: snapTransition,
                 }}>
              <img src={src} alt="" draggable={false} className="absolute inset-0 w-full h-full" />
              {heatUrl && (
                <img src={heatUrl} alt="" draggable={false}
                     className="absolute inset-0 w-full h-full pointer-events-none"
                     style={{ opacity: overview ? 1 : 0.5 }} />
              )}
              <div className="absolute inset-0" style={{
                backgroundImage:
                  `repeating-linear-gradient(to right, rgba(255,255,255,.32) 0 1px, transparent 1px ${baseCellW}px),
                   repeating-linear-gradient(to bottom, rgba(255,255,255,.32) 0 1px, transparent 1px ${baseCellH}px)`,
              }} />
              <TileOverlay overview={overview} collapse={collapse} scrubbing={scrubbing}
                           focusRow={focus.row} focusCol={focus.col} cw={baseCellW} ch={baseCellH} />
            </div>

            {/* Highlight ring + label on the locked cell (focus mode only) */}
            {!panning && !overview && (
              <div className="absolute left-1/2 top-1/2 pointer-events-none"
                   style={{
                     width: onCellW, height: onCellH, transform: "translate(-50%, -50%)",
                     outline: "2px solid rgba(56,189,248,.95)", outlineOffset: "-1px", borderRadius: 2,
                     boxShadow: "0 0 0 1px rgba(0,0,0,.4)",
                   }}>
                <div className="absolute top-1 right-1 px-2 py-0.5 rounded-md bg-sky-400 text-slate-950 text-[11px] font-bold tabular-nums shadow">
                  {focus.row + 1}·{focus.col + 1}
                </div>
              </div>
            )}

            {/* Live chip while scrubbing with one finger */}
            {panning && !pinching && !overview && (
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                <div className="px-3 py-1.5 rounded-lg bg-sky-400 text-slate-950 text-sm font-bold tabular-nums shadow-lg">
                  שורה {live.row + 1} · עמודה {live.col + 1}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer status + recipe */}
      <div className="px-4 py-2 border-t border-white/10 text-center text-xs text-slate-400 min-h-[52px] flex flex-col items-center justify-center gap-1">
        {overview ? (
          activeColorObj ? (
            <>
              <RecipeCard color={activeColorObj} />
              <span className="text-[10px] text-slate-500">מפת חום · היכן הצבע מופיע בסקיצה</span>
            </>
          ) : (
            <span className="tabular-nums">סקיצה מלאה · בחרו צבע מהפלטה למפת חום</span>
          )
        ) : (
          <>
            <div className="tabular-nums">שורה {focus.row + 1}/{ROWS} · עמודה {focus.col + 1}/{COLS}</div>
            {activeColorObj ? (
              <RecipeCard color={activeColorObj} />
            ) : focusCell ? (
              focusCell.inBetween ? (
                <div className="flex items-center gap-2 flex-wrap justify-center">
                  <span className="text-[11px] text-amber-300/90">צבע ביניים — לערבב לפי הצורך</span>
                  <span className="text-[10px] text-slate-500">בין</span>
                  {[focusCell.nearest, focusCell.second].map((c) => (
                    <span key={c.id} className="inline-flex items-center gap-1">
                      <span className="rounded ring-1 ring-white/25" style={{ width: 16, height: 16, background: `#${c.hex}` }} />
                      <span className="text-[10px] tabular-nums">צבע {c.id}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <RecipeCard color={focusCell.nearest} />
              )
            ) : (
              <div className="text-[10px] text-slate-500">משבצת נבחרת</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
