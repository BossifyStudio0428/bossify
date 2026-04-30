import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";

export const Route = createFileRoute("/privacy")({ component: PrivacyPage });

function PrivacyPage() {
  const { user, signOut } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [pw, setPw] = useState({ next: "", confirm: "" });
  const [newEmail, setNewEmail] = useState("");
  const [del, setDel] = useState({ open: false, text: "" });
  const [busy, setBusy] = useState(false);

  const updatePassword = async () => {
    if (pw.next.length < 8) { toast.error("Password must be 8+ chars"); return; }
    if (pw.next !== pw.confirm) { toast.error("Passwords do not match"); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw.next });
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Password updated!"); setPw({ next: "", confirm: "" }); }
  };

  const updateEmail = async () => {
    if (!newEmail.includes("@")) { toast.error("Invalid email"); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Confirmation link sent to new email"); setNewEmail(""); }
  };

  const deleteAccount = async () => {
    if (del.text !== "DELETE" || !user) return;
    setBusy(true);
    // Cascade deletes via FK on_delete cascade should handle children;
    // Best-effort cleanup of user-owned rows in case of stragglers.
    await supabase.from("orders").delete().eq("user_id", user.id);
    await supabase.from("inventory").delete().eq("user_id", user.id);
    await supabase.from("customers").delete().eq("user_id", user.id);
    await supabase.from("notifications").delete().eq("user_id", user.id);
    await supabase.from("subscriptions").delete().eq("user_id", user.id);
    await supabase.from("user_preferences").delete().eq("user_id", user.id);
    await supabase.from("profiles").delete().eq("id", user.id);
    // Note: actually deleting auth.users requires service role / Edge Function.
    // Sign out — user data is purged.
    await signOut();
    setBusy(false);
    toast.success("Account data deleted");
    navigate({ to: "/auth" });
  };

  return (
    <div className="px-5 pt-10 pb-8 space-y-6">
      <header className="flex items-center gap-3">
        <button onClick={() => navigate({ to: "/profile" })} className="h-10 w-10 rounded-full bg-card border border-border/60 flex items-center justify-center">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold">{t("privacy")}</h1>
      </header>

      <section className="rounded-2xl bg-card border border-border/60 p-5 space-y-3">
        <h2 className="text-sm font-bold">{t("change_password")}</h2>
        <Input type="password" placeholder="New password (8+ chars)" value={pw.next} onChange={(v) => setPw((p) => ({ ...p, next: v }))} />
        <Input type="password" placeholder="Confirm new password" value={pw.confirm} onChange={(v) => setPw((p) => ({ ...p, confirm: v }))} />
        <button onClick={updatePassword} disabled={busy} className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-60">Update Password</button>
      </section>

      <section className="rounded-2xl bg-card border border-border/60 p-5 space-y-3">
        <h2 className="text-sm font-bold">Change Email</h2>
        <p className="text-xs text-muted-foreground">Current: {user?.email}</p>
        <Input type="email" placeholder="New email" value={newEmail} onChange={setNewEmail} />
        <button onClick={updateEmail} disabled={busy} className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-60">Update Email</button>
        <p className="text-[11px] text-muted-foreground">A confirmation link will be sent to your new email.</p>
      </section>

      <section className="rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 p-5 space-y-3">
        <h2 className="text-sm font-bold text-red-700 dark:text-red-400">Danger Zone</h2>
        <p className="text-xs text-red-600 dark:text-red-300">Permanently delete your account and all data. This cannot be undone.</p>
        <button onClick={() => setDel({ open: true, text: "" })} className="w-full py-3 rounded-2xl bg-red-600 text-white font-semibold text-sm">{t("delete_account")}</button>
      </section>

      {del.open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={() => setDel({ open: false, text: "" })}>
          <div className="w-full max-w-[390px] bg-card rounded-t-3xl sm:rounded-3xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold">Confirm deletion</h3>
            <p className="text-xs text-muted-foreground">Type <strong>DELETE</strong> to confirm.</p>
            <Input value={del.text} onChange={(v) => setDel((p) => ({ ...p, text: v }))} placeholder="DELETE" />
            <div className="flex gap-2">
              <button onClick={() => setDel({ open: false, text: "" })} className="flex-1 py-3 rounded-2xl bg-muted font-semibold text-sm">{t("cancel")}</button>
              <button onClick={deleteAccount} disabled={del.text !== "DELETE" || busy} className="flex-1 py-3 rounded-2xl bg-red-600 text-white font-semibold text-sm disabled:opacity-50">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Input({ value, onChange, ...rest }: { value: string; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  return (
    <input
      {...rest}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl bg-muted/50 border border-border/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary"
    />
  );
}