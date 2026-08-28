/**
 * EmptyState.tsx — Centered call-to-action when no document is loaded
 * (docs/05 "Feedback & empty states"). File / URL / paste arrive in M6.
 */

import { FileText } from "lucide-react";
import { adaptersWithSamples, loadSample } from "./loadSample";
import { useUiStore } from "./uiStore";

export function EmptyState() {
  const setLoadDialogOpen = useUiStore((s) => s.setLoadDialogOpen);
  return (
    <div className="flex flex-1 items-center justify-center bg-neutral-50">
      <div className="w-96 rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <FileText className="mx-auto text-neutral-300" size={40} />
        <h2 className="mt-4 text-[16px] font-semibold text-neutral-800">
          See your table of contents whole
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-500">
          Load a TOC to lay its sections out as cards on the canvas — from a file or docs
          folder, pasted YAML, or a URL. Nothing leaves your browser.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            data-testid="empty-open-dialog"
            className="rounded-md bg-neutral-800 px-4 py-2 text-[13px] font-medium text-white hover:bg-neutral-700"
            onClick={() => setLoadDialogOpen(true)}
          >
            Open a file, folder, paste, or URL…
          </button>
          {adaptersWithSamples().map((adapter) => (
            <button
              key={adapter.id}
              type="button"
              data-testid={`empty-load-sample-${adapter.id}`}
              className="rounded-md border border-neutral-300 px-4 py-2 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50"
              onClick={() => loadSample(adapter)}
            >
              Load sample — {adapter.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
