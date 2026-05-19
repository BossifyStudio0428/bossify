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
    orders: "bl_leads",
    new_order: "bl_new_lead",
    customers: "bl_clients",
    new_customer: "bl_new_client",
    products: "bl_packages",
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
  new_customer: "new_customer",
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