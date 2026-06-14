import type { TKey } from "@/contexts/I18nContext";

/**
 * Map a stored inventory unit value to a localized display label.
 * Stored values are language-agnostic (e.g. "pcs", "packs"); falls
 * back to the raw value for custom units.
 */
export function formatUnit(
  unit: string | null | undefined,
  t: (k: TKey) => string,
): string {
  if (!unit) return "";
  switch (unit.trim().toLowerCase()) {
    case "pcs":
    case "pieces":
      return t("unit_pieces");
    case "packs":
    case "pack":
      return t("unit_packs");
    case "bottles":
    case "bottle":
      return t("unit_bottles");
    case "jars":
    case "jar":
      return t("unit_jars");
    case "boxes":
    case "box":
      return t("unit_boxes");
    default:
      return unit;
  }
}

/**
 * Map a known English category preset to its localized label.
 * Unknown categories (custom ones the user typed) are returned as-is.
 */
export function formatCategory(
  category: string | null | undefined,
  t: (k: TKey) => string,
): string {
  if (!category) return "";
  const key = category.trim().toLowerCase();
  const map: Record<string, TKey> = {
    food: "cat_food",
    drinks: "cat_drinks",
    desserts: "cat_desserts",
    snacks: "cat_snacks",
    sets: "cat_sets",
    clothing: "cat_clothing",
    accessories: "cat_accessories",
    electronics: "cat_electronics",
    beauty: "cat_beauty",
    home: "cat_home",
  };
  const tk = map[key];
  return tk ? t(tk) : category;
}