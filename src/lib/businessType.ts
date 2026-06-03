import type { TKey } from "@/contexts/I18nContext";

export type BizType =
  | "retail"
  | "education"
  | "beauty"
  | "property"
  | "fnb"
  | "freelance";

export const BIZ_TYPES: { key: BizType; emoji: string; nameKey: TKey }[] = [
  { key: "retail",    emoji: "🛍️", nameKey: "bt_retail" },
  { key: "education", emoji: "🎓", nameKey: "bt_education" },
  { key: "beauty",    emoji: "💄", nameKey: "bt_beauty" },
  { key: "property",  emoji: "🏠", nameKey: "bt_property" },
  { key: "fnb",       emoji: "🍱", nameKey: "bt_fnb" },
  { key: "freelance", emoji: "💪", nameKey: "bt_freelance" },
];

export const BIZ_TYPES_WITH_INVENTORY: ReadonlySet<BizType> = new Set([
  "retail",
  "fnb",
]);

export function hasInventory(type: BizType | null | undefined): boolean {
  if (!type) return true; // default retail
  return BIZ_TYPES_WITH_INVENTORY.has(type);
}

type SemanticKey =
  | "orders"
  | "new_order"
  | "customers"
  | "new_customer"
  | "products"
  | "inventory";

/** Per-business-type label overrides. Falls back to the default key. */
const LABEL_MAP: Record<BizType, Partial<Record<SemanticKey, TKey>>> = {
  retail: {},
  fnb: {
    products: "bl_menu",
    inventory: "bl_stock",
  },
  education: {
    orders: "bl_cases",
    new_order: "bl_new_case",
    customers: "bl_clients",
    new_customer: "bl_new_client",
    products: "bl_services",
  },
  beauty: {
    orders: "bl_appointments",
    new_order: "bl_new_appointment",
    customers: "bl_clients",
    new_customer: "bl_new_client",
    products: "bl_services",
  },
  property: {
    orders: "bl_clients",
    new_order: "bl_new_client",
    customers: "bl_clients",
    new_customer: "bl_new_client",
    products: "bl_listings",
  },
  freelance: {
    orders: "bl_projects",
    new_order: "bl_new_project",
    customers: "bl_clients",
    new_customer: "bl_new_client",
    products: "bl_services",
  },
};

const DEFAULT_KEY: Record<SemanticKey, TKey> = {
  orders: "orders",
  new_order: "new_order",
  customers: "customers",
  new_customer: "bl_new_customer",
  products: "bl_products",
  inventory: "inventory",
};

export function bizKey(type: BizType | null | undefined, key: SemanticKey): TKey {
  const eff = (type ?? "retail") as BizType;
  return LABEL_MAP[eff]?.[key] ?? DEFAULT_KEY[key];
}

export const HOME_GREETING_KEY: Record<BizType, TKey> = {
  retail:    "bg_retail",
  education: "bg_education",
  beauty:    "bg_beauty",
  property:  "bg_property",
  fnb:       "bg_fnb",
  freelance: "bg_freelance",
};

/** Section title for "My ___ Form" entry/page, per business type. */
export function pofSectionTitleKey(type: BizType | null | undefined): TKey {
  switch (type) {
    case "education":
    case "property":
      return "pof_section_title_enquiry";
    case "beauty":
    case "freelance":
      return "pof_section_title_booking";
    case "retail":
    case "fnb":
    default:
      return "pof_section_title_order";
  }
}

/** Subtitle shown under the form section title, per business type. */
export function pofSectionSubKey(type: BizType | null | undefined): TKey {
  switch (type) {
    case "education":
    case "property":
      return "pof_section_sub_enquiry";
    case "beauty":
    case "freelance":
      return "pof_section_sub_booking";
    case "retail":
    case "fnb":
    default:
      return "pof_section_sub_order";
  }
}

/** Description shown below the public form link, per business type. */
export function pofDescKey(type: BizType | null | undefined): TKey {
  switch (type) {
    case "education":
      return "pof_desc_education";
    case "beauty":
      return "pof_desc_beauty";
    case "property":
      return "pof_desc_property";
    case "freelance":
      return "pof_desc_freelance";
    case "retail":
    case "fnb":
    default:
      return "pof_desc_retail";
  }
}

/** Default category suggestions per business type. */
export const CATEGORY_PRESETS: Record<BizType, string[]> = {
  retail:    ["Clothing", "Accessories", "Electronics", "Beauty", "Home", "Food"],
  fnb:       ["Food", "Drinks", "Desserts", "Snacks", "Sets"],
  beauty:    ["Facial", "Body", "Nails", "Hair", "Massage"],
  education: ["Local University", "Overseas", "TVET", "Foundation", "Diploma", "Postgraduate"],
  property:  ["Condo", "Terrace", "Apartment", "Commercial", "Land", "Insurance"],
  freelance: ["Design", "IT", "Cleaning", "Marketing", "Writing", "Consulting"],
};