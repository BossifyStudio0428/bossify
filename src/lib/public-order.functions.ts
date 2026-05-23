import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const PUBLIC_SUPABASE_URL = "https://knouahqwazerjiyiqgmh.supabase.co";
const PUBLIC_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtub3VhaHF3YXplcmppeWlxZ21oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjgzNDEsImV4cCI6MjA5Mjk0NDM0MX0.VF6SsKKhnAZ9vbD1HeH3KoEpt_XYdjTJqITGBSg3yjs";

function getPublicClient() {
  const serviceKey = process.env.APP_SUPABASE_SERVICE_ROLE_KEY;
  return createClient(PUBLIC_SUPABASE_URL, serviceKey || PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const CODE_RE = /^[a-z0-9_-]{4,32}$/i;

const SubmitSchema = z.object({
  code: z.string().regex(CODE_RE),
  customer_name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(32).optional().default(""),
  product: z.string().trim().min(1).max(160),
  quantity: z.number().int().min(1).max(9999).optional().default(1),
  amount: z.number().min(0).max(10_000_000).optional().default(0),
  notes: z.string().trim().max(2000).optional().default(""),
  // Business-type specific extras (all optional strings)
  course_interest: z.string().trim().max(160).optional().default(""),
  university_preference: z.string().trim().max(160).optional().default(""),
  date_time: z.string().trim().max(64).optional().default(""),
  budget: z.string().trim().max(64).optional().default(""),
  location_interest: z.string().trim().max(160).optional().default(""),
  project_description: z.string().trim().max(2000).optional().default(""),
  deadline: z.string().trim().max(64).optional().default(""),
});

export const getPublicOrderForm = createServerFn({ method: "GET" })
  .inputValidator((input: { code: string }) => {
    return z.object({ code: z.string().regex(CODE_RE) }).parse(input);
  })
  .handler(async ({ data }) => {
    const sb = getPublicClient() as any;
    const { data: profile, error } = await sb
      .from("profiles")
      .select(
        "id, business_name, avatar_url, business_type, whatsapp_number, order_form_enabled, order_form_code",
      )
      .eq("order_form_code", data.code.toLowerCase())
      .maybeSingle();

    if (error || !profile) return { ok: false as const, reason: "not_found" as const };
    if (profile.order_form_enabled === false) {
      return { ok: false as const, reason: "disabled" as const };
    }

    const bizType: string = profile.business_type ?? "retail";
    const isRetailish = bizType === "retail" || bizType === "fnb";

    // Pull either inventory items (retail/fnb) or services (others)
    let products: Array<{ id: string; name: string; price: number }> = [];
    if (isRetailish) {
      const { data: inv } = await sb
        .from("inventory")
        .select("id,name,price")
        .eq("user_id", profile.id)
        .order("name", { ascending: true });
      products = ((inv ?? []) as any[]).map((x) => ({
        id: String(x.id),
        name: String(x.name),
        price: Number(x.price ?? 0),
      }));
    } else {
      const { data: svc } = await sb
        .from("services")
        .select("id,name,price,is_active")
        .eq("user_id", profile.id)
        .eq("is_active", true)
        .order("name", { ascending: true });
      products = ((svc ?? []) as any[]).map((x) => ({
        id: String(x.id),
        name: String(x.name),
        price: Number(x.price ?? 0),
      }));
    }

    return {
      ok: true as const,
      profile: {
        business_name: profile.business_name ?? "",
        avatar_url: profile.avatar_url ?? null,
        business_type: bizType,
        whatsapp_number: profile.whatsapp_number ?? null,
        language: (profile as any).language ?? "en",
      },
      products,
    };
  });

function genCode() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rnd = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  return `ORD-${ymd}-${rnd}`;
}

export const submitPublicOrder = createServerFn({ method: "POST" })
  .inputValidator((input) => SubmitSchema.parse(input))
  .handler(async ({ data }) => {
    const sb = getPublicClient() as any;

    const { data: profile, error: pErr } = await sb
      .from("profiles")
      .select("id, business_type, order_form_enabled, business_name")
      .eq("order_form_code", data.code.toLowerCase())
      .maybeSingle();
    if (pErr || !profile) return { ok: false as const, reason: "not_found" as const };
    if (profile.order_form_enabled === false) {
      return { ok: false as const, reason: "disabled" as const };
    }

    const bizType: string = profile.business_type ?? "retail";
    const isRetailish = bizType === "retail" || bizType === "fnb";
    const userId: string = profile.id;

    // Build notes from biz-specific extras + user notes
    const extra: string[] = [];
    if (bizType === "education") {
      if (data.course_interest) extra.push(`Course: ${data.course_interest}`);
      if (data.university_preference) extra.push(`University: ${data.university_preference}`);
    } else if (bizType === "beauty") {
      if (data.date_time) extra.push(`Preferred: ${data.date_time}`);
    } else if (bizType === "property") {
      if (data.budget) extra.push(`Budget: ${data.budget}`);
      if (data.location_interest) extra.push(`Location: ${data.location_interest}`);
    } else if (bizType === "freelance") {
      if (data.project_description) extra.push(`Project: ${data.project_description}`);
      if (data.deadline) extra.push(`Deadline: ${data.deadline}`);
    }
    const combinedNotes =
      [extra.join("\n"), (data.notes || "").trim()].filter(Boolean).join("\n\n") || null;

    const code = genCode();
    const phoneDigits = (data.phone || "").replace(/\D/g, "");
    const qty = isRetailish ? Math.max(1, Number(data.quantity) || 1) : 1;
    const amount = Number(data.amount) || 0;

    const { data: inserted, error: oErr } = await sb
      .from("orders")
      .insert({
        user_id: userId,
        code,
        customer_name: data.customer_name.trim(),
        phone: phoneDigits || null,
        product: data.product.trim(),
        quantity: qty,
        amount,
        status: "Unpaid",
        notes: combinedNotes,
        order_source: "online_form",
      })
      .select("id, code")
      .single();

    if (oErr || !inserted) {
      return { ok: false as const, reason: "insert_failed" as const, error: oErr?.message };
    }

    // Upsert customer by phone
    if (phoneDigits) {
      const { data: existing } = await sb
        .from("customers")
        .select("id,total_orders,total_spent")
        .eq("user_id", userId)
        .eq("phone", phoneDigits)
        .maybeSingle();
      if (existing) {
        await sb
          .from("customers")
          .update({
            total_orders: (existing.total_orders ?? 0) + 1,
            total_spent: Number(existing.total_spent ?? 0) + amount,
            last_order_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        await sb.from("customers").insert({
          user_id: userId,
          name: data.customer_name.trim(),
          phone: phoneDigits,
          total_orders: 1,
          total_spent: amount,
          last_order_at: new Date().toISOString(),
        });
      }
    }

    // Push notification to seller (best-effort)
    try {
      await sb.functions.invoke("send-push", {
        body: {
          kind: "new_order",
          targetUserId: userId,
          title: "New order received! 🛍️",
          body: `From ${data.customer_name} · ${data.product}`,
          link: "/orders",
        },
      });
    } catch {
      /* non-fatal */
    }

    return {
      ok: true as const,
      code: inserted.code,
      business_name: profile.business_name ?? "",
    };
  });