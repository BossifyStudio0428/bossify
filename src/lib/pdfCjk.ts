import type jsPDF from "jspdf";

// jsPDF's built-in fonts (Helvetica/Times/Courier) only support Latin-1, so
// CJK characters render as garbage. We lazy-fetch a Simplified Chinese TTF
// the first time a PDF that contains CJK is generated, register it in the
// jsPDF VFS, then switch the document's active font to it.
//
// The font is ~17MB so the download is slow on first use, but it's served
// from jsDelivr's CDN (cached) and the browser/WebView caches it after.

const FONT_URL =
  "https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@main/Sans/Variable/TTF/Subset/NotoSansSC-VF.ttf";
const FONT_VFS_NAME = "NotoSansSC.ttf";
const FONT_FAMILY = "NotoSansSC";

let cached: Promise<string> | null = null;

export function hasCjk(text: string): boolean {
  return /[\u3000-\u9fff\uff00-\uffef]/.test(text);
}

async function fetchFontBase64(): Promise<string> {
  if (cached) return cached;
  cached = (async () => {
    const res = await fetch(FONT_URL);
    if (!res.ok) throw new Error(`Failed to load CJK font (${res.status})`);
    const buf = await res.arrayBuffer();
    // Convert ArrayBuffer -> base64 in chunks to avoid call-stack overflow.
    const bytes = new Uint8Array(buf);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(
        null,
        bytes.subarray(i, i + chunk) as unknown as number[],
      );
    }
    return btoa(binary);
  })().catch((err) => {
    cached = null;
    throw err;
  });
  return cached;
}

/**
 * Registers the Simplified Chinese font on the given jsPDF doc (idempotent)
 * and switches the active font to it. Call once per doc before any text
 * that may contain CJK characters.
 */
export async function applyCjkFont(doc: jsPDF): Promise<void> {
  const base64 = await fetchFontBase64();
  // addFileToVFS / addFont are safe to call again — jsPDF replaces the entry.
  doc.addFileToVFS(FONT_VFS_NAME, base64);
  doc.addFont(FONT_VFS_NAME, FONT_FAMILY, "normal");
  // Register the same TTF under "bold" too — jspdf-autotable defaults
  // table headers to fontStyle: "bold", and if that variant is missing
  // jsPDF silently falls back to Helvetica (garbling CJK).
  doc.addFont(FONT_VFS_NAME, FONT_FAMILY, "bold");
  doc.setFont(FONT_FAMILY, "normal");
}

export const CJK_FONT_FAMILY = FONT_FAMILY;