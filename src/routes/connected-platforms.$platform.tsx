import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Capacitor } from "@capacitor/core";
import { ChevronLeft, Check, Loader2 } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getPlatform } from "@/lib/platforms";
import { PlatformIcon } from "@/components/PlatformIcon";
import {
  startPlatformConnect,
  disconnectPlatform,
  getPlatformConnection,
} from "@/lib/platformConnect.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/connected-platforms/$platform")({
  component: PlatformConnectPage,
});

const API_ORIGIN = "https://tanstack-start-app.bossifystudio.workers.dev";
const isNative = Capacitor.isNativePlatform();

async function getAuthHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function PlatformConnectPage() {
  const { platform } = Route.useParams();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMessage, setSheetMessage] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [connection, setConnection] = useState<null | {
    platform_shop_name: string | null;
    status: string;
    last_synced_at: string | null;
  }>(null);

  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [importingProducts, setImportingProducts] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const cfg = getPlatform(platform);
  const startConnect = useServerFn(startPlatformConnect);
  const disconnect = useServerFn(disconnectPlatform);
  const getConnection = useServerFn(getPlatformConnection);

  useEffect(() => {
    if (!user || !cfg) return;
    (async () => {
      try {
        if (isNative) {
          const headers = await getAuthHeader();
          const res = await fetch(
            `${API_ORIGIN}/api/platforms/connect?platform=${encodeURIComponent(cfg.key)}`,
            { headers },
          );
          const j = await res.json();
          setConnection(j?.connection ?? null);
        } else {
          const { connection: c } = await getConnection({
            data: { platform: cfg.key as any },
          });
          setConnection(c as any);
        }
      } catch {
        setConnection(null);
      }
    })();
  }, [user, cfg, getConnection]);

  const connected = connection?.status === "active";

  const handleConnect = async () => {
    if (!cfg) return;
    setBusy(true);
    try {
      if (isNative) {
        const headers = await getAuthHeader();
        const res = await fetch(`${API_ORIGIN}/api/platforms/connect`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ platform: cfg.key }),
        });
        const j = await res.json();
        if (!res.ok || !j?.authUrl) {
          throw new Error(j?.message || "Something went wrong. Please try again.");
        }
        window.location.href = j.authUrl;
      } else {
        const { authUrl } = await startConnect({ data: { platform: cfg.key as any } });
        window.location.href = authUrl;
      }
    } catch (err: any) {
      setSheetMessage(err?.message || "Something went wrong. Please try again.");
      setSheetOpen(true);
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    if (!cfg) return;
    setBusy(true);
    try {
      if (isNative) {
        const headers = await getAuthHeader();
        await fetch(`${API_ORIGIN}/api/platforms/connect`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ platform: cfg.key }),
        });
      } else {
        await disconnect({ data: { platform: cfg.key as any } });
      }
      setConnection(null);
    } finally {
      setBusy(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${API_ORIGIN}/api/platforms/${cfg?.key}/sync`, {
        method: "POST",
        headers,
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.message || "Sync failed");
      const skippedCount = (j.skipped ?? []).length;
      setSyncMsg(
        `${j.completed ?? 0} order(s) updated with real data` +
          (skippedCount > 0 ? `, ${skippedCount} still pending` : ""),
      );
    } catch (err: any) {
      setSyncMsg(err?.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleImportProducts = async () => {
    setImportingProducts(true);
    setImportMsg(null);
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${API_ORIGIN}/api/platforms/${cfg?.key}/sync-products`, {
        method: "POST",
        headers,
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.message || "Import failed");
      const importedCount = (j.imported ?? []).length;
      const refreshedCount = Number(j.refreshed ?? 0);
      const delistedCount = Number(j.delisted ?? 0);
      const parts: string[] = [];
      if (importedCount > 0) {
        parts.push(`${importedCount} new product(s) imported — set their real cost in Inventory before relying on profit numbers.`);
      }
      if (delistedCount > 0) {
        parts.push(`${delistedCount} product(s) no longer found on TikTok — flagged in Inventory, not removed.`);
      }
      if (parts.length === 0) {
        parts.push(
          refreshedCount > 0
            ? `No new products — refreshed price/stock on ${refreshedCount} already-linked product(s).`
            : `No new products to import (${j.linked ?? 0} already linked).`,
        );
      }
      setImportMsg(parts.join(" "));
    } catch (err: any) {
      setImportMsg(err?.message || "Import failed");
    } finally {
      setImportingProducts(false);
    }
  };

  if (!cfg) {
    return (
      <div className="px-5 pt-10 pb-8">
        <button onClick={() => navigate({ to: "/profile" })} className="text-sm text-muted-foreground underline">
          ← {t("back")}
        </button>
        <p className="mt-6 text-sm">Platform not found.</p>
      </div>
    );
  }

  return (
    <div className="px-5 pt-10 pb-8 space-y-6">
      <header className="flex items-center gap-3">
        <button
          onClick={() => navigate({ to: "/profile" })}
          className="h-10 w-10 rounded-full bg-card border border-border/60 flex items-center justify-center"
          aria-label={t("back")}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold">{cfg.name}</h1>
      </header>

      <div className="flex flex-col items-center text-center gap-3">
        <div className="shadow-[var(--shadow-soft)]">
          <PlatformIcon platform={cfg.key} size={96} />
        </div>
        <span
          className={`text-xs font-semibold px-3 py-1 rounded-full ${
            connected
              ? "bg-emerald-500/15 text-emerald-700"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {connected ? `${t("connected")} ✅` : t("not_connected")}
        </span>
        <p className="text-sm text-muted-foreground max-w-sm">{cfg.description[lang]}</p>
      </div>

      <section className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 space-y-3">
        {cfg.benefits[lang].map((b, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className="h-6 w-6 rounded-full bg-emerald-500/15 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
            </span>
            <p className="text-sm text-foreground flex-1">{b}</p>
          </div>
        ))}
      </section>

      <button
        type="button"
        disabled={busy}
        onClick={connected ? handleDisconnect : handleConnect}
        className="w-full py-4 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-bold text-sm shadow-[var(--shadow-soft)] active:scale-[0.99] disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {connected ? "Disconnect" : cfg.connectLabel[lang]}
      </button>

      {connected && cfg.key === "tiktok" && (
        <div className="space-y-2">
          <button
            type="button"
            disabled={importingProducts}
            onClick={handleImportProducts}
            className="w-full py-3.5 rounded-2xl bg-card border border-border/60 text-foreground font-semibold text-sm active:scale-[0.99] disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {importingProducts && <Loader2 className="h-4 w-4 animate-spin" />}
            {importingProducts ? "Importing…" : "Import products from TikTok"}
          </button>
          {importMsg && <p className="text-xs text-center text-muted-foreground">{importMsg}</p>}

          <button
            type="button"
            disabled={syncing}
            onClick={handleSync}
            className="w-full py-3.5 rounded-2xl bg-card border border-border/60 text-foreground font-semibold text-sm active:scale-[0.99] disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {syncing && <Loader2 className="h-4 w-4 animate-spin" />}
            {syncing ? "Syncing…" : "Sync pending orders now"}
          </button>
          {syncMsg && <p className="text-xs text-center text-muted-foreground">{syncMsg}</p>}
        </div>
      )}

      {sheetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 animate-fade-in"
          onClick={() => setSheetOpen(false)}
        >
          <div
            className="w-full max-w-[390px] bg-card rounded-t-3xl p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto h-1 w-10 rounded-full bg-muted" />
            <p className="text-lg font-bold text-foreground py-1">
              {sheetMessage ? "Connection error" : t("coming_soon_title")}
            </p>
            <p className="text-sm text-muted-foreground">
              {sheetMessage || cfg.comingSoonMsg[lang]}
            </p>
            <button
              onClick={() => { setSheetOpen(false); setSheetMessage(""); }}
              className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}