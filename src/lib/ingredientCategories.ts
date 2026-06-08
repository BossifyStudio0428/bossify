// Preset ingredient categories. Names are intentionally Chinese (primary
// audience), but matching/AI prompts work multilingually.
export const PRESET_INGREDIENT_CATEGORIES = [
  "肉类",
  "海鲜",
  "蔬菜",
  "水果",
  "调味料",
  "干货",
  "饮料",
  "包装",
  "乳制品",
  "蛋类",
  "其他",
] as const;

export type PresetCategory = (typeof PRESET_INGREDIENT_CATEGORIES)[number];

type Lang = "zh" | "en" | "ms";

const PRESET_LABELS: Record<PresetCategory, { en: string; ms: string }> = {
  肉类:   { en: "Meat",       ms: "Daging" },
  海鲜:   { en: "Seafood",    ms: "Makanan Laut" },
  蔬菜:   { en: "Vegetables", ms: "Sayur" },
  水果:   { en: "Fruits",     ms: "Buah" },
  调味料: { en: "Seasoning",  ms: "Perasa" },
  干货:   { en: "Dry Goods",  ms: "Barang Kering" },
  饮料:   { en: "Beverages",  ms: "Minuman" },
  包装:   { en: "Packaging",  ms: "Pembungkusan" },
  乳制品: { en: "Dairy",      ms: "Tenusu" },
  蛋类:   { en: "Eggs",       ms: "Telur" },
  其他:   { en: "Others",     ms: "Lain-lain" },
};

/** Translate a preset category to the active language. Custom categories pass through unchanged. */
export function translateCategory(name: string, lang: Lang): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return trimmed;
  if (lang === "zh") return trimmed;
  const preset = (PRESET_INGREDIENT_CATEGORIES as readonly string[]).find(
    (c) => c === trimmed,
  ) as PresetCategory | undefined;
  if (!preset) return trimmed;
  return PRESET_LABELS[preset][lang];
}

/** Merge presets + user-defined custom categories, deduped case-insensitively, preserving original casing. */
export function mergeCategories(custom: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (s: string) => {
    const k = s.trim().toLowerCase();
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(s.trim());
  };
  PRESET_INGREDIENT_CATEGORIES.forEach(push);
  custom.forEach(push);
  return out;
}