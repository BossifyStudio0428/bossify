import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-cron-secret",
} as const;

export const Route = createFileRoute("/api/public/send-push")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }: { request: Request }) => {
        const { handleSendPush } = await import("@/lib/sendPushHandler.server");
        return handleSendPush(request);
      },
    },
  },
} as any);
