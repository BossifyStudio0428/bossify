import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Camera } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";

export const Route = createFileRoute("/business-profile")({ component: BusinessProfilePage });

const BUSINESS_TYPES = ["Food & Beverage", "Fashion", "Beauty", "Handmade", "Others"] as const;

function BusinessProfilePage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    business_name: "",
    business_type: "",
    whatsapp_number: "",
    avatar_url: "",
  });

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("business_name,business_type,whatsapp_number,avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        setForm({
          business_name: data.business_name ?? "",
          business_type: data.business_type ?? "",
          whatsapp_number: data.whatsapp_number ?? "",
          avatar_url: data.avatar_url ?? "",
        });
      }
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
    // Persist immediately so the avatar shows everywhere even if user doesn't tap Save
    const { error: updErr } = await supabase
      .from("profiles")
      .update({ avatar_url: url })
      .eq("id", user.id);
    setUploading(false);
    if (updErr) toast.error(updErr.message);
    else toast.success(t("photo_updated"));
  };

  const save = async () => {
    if (!user) return;
    if (!form.business_name.trim()) { toast.error(t("required_field")); return; }
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      business_name: form.business_name.trim(),
      business_type: form.business_type || null,
      whatsapp_number: form.whatsapp_number.trim() || null,
      avatar_url: form.avatar_url || null,
    }).eq("id", user.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success(t("profile_updated")); navigate({ to: "/profile" }); }
  };

  if (loading) return <p className="p-6 text-sm text-muted-foreground">{t("loading")}</p>;

  return (
    <div className="px-5 pt-10 pb-8 space-y-6">
      <header className="flex items-center gap-3">
        <button onClick={() => navigate({ to: "/profile" })} className="h-10 w-10 rounded-full bg-card border border-border/60 flex items-center justify-center">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold">{t("business_profile")}</h1>
      </header>

      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="relative h-28 w-28 rounded-full shadow-[var(--shadow-soft)]"
          aria-label={t("change_photo")}
        >
          <span className="block h-full w-full rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center text-3xl font-bold overflow-hidden">
            {form.avatar_url
              ? <img src={form.avatar_url} alt="" className="h-full w-full object-cover" />
              : (form.business_name || t("name_initial_ph")).slice(0, 2).toUpperCase()}
          </span>
          <span className="absolute -bottom-1 -right-1 h-9 w-9 rounded-full bg-card border-2 border-background flex items-center justify-center shadow-md">
            <Camera className="h-4 w-4 text-foreground" />
          </span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onUpload} />
        {uploading && <p className="text-xs text-muted-foreground">{t("uploading")}</p>}
      </div>

      <div className="space-y-4">
        <Field label={t("business_name")} value={form.business_name} onChange={(v) => setForm((p) => ({ ...p, business_name: v }))} />

        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{t("business_type_label")}</label>
          <select
            value={form.business_type}
            onChange={(e) => setForm((p) => ({ ...p, business_type: e.target.value }))}
            className="w-full rounded-2xl bg-card border border-border/60 px-4 py-3 text-sm text-foreground"
          >
            <option value="">{t("select_dash")}</option>
            {BUSINESS_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        <Field label={`WhatsApp ${t("phone_number")}`} value={form.whatsapp_number} onChange={(v) => setForm((p) => ({ ...p, whatsapp_number: v }))} type="tel" placeholder="60123456789" />
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="w-full py-4 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-bold text-sm shadow-[var(--shadow-soft)] disabled:opacity-60"
      >
        {saving ? t("saving") : t("save")}
      </button>
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
        className="w-full rounded-2xl bg-card border border-border/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
      />
    </div>
  );
}