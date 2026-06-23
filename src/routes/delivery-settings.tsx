import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PlacesAutocomplete } from "@/components/PlacesAutocomplete";
import { useI18n } from "@/contexts/I18nContext";

export const Route = createFileRoute("/delivery-settings")({ component: DeliverySettingsPage });

type Zone = { max_km: number; fee: number };

const DEFAULT_ZONES: Zone[] = [
  { max_km: 2, fee: 3 },
  { max_km: 5, fee: 6 },
  { max_km: 10, fee: 10 },
];

function DeliverySettingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [zones, setZones] = useState<Zone[]>(DEFAULT_ZONES);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("delivery_enabled,store_address,store_lat,store_lng,delivery_zones" as any)
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const p = (data as any) ?? {};
      setEnabled(!!p.delivery_enabled);
      setAddress(p.store_address ?? "");
      setLat(p.store_lat != null ? Number(p.store_lat) : null);
      setLng(p.store_lng != null ? Number(p.store_lng) : null);
      const z = Array.isArray(p.delivery_zones) ? p.delivery_zones : [];
      setZones(z.length > 0 ? z.map((x: any) => ({ max_km: Number(x.max_km), fee: Number(x.fee) })) : DEFAULT_ZONES);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const save = async () => {
    if (!user) return;
    if (enabled && (lat == null || lng == null)) {
      toast.error("Pick your store address from the suggestions so we have map coordinates.");
      return;
    }
    const cleanZones = zones
      .map((z) => ({ max_km: Number(z.max_km), fee: Number(z.fee) }))
      .filter((z) => isFinite(z.max_km) && z.max_km > 0 && isFinite(z.fee) && z.fee >= 0)
      .sort((a, b) => a.max_km - b.max_km);
    if (enabled && cleanZones.length === 0) {
      toast.error("Add at least one delivery zone.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        delivery_enabled: enabled,
        store_address: address || null,
        store_lat: lat,
        store_lng: lng,
        delivery_zones: cleanZones,
      } as any)
      .eq("id", user.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Saved");
  };

  const updZone = (i: number, key: keyof Zone, val: string) => {
    const n = Number(val);
    setZones((p) => p.map((z, idx) => (idx === i ? { ...z, [key]: isFinite(n) ? n : 0 } : z)));
  };

  return (
    <div className="px-5 pt-10 pb-10 space-y-5 max-w-[480px] mx-auto">
      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate({ to: "/profile" })}
          className="h-9 w-9 rounded-full bg-card border border-border/60 flex items-center justify-center active:scale-95"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-foreground">🛵 {t("ds_title")}</h1>
          <p className="text-[11px] text-muted-foreground">{t("ds_subtitle")}</p>
        </div>
      </header>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-10">{t("loading")}</p>
      ) : (
        <>
          <section className="rounded-2xl bg-card border border-border/60 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="min-w-0 pr-3">
                <p className="text-sm font-semibold">{t("ds_enable")}</p>
                <p className="text-[11px] text-muted-foreground">{t("ds_enable_desc")}</p>
              </div>
              <button
                type="button"
                onClick={() => setEnabled((v) => !v)}
                role="switch"
                aria-checked={enabled}
                className={`relative h-6 w-11 rounded-full transition-colors shrink-0 ${enabled ? "bg-primary" : "bg-muted-foreground/30"}`}
              >
                <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : ""}`} />
              </button>
            </div>
          </section>

          <section className="rounded-2xl bg-card border border-border/60 p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold">{t("ds_store_address")}</p>
              <p className="text-[11px] text-muted-foreground">{t("ds_store_address_desc")}</p>
            </div>
            <PlacesAutocomplete
              value={address}
              onChange={({ address: a, lat: la, lng: ln }) => {
                setAddress(a);
                if (la != null && ln != null) {
                  setLat(la);
                  setLng(ln);
                }
              }}
              placeholder="e.g. 123 Jalan Ampang, Kuala Lumpur"
              className="w-full rounded-xl bg-muted/40 border border-border/60 px-3 py-2.5 text-sm"
            />
            {lat != null && lng != null && (
              <p className="text-[10px] text-muted-foreground">📍 {lat.toFixed(5)}, {lng.toFixed(5)}</p>
            )}
          </section>

          <section className="rounded-2xl bg-card border border-border/60 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">{t("ds_zones")}</p>
                <p className="text-[11px] text-muted-foreground">{t("ds_zones_desc")}</p>
              </div>
              <button
                type="button"
                onClick={() => setZones((p) => [...p, { max_km: 0, fee: 0 }])}
                className="h-8 px-2.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Add
              </button>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-[10px] font-semibold uppercase text-muted-foreground px-1">
                <span>{t("ds_up_to_km")}</span>
                <span>{t("ds_fee_rm")}</span>
                <span />
              </div>
              {zones.map((z, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.1"
                    value={z.max_km}
                    onChange={(e) => updZone(i, "max_km", e.target.value)}
                    className="rounded-xl bg-muted/40 border border-border/60 px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.5"
                    value={z.fee}
                    onChange={(e) => updZone(i, "fee", e.target.value)}
                    className="rounded-xl bg-muted/40 border border-border/60 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setZones((p) => p.filter((_, idx) => idx !== i))}
                    className="h-9 w-9 rounded-full bg-muted/60 flex items-center justify-center text-rose-500"
                    aria-label="Remove"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm shadow-lg disabled:opacity-60 active:scale-[0.99]"
          >
            {saving ? t("saving") : t("save")}
          </button>
        </>
      )}
    </div>
  );
}