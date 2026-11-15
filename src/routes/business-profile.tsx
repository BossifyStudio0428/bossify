import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Camera, Store, RefreshCw, CheckCircle2, ArrowRight, Info } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { PhoneInput } from "@/components/PhoneInput";
import { refreshBusinessProfile } from "@/hooks/use-business-profile";

export const Route = createFileRoute("/business-profile")({ component: BusinessProfilePage });

type TikTokShop = { status: string; shop_name: string | null; last_synced_at: string | null } | null;

function BusinessProfilePage() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const L = (zh: string, en: string, ms?: string) => (lang === "zh" ? zh : lang === "ms" ? ms ?? en : en);
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ business_name: "", whatsapp_number: "", avatar_url: "" });
  const [tiktok, setTiktok] = useState<TikTokShop>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data }, { data: conn }] = await Promise.all([
        supabase.from("profiles").select("business_name,whatsapp_number,avatar_url").eq("id", user.id).maybeSingle(),
        supabase
          .from("platform_connections" as any)
          .select("status,platform_shop_name,last_synced_at")
          .eq("user_id", user.id)
          .eq("platform", "tiktok")
          .maybeSingle(),
      ]);
      if (data) {
        setForm({
          business_name: data.business_name ?? "",
          whatsapp_number: data.whatsapp_number ?? "",
          avatar_url: data.avatar_url ?? "",
        });
      }
      const c = conn as any;
      setTiktok(c ? { status: c.status, shop_name: c.platform_shop_name ?? null, last_synced_at: c.last_synced_at ?? null } : null);
      setLoading(false);
    })();
  }, [user]);

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) { toast.error(t("photo_max_5mb")); return; }
    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (upErr) { toast.error(upErr.message); setUploading(false); return; }
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    const url = pub.publicUrl;
    setForm((p) => ({ ...p, avatar_url: url }));
    // Saved straight away so the photo shows on the dashboard and top bar
    // even without tapping Save.
    const { error: updErr } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
    setUploading(false);
    if (updErr) toast.error(updErr.message);
    else {
      refreshBusinessProfile({ businessName: form.business_name || null, avatarUrl: url }, user.id);
      toast.success(t("photo_updated"));
    }
  };

  const save = async () => {
    if (!user) return;
    if (!form.business_name.trim()) { toast.error(t("required_field")); return; }
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      business_name: form.business_name.trim(),
      whatsapp_number: form.whatsapp_number.trim() || null,
      avatar_url: form.avatar_url || null,
    }).eq("id", user.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      refreshBusinessProfile({ businessName: form.business_name.trim(), avatarUrl: form.avatar_url || null }, user.id);
      toast.success(t("profile_updated"));
      navigate({ to: "/profile" });
    }
  };

  if (loading) return <p className="p-6 text-sm text-muted-foreground">{t("loading")}</p>;

  const connected = tiktok?.status === "active";
  const tiktokName = tiktok?.shop_name?.trim() || "";
  const nameDiffers = !!tiktokName && tiktokName !== form.business_name.trim();
  const initials = (form.business_name || t("name_initial_ph")).slice(0, 2).toUpperCase();

  return (
    <div className="px-5 pt-8 pb-28 space-y-5 lg:max-w-2xl lg:mx-auto lg:pb-10">
      <header className="flex items-center gap-3">
        <button onClick={() => navigate({ to: "/profile" })} aria-label={L("返回", "Back", "Kembali")} className="h-10 w-10 rounded-full bg-card border border-border/60 flex items-center justify-center">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold">{t("business_profile")}</h1>
      </header>

      {/* Hero: photo + name */}
      <section className="rounded-3xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground p-5 shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative h-20 w-20 shrink-0 rounded-2xl"
            aria-label={t("change_photo")}
          >
            <span className="block h-full w-full rounded-2xl bg-white/20 ring-2 ring-white/40 flex items-center justify-center text-2xl font-bold overflow-hidden">
              {form.avatar_url ? <img src={form.avatar_url} alt="" className="h-full w-full object-cover" /> : initials}
            </span>
            <span className="absolute -bottom-1.5 -right-1.5 h-8 w-8 rounded-full bg-card text-foreground border-2 border-primary flex items-center justify-center shadow-md">
              <Camera className="h-4 w-4" />
            </span>
          </button>
          <div className="min-w-0">
            <p className="text-lg font-bold leading-tight truncate">{form.business_name || L("你的店名", "Your business name", "Nama perniagaan anda")}</p>
            {form.whatsapp_number && <p className="text-xs opacity-80 truncate mt-0.5">WhatsApp {form.whatsapp_number}</p>}
            <span className={`inline-flex items-center gap-1 mt-2 text-[10px] font-semibold px-2 py-0.5 rounded-full ${connected ? "bg-black text-white" : "bg-white/20"}`}>
              {connected ? <CheckCircle2 className="h-3 w-3" /> : <Store className="h-3 w-3" />}
              {connected ? `TikTok · ${tiktokName || L("已连接", "Connected")}` : L("TikTok 未连接", "TikTok not connected", "TikTok belum disambung")}
            </span>
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onUpload} />
        <p className="text-[11px] opacity-80 mt-3">
          {uploading
            ? t("uploading")
            : L("点照片可以更换。这张照片会显示在首页和右上角。", "Tap the photo to change it. It shows on the dashboard and in the top bar.", "Tekan foto untuk menukar. Ia dipapar di papan pemuka dan bar atas.")}
        </p>
      </section>

      {/* TikTok Shop */}
      <section className="rounded-3xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="h-8 w-8 rounded-xl bg-black text-white flex items-center justify-center"><Store className="h-4 w-4" /></span>
          <h2 className="text-sm font-bold flex-1">TikTok Shop</h2>
          {connected && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700">{L("已连接", "Connected", "Bersambung")}</span>}
        </div>
        {connected ? (
          <>
            <div className="rounded-2xl bg-muted/40 px-3 py-2.5 text-sm">
              <p className="text-[11px] text-muted-foreground">{L("TikTok 上的店名", "Shop name on TikTok", "Nama kedai di TikTok")}</p>
              <p className="font-semibold text-foreground">{tiktokName || "—"}</p>
              {tiktok?.last_synced_at && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  {L("上次同步", "Last synced", "Segerak terakhir")} {new Date(tiktok.last_synced_at).toLocaleString(lang === "zh" ? "zh-CN" : "en-MY")}
                </p>
              )}
            </div>
            {nameDiffers && (
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, business_name: tiktokName }))}
                className="w-full py-2.5 rounded-xl bg-black text-white text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-[0.99]"
              >
                <RefreshCw className="h-3.5 w-3.5" /> {L(`用 TikTok 店名「${tiktokName}」`, `Use TikTok shop name "${tiktokName}"`, `Guna nama kedai TikTok "${tiktokName}"`)}
              </button>
            )}
            <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
              <Info className="h-3.5 w-3.5 shrink-0 mt-px" />
              {L(
                "TikTok 只提供店名，不提供店铺头像，所以照片要在上面自己上传。",
                "TikTok only shares the shop name, not the shop logo, so upload your photo above.",
                "TikTok hanya beri nama kedai, bukan logo, jadi muat naik foto anda di atas.",
              )}
            </p>
          </>
        ) : (
          <Link
            to="/connected-platforms/$platform"
            params={{ platform: "tiktok" }}
            className="w-full py-3 rounded-xl bg-black text-white text-sm font-semibold flex items-center justify-center gap-1.5"
          >
            {L("连接 TikTok Shop", "Connect TikTok Shop", "Sambung TikTok Shop")} <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </section>

      {/* Details */}
      <section className="rounded-3xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 space-y-4">
        <h2 className="text-sm font-bold">{L("店铺资料", "Business details", "Butiran perniagaan")}</h2>
        <Field label={t("business_name")} value={form.business_name} onChange={(v) => setForm((p) => ({ ...p, business_name: v }))} />
        <PhoneInput
          label={`WhatsApp ${t("phone_number")}`}
          value={form.whatsapp_number}
          onChange={(v) => setForm((p) => ({ ...p, whatsapp_number: v }))}
        />
      </section>

      <div className="fixed inset-x-0 bottom-0 z-20 bg-background/95 backdrop-blur border-t border-border/50 px-5 py-3 lg:static lg:bg-transparent lg:border-0 lg:p-0" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}>
        <button
          onClick={save}
          disabled={saving}
          className="w-full max-w-2xl mx-auto block py-4 rounded-2xl bg-primary text-primary-foreground font-bold text-sm shadow-[var(--shadow-soft)] disabled:opacity-60"
        >
          {saving ? t("saving") : t("save")}
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl bg-muted/40 border border-border/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
      />
    </div>
  );
}
