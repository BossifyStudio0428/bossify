import "./lib/error-capture";
import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  serverEntryPromise ??= import("@tanstack/react-start/server-entry").then(
    (module) => (module.default ?? module) as ServerEntry,
  );

  return serverEntryPromise;
}

async function normalizeServerError(response: Response): Promise<Response> {
  if (response.status < 500) return response;

  const contentType = response.headers.get("content-type") ?? "";
  try {
    const debugBody = await response.clone().text();
    console.error("[server.ts] 500 response body:", debugBody.slice(0, 4000));
  } catch {}
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  const isMaskedSsrError =
    body.includes('"unhandled":true') && body.includes('"message":"HTTPError"');

  if (!isMaskedSsrError) return response;

  console.error(consumeLastCapturedError() ?? new Error(`Masked SSR error: ${body}`));

  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeServerError(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};