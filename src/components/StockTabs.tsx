import { Link, useRouterState } from "@tanstack/react-router";
import { useI18n } from "@/contexts/I18nContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";

type TabKey = "products" | "ingredients" | "recipes" | "suppliers" | "stock-take";

const LABELS: Record<TabKey, { en: string; ms: string; zh: string }> = {
  products:    { en: "Products",   ms: "Produk",     zh: "成品" },
  ingredients: { en: "Ingredients", ms: "Bahan",      zh: "食材" },
  recipes:     { en: "Recipes",     ms: "Resipi",     zh: "食谱" },
  suppliers:   { en: "Suppliers",   ms: "Pembekal",   zh: "供应商" },
  "stock-take":{ en: "Stock Take",  ms: "Ambil Stok", zh: "盘点" },
};

const ROUTE_BY_KEY: Record<TabKey, "/inventory" | "/ingredients" | "/recipes" | "/suppliers" | "/stock-take"> = {
  products: "/inventory",
  ingredients: "/ingredients",
  recipes: "/recipes",
  suppliers: "/suppliers",
  "stock-take": "/stock-take",
};

export function StockTabs({ active }: { active: TabKey }) {
  const { lang } = useI18n();
  const { type } = useBusinessType();
  let tabs: TabKey[];
  if (type === "fnb") {
    tabs = ["products", "ingredients", "recipes", "suppliers", "stock-take"];
  } else if (type === "retail") {
    tabs = ["products", "suppliers", "stock-take"];
  } else {
    tabs = ["products"];
  }
  if (tabs.length <= 1) return null;
  return (
    <div className="-mx-5 px-5 overflow-x-auto no-scrollbar">
      <div className="flex gap-2 pb-1">
        {tabs.map((k) => {
          const isActive = k === active;
          return (
            <Link
              key={k}
              to={ROUTE_BY_KEY[k]}
              className={`shrink-0 px-4 py-2 rounded-full text-xs font-semibold transition-colors border ${
                isActive
                  ? "bg-primary text-primary-foreground border-primary shadow-[var(--shadow-soft)]"
                  : "bg-card text-foreground border-border/60 hover:bg-muted"
              }`}
            >
              {LABELS[k][lang]}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function useActiveStockTab(): TabKey | null {
  const path = useRouterState({ select: (s) => s.location.pathname });
  if (path.startsWith("/inventory")) return "products";
  if (path.startsWith("/ingredients")) return "ingredients";
  if (path.startsWith("/recipes")) return "recipes";
  if (path.startsWith("/suppliers")) return "suppliers";
  if (path.startsWith("/stock-take")) return "stock-take";
  return null;
}