import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getPublicOrderClient } from "./public-order.server";

const CODE_RE = /^[a-z0-9_-]{4,32}$/i;

const CartItemSchema = z.object({
  product: z.string().trim().min(1).max(200),
  variant: z.string().trim().max(120).optional().default(""),
  quantity: z.number().int().min(1).max(9999).optional().default(1),
  unit_price: z.number().min(0).max(10_000_000).optional().default(0),
});

const SubmitSchema = z.object({
  code: z.string().regex(CODE_RE),
  customer_name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(32).optional().default(""),
  // Legacy single-item fields (still supported for back-compat)
  product: z.string().trim().max(200).optional().default(""),
  quantity: z.number().int().min(1).max(9999).optional().default(1),
  amount: z.number().min(0).max(10_000_000).optional().default(0),
  // New cart-style submissions (retail / fnb multi-item, or single-item with variant)
  items: z.array(CartItemSchema).max(50).optional().default([]),
  // Optional extras
  fulfilment: z.string().trim().max(40).optional().default(""), // dine_in | takeaway | delivery
  address: z.string().trim().max(500).optional().default(""),
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
    try {
    const sb = getPublicOrderClient() as any;
    const { data: profile, error } = await sb
      .from("profiles")
      .select(
        "id, business_name, avatar_url, business_type, whatsapp_number, order_form_enabled, order_form_code",
      )
      .eq("order_form_code", data.code.toLowerCase())
      .maybeSingle();

    if (error || !profile) return { ok: false as const, reason: "not_found" as const, error: error?.message };
    if (profile.order_form_enabled === false) {
      return { ok: false as const, reason: "disabled" as const };
    }

    const bizType: string = profile.business_type ?? "retail";
    const isRetailish = bizType === "retail" || bizType === "fnb";

    // Pull either inventory items (retail/fnb) or services (others)
    let products: Array<{
      id: string;
      name: string;
      price: number;
      image_url: string | null;
      category: string | null;
      description: string | null;
      variants: Array<{ id?: string; name: string; price: number }>;
      duration_minutes?: number | null;
    }> = [];
    if (isRetailish) {
      const { data: inv } = await sb
        .from("inventory")
        .select("id,name,price,image_url,category,description,variants")
        .eq("user_id", profile.id)
        .order("name", { ascending: true });
      products = ((inv ?? []) as any[]).map((x) => ({
        id: String(x.id),
        name: String(x.name),
        price: Number(x.price ?? 0),
        image_url: x.image_url ?? null,
        category: x.category ?? null,
        description: x.description ?? null,
        variants: Array.isArray(x.variants) ? x.variants : [],
      }));
    } else {
      const { data: svc } = await sb
        .from("services")
        .select("id,name,price,is_active,image_url,category,description,variants,duration_minutes")
        .eq("user_id", profile.id)
        .eq("is_active", true)
        .order("name", { ascending: true });
      products = ((svc ?? []) as any[]).map((x) => ({
        id: String(x.id),
        name: String(x.name),
        price: Number(x.price ?? 0),
        image_url: x.image_url ?? null,
        category: x.category ?? null,
        description: x.description ?? null,
        variants: Array.isArray(x.variants) ? x.variants : [],
        duration_minutes: x.duration_minutes ?? null,
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
    } catch (e: any) {
      console.error("[getPublicOrderForm] threw", e);
      return { ok: false as const, reason: "not_found" as const, error: String(e?.message ?? e) };
    }
  });

function genCode() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rnd = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  return `ORD-${ymd}-${rnd}`;
}

export const submitPublicOrder = createServerFn({ method: "POST" })
  .inputValidator((input) => {
    try {
      return { __ok: true as const, value: SubmitSchema.parse(input) };
    } catch (e: any) {
      const msg = e?.issues
        ? e.issues.map((i: any) => `${(i.path ?? []).join(".")}: ${i.message}`).join("; ")
        : String(e?.message ?? e);
      return { __ok: false as const, error: msg };
    }
  })
  .handler(async ({ data }) => {
    if ((data as any).__ok === false) {
      return { ok: false as const, reason: "insert_failed" as const, error: (data as any).error };
    }
    const payload = (data as any).__ok === true ? (data as any).value : data;
    try {
    const sb = getPublicOrderClient() as any;

    const { data: profile, error: pErr } = await sb
      .from("profiles")
      .select("id, business_type, order_form_enabled, business_name")
      .eq("order_form_code", payload.code.toLowerCase())
      .maybeSingle();
    if (pErr || !profile) return { ok: false as const, reason: "not_found" as const, error: pErr?.message };
    if (profile.order_form_enabled === false) {
      return { ok: false as const, reason: "disabled" as const };
    }

    const bizType: string = profile.business_type ?? "retail";
    const isRetailish = bizType === "retail" || bizType === "fnb";
    const userId: string = profile.id;

    // Load authoritative prices from the database. We never trust client-supplied
    // unit_price / amount values — a malicious client could submit RM 0.
    const priceMap = new Map<string, number>();
    const sourceTable = isRetailish ? "inventory" : "services";
    const { data: priceRows } = await sb
      .from(sourceTable)
      .select("name, price, variants")
      .eq("user_id", userId);
    for (const row of (priceRows ?? []) as any[]) {
      const baseName = String(row.name ?? "").trim().toLowerCase();
      const basePrice = Number(row.price ?? 0);
      if (baseName) priceMap.set(baseName, basePrice);
      const variants = Array.isArray(row.variants) ? row.variants : [];
      for (const v of variants) {
        const vName = String(v?.name ?? "").trim();
        if (!vName) continue;
        const vPrice = Number(v?.price ?? basePrice);
        priceMap.set(`${baseName} (${vName.toLowerCase()})`, vPrice);
      }
    }
    const lookupPrice = (product: string, variant?: string): number | null => {
      const p = product.trim().toLowerCase();
      if (variant && variant.trim()) {
        const key = `${p} (${variant.trim().toLowerCase()})`;
        if (priceMap.has(key)) return priceMap.get(key)!;
      }
      return priceMap.has(p) ? priceMap.get(p)! : null;
    };

    const data2 = payload;
    // Build notes from biz-specific extras + user notes
    const extra: string[] = [];
    if (bizType === "fnb" && data2.fulfilment) {
      const labelMap: Record<string, string> = {
        dine_in: "Dine-in",
        takeaway: "Takeaway",
        delivery: "Delivery",
      };
      extra.push(`Type: ${labelMap[data2.fulfilment] ?? data2.fulfilment}`);
    }
    if (bizType === "retail" && data2.address) {
      extra.push(`Address: ${data2.address}`);
    }
    if (bizType === "education") {
      if (data2.course_interest) extra.push(`Course: ${data2.course_interest}`);
      if (data2.university_preference) extra.push(`University: ${data2.university_preference}`);
    } else if (bizType === "beauty") {
      if (data2.date_time) extra.push(`Preferred: ${data2.date_time}`);
    } else if (bizType === "property") {
      if (data2.budget) extra.push(`Budget: ${data2.budget}`);
      if (data2.location_interest) extra.push(`Location: ${data2.location_interest}`);
    } else if (bizType === "freelance") {
      if (data2.project_description) extra.push(`Project: ${data2.project_description}`);
      if (data2.deadline) extra.push(`Deadline: ${data2.deadline}`);
      if (data2.date_time) extra.push(`Preferred: ${data2.date_time}`);
    }

    // Build product string + totals from cart (preferred) or legacy fields
    let productText = "";
    let totalQty = 1;
    let totalAmount = 0;
    if (data2.items && data2.items.length > 0) {
      // Resolve every item's price from the server-side mapping. Reject
      // items whose product cannot be matched to a real inventory/service row.
      const resolved = data2.items.map((it: any) => {
        const serverPrice = lookupPrice(it.product, it.variant);
        return { it, serverPrice };
      });
      const unknown = resolved.find((r: any) => r.serverPrice === null);
      if (unknown) {
        return {
          ok: false as const,
          reason: "insert_failed" as const,
          error: `Unknown product: ${unknown.it.product}`,
        };
      }
      productText = data2.items
        .map((it: any) => {
          const label = it.variant ? `${it.product} (${it.variant})` : it.product;
          return isRetailish ? `${label} × ${it.quantity}` : label;
        })
        .join(", ");
      totalQty = isRetailish
        ? data2.items.reduce((s: number, it: any) => s + (it.quantity || 1), 0)
        : 1;
      totalAmount = resolved.reduce(
        (s: number, { it, serverPrice }: any) =>
          s + Number(serverPrice ?? 0) * (isRetailish ? (it.quantity || 1) : 1),
        0,
      );
      // Itemized lines added to notes for seller clarity
      const lines = resolved.map(({ it, serverPrice }: any) => {
        const label = it.variant ? `${it.product} (${it.variant})` : it.product;
        const sub = Number(serverPrice ?? 0) * (isRetailish ? (it.quantity || 1) : 1);
        return isRetailish
          ? `• ${label} × ${it.quantity} — RM ${sub.toFixed(2)}`
          : `• ${label} — RM ${sub.toFixed(2)}`;
      });
      extra.unshift(`Items:\n${lines.join("\n")}`);
    } else {
      productText = (data2.product || "").trim();
      totalQty = isRetailish ? Math.max(1, Number(data2.quantity) || 1) : 1;
      // Legacy single-item path: derive the price server-side too.
      const serverPrice = productText ? lookupPrice(productText) : null;
      if (productText && serverPrice === null) {
        return {
          ok: false as const,
          reason: "insert_failed" as const,
          error: `Unknown product: ${productText}`,
        };
      }
      totalAmount = Number(serverPrice ?? 0) * totalQty;
    }

    if (!productText) {
      return { ok: false as const, reason: "insert_failed" as const, error: "No product selected" };
    }

    const combinedNotes =
      [extra.join("\n"), (data2.notes || "").trim()].filter(Boolean).join("\n\n") || null;

    const code = genCode();
    const phoneDigits = (data2.phone || "").replace(/\D/g, "");
    const qty = totalQty;
    const amount = totalAmount;

    const { data: inserted, error: oErr } = await sb
      .from("orders")
      .insert({
        user_id: userId,
        code,
        customer_name: data2.customer_name.trim(),
        phone: phoneDigits || null,
        product: productText,
        quantity: qty,
        amount,
        status: "Unpaid",
        notes: combinedNotes,
        order_source: "online_form",
      })
      .select("id, code")
      .single();

    if (oErr || !inserted) {
      console.error("[submitPublicOrder] orders insert failed", oErr);
      return { ok: false as const, reason: "insert_failed" as const, error: oErr?.message ?? "Failed to insert order" };
    }

    // Upsert customer by phone
    if (phoneDigits) {
      try {
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
          name: data2.customer_name.trim(),
          phone: phoneDigits,
          total_orders: 1,
          total_spent: amount,
          last_order_at: new Date().toISOString(),
        });
      }
      } catch (e) {
        console.warn("[submitPublicOrder] customer upsert failed", e);
      }
    }

    // Push notification to seller (best-effort)
    try {
      const pushSecret = process.env.PUSH_WEBHOOK_SECRET;
      console.log("[submitPublicOrder] push secret present:", !!pushSecret);
      if (pushSecret) {
        const pushRes = await fetch("https://utqlrdbhvnugqvemjegi.supabase.co/functions/v1/send-push", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-cron-secret": pushSecret,
          },
          body: JSON.stringify({
            kind: "new_order",
            targetUserId: userId,
            title: "New order received! 🛍️",
            body: `From ${data2.customer_name} · ${productText}`,
            link: "/orders",
          }),
        });
        const pushBody = await pushRes.text();
        console.log("[submitPublicOrder] push result", pushRes.status, pushBody);
      } else {
        console.warn("[submitPublicOrder] PUSH_WEBHOOK_SECRET missing in worker env");
      }
    } catch (e) {
      console.error("[submitPublicOrder] push error", e);
    }

    return {
      ok: true as const,
      code: inserted.code,
      business_name: profile.business_name ?? "",
    };
    } catch (e: any) {
      console.error("[submitPublicOrder] threw", e);
      return {
        ok: false as const,
        reason: "insert_failed" as const,
        error: String(e?.message ?? e),
      };
    }
  });