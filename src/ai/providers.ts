/**
 * providers.ts — Provider presets for the thin OpenAI-compatible
 * client. Gemini Flash (free tier), Claude via Anthropic's
 * OpenAI-compatibility layer, and a custom URL escape hatch;
 * Groq/OpenRouter/Mistral are future preset entries.
 */

export interface ProviderPreset {
  id: string;
  label: string;
  /** OpenAI-compatible base URL (…/chat/completions is appended). */
  baseUrl: string;
  defaultModel: string;
  /** Rough input context window (tokens) for the payload guard. */
  contextWindow: number;
  /** One honest sentence shown under the picker in settings. */
  description?: string;
  /** Where to get a key (shown in settings). */
  keyUrl?: string;
  /**
   * Link text for `keyUrl`. Per-preset because it is a CLAIM: "Get a
   * free key" is true of Gemini and a lie about a paid-only endpoint,
   * and the code compiles either way.
   */
  keyLabel?: string;
  /**
   * One honest sentence on what this provider does with submitted data
   * (training), rendered by the API-key field in settings.
   *
   * REQUIRED, not optional, because forgetting it fails SILENTLY in the
   * dangerous direction: a preset shipping without it shows the user no
   * disclosure at all while the provider may train on what they send —
   * the same reasoning as `reparentMovesFiles`. `pnpm check` names any
   * preset that owes an answer.
   *
   * The copy is a CLAIM, per preset, at the strength its source
   * supports (the `keyLabel` lesson — one sentence true of Gemini is a
   * lie about Anthropic). Sources, both retrieved 2026-08-27:
   *
   *   - Gemini API Additional Terms, Unpaid Services: "Google uses the
   *     content you submit to the Services and any generated responses
   *     to provide, improve, and develop Google products and services
   *     and machine learning technologies."
   *     (ai.google.dev/gemini-api/terms)
   *   - Anthropic privacy center: "By default, we will not use your
   *     inputs or outputs from our commercial products (e.g. … Anthropic
   *     API …) to train our models."
   *     (privacy.claude.com/en/articles/7996868)
   *
   * A provider whose policy this app cannot verify (custom endpoints)
   * gets CONDITIONAL wording — pointing at the provider's terms rather
   * than asserting a direction on the user's behalf.
   */
  trainingNote: string;
  /** Extra body params this provider understands. */
  extraBody?: Record<string, unknown>;
  /**
   * Does this provider accept `temperature`? Default true.
   *
   * RECEIPT: a live reorganize against Anthropic on 2026-08-19 returned
   * `400` with the provider's own words — **"temperature is deprecated
   * for this model."** The current Claude generation reasons by default
   * and refuses sampling parameters outright; sending one fails the
   * whole call, so this is not a quality knob but a hard incompatibility.
   *
   * Optional with a default of TRUE on purpose, unlike
   * `reparentMovesFiles` elsewhere in this codebase. Forgetting it on a
   * future preset fails LOUDLY and immediately — the provider answers
   * 400 and `client.ts` surfaces its message verbatim, which is how this
   * one was found in a single run. A required field earns its cost where
   * forgetting fails silently; here it would only add ceremony to every
   * preset that has nothing to say.
   *
   * Kept as a capability fact rather than a per-preset temperature
   * VALUE: "this provider rejects the parameter" and "this provider
   * should run at 0.4" are two different sentences, and only the first
   * has a producer.
   */
  supportsTemperature?: boolean;
  /**
   * Does `GET {baseUrl}/models` serve a usable list to THIS client?
   * Default true.
   *
   * RECEIPT: measured 2026-08-19, and it corrects an inference this note
   * previously recorded. A dummy-key probe returned `401 "Invalid bearer
   * token"`, which was read as "the scheme is accepted, only the value
   * was rejected" — an inference, labelled as one, and false. A live run
   * with a VALID funded key was rejected identically, and a keyless auth
   * matrix says why:
   *
   *   Authorization: Bearer <key>  → 401 "Invalid bearer token"
   *   x-api-key: <key>             → 401 "API key is invalid."
   *
   * Two different refusals for two different credential TYPES. Anthropic
   * reads `Authorization: Bearer` as an OAuth-style token, so an API key
   * presented that way is never valid, whatever the key. Adding
   * `anthropic-version` changed nothing — auth is decided first.
   *
   * The fix is to stop asking, not to guess a model list: a hardcoded
   * list is the stale-pin trap wearing a new coat.
   */
  supportsModelList?: boolean;
  /**
   * Extra request headers, merged into every call to this provider —
   * chat AND model-list, which are two consumers, not one.
   *
   * RECEIPT, kept here because this is where the temptation to tidy it
   * away will stand. Anthropic's API refuses browser-origin requests
   * unless the request carries
   * `anthropic-dangerous-direct-browser-access: true`. Measured
   * 2026-08-18, CORS preflight against `api.anthropic.com` from
   * `Origin: http://localhost:5173`:
   *
   *   WITHOUT it in Access-Control-Request-Headers
   *     → HTTP 400, body "Disallowed CORS origin", and no
   *       `access-control-allow-origin` header at all
   *   WITH it
   *     → HTTP 200, `access-control-allow-origin: *`, and the header
   *       echoed back in `access-control-allow-headers`
   *
   * So the failure is a CORS block at the PREFLIGHT — the request never
   * reaches authentication, so there is no 401 and no error body naming
   * what is missing. It surfaces here as `AiError("network")`, whose
   * message already blames "a network problem or a CORS restriction";
   * for this provider that message would be true and useless. Anything
   * that reads like a network outage against this endpoint is this
   * header.
   *
   * Measured from a browser on 2026-08-18. The oft-cited 401 whose body
   * names the required header occurs only on NON-PREFLIGHT paths (curl,
   * a server-side client) — which is not the path this field serves, so
   * do not "correct" the paragraph above to match that account.
   *
   * "Dangerous" names the risk of an app shipping ITS OWN key in client
   * code where any visitor can read it — Anthropic's TypeScript SDK
   * documents the sibling `dangerouslyAllowBrowser` option as one that
   * "exposes your secret API credentials in the client-side code", and
   * names internal tools and development use as the cases where that
   * risk does not apply. TOC Fable ships no key: the key is the user's
   * own, typed in by them, held in their browser (docs/10's BYO-key
   * paragraph). The hazard the name warns about is one this app does
   * not have.
   *
   * NOT an instruction and NOT a permission — the two things docs/10
   * already regulates. A preset may set what the model is ASKED to
   * optimize for, and may never set what a run is ALLOWED to do to the
   * user's disk. Headers are neither: they are TRANSPORT, what the
   * endpoint requires in order to answer at all. A header that gated a
   * consequence would belong with the permissions, not here.
   */
  extraHeaders?: Record<string, string>;
  /** Whether the base URL is editable (custom endpoints). */
  editableBaseUrl?: boolean;
}

export const PROVIDERS: ProviderPreset[] = [
  {
    id: "gemini",
    label: "Google Gemini Flash (free tier)",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    // the -latest alias survives Google's model renames; the settings
    // "Fetch models" button lists what the key actually serves
    defaultModel: "gemini-flash-latest",
    contextWindow: 1_000_000,
    // no description: the label already says "free tier", and the
    // training disclosure lives on `trainingNote` by the key field
    trainingNote:
      "On the free tier, Google uses what you send to improve its products, including training its models.",
    keyUrl: "https://aistudio.google.com/apikey",
    keyLabel: "Get a free key ↗",
    // thinking eats the output budget; keep it low for this task
    extraBody: { reasoning_effort: "low" },
  },
  {
    id: "claude",
    label: "Claude (Anthropic)",
    // Anthropic's OpenAI-compatibility layer; the client appends
    // `/chat/completions`. Verified 2026-08-18 against
    // platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk
    baseUrl: "https://api.anthropic.com/v1/",
    // Alias-style id, no date suffix — the same discipline as Gemini's
    // `-latest`, and for a reason this project has already paid for
    // once: a hard-pinned `gemini-2.5-flash` was retired server-side
    // underneath us. This is the id the compatibility layer's own
    // quick-start example uses.
    defaultModel: "claude-opus-5",
    contextWindow: 1_000_000,
    description:
      "For development and testing — Anthropic positions this compatibility layer as a way to test and compare models, not as a production path. Paid API credit only; there is no free tier.",
    trainingNote:
      "Anthropic says it does not use API inputs or outputs to train its models by default.",
    keyUrl: "https://platform.claude.com/settings/keys",
    keyLabel: "Get an API key ↗",
    extraHeaders: { "anthropic-dangerous-direct-browser-access": "true" },
    supportsTemperature: false,
    supportsModelList: false,
  },
  {
    id: "custom",
    label: "Custom (OpenAI-compatible URL)",
    baseUrl: "",
    defaultModel: "",
    contextWindow: 128_000,
    description:
      "Any endpoint that speaks the OpenAI chat-completions shape. It must allow browser requests from this page.",
    trainingNote:
      "Whether this endpoint trains on what you send is up to the provider — check their terms.",
    editableBaseUrl: true,
  },
];

export function getProvider(id: string): ProviderPreset {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0]!;
}
