/**
 * loadDocument.ts — Loading pipeline for file / paste / URL sources
 * (docs/02 §1). Pure helpers are exported for unit tests; the UI layer
 * catches errors and shows them as specific messages.
 */

import { FORMAT_ADAPTERS, parseDocument } from "@/formats/registry";
import { useAppStore } from "@/store";

/**
 * GitHub file pages are CORS-closed, but raw.githubusercontent.com is
 * open — rewrite blob URLs so fetch works directly.
 */
export function rewriteGitHubUrl(url: string): string {
  const match = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
  if (!match) return url;
  return `https://raw.githubusercontent.com/${match[1]}/${match[2]}/${match[3]}`;
}

/** Last path segment of a URL, for format detection + document naming. */
export function fileNameFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    return path.split("/").filter(Boolean).pop() ?? "toc.yml";
  } catch {
    return "toc.yml";
  }
}

/** Parse text through the adapter registry and open it in a new tab.
 *  Loading always opens a NEW tab — never silently replaces.
 *  `formatId` overrides auto-detection (the Format dropdown). */
export function openFromText(raw: string, fileName: string, formatId?: string): void {
  let doc;
  if (formatId) {
    const adapter = FORMAT_ADAPTERS.find((a) => a.id === formatId);
    if (!adapter) throw new Error(`Unknown format "${formatId}"`);
    doc = adapter.parse(raw, fileName);
  } else {
    doc = parseDocument(raw, fileName);
  }
  useAppStore.getState().openDocument(doc);
}

/**
 * Fetch a TOC from a URL. CORS failures surface as TypeError, not an
 * HTTP status — branch the message accordingly so the
 * user learns the open-in-browser + paste fallback.
 */
export async function fetchTocFromUrl(
  url: string,
): Promise<{ raw: string; fileName: string }> {
  const target = rewriteGitHubUrl(url.trim());
  let response: Response;
  try {
    response = await fetch(target);
  } catch {
    throw new Error(
      "Could not fetch that URL (likely blocked by CORS). " +
        "Open the file in your browser and paste its contents instead.",
    );
  }
  if (!response.ok) {
    throw new Error(`The server answered ${response.status} for that URL.`);
  }
  return { raw: await response.text(), fileName: fileNameFromUrl(target) };
}
