import { BASE_PAINTS, DARK_PAINTS } from "./palette";

const swatchStyle = (hex) => ({ background: `#${hex}` });

// A single base-paint dot with its part-count, PDF-style.
function PaintDot({ paint, parts }) {
  const light = DARK_PAINTS.has(paint);
  return (
    <span
      className="inline-flex items-center justify-center rounded-full text-[11px] font-bold shadow ring-1 ring-black/20"
      style={{
        width: 22, height: 22, background: BASE_PAINTS[paint],
        color: light ? "#fff" : "#111",
      }}
    >
      {parts}
    </span>
  );
}

// Recipe row: dot + dot + … = swatch, like the guide.
export function RecipeCard({ color, note }) {
  return (
    <div className="flex items-center justify-center gap-2 flex-wrap">
      <span className="text-xs font-semibold text-slate-300 tabular-nums">
        צבע {color.id}
      </span>
      <span className="flex items-center gap-1.5">
        {color.recipe.map((r, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-slate-500 text-xs">+</span>}
            <PaintDot paint={r.paint} parts={r.parts} />
          </span>
        ))}
        <span className="text-slate-500 text-xs">=</span>
        <span className="rounded-md ring-1 ring-white/25" style={{ width: 22, height: 22, ...swatchStyle(color.hex) }} />
      </span>
      <span className="text-[10px] text-slate-500 tabular-nums">#{color.hex}</span>
      {note && <span className="text-[10px] text-amber-300/90">{note}</span>}
    </div>
  );
}

// Horizontal row of selectable palette swatches.
export function PaletteStrip({ palette, activeId, onSelect }) {
  return (
    <div className="flex items-center gap-1.5">
      {palette.map((c) => {
        const active = c.id === activeId;
        return (
          <button
            key={c.id}
            onClick={() => onSelect(active ? null : c.id)}
            title={`צבע ${c.id} · #${c.hex}`}
            className={`relative rounded-md transition-transform ${active ? "scale-110" : "hover:scale-105"}`}
            style={{
              width: 24, height: 24, background: `#${c.hex}`,
              boxShadow: active
                ? "0 0 0 2px rgba(56,189,248,.95), 0 0 8px rgba(56,189,248,.5)"
                : "inset 0 0 0 1px rgba(255,255,255,.25)",
            }}
          >
            <span className="absolute -top-1 -right-1 text-[8px] font-bold text-slate-300 tabular-nums">
              {c.id}
            </span>
          </button>
        );
      })}
    </div>
  );
}
