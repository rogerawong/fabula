/**
 * exportDocument.ts — Serialize the active tab through the adapter that
 * parsed it (honoring the current card arrangement) and download it
 * (docs/02 §6). Losslessness is the adapter conformance suite's job;
 * this is just the faucet.
 */

import { toast } from "sonner";
import { untitledNotice } from "@/model/naming";
import { getAdapter } from "@/formats/registry";
import { deriveSectionOrder } from "@/layout/columns";
import type { TabState } from "@/store";

export function exportFileName(tab: TabState): string {
  const adapter = getAdapter(tab.editor.document.formatId);
  const ext = adapter.fileExtensions[0] ?? "yml";
  const stem =
    tab.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "toc";
  return `${stem}.${ext}`;
}

export function exportDocument(tab: TabState): void {
  try {
    const adapter = getAdapter(tab.editor.document.formatId);
    const text = adapter.serialize(
      tab.editor.document,
      deriveSectionOrder(tab.editor.columns),
    );
    const blob = new Blob([text], { type: "text/yaml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFileName(tab);
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${a.download}`);
    // THE PLACEHOLDER NOTICE, at the moment it stops being fixable in
    // this file (docs/22, Decision 5). A separate toast rather than an
    // appendix to the success line, because they are two facts and the
    // export DID succeed — the bytes are legal, the name is merely
    // nobody's. Never a refusal, for the same reason.
    const notice = untitledNotice(tab.editor.document);
    if (notice !== null) toast(`${notice} — worth naming before you share it.`);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Export failed");
  }
}
