import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { loadTrackingInfo } from "@/lib/tracking.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const RefSchema = z.string().trim().regex(/^[A-Za-z0-9_-]{4,40}$/);

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

export const Route = createFileRoute("/api/public/tracking")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = RefSchema.safeParse(url.searchParams.get("ref") ?? "");
        if (!parsed.success) return json(400, { ok: false, reason: "not_found" });
        const result = await loadTrackingInfo(parsed.data);
        return json(200, result);
      },
    },
  },
});