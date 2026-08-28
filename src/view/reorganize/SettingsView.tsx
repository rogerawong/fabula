/**
 * SettingsView.tsx — The Reorganize dialog's connection subview
 * (provider, model, key). Set once, rarely revisited. Key persistence
 * is opt-in and clearly labeled.
 */

import { useState } from "react";
import { ArrowLeft, Eye, EyeOff, ListRestart } from "lucide-react";
import { listModels } from "@/ai/client";
import { AiError } from "@/ai/contract";
import { PROVIDERS, getProvider } from "@/ai/providers";
import { currentKey, useAiSettings } from "@/ai/settings";
import { useTooltip } from "@/view/Tooltip";

export function SettingsView({ onBack }: { onBack: () => void }) {
  const settings = useAiSettings();
  const [reveal, setReveal] = useState(false);
  const [models, setModels] = useState<string[] | null>(null);
  const [modelsNote, setModelsNote] = useState<string | null>(null);
  // A failed fetch rendered in the same grey as a successful one is a
  // failure that does not announce itself; the note carries its own
  // polarity so the two cannot look alike.
  const [modelsFailed, setModelsFailed] = useState(false);
  const [fetching, setFetching] = useState(false);
  const provider = getProvider(settings.providerId);
  // the field shows THIS provider's key; switching presets swaps it
  const apiKey = currentKey(settings);

  // DISABLED WITH A REASON (docs/13 decision-5 precedent, the same seam
  // ConfigureView uses for its gated toggles). Anthropic's /v1/models
  // refuses this client's Bearer credential whatever the key, so the
  // button cannot work — and a button that cannot work must say why
  // rather than fail on press. The tooltip rides a WRAPPER, not the
  // button: a disabled control swallows the pointer events a tip needs.
  const listable = provider.supportsModelList !== false;
  const modelListTip = useTooltip(
    listable
      ? null
      : [
          "This provider doesn't serve a model list to this app — enter a model name from their documentation.",
        ],
  );

  const fetchModels = async () => {
    // belt and braces: the button is disabled, but the handler refuses
    // too, so a keyboard or programmatic path cannot fire a request the
    // provider is known to reject
    if (provider.supportsModelList === false) return;
    setFetching(true);
    setModelsNote(null);
    setModelsFailed(false);
    try {
      const ids = await listModels({
        baseUrl: settings.baseUrl,
        apiKey,
        // same transport headers as the chat call — without these this
        // button CORS-fails on Anthropic and reads as a network outage
        extraHeaders: provider.extraHeaders,
      });
      setModels(ids);
      // zero is a real answer and says so, distinctly from a refusal
      setModelsNote(
        ids.length === 0
          ? "That endpoint served an empty model list."
          : `${ids.length} models available`,
      );
    } catch (err) {
      setModels(null);
      setModelsFailed(true);
      setModelsNote(
        err instanceof AiError ? err.message : "Could not fetch the model list",
      );
    } finally {
      setFetching(false);
    }
  };

  const label = "text-[11px] font-semibold uppercase tracking-wide text-neutral-400";
  const input =
    "w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-[13px] outline-none focus:border-neutral-500";

  return (
    <div className="flex flex-col gap-3.5" data-testid="ai-settings">
      <div>
        <div className={`${label} mb-1`}>Provider</div>
        <select
          data-testid="ai-provider"
          className={input}
          value={settings.providerId}
          onChange={(e) => settings.update({ providerId: e.target.value })}
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        {provider.description && (
          <p
            className="mt-1 text-[11px] leading-relaxed text-neutral-500"
            data-testid="ai-provider-description"
          >
            {provider.description}
          </p>
        )}
      </div>

      {provider.editableBaseUrl && (
        <div>
          <div className={`${label} mb-1`}>Base URL</div>
          <input
            type="url"
            data-testid="ai-base-url"
            className={input}
            placeholder="https://api.example.com/v1"
            value={settings.baseUrl}
            onChange={(e) => settings.update({ baseUrl: e.target.value })}
          />
        </div>
      )}

      <div>
        <div className={`${label} mb-1 flex items-center justify-between`}>
          <span>Model</span>
          <span {...modelListTip.props}>
            <button
              type="button"
              data-testid="ai-fetch-models"
              disabled={!listable || !apiKey.trim() || fetching}
              className="flex items-center gap-1 font-normal normal-case tracking-normal text-neutral-500 hover:text-neutral-700 disabled:opacity-40"
              onClick={() => void fetchModels()}
            >
              <ListRestart size={11} />
              {fetching ? "Fetching…" : "Fetch available models"}
            </button>
          </span>
        </div>
        <input
          type="text"
          data-testid="ai-model"
          className={input}
          list="ai-model-options"
          value={settings.model}
          onChange={(e) => settings.update({ model: e.target.value })}
        />
        {models && (
          <datalist id="ai-model-options">
            {models.map((id) => (
              <option key={id} value={id} />
            ))}
          </datalist>
        )}
        {modelsNote && (
          <p
            className={`mt-1 text-[11px] ${modelsFailed ? "text-red-600" : "text-neutral-500"}`}
            data-testid="ai-models-note"
            data-failed={modelsFailed ? "true" : "false"}
          >
            {modelsNote}
          </p>
        )}
      </div>

      <div>
        <div className={`${label} mb-1`}>API key</div>
        <div className="relative">
          <input
            type={reveal ? "text" : "password"}
            data-testid="ai-api-key"
            className={`${input} pr-9`}
            autoComplete="off"
            value={apiKey}
            onChange={(e) => settings.setKey(e.target.value)}
          />
          <button
            type="button"
            aria-label={reveal ? "Hide API key" : "Show API key"}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
            onClick={() => setReveal((r) => !r)}
          >
            {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <label className="mt-2 flex cursor-pointer items-center gap-1.5 text-[13px] text-neutral-700">
          <input
            type="checkbox"
            checked={settings.rememberKey}
            onChange={(e) => settings.update({ rememberKey: e.target.checked })}
          />
          Remember on this device
        </label>
        <p className="mt-0.5 pl-5 text-[11px] text-neutral-400">
          Stored unencrypted in this browser's localStorage.
        </p>
        {/* one producer: the preset's trainingNote (a per-provider CLAIM
            with its sources at the field declaration in providers.ts) */}
        <p
          className="mt-1.5 text-[11px] leading-relaxed text-neutral-500"
          data-testid="ai-training-note"
        >
          {provider.trainingNote}
        </p>
        <div className="mt-1.5 flex gap-3 text-[12px]">
          {apiKey && (
            <button
              type="button"
              className="text-neutral-500 underline hover:text-neutral-700"
              onClick={() => settings.forgetKey()}
            >
              Forget key
            </button>
          )}
          {provider.keyUrl && (
            <a
              href={provider.keyUrl}
              target="_blank"
              rel="noreferrer"
              className="text-neutral-500 underline hover:text-neutral-700"
            >
              {provider.keyLabel ?? "Get an API key ↗"}
            </a>
          )}
        </div>
      </div>

      {modelListTip.node}

      <button
        type="button"
        data-testid="ai-settings-back"
        className="mt-1 flex items-center gap-1.5 self-start rounded-md px-2 py-1 text-[13px] font-medium text-neutral-600 hover:bg-neutral-100"
        onClick={onBack}
      >
        <ArrowLeft size={14} /> Back
      </button>
    </div>
  );
}
