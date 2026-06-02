import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Plus, Search, ImageIcon, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n, type TKey } from "@/contexts/I18nContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { exportListingsPDF } from "@/lib/propertyPdf";

export const Route = createFileRoute("/listings")({ component: ListingsPage });

type Listing = {
  id: string;
  title: string;
  property_type: string;
  listing_type: string;
  price: number;
  address: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  size_sqft: number | null;
  status: string;
  images: string[];
};

type FilterKey = "all" | "sale" | "rent" | "available" | "sold";

const STATUS_STYLES: Record<string, string> = {
  available: "bg-emerald-100 text-emerald-700",
  reserved: "bg-amber-100 text-amber-700",
  sold: "bg-red-100 text-red-600",
  rented: "bg-blue-100 text-blue-700",
};

function ListingsPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { type: bizType, loading: bizLoading } = useBusinessType();
  const { hasFullAccess, showUpgrade } = useSubscription();
  const navigate = useNavigate();
  const [items, setItems] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!bizLoading && bizType && bizType !== "property") {
      navigate({ to: "/", replace: true });
    }
  }, [bizLoading, bizType, navigate]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("property_listings" as never)
      .select("id,title,property_type,listing_type,price,address,bedrooms,bathrooms,size_sqft,status,images")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setItems(((data as any) ?? []).map((r: any) => ({ ...r, images: Array.isArray(r.images) ? r.images : [] })) as Listing[]);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter((it) => {
      if (filter === "sale" && it.listing_type !== "sale") return false;
      if (filter === "rent" && it.listing_type !== "rent") return false;
      if (filter === "available" && it.status !== "available") return false;
      if (filter === "sold" && it.status !== "sold") return false;
      if (term) {
        const hay = (it.title + " " + (it.address ?? "")).toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [items, filter, q]);

  const filters: { key: FilterKey; labelKey: TKey }[] = [
    { key: "all", labelKey: "all" },
    { key: "sale", labelKey: "lt_sale" },
    { key: "rent", labelKey: "lt_rent" },
    { key: "available", labelKey: "status_available" },
    { key: "sold", labelKey: "status_sold" },
  ];

  const onExport = async () => {
    if (!hasFullAccess) { showUpgrade(t("pro_feature_required")); return; }
    if (!user) return;
    try {
      const { data: prof } = await supabase.from("profiles").select("business_name").eq("id", user.id).maybeSingle();
      await exportListingsPDF({
        lang, businessName: (prof as any)?.business_name || "Bossify",
        rows: items,
      });
    } catch (e: any) { toast.error(e?.message || "Failed to export"); }
  };

  return (
    <div className="px-5 pt-10 pb-28 space-y-4">
      <header className="flex items-center gap-2">
        <Link to="/" className="-ml-2 p-2 rounded-full active:bg-muted">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{t("listings_title")}</h1>
        <span className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
          {items.length}
        </span>
        <button
          onClick={onExport}
          aria-label={t("export_pdf")}
          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-full bg-primary/10 text-primary active:scale-95"
        >
          <Download className="h-3.5 w-3.5" /> {t("export_pdf")}
        </button>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <Link to="/viewings" className="rounded-2xl bg-card border border-border/60 p-2 text-center active:scale-95 transition-transform">
          <div className="text-lg">📅</div>
          <p className="text-[10px] font-semibold text-foreground truncate">{t("viewings_title")}</p>
        </Link>
        <Link to="/documents" className="rounded-2xl bg-card border border-border/60 p-2 text-center active:scale-95 transition-transform">
          <div className="text-lg">📄</div>
          <p className="text-[10px] font-semibold text-foreground truncate">{t("documents_title")}</p>
        </Link>
        <Link to="/loan-calculator" className="rounded-2xl bg-card border border-border/60 p-2 text-center active:scale-95 transition-transform">
          <div className="text-lg">🧮</div>
          <p className="text-[10px] font-semibold text-foreground truncate">{t("loan_calc_title")}</p>
        </Link>
      </div>

      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("search_listings")}
          className="w-full pl-9 pr-3 py-2.5 rounded-2xl bg-muted/60 text-sm outline-none focus:bg-muted"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto -mx-1 px-1 no-scrollbar">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border ${
              filter === f.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground border-border/60"
            }`}
          >
            {t(f.labelKey)}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {loading && (
          <div className="flex justify-center py-10">
            <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          </div>
        )}
        {!loading && visible.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10">{t("no_listings_yet")}</p>
        )}
        {!loading && visible.map((it) => (
          <Link
            key={it.id}
            to="/listing/$id"
            params={{ id: it.id }}
            className="block rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] overflow-hidden active:scale-[0.99] transition-transform"
          >
            <div className="aspect-[16/9] bg-muted relative">
              {it.images[0] ? (
                <img src={it.images[0]} alt={it.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  <ImageIcon className="h-8 w-8" />
                </div>
              )}
              <div className="absolute top-2 left-2 flex gap-1.5">
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-white/95 text-foreground">
                  {t(propTypeKey(it.property_type))}
                </span>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-primary text-primary-foreground">
                  {t(it.listing_type === "rent" ? "lt_rent" : "lt_sale")}
                </span>
              </div>
              <span className={`absolute top-2 right-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${STATUS_STYLES[it.status] ?? "bg-muted text-foreground"}`}>
                {t(statusKey(it.status))}
              </span>
            </div>
            <div className="p-3 space-y-1">
              <p className="text-sm font-bold text-foreground truncate">{it.title}</p>
              {it.address && (
                <p className="text-[11px] text-muted-foreground truncate">{it.address}</p>
              )}
              <div className="flex items-center justify-between pt-1">
                <p className="text-base font-bold text-primary">RM {Number(it.price).toLocaleString()}</p>
                <p className="text-[11px] text-muted-foreground">
                  {(it.bedrooms ?? 0)} {t("bedrooms_short")} · {(it.bathrooms ?? 0)} {t("bathrooms_short")} · {(it.size_sqft ?? 0)} sqft
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <Link
        to="/listing/$id"
        params={{ id: "new" }}
        aria-label={t("add_listing")}
        className="fixed bottom-24 z-30 h-14 w-14 rounded-full text-primary-foreground shadow-[var(--shadow-soft)] flex items-center justify-center active:scale-95 transition-transform bg-gradient-to-br from-primary to-primary/80"
        style={{ right: "max(1.5rem, calc(50vw - 180px + 1rem))" }}
      >
        <Plus className="h-6 w-6" strokeWidth={2.5} />
      </Link>
    </div>
  );
}

export function propTypeKey(v: string): TKey {
  switch (v) {
    case "terrace": return "pt_terrace";
    case "semi_d": return "pt_semi_d";
    case "bungalow": return "pt_bungalow";
    case "office": return "pt_office";
    case "shop": return "pt_shop";
    case "land": return "pt_land";
    default: return "pt_condo";
  }
}

export function statusKey(v: string): TKey {
  switch (v) {
    case "reserved": return "status_reserved";
    case "sold": return "status_sold";
    case "rented": return "status_rented";
    default: return "status_available";
  }
}