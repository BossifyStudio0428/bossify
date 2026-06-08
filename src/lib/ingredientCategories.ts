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