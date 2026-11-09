import { useEffect, useRef, useState } from "react";
import { Sparkles, X, Send, Trash2, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";

/**
 * Global "Ask AI" widget — a floating button rendered once in AppShell so
 * it's available on every page (not tied to /campaign). Grounded in the
 * seller's own live data server-side; history persists in
 * `ai_chat_messages` so it survives closing/reopening the app.
 *
 * IMPORTANT: this talks to the backend via plain fetch() + Bearer token
 * (see src/routes/api/public/ai-chat/history.ts and send.ts) — NOT
 * createServerFn()/useServerFn(). That earlier version is what caused the
 * button to open to a blank "Bossify" screen with no catchable error on a
 * real Android device: createServerFn()'s RPC transport doesn't reliably
 * work inside the Capacitor WebView (documented project learning), so the
 * request just never resolved anywhere a React error boundary could see
 * it.
 *
 * SECOND, SEPARATE native issue found after fixing the above: a *relative*
 * fetch("/api/...") resolves against the WebView's own local origin on
 * Android, not the deployed worker domain — so on-device it was hitting
 * the app's own HTML shell instead of the API route, which surfaced as
 * "Unexpected token '<', <!doctype..." (the shell's HTML failing to parse
 * as JSON) when the request result was actually awaited (send), and as a
 * silently-swallowed failure where the caller ignores errors (history).
 * The rest of this codebase already established the fix for this: call an
 * ABSOLUTE url (see API_ORIGIN in profile.tsx / connected-platforms.$platform.tsx
 * / inventory.tsx's TikTok sync calls) instead of a relative one. Applying
 * that same fix here.
 */

const API_ORIGIN = "https://tanstack-start-app.bossifystudio.workers.dev";

type ChatMessage = { id: string; role: "user" | "assistant"; content: string; created_at: string };

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

async function apiGetHistory(): Promise<ChatMessage[]> {
  const headers = await authHeaders();
  const res = await fetch(`${API_ORIGIN}/api/public/ai-chat/history`, { method: "GET", headers });
  if (!res.ok) throw new Error(`HISTORY_FAILED_${res.status}`);
  const data = (await res.json()) as { history?: ChatMessage[] };
  return data.history ?? [];
}

async function apiClearHistory(): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${API_ORIGIN}/api/public/ai-chat/history`, { method: "DELETE", headers });
  if (!res.ok) throw new Error(`CLEAR_FAILED_${res.status}`);
}

async function apiSendMessage(message: string, lang: "en" | "ms" | "zh"): Promise<{ reply: string; history: ChatMessage[] }> {
  const headers = await authHeaders();
  const res = await fetch(`${API_ORIGIN}/api/public/ai-chat/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ message, lang }),
  });
  const text = await res.text();
  if (!res.ok) {
    let code = `HTTP_${res.status}`;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j.error) code = j.error;
    } catch {
      // response wasn't JSON — keep the generic HTTP_xxx code
    }
    throw new Error(code);
  }
  return JSON.parse(text) as { reply: string; history: ChatMessage[] };
}

export function AiChatWidget() {
  const { user } = useAuth();
  const { lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    setLoadingHistory(true);
    apiGetHistory()
      .then((h) => {
        if (!cancelled) setMessages(h);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, user?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  if (!user) return null;

  const sendText = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setInput("");
    setSending(true);
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, role: "user", content: trimmed, created_at: new Date().toISOString() },
    ]);
    try {
      const result = await apiSendMessage(trimmed, lang as "en" | "ms" | "zh");
      setMessages(result.history);
    } catch (e: any) {
      const msg = String(e?.message ?? e ?? "");
      // TEMP DEBUG (round 2): the absolute-URL fix didn't fully resolve the
      // send failure, so appending the raw error code again to see what's
      // actually happening now (401 auth, a different HTTP_xxx, a new
      // AI_ERROR_xxx from the gateway, a network-level failure, etc).
      // Remove the "(${msg})" part once this is diagnosed.
      const errText =
        msg.includes("AI_RATE_LIMIT")
          ? (lang === "zh" ? "太频繁了，稍后再试" : lang === "ms" ? "Terlalu kerap, cuba sebentar lagi" : "Too many requests, try again shortly")
          : msg.includes("AI_CREDIT_EXHAUSTED")
            ? (lang === "zh" ? "AI 额度已用完" : lang === "ms" ? "Kredit AI habis" : "AI credit exhausted")
            : msg.includes("AI_OVERLOADED")
              ? (lang === "zh" ? "AI 现在有点忙，稍后再试一次" : lang === "ms" ? "AI sedang sibuk, cuba lagi sebentar" : "AI is a bit busy right now, try again shortly")
              : `${lang === "zh" ? "出错了，请重试" : lang === "ms" ? "Ralat, sila cuba lagi" : "Something went wrong, try again"} (${msg})`;
      setMessages((prev) => [
        ...prev,
        { id: `err-${Date.now()}`, role: "assistant", content: errText, created_at: new Date().toISOString() },
      ]);
    } finally {
      setSending(false);
    }
  };

  const send = () => sendText(input);

  const clearChat = async () => {
    setMessages([]);
    try {
      await apiClearHistory();
    } catch {
      // best-effort — chat will just repopulate from DB next open if this failed
    }
  };

  const placeholder = lang === "zh" ? "问点什么…" : lang === "ms" ? "Tanya apa-apa…" : "Ask anything…";
  const title = lang === "zh" ? "AI 助手" : lang === "ms" ? "Pembantu AI" : "AI Assistant";
  const emptyHint =
    lang === "zh" ? "可以问我你的库存、销售、利润，或任何生意上的问题" : lang === "ms" ? "Tanya saya tentang stok, jualan, untung anda, atau apa-apa soalan perniagaan" : "Ask me about your stock, sales, profit, or anything business-related";
  const popularLabel = lang === "zh" ? "热门问题" : lang === "ms" ? "Soalan popular" : "Popular questions";

  const suggestedQuestions =
    lang === "zh"
      ? ["这个月赚了多少？", "有什么产品快缺货了？", "这个月卖最好的产品是什么？", "怎么提高利润？"]
      : lang === "ms"
        ? ["Berapa untung bulan ini?", "Produk apa yang stok rendah?", "Produk apa paling laku bulan ini?", "Macam mana nak tingkatkan untung?"]
        : ["How much profit this month?", "Which products are low on stock?", "What's my best seller this month?", "How can I improve my profit margin?"];

  return (
    <>
      {/* Back to a plain round icon button, right side, same height as the
          original design — no text label (looked odd / sat too high and
          covered content per feedback). */}
      <button
        onClick={() => setOpen(true)}
        aria-label={title}
        title={title}
        className="fixed right-4 z-40 h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95"
        style={{ bottom: "calc(88px + env(safe-area-inset-bottom))" }}
      >
        <Sparkles className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div
            className="relative w-full max-w-[390px] md:max-w-3xl lg:max-w-5xl xl:max-w-6xl bg-background rounded-t-2xl flex flex-col shadow-2xl"
            style={{ height: "78vh", paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-bold">{title}</h2>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={clearChat} aria-label={lang === "zh" ? "清空对话" : lang === "ms" ? "Kosongkan chat" : "Clear chat"} className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground active:scale-95">
                  <Trash2 className="h-4 w-4" />
                </button>
                <button onClick={() => setOpen(false)} aria-label={lang === "zh" ? "关闭" : lang === "ms" ? "Tutup" : "Close"} className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground active:scale-95">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {loadingHistory ? (
                <p className="text-xs text-muted-foreground text-center py-6">…</p>
              ) : messages.length === 0 ? (
                <div className="py-6 space-y-4">
                  <p className="text-xs text-muted-foreground text-center px-4">{emptyHint}</p>
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold text-muted-foreground px-1">{popularLabel}</p>
                    <div className="flex flex-col gap-2">
                      {suggestedQuestions.map((q) => (
                        <button
                          key={q}
                          onClick={() => sendText(q)}
                          disabled={sending}
                          className="text-left text-sm rounded-2xl px-3.5 py-2.5 bg-card border border-border/60 active:scale-[0.98] disabled:opacity-50"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
                        m.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border border-border/60 text-foreground"
                      }`}
                    >
                      {m.content}
                    </div>
                  </div>
                ))
              )}
              {sending && (
                <div className="flex justify-start">
                  <div className="rounded-2xl px-3.5 py-2.5 bg-card border border-border/60">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="flex items-center gap-2 px-3 py-3 border-t border-border/60 shrink-0">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder={placeholder}
                className="flex-1 rounded-full bg-card border border-border/60 px-4 py-2.5 text-sm"
              />
              <button
                onClick={send}
                disabled={sending || !input.trim()}
                aria-label={lang === "zh" ? "发送" : lang === "ms" ? "Hantar" : "Send"}
                className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 disabled:opacity-50 active:scale-95"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}