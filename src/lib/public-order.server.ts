import "@tanstack/react-start/server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

/** Normalize detail_images JSON (legacy string[] or new {url, description}[]) for public output. */
function normalizeDetailItems(raw: unknown): Array<{ url: string; description: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ url: string; description: string }> = [];
  for (const v of raw) {
    if (typeof v === "string") {
      if (v.trim()) out.push({ url: v, description: "" });
    } else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const url = typeof o.url === "string" ? o.url : "";
      const description = typeof o.description === "string" ? o.description : "";
      if (url.trim()) out.push({ url, description });
    }
  }
  return out;
}

const APP_SUPABASE_URL = "https://knouahqwazerjiyiqgmh.supabase.co";
// Push notifications for new orders are dispatched by a Postgres AFTER INSERT
// trigger on public.orders (see external migration: notify_new_order_push).
// That covers BOTH merchant-created orders and public order-form orders, so
// we do not fire a separate push from the server function here.

function createPublicOrderClient() {
  const serviceRoleKey = process.env.APP_SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error("Missing APP_SUPABASE_SERVICE_ROLE_KEY for public order form lookups.");
  }

  return createClient(APP_SUPABASE_URL, serviceRoleKey, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

let publicOrderClient: ReturnType<typeof createPublicOrderClient> | undefined;

export function getPublicOrderClient() {
  if (!publicOrderClient) publicOrderClient = createPublicOrderClient();
  return publicOrderClient;
}

const CODE_RE = /^[a-z0-9_-]{4,32}$/i;

const CartItemSchema = z.object({
  product: z.string().trim().min(1).max(200),
  variant: z.string().trim().max(120).optional().default(""),
  quantity: z.number().int().min(1).max(9999).optional().default(1),
  unit_price: z.number().min(0).max(10_000_000).optional().default(0),
  listing_id: z.string().uuid().optional(),
});

const SubmitSchema = z.object({
  code: z.string().regex(CODE_RE),
  customer_name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(32).optional().default(""),
  product: z.string().trim().max(200).optional().default(""),
  quantity: z.number().int().min(1).max(9999).optional().default(1),
  amount: z.number().min(0).max(10_000_000).optional().default(0),
  items: z.array(CartItemSchema).max(50).optional().default([]),
  fulfilment: z.string().trim().max(40).optional().default(""),
  address: z.string().trim().max(500).optional().default(""),
  dest_lat: z.number().min(-90).max(90).optional(),
  dest_lng: z.number().min(-180).max(180).optional(),
  delivery_method: z.enum(["delivery", "pickup"]).optional(),
  notes: z.string().trim().max(2000).optional().default(""),
  course_interest: z.string().trim().max(160).optional().default(""),
  university_preference: z.string().trim().max(160).optional().default(""),
  date_time: z.string().trim().max(64).optional().default(""),
  budget: z.string().trim().max(64).optional().default(""),
  location_interest: z.string().trim().max(160).optional().default(""),
  project_description: z.string().trim().max(2000).optional().default(""),
  deadline: z.string().trim().max(64).optional().default(""),
  payment_method: z.enum(["bank_transfer", "cash_on_delivery"]).optional(),
  listing_id: z.string().uuid().optional(),
});

export type LoadPublicOrderFormResult =
  | {
      ok: true;
      profile: {
        business_name: string;
        avatar_url: string | null;
        business_type: string;
        whatsapp_number: string | null;
        language: string;
        allow_cod: boolean;
        order_form_show_stock: boolean;
        delivery_enabled: boolean;
        delivery_zones: Array<{ max_km: number; fee: number }>;
        store_address: string | null;
        payment_methods: Array<{
          type: string | null;
          bank: string | null;
          number: string | null;
          name: string | null;
          qr_url: string | null;
        }>;
      };
      products: Array<{
        id: string;
        name: string;
        price: number;
        image_url: string | null;
        category: string | null;
        description: string | null;
        variants: Array<{ id?: string; name: string; price: number }>;
        duration_minutes?: number | null;
        stock?: number | null;
        unit?: string | null;
        images?: string[];
        property?: {
          property_type: string | null;
          listing_type: string | null;
          bedrooms: number | null;
          bathrooms: number | null;
          size_sqft: number | null;
          address: string | null;
        };
      }>;
    }
  | { ok: false; reason: "not_found" | "disabled"; error?: string };

export async function loadPublicOrderForm(rawCode: string): Promise<LoadPublicOrderFormResult> {
  const codeParsed = z.object({ code: z.string().regex(CODE_RE) }).safeParse({ code: rawCode });
  if (!codeParsed.success) return { ok: false, reason: "not_found" };
  const code = codeParsed.data.code;
  try {
    const sb = getPublicOrderClient() as any;
    // Use `*` so missing optional columns (e.g. payment_method_*, allow_cod
    // on external Supabase projects that haven't run the latest migration)
    // don't cause the whole lookup to fail and surface as "Order form not found".
    let { data: profile, error } = await sb
      .from("profiles")
      .select("*")
      .eq("order_form_code", code.toLowerCase())
      .maybeSingle();
    if (error) {
      console.error("[loadPublicOrderForm] profiles select * failed, retrying minimal", error);
      const fallback = await sb
        .from("profiles")
        .select("id, business_name, avatar_url, business_type, whatsapp_number, order_form_enabled, order_form_code, language")
        .eq("order_form_code", code.toLowerCase())
        .maybeSingle();
      profile = fallback.data;
      error = fallback.error;
    }

    if (error || !profile) {
      if (error) console.error("[loadPublicOrderForm] profile lookup error", error);
      return { ok: false, reason: "not_found" };
    }
    if (profile.order_form_enabled === false) return { ok: false, reason: "disabled" };

    const bizType: string = profile.business_type ?? "retail";
    const isRetailish = bizType === "retail" || bizType === "fnb";

    let products: Array<{
      id: string;
      name: string;
      price: number;
      image_url: string | null;
      category: string | null;
      description: string | null;
      variants: Array<{ id?: string; name: string; price: number }>;
      duration_minutes?: number | null;
      stock?: number | null;
      unit?: string | null;
      images?: string[];
      property?: {
        property_type: string | null;
        listing_type: string | null;
        bedrooms: number | null;
        bathrooms: number | null;
        size_sqft: number | null;
        address: string | null;
      };
    }> = [];
    if (isRetailish) {
      const { data: inv } = await sb
        .from("inventory")
        .select("id,name,price,image_url,images,detail_images,video_url,cover_image_url,category,description,variants,stock,unit")
        .eq("user_id", profile.id)
        .order("name", { ascending: true });
      products = ((inv ?? []) as any[]).map((x) => ({
        id: String(x.id),
        name: String(x.name),
        price: Number(x.price ?? 0),
        image_url: x.cover_image_url ?? x.image_url ?? null,
        category: x.category ?? null,
        description: x.description ?? null,
        variants: Array.isArray(x.variants) ? x.variants : [],
        stock: typeof x.stock === "number" ? x.stock : null,
        unit: x.unit ?? null,
        images: Array.isArray(x.images) ? x.images.map((u: unknown) => String(u)) : [],
        detail_images: normalizeDetailItems(x.detail_images),
        video_url: x.video_url ?? null,
        cover_image_url: x.cover_image_url ?? null,
      })) as any;
    } else if (bizType === "property") {
      const { data: rows } = await sb
        .from("listings")
        .select("id,title,price,images,detail_images,video_url,cover_image_url,property_type,listing_type,bedrooms,bathrooms,size_sqft,address,description,status")
        .eq("user_id", profile.id)
        .eq("status", "available")
        .order("created_at", { ascending: false });
      products = ((rows ?? []) as any[]).map((x) => {
        const imgs = Array.isArray(x.images) ? x.images : [];
        const firstImg = x.cover_image_url ?? (imgs.length > 0 ? String(imgs[0]) : null);
        const listingType = String(x.listing_type ?? "sale");
        return {
          id: String(x.id),
          name: String(x.title ?? ""),
          price: Number(x.price ?? 0),
          image_url: firstImg,
          category: listingType === "rent" ? "For Rent" : "For Sale",
          description: x.description ?? null,
          variants: [],
          images: imgs.map((u: unknown) => String(u)),
          detail_images: normalizeDetailItems(x.detail_images),
          video_url: x.video_url ?? null,
          cover_image_url: x.cover_image_url ?? null,
          property: {
            property_type: x.property_type ?? null,
            listing_type: listingType,
            bedrooms: x.bedrooms ?? null,
            bathrooms: x.bathrooms ?? null,
            size_sqft: x.size_sqft ?? null,
            address: x.address ?? null,
          },
        };
      }) as any;
    } else {
      const { data: svc } = await sb
        .from("services")
        .select("id,name,price,is_active,image_url,images,detail_images,video_url,cover_image_url,category,description,variants,duration_minutes,stock,addons,rate_type,level,intake,requirements,turnaround_days,portfolio_links")
        .eq("user_id", profile.id)
        .eq("is_active", true)
        .order("name", { ascending: true });
      products = ((svc ?? []) as any[]).map((x) => ({
        id: String(x.id),
        name: String(x.name),
        price: Number(x.price ?? 0),
        image_url: x.cover_image_url ?? x.image_url ?? null,
        category: x.category ?? null,
        description: x.description ?? null,
        variants: Array.isArray(x.variants) ? x.variants : [],
        duration_minutes: x.duration_minutes ?? null,
        stock: typeof x.stock === "number" ? x.stock : null,
        images: Array.isArray(x.images) ? x.images.map((u: unknown) => String(u)) : [],
        detail_images: normalizeDetailItems(x.detail_images),
        video_url: x.video_url ?? null,
        cover_image_url: x.cover_image_url ?? null,
        addons: Array.isArray(x.addons) ? x.addons : [],
        rate_type: x.rate_type ?? null,
        level: x.level ?? null,
        intake: x.intake ?? null,
        requirements: x.requirements ?? null,
        turnaround_days: x.turnaround_days ?? null,
        portfolio_links: Array.isArray(x.portfolio_links) ? x.portfolio_links.map((u: unknown) => String(u)) : [],
      })) as any;
    }

    return {
      ok: true,
      profile: {
        business_name: profile.business_name ?? "",
        avatar_url: profile.avatar_url ?? null,
        business_type: bizType,
        whatsapp_number: profile.whatsapp_number ?? null,
        language: (profile as any).language ?? "en",
        allow_cod: (profile as any).allow_cod !== false,
        order_form_show_stock: (profile as any).order_form_show_stock !== false,
        delivery_enabled: (profile as any).delivery_enabled === true,
        delivery_zones: Array.isArray((profile as any).delivery_zones)
          ? (profile as any).delivery_zones
          : [],
        store_address: (profile as any).store_address ?? null,
        payment_methods: [
          {
            type: (profile as any).payment_method_1_type ?? null,
            bank: (profile as any).payment_method_1_bank ?? null,
            number: (profile as any).payment_method_1_number ?? null,
            name: (profile as any).payment_method_1_name ?? null,
            qr_url: (profile as any).payment_method_1_qr_url ?? null,
          },
          {
            type: (profile as any).payment_method_2_type ?? null,
            bank: (profile as any).payment_method_2_bank ?? null,
            number: (profile as any).payment_method_2_number ?? null,
            name: (profile as any).payment_method_2_name ?? null,
            qr_url: (profile as any).payment_method_2_qr_url ?? null,
          },
        ].filter((m) => m.type || m.bank || m.number || m.name || m.qr_url),
      },
      products: products as any,
    };
  } catch (e: any) {
    console.error("[loadPublicOrderForm] threw", e);
    return { ok: false, reason: "not_found" };
  }
}

function genCode() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rnd = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  return `ORD-${ymd}-${rnd}`;
}

export type CreatePublicOrderResult =
  | { ok: true; code: string; business_name: string }
  | { ok: false; reason: "not_found" | "disabled" | "shop_closed" | "insert_failed"; error?: string };

export async function createPublicOrder(rawInput: unknown): Promise<CreatePublicOrderResult> {
  const parsed = SubmitSchema.safeParse(rawInput);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${(i.path ?? []).join(".")}: ${i.message}`)
      .join("; ");
    return { ok: false, reason: "insert_failed", error: msg };
  }
  const data2 = parsed.data;
  try {
    const sb = getPublicOrderClient() as any;

    let { data: profile, error: pErr } = await sb
      .from("profiles")
      .select("id, business_type, order_form_enabled, business_name, allow_cod, store_address")
      .eq("order_form_code", data2.code.toLowerCase())
      .maybeSingle();
    if (pErr) {
      // allow_cod column may not exist on external Supabase yet — retry without it
      const fb = await sb
        .from("profiles")
        .select("id, business_type, order_form_enabled, business_name, store_address")
        .eq("order_form_code", data2.code.toLowerCase())
        .maybeSingle();
      profile = fb.data;
      pErr = fb.error;
    }
    if (pErr || !profile) return { ok: false, reason: "not_found", error: pErr?.message };
    if (profile.order_form_enabled === false) return { ok: false, reason: "disabled" };

    const bizType: string = profile.business_type ?? "retail";
    const isRetailish = bizType === "retail" || bizType === "fnb";
    const userId: string = profile.id;

    // Payment method only applies to retail/fnb. Validate seller actually allows the chosen option.
    let paymentMethod: string | null = null;
    if (isRetailish && data2.payment_method) {
      if (data2.payment_method === "cash_on_delivery" && (profile as any).allow_cod === false) {
        return { ok: false, reason: "insert_failed", error: "Cash on delivery not allowed" };
      }
      paymentMethod = data2.payment_method;
    }

    const priceMap = new Map<string, { price: number; cost: number }>();
    if (bizType === "property") {
      const { data: priceRows } = await sb
        .from("listings")
        .select("title, price")
        .eq("user_id", userId);
      for (const row of (priceRows ?? []) as any[]) {
        const baseName = String(row.title ?? "").trim().toLowerCase();
        const basePrice = Number(row.price ?? 0);
        if (baseName) priceMap.set(baseName, { price: basePrice, cost: 0 });
      }
    } else {
      const sourceTable = isRetailish ? "inventory" : "services";
      let { data: priceRows, error: priceError } = await sb
        .from(sourceTable)
        .select(isRetailish ? "name, price, cost_price, variants" : "name, price, variants")
        .eq("user_id", userId);
      if (priceError && isRetailish) {
        const fallback = await sb
          .from(sourceTable)
          .select("name, price, variants")
          .eq("user_id", userId);
        priceRows = fallback.data;
        priceError = fallback.error;
      }
      if (priceError) {
        console.error("[createPublicOrder] product price lookup failed", priceError);
      }
      for (const row of (priceRows ?? []) as any[]) {
        const baseName = String(row.name ?? "").trim().toLowerCase();
        const basePrice = Number(row.price ?? 0);
        const baseCost = isRetailish ? Number(row.cost_price ?? 0) : 0;
        if (baseName) priceMap.set(baseName, { price: basePrice, cost: baseCost });
        const variants = Array.isArray(row.variants) ? row.variants : [];
        for (const v of variants) {
          const vName = String(v?.name ?? "").trim();
          if (!vName) continue;
          const vPrice = Number(v?.price ?? basePrice);
          priceMap.set(`${baseName} (${vName.toLowerCase()})`, { price: vPrice, cost: baseCost });
        }
      }
    }
    const lookupPrice = (product: string, variant?: string): { price: number; cost: number } | null => {
      const p = product.trim().toLowerCase();
      if (variant && variant.trim()) {
        const key = `${p} (${variant.trim().toLowerCase()})`;
        if (priceMap.has(key)) return priceMap.get(key)!;
      }
      return priceMap.has(p) ? priceMap.get(p)! : null;
    };

    const extra: string[] = [];
    // delivery_address is now persisted as a dedicated column on orders,
    // so we no longer duplicate it into the notes field for retail.
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

    let productText = "";
    let totalQty = 1;
    let totalAmount = 0;
    if (data2.items && data2.items.length > 0) {
      const resolved = data2.items.map((it: any) => ({
        it,
        serverPrice: lookupPrice(it.product, it.variant),
      }));
      const unknown = resolved.find((r) => r.serverPrice === null);
      if (unknown) {
        return {
          ok: false,
          reason: "insert_failed",
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
        (s, { it, serverPrice }: any) =>
          s + Number(serverPrice?.price ?? 0) * (isRetailish ? (it.quantity || 1) : 1),
        0,
      );
      const lines = resolved.map(({ it, serverPrice }: any) => {
        const label = it.variant ? `${it.product} (${it.variant})` : it.product;
        const sub = Number(serverPrice?.price ?? 0) * (isRetailish ? (it.quantity || 1) : 1);
        return isRetailish
          ? `• ${label} × ${it.quantity} — RM ${sub.toFixed(2)}`
          : `• ${label} — RM ${sub.toFixed(2)}`;
      });
      // Items breakdown lives in `product` + dedicated fields; no longer
      // duplicated into notes.
      void lines;
    } else {
      productText = (data2.product || "").trim();
      totalQty = isRetailish ? Math.max(1, Number(data2.quantity) || 1) : 1;
      const serverPrice = productText ? lookupPrice(productText) : null;
      if (productText && serverPrice === null) {
        return { ok: false, reason: "insert_failed", error: `Unknown product: ${productText}` };
      }
      totalAmount = Number(serverPrice?.price ?? 0) * totalQty;
    }

    if (!productText) {
      return { ok: false, reason: "insert_failed", error: "No product selected" };
    }

    const code = genCode();
    const phoneDigits = (data2.phone || "").replace(/\D/g, "");
    const qty = totalQty;
    // Server-side delivery fee: only when the seller has delivery configured,
    // the customer chose delivery, and coordinates were supplied.
    let deliveryFee = 0;
    let deliveryKm: number | null = null;
    const wantsDelivery =
      isRetailish &&
      data2.delivery_method === "delivery" &&
      typeof data2.dest_lat === "number" &&
      typeof data2.dest_lng === "number";
    if (wantsDelivery) {
      try {
        const { loadDeliveryConfig, computeDistanceKm, pickFee } = await import("./delivery.server");
        const cfg = await loadDeliveryConfig(data2.code);
        if (cfg.ok) {
          const dist = await computeDistanceKm(cfg.storeLat, cfg.storeLng, data2.dest_lat!, data2.dest_lng!);
          if (dist.ok) {
            const fee = pickFee(dist.km, cfg.zones);
            if (fee === null) {
              return { ok: false, reason: "insert_failed", error: "Address is outside the delivery area" };
            }
            deliveryFee = fee;
            deliveryKm = dist.km;
          } else if (dist.reason === "out_of_range") {
            return { ok: false, reason: "insert_failed", error: "Address is outside the delivery area" };
          }
        }
      } catch (e) {
        console.warn("[createPublicOrder] delivery fee compute failed", e);
      }
    }
    const amount = totalAmount + deliveryFee;
    if (deliveryFee > 0 || deliveryKm !== null) {
      const line = deliveryKm !== null
        ? `Delivery: ${deliveryKm.toFixed(2)} km — RM ${deliveryFee.toFixed(2)}`
        : `Delivery fee: RM ${deliveryFee.toFixed(2)}`;
      extra.push(line);
    }
    const combinedNotes =
      [extra.join("\n"), (data2.notes || "").trim()].filter(Boolean).join("\n\n") || null;
    const totalCost = data2.items && data2.items.length > 0
      ? data2.items.reduce((s: number, it: any) => {
          const found = lookupPrice(it.product, it.variant);
          return s + Number(found?.cost ?? 0) * (isRetailish ? (it.quantity || 1) : 1);
        }, 0)
      : Number(lookupPrice(productText)?.cost ?? 0) * qty;

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
        cost: totalCost,
        status: "Unpaid",
        notes: combinedNotes,
        delivery_address: (data2.address || "").trim() || null,
        payment_method: paymentMethod,
        order_source: "online_form",
        delivery_method: isRetailish ? (data2.delivery_method ?? null) : null,
        delivery_status: isRetailish && data2.delivery_method === "delivery" ? "confirmed" : null,
        store_address_snapshot:
          isRetailish && data2.delivery_method === "pickup"
            ? ((profile as any).store_address ?? null)
            : isRetailish && data2.delivery_method === "delivery"
              ? ((profile as any).store_address ?? null)
              : null,
      } as any)
      .select("id, code")
      .single();

    if (oErr || !inserted) {
      console.error("[createPublicOrder] orders insert failed", oErr);
      const msg = oErr?.message ?? "";
      if (msg.includes("order_quota_reached")) return { ok: false, reason: "shop_closed" };
      return { ok: false, reason: "insert_failed", error: "Order could not be submitted" };
    }

    if (phoneDigits) {
      try {
        const { data: existing } = await sb
          .from("customers")
          .select("id,total_orders,total_spent")
          .eq("user_id", userId)
          .eq("phone", phoneDigits)
          .maybeSingle();
        // For property businesses, capture the listing_id the buyer enquired about
        let propertyListingId: string | null = null;
        if (bizType === "property") {
          propertyListingId =
            data2.listing_id ||
            (data2.items.find((it: any) => it.listing_id)?.listing_id ?? null) ||
            null;
        }
        if (existing) {
          const upd: Record<string, any> = {
            total_orders: (existing.total_orders ?? 0) + 1,
            total_spent: Number(existing.total_spent ?? 0) + amount,
            last_order_at: new Date().toISOString(),
          };
          if (propertyListingId) upd.interested_listing_id = propertyListingId;
          await sb.from("customers").update(upd).eq("id", existing.id);
          if (propertyListingId) {
            await sb
              .from("listings")
              .update({ interested_customer_id: existing.id })
              .eq("id", propertyListingId);
          }
        } else {
          const ins: Record<string, any> = {
            user_id: userId,
            name: data2.customer_name.trim(),
            phone: phoneDigits,
            total_orders: 1,
            total_spent: amount,
            last_order_at: new Date().toISOString(),
            customer_status: "enquiry",
          };
          if (propertyListingId) ins.interested_listing_id = propertyListingId;
          const { data: newCust } = await sb
            .from("customers")
            .insert(ins)
            .select("id")
            .maybeSingle();
          if (propertyListingId && newCust?.id) {
            await sb
              .from("listings")
              .update({ interested_customer_id: newCust.id })
              .eq("id", propertyListingId);
          }
        }
      } catch (e) {
        console.warn("[createPublicOrder] customer upsert failed", e);
      }
    }

    return { ok: true, code: inserted.code, business_name: profile.business_name ?? "" };
  } catch (e: any) {
    console.error("[createPublicOrder] threw", e);
    return { ok: false, reason: "insert_failed", error: "Order could not be submitted" };
  }
}