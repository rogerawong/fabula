/**
 * loadSample.ts — Open a bundled adapter sample in a new tab.
 * (File / paste / URL loading arrives in M6.)
 */

import { toast } from "sonner";
import { FORMAT_ADAPTERS } from "@/formats/registry";
import type { TocFormatAdapter } from "@/formats/types";
import { useAppStore } from "@/store";

export function adaptersWithSamples(): TocFormatAdapter[] {
  return FORMAT_ADAPTERS.filter((a) => a.sample);
}

export function loadSample(adapter: TocFormatAdapter): void {
  if (!adapter.sample) return;
  try {
    const doc = adapter.parse(adapter.sample.content, adapter.sample.fileName);
    useAppStore.getState().openDocument(doc);
  } catch (err) {
    // Errors are specific, never raw exceptions in the console (docs/05)
    toast.error(err instanceof Error ? err.message : "Could not load the sample");
  }
}
