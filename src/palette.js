// ── Gouache palette for ROLLER 3000 ────────────────────────────
// Extracted from the color guide PDF "מדריך צבעים לשלט פריסה".
// Recipes are parts of base gouache paints. "Color 6" is intentionally
// absent in the source guide (an in-between colour) — numbering is preserved.

// Base paints, keyed by the dot colour used in the guide's recipes.
export const BASE_PAINTS = {
  white:  "#FFFFFF",
  red:    "#FF0000",
  blue:   "#1B4DA8",
  black:  "#111111",
  yellow: "#FFE100",
};

// Which dots need a light number for contrast.
export const DARK_PAINTS = new Set(["blue", "black"]);

export const PALETTE = [
  {
    id: 1, hex: "040B1A", rgb: [4, 11, 26],
    hsb: [221, 85, 10], cmyk: [84, 57, 0, 89],
    recipe: [{ paint: "blue", parts: 1 }, { paint: "black", parts: 6 }],
  },
  {
    id: 2, hex: "BD2940", rgb: [189, 41, 64],
    hsb: [351, 78, 74], cmyk: [0, 78, 66, 25],
    recipe: [{ paint: "white", parts: 2 }, { paint: "red", parts: 5 }],
  },
  {
    id: 3, hex: "3A1727", rgb: [58, 23, 39],
    hsb: [333, 60, 23], cmyk: [0, 60, 32, 77],
    recipe: [{ paint: "white", parts: 2 }, { paint: "red", parts: 7 }, { paint: "black", parts: 1 }, { paint: "blue", parts: 1 }],
  },
  {
    id: 4, hex: "0F3963", rgb: [15, 57, 99],
    hsb: [210, 85, 39], cmyk: [84, 42, 0, 61],
    recipe: [{ paint: "yellow", parts: 2 }, { paint: "red", parts: 1 }, { paint: "blue", parts: 10 }],
  },
  {
    id: 5, hex: "121B31", rgb: [18, 27, 49],
    hsb: [223, 63, 19], cmyk: [63, 44, 0, 80],
    recipe: [{ paint: "white", parts: 2 }, { paint: "red", parts: 1 }, { paint: "blue", parts: 9 }, { paint: "black", parts: 4 }],
  },
  {
    id: 7, hex: "661124", rgb: [102, 17, 36],
    hsb: [347, 83, 40], cmyk: [0, 83, 64, 60],
    recipe: [{ paint: "white", parts: 2 }, { paint: "red", parts: 5 }, { paint: "black", parts: 1 }],
  },
  {
    id: 8, hex: "030206", rgb: [3, 2, 6],
    hsb: [255, 67, 2], cmyk: [50, 66, 0, 97],
    recipe: [{ paint: "black", parts: 1 }],
  },
  {
    id: 9, hex: "465C7E", rgb: [70, 92, 126],
    hsb: [216, 44, 49], cmyk: [44, 26, 0, 50],
    recipe: [{ paint: "white", parts: 4 }, { paint: "black", parts: 6 }, { paint: "blue", parts: 5 }],
  },
];

export const byId = (id) => PALETTE.find((c) => c.id === id);
