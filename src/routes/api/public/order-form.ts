import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { loadPublicOrderForm, createPublicOrder } from "@/lib/public-order.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const CodeSchema = z.string().trim().regex(/^[a-z0-9_-]{4,32}$/i);

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...CORS,
    },
  });
}

export const Route = createFileRoute("/api/public/order-form")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = CodeSchema.safeParse(url.searchParams.get("code") ?? "");
        if (!parsed.success) return json(400, { ok: false, reason: "not_found" });

        const result = await loadPublicOrderForm(parsed.data);
        return json(200, result);
      },
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json(400, { ok: false, reason: "insert_failed", error: "Invalid JSON" });
        }

        const result = await createPublicOrder(body);
        return json(200, result);
      },
    },
  },
});