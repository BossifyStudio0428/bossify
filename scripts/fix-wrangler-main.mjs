import { readFileSync, writeFileSync } from "fs";

const path = ".output/server/wrangler.json";
const content = JSON.parse(readFileSync(path, "utf-8"));

if (content.main !== "server.js") {
  content.main = "server.js";
  writeFileSync(path, JSON.stringify(content, null, 2));
  console.log("[fix-wrangler-main] Patched wrangler.json main -> server.js");
} else {
  console.log("[fix-wrangler-main] Already correct, skipped.");
}