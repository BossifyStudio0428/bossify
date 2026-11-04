import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { FileOpener } from "@capacitor-community/file-opener";

/**
 * Minimal CSV export — no external library, since this is a simple,
 * well-bounded need (raw transaction data for accountants/tax filing).
 * Values are quoted and internal quotes escaped per standard CSV rules.
 *
 * On native Android, a plain Blob + <a download> + .click() never
 * triggers a real download inside the Capacitor WebView (there's no
 * browser download manager to catch it), so the button silently did
 * nothing. Fixed to mirror the proven savePdf() pattern in pdf.ts:
 * write the file via Capacitor Filesystem, then open it with
 * FileOpener. Web behavior (Blob + <a download>) is unchanged.
 */
function isAndroidNative(): boolean {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return false;
  return true;
}

function toCsvText(headers: string[], rows: (string | number)[][]): string {
  const escape = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))];
  // BOM so Excel opens UTF-8 (Chinese/Malay text) correctly instead of mangling it.
  return "﻿" + lines.join("\r\n");
}

export async function downloadCSV(filename: string, headers: string[], rows: (string | number)[][]): Promise<void> {
  const safeFilename = (filename.endsWith(".csv") ? filename : `${filename}.csv`).replace(/[^a-zA-Z0-9._ -]/g, "_");
  const csvText = toCsvText(headers, rows);

  if (isAndroidNative()) {
    // Filesystem.writeFile expects base64 for reliable binary-safe writes
    // (matches savePdf()'s approach), so encode the UTF-8 text ourselves
    // rather than relying on the `encoding` option's own UTF-8 handling.
    const base64 = btoa(unescape(encodeURIComponent(csvText)));
    let savedUri: string | null = null;
    try {
      await Filesystem.writeFile({
        path: safeFilename, data: base64,
        directory: Directory.Documents, recursive: true,
      });
      const { uri } = await Filesystem.getUri({ path: safeFilename, directory: Directory.Documents });
      savedUri = /^(file|content):\/\//.test(uri) ? uri : `file://${uri}`;
    } catch (writeErr) {
      console.error("[csvExport] write to Documents failed, falling back to Cache", writeErr);
      await Filesystem.writeFile({ path: safeFilename, data: base64, directory: Directory.Cache });
      const { uri } = await Filesystem.getUri({ path: safeFilename, directory: Directory.Cache });
      savedUri = /^(file|content):\/\//.test(uri) ? uri : `file://${uri}`;
    }
    try {
      await FileOpener.open({ filePath: savedUri!, contentType: "text/csv", openWithDefault: true });
    } catch (openErr) {
      console.warn("[csvExport] saved but could not auto-open", openErr);
    }
    return;
  }

  try {
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = safeFilename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    console.error("[csvExport] web download fallback failed", e);
  }
}