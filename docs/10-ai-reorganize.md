# AI Reorganization

An optional, explicitly user-initiated feature that sends the topic
hierarchy to an LLM with editable, preset-seeded instructions and opens
the suggested structure as a **new tab** (compare, keep, or close — the
original is never touched).

> **[amended 2026-08-19] A run has a MODE** (docs/21, Decisions 2 and
> 7). **Grounded** is the run described throughout this note: every
> proposed move is one the app can write back, and one it cannot is
> discarded with the branch-aware copy below. **Aspirational** widens
> proposal space to any arrangement of the document — moves the app
> cannot write are CLASSIFIED and labeled rather than discarded, and
> handed to the user as a checklist at apply time. The mode is chosen
> per dialog open (never remembered on the device), recorded immutably
> on `TabProvenance.mode`, and an ABSENT `mode` on a stored provenance
> is a grounded-era run rather than a missing fact.
>
> The tab a run produces is unchanged in every other respect: still a
> new tab, still named `"<source> (<model>)"`, still leaving the
> original untouched. What changes is that an aspirational tab may
> carry displacements — and a tab holding them is born Aspirational
> whatever run produced it, because a tab holding displacements cannot
> honestly wear the Grounded promise.

## The privacy exception

This is the one deliberate exception to "no data leaves the browser":

- Nothing is sent until the user presses **Run** (stated in the dialog,
  and since 2026-08-19 WATCHABLE rather than merely stated — the run's
  live log shows the exact request that left, expandable in place; see
  the streaming amendment).
- What is sent: **topic titles only**, as an indented outline with
  compact ids (`s1`, `t1`). File paths, UUIDs, and format `extras`
  never leave the browser. An optional "folder hints" toggle (off by
  default) adds directory prefixes — never file names.
- Scope: the request can be limited to selected cards; other sections
  appear as a single **id-less** context line, so the model cannot
  reference — let alone modify — them.
- Auth is BYO API key (there is no server). The key lives in memory for
  the session; "remember on this device" (off by default) persists it
  unencrypted to localStorage, with a "forget key" affordance.
  v1 provider: Google Gemini via its OpenAI-compatible endpoint; any
  OpenAI-compatible URL works via the custom provider.

## The safety contract (src/ai/)

The model can only *rearrange* — it structurally cannot corrupt:

1. The response references outline ids; unknown or duplicate ids are
   rejected (one guided retry with specific errors, then a clean
   failure).
2. Reconstruction rebuilds the document from the ORIGINAL objects by
   id: paths and extras are restored from local state, never parsed
   from model output. Children-follow semantics keep unlisted subtrees
   intact; omitted topics are recovered into their original sections.
3. A final invariant check (the topic-id multiset must be preserved,
   modulo explicit promote/demote accounting) refuses to open any
   result that fails — property-tested with fast-check.

Parsing is layered-tolerant (fences, prose, bullets, ragged indents,
JSON fallback) but strict on identity. See `src/ai/parse.ts` and
`src/ai/validate.ts`; the malformed-input suite in
`src/ai/__tests__/` is the reference for what the parser survives.

## Context-size strategy

Indented text ≈ 2–4× fewer tokens than JSON. Two user-facing controls
bound the payload: **scope** (fewer cards) and **granularity**
(full / top 2 levels / top level — truncated subtrees move atomically).
Oversized requests are blocked with guidance before anything is sent;
truncated responses (`finish_reason: length`) error with the same
guidance rather than parsing a partial answer.

## Amendment 2026-08-18 — a second provider, and the bytes behind a refusal

Live runs against the Gemini free tier were failing two ways: provider
503s, and earlier parse failures **whose response bytes were lost**.
Nothing captured them, so every report could say that a run failed and
never what the model actually said. Both halves of this amendment come
from that: a second provider to tell *our* bug from *theirs*, and a
capture so either one leaves evidence.

### `extraHeaders` — a transport seam, and what it is not

`ProviderPreset.extraHeaders` carries per-provider request headers,
merged by the client into **both** calls it makes — the chat completion
and the model list. Two consumers, not one: wiring only the chat call
leaves the settings "Fetch available models" button failing for exactly
the provider the seam exists for, and no chat test would notice.

The receipt lives at the field declaration in `providers.ts`, where the
temptation to tidy it away will stand. In short: Anthropic's API refuses
browser-origin requests unless the request carries
`anthropic-dangerous-direct-browser-access: true`. Measured this date
against `api.anthropic.com`, from `Origin: http://localhost:5173` —

| request | result |
| --- | --- |
| preflight **without** the header | `HTTP 400`, body `Disallowed CORS origin`, **no** `access-control-allow-origin` |
| preflight **with** it | `HTTP 200`, `access-control-allow-origin: *`, header echoed in `access-control-allow-headers` |
| browser `fetch` **without** it | `TypeError: Failed to fetch` — the CORS block |
| browser `fetch` **with** it, dummy key | `HTTP 401` `{"error":{"code":"authentication_error","message":"Invalid Anthropic API Key",…}}` |

So the failure is a CORS block **at the preflight**. The request never
reaches authentication, which means there is no 401 and no error body
naming what is missing — it arrives here as `AiError("network")`, whose
message already blames "a network problem or a CORS restriction". For
this endpoint that message would be true and useless. The last row is
also the acceptance receipt for the seam, and it needs no valid key: an
auth error rather than a CORS failure is the proof the header landed.

"Dangerous" names the risk of an app shipping **its own** key in client
code where any visitor can read it; Anthropic's TypeScript SDK
documents the sibling `dangerouslyAllowBrowser` option as one that
"exposes your secret API credentials in the client-side code", and
names internal tools and development use as where that risk does not
apply. TOC Fable ships no key — the key is the user's own, typed in by
them, held in their browser. The hazard the name warns about is one
this app does not have.

**It is neither of the two things this note already regulates.** A
preset may set what the model is ASKED to optimize for, and may never
set what a run is ALLOWED to do to the user's disk. A header is
neither: it is transport — what the endpoint requires in order to
answer at all. A header that gated a consequence would belong with the
permissions instead.

**Single-producer caveat, pre-declared.** `extraHeaders` ships with one
producer, so it is a parameterised mechanism that nothing yet
distinguishes from a hardcoded one — staged, not proved. The
anticipated second is OpenRouter's optional attribution headers, chosen
because they differ in KIND: optional rather than required, courtesy
rather than access, and absent-by-default rather than
present-on-every-call. Until that lands, the mechanism claim stands
unproved and should be read as such. The registry-level test asserting
that *any* preset pointed at `api.anthropic.com` carries the header is
the interim guard, not a substitute.

### The Claude preset

`https://api.anthropic.com/v1/` (the OpenAI-compatibility layer;
`/chat/completions` is appended by the client), default model
`claude-opus-5` — alias-style with no date suffix, the same discipline
Gemini's `-latest` follows and for a reason this project has already
paid for once, when a hard-pinned `gemini-2.5-flash` was retired
server-side underneath it. Both verified this date against
`platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk`,
which is also where the default model appears in the quick-start.

Two reasons to want it. **A differential oracle:** the same payload
against two providers turns an ambiguous failure into a localized one —
fails on both, suspect our parser; fails on one, suspect that model's
output. **Reliability:** a second endpoint when the first is 503ing.

The oracle's readings are recorded here as they are taken, because an
oracle with no log is an oracle nobody can check. First entry, from
Roger's receipts 4 and 5:

> 2026-08-19 — same document, same scope and instruction:
> gemini-flash-latest and claude-opus-5 both returned valid
> reorganizations, parse and validate clean. The historical Gemini
> parse failures did not reproduce against either provider —
> consistent with provider-side degradation under load, not a parser
> defect. Capture affordance stands ready for any recurrence.

Worth stating what that entry does NOT settle: a non-reproduction is
evidence about the parser's innocence on THESE two answers, not a
finding that the parser is correct. The capture is what would turn a
recurrence into evidence, and it is why the entry ends where it does.

Second entry, from the constraint-parity arc's receipt 5:

> 2026-08-19 — godot-docs, whole-document scope, **grounded**
> semantics, constraints communicated (47 pinned rows marked):
> claude-opus-5. The first answer moved a pinned row; the
> pre-reconstruct check named it, the guided retry complied, and the
> result validated and opened as a tab. The incident that opened the
> parity arc does not reproduce.

Two things that entry settles which no keyless receipt could. **The
rescue path fired on a real model at corpus scale** — the exact
sequence `pnpm receipt-constraints` drives with a mock, driven instead
by a model that had never seen the constraint before, on a 515-row
payload. And **communication alone was not sufficient**: the model was
told, in the request, that the row was pinned, and moved it anyway on
the first attempt. Under the shape this arc replaced, that run ends in
a discarded corpus-scale call; under ruling 1b it ends in a tab.

The **mode** term is docs/21's (Decision 7), recorded here ahead of
that note landing because two runs in different modes are not the same
experiment — a grounded/aspirational pair against one model measures
the constraint framing rather than the model, and a log that omits it
makes its own comparisons silently unsound. Every entry above this
line was grounded by construction, modes not existing yet.

> 2026-08-19 — godot-docs, whole-document scope, **grounded**, allow
> new sections ON: claude-opus-5. Valid result tab; Review changes
> refused the plan — the proposal added and removed cards, and a
> Sphinx card is a toctree block this version does not create or
> delete. The refusal is docs/19's designed absence speaking; the
> finding is upstream of it: the dialog offered a toggle no adapter
> capability field conditions, so the run promised what the plan
> must refuse.

> 2026-08-19 — godot-docs, whole-document scope, **aspirational**,
> diátaxis instruction, full granularity: claude-opus-5. Discarded at
> validate, first attempt; the capture shows ~130 of 515 ids — the
> model omitted the rest under output pressure. First live receipt
> that the content-safety net binds in aspirational mode at corpus
> scale: imagination never licensed the dropped rows. The discard
> copy, however, called it "a bug on our side" and advised retrying —
> a misattribution, since the honest surface here is the omission
> count and a coarser granularity.

> **[annotated 2026-08-20]** The mechanism this entry names is
> withdrawn. Measured while rewriting the discard copy
> (capability-fields, `discardCopy.test.ts`): an OMISSION never
> reaches the multiset net — all three omission shapes driven through
> the real `reconstructDocument` return the document whole, because
> omitted topics are recovered into their original sections by
> design. Only a duplicate trips it. So "imagination never licensed
> the dropped rows" cannot be what discarded this run. What stands:
> the run was discarded at validate on the first attempt, and the
> answer held ~130 of 515 ids. What was never kept: the capture, so
> the true trigger — a duplicate among the 130, a mangled id, another
> net — is unknown rather than known. The "first live receipt" claim
> above is withdrawn with it; the multiset net's mode-independence
> rests on its property test, which was never this entry's job to
> carry. The /v1/models lesson, inverted: that inference cost a
> paragraph to retract because it was labeled one; this finding cost
> a measurement, and the bytes that would have settled it in one look
> were not kept. A capture behind a log entry should outlive the
> dialog it appeared in.

> 2026-08-19 — godot-docs, whole-document scope, **grounded**, allow
> new sections OFF: claude-opus-5. Valid result, Review clean,
> `.patch` produced. The grounded half of the differential, collected.

> 2026-08-19 — godot-docs, **aspirational**, coarser granularity,
> allow new sections ON: claude-opus-5. Validated and opened: 100
> moves (88 the app can write, 12 needing the hand), 5 promoted;
> badges, the Overview line, and the checklist all rendered live —
> including the kept-whole container item with its re-import remedy.
> Review then refused: the model had created four cards (sections
> 6 → 10), the same block-creation wall as the grounded run — and the
> dialog's headline claimed "the canvas matches the imported files"
> beside the blocking warning saying otherwise. docs/21 is silent on
> model-created cards; this run is the demand receipt for ruling one.

> 2026-08-19 — godot-docs, **aspirational**, coarser granularity,
> allow new sections OFF: claude-opus-5. Refused at Review for a
> different structural move: the model reordered top-level cards
> ("Class reference", position 6 → 5), and block order is written in
> prose positions Sphinx does not rewrite. Second live instance of
> Decision 8's enforced-but-uncommunicated class — the card-level
> sibling of the frozen-block `order` gap — and nothing in either
> mode's prompt says card order is fixed here.

> 2026-08-19 — godot-docs, **aspirational**, card order intact:
> claude-opus-5. Within-card reorderings validated, opened, and
> flowed through Review to a `.patch`. The aspirational half of the
> differential, collected; with the grounded entry above, the pair
> docs/21 designed for exists in the wild.

The three refusals in this batch are one family — the model imagined
STRUCTURE (new cards, card order) the adapter cannot write, and the
projection only knows how to send rows home. Ruled family membership
and remedies are docs/21-territory; the rulings are pending and these
entries are their demand receipts.

> **[updated 2026-08-20]** Disposed as follows. The created-cards and
> card-order refusals are now COMMUNICATED — `createCards` and
> `reorderCards` landed as required fields on both adapter contracts
> (capability-fields), conditioning the dialog's toggle and adding
> the constraint lines to both modes' prompts — and the Review
> headline no longer claims a canvas match beside a blocking warning.
> The moves themselves stay unwritable; making structure a
> projectable record kind is the structural-remainders design's
> question (**docs/22**), and docs/21's Decision 9 addendum names it as
> the unlock.

> **[updated 2026-08-21 — the unlock landed]** docs/22 makes structure a
> projectable record kind, and this batch's own wall is gone: creation,
> card order and row order derive as `StructuralRemainder`s, the
> applyable projection dissolves them, and the WRITABLE part of a plan
> now reaches Review instead of the whole plan dying at
> `section-set-changed`. Measured in a browser rather than argued
> (`e2e/flow17-structural-remainders.spec.ts`): with a created card on
> the canvas the plan still carries its file changes, and disabling the
> dissolution turns that assertion red at zero. The moves in THIS batch
> would today be labeled, listed with a remedy naming the toctree block
> to add, and split out at Review — the disposition this entry was
> waiting for.

The settings copy says what it is, honestly, because dialog copy is a
claim: *for development and testing* (Anthropic positions the
compatibility layer as a way to test and compare models, not as a
production path — its own docs say so in as many words) and *paid API
credit only; there is no free tier*.

That framing forced a **copy sweep** one field wider than planned. The
key link read "Get a free key ↗" for every provider, which is true of
Gemini and false of a paid-only endpoint — a capability flip turning a
neighbouring sentence into a lie told to the person least able to check
it. `keyLabel` is now per-preset for that reason.

**`max_tokens`: decided 2026-08-19 — it stays unset.** The open
question was whether the compatibility layer's default output budget is
small enough that an ordinary reorganization returns
`finish_reason: "length"`, which would surface as our truncation error
and give advice ("reduce the scope, use a coarser granularity") that
misnames the cause. Roger's receipt 4 answers it: a medium document ran
to completion against `claude-opus-5` with no truncation. The default
is adequate for the sizes this feature is used at, so nothing is added
— a bounded `max_tokens` in the preset's `extraBody` would be a guess
that CREATES the failure it was meant to explain. The truncation
surface stands as the honest failure mode for larger scopes, and it now
keeps the partial bytes it got (the streaming amendment below).

### The rejected response survives

A rejection now carries the response that caused it. Both surfaces, per
ruling: a **"Copy raw response"** button in the dialog's error state,
and a DEV console dump.

It rides the thrown `AiError` rather than living in a store. The scope
is then right by construction — no lifecycle to get wrong, nothing to
evict, no way to outlive the session, and "never captured on success"
stops being a rule anyone has to remember, because a run that does not
throw has nothing to hang a capture on.

It carries **two facts that are not one fact**: `stage` (which layer
refused it — parse or validate) and `attempt` (which answer it was —
first, or after the one guided retry). They read like a single "phase"
and are orthogonal: a proposal can parse only on the retry and still be
refused by reconstruction, which is `validate` + `after-retry` and
which neither field alone can express. It stores the **bytes**,
verbatim — the parser strips fences and prose to find the outline, and
storing what it extracted would discard exactly the wrapping that is
usually why a report was filed.

Two absences on purpose. A transport failure (auth, rate limit, no
network) has no model output, so no button appears — one promising a
body there would be a claim the clipboard contradicts. And a
first-attempt parse failure that the retry **rescued** reaches no
user-facing surface at all, because no error is thrown to carry it; the
DEV log is the only place it is ever visible, which is most of what
that surface is for.

### WebLLM — a designed absence, not a deferral

In-browser inference (WebLLM and its kin) is not a preset and could not
be one: there is no base URL, no key, and no OpenAI-compatible endpoint
to point at — it is a second client path, a model download, and a
storage budget. The provider registry is the wrong shape for it, so its
absence from that list is not a gap to close. Recorded because the list
is the obvious place a later reader would try to add it.

### Addendum, same date — what the first live attempt found

Roger's first live run failed, and the capture affordance handed back
the rejected response. The proposal was `s99 Invented Section`
containing `t404 Ghost Topic` — byte-for-byte the fixture from this
arc's own forced-failure receipt. A Playwright `page.route` registered
to collect that receipt had never been removed, so the browser was
still answering every `api.anthropic.com` request with it. Anthropic
never saw the request.

The instrument, not the product. Three consequences worth keeping:

- **The glob matched everything.** `api.anthropic.com/**` intercepts
  GET `/models` as readily as POST `/chat/completions`, which is why a
  model-list fetch came back as a chat-completion object — a shape now
  pinned as a `listModels` fixture, since it is the realistic wrong
  answer rather than an invented one.
- **The residue was invisible.** A route lives in the test driver's
  process; nothing running inside the app can see it. The fence in
  `noInterception.test.ts` guards the shipped app and says at its top
  that it cannot close this gap, because a green check that means less
  than it appears to is worse than no check.
- **Forced-failure receipts no longer patch anything.**
  `scripts/mock-provider.ts` is a real local endpoint that answers
  badly on purpose; point the custom provider at it. Nothing is
  patched, so nothing can be left patched.

**What the incident did NOT invalidate.** Receipt 2 was collected
before the route was registered, and its re-collection agrees with the
original: without the header a browser `fetch` throws `TypeError`, with
it the same call returns `401`, now carrying per-request Cloudflare ray
ids and ~110 ms round trips. The seam's measurements stand.

### `GET /v1/models`, measured

Against real Anthropic, with our Bearer-auth client and the browser
header: **401**, body
`{"type":"error","error":{"type":"authentication_error","message":"Invalid bearer token"},"request_id":"req_…"}`.

Two readings hold: the endpoint exists and is CORS-reachable with the
header, and the envelope is Anthropic's NATIVE error shape rather than
the OpenAI-compat one `/chat/completions` returns, so `/v1/models` is
served by the native API.

A third reading was recorded here and was **wrong**. It said our
`Authorization: Bearer` was *parsed* — that the refusal was about the
token's value, not the scheme — and concluded the fetch could stay.
That was labelled an inference rather than a receipt, which is the only
reason it was cheap to retract.

#### Falsified 2026-08-19, and what replaced it

A live run with a VALID, funded key was refused identically. The
inference was not merely unproven, it was false, and a keyless auth
matrix shows exactly how:

| credential | `anthropic-version` | answer |
| --- | --- | --- |
| `Authorization: Bearer <key>` | absent | `401 "Invalid bearer token"` |
| `x-api-key: <key>` | absent | `401 "API key is invalid."` |
| `Authorization: Bearer <key>` | present | `401 "Invalid bearer token"` |
| `x-api-key: <key>` | present | `401 "API key is invalid."` |

**Two different refusals for two different credential TYPES.** Anthropic
reads `Authorization: Bearer` as an OAuth-style token, so an API key
presented that way is never valid — no key of ours could have worked.
The version header changes nothing; auth is decided first. The original
probe could not distinguish "wrong value" from "wrong kind of
credential", because a dummy key produces the same words as a real one.

Per the decision rule, with a refusal of our call shape now observed:
`supportsModelList: false` on the Claude preset, and the button is
disabled through the same disabled-with-a-reason seam `ConfigureView`
uses for its gated toggles — *"This provider doesn't serve a model list
to this app — enter a model name from their documentation."* The
handler refuses too, so no keyboard or programmatic path can fire a
request the provider is known to reject. No hardcoded model list: that
is the stale-pin trap in a new coat.

**The road not taken:** per-endpoint native auth (`x-api-key` +
`anthropic-version`), which the matrix suggests would be accepted. It
is not built, because it would introduce an auth-STYLE seam with a
single producer — the same "staged, not proved" position `extraHeaders`
is already in, and a second one bought for a convenience button rather
than for the feature itself. If a second provider ever needs non-Bearer
auth, this paragraph is the starting point and the matrix above is the
evidence.

The lesson is not "don't infer". It is that an inference recorded AS an
inference costs one paragraph to withdraw, while the same sentence
written as a finding would have become a fact nobody re-checked.

### A non-list answer is not zero models

`listModels` did `body.data ?? []`, so any 200 without a `data` array —
an error object, an HTML login page, a chat completion from a mis-set
base URL — became a *successful fetch of zero models*: the note read
"0 models available" in the same grey as a success, and the current
model was quietly kept. Not measured is not zero, and the failure was
invisible precisely because it wore a success's clothes.

Now: a non-list answer is refused and named ("That endpoint answered,
but not with a model list"), an empty `data: []` is returned as the
real answer it is, and the note carries its own polarity so a refusal
cannot be rendered in a success's colour. Both answers are pinned by
test — asserting only the refusal would leave the other half resting on
nothing.

This is also what makes the unmeasured 200 body above safe to live
with: if Anthropic's list ever arrives in a shape we cannot read, the
button now says so instead of reporting zero.

### The capture's stage attribution, checked

Roger's capture labelled an unknown-id rejection `stage: parse`, which
looks wrong — the response parsed fine and the complaint is semantic.
It is correct. `parse.ts` is layered, and L3 IS identity-strict id
resolution: `collectIdErrors` runs inside `parseResponse`, and its
findings are what the guided retry is built from. The stage type now
says so at its declaration, since "it parsed, so this must be validate"
is the obvious wrong reading.

The check did surface a real defect one field over: the dialog rendered
`parse` as "unreadable reply", which is false for the commonest case —
an unknown id means the reply read perfectly and named something absent
from the outline. It now reads "reply didn't match the outline".

### `temperature`, refused (measured 2026-08-19)

The same live session returned `400` with the provider's own words:
**"temperature is deprecated for this model."** The current Claude
generation reasons by default and refuses sampling parameters outright,
so this is not a quality knob that happens to be ignored — it fails the
whole call.

`supportsTemperature: false` on the preset, and the payload builder
omits the KEY rather than sending a neutral value, because what is
refused is the parameter and not the number. Gemini's payload is
unchanged, and that half is asserted too: a suppression that leaked
into the provider this app has always shipped would be a silent
behaviour change, and only the absence test on the other side catches
it.

The field is optional with a default of true, which is a departure from
this project's usual "required, not optional" instinct — and the reason
is the failure direction. Forgetting it fails LOUDLY: the provider
answers 400 and `client.ts` surfaces its message verbatim, which is how
this was found in a single run. Required fields earn their ceremony
where forgetting fails silently; here it would tax every preset that
has nothing to say.

Both of these arrived the same way — a real key, a real endpoint, two
refusals in sequence. That sequence is also the user-side confirmation
that the interception incident above is closed: two distinct
server-generated errors, from the provider, in a browser that had
nothing registered in it.

### Keys are per provider (ruled 2026-08-19)

The API key was one shared field. Switching presets kept it, so the run
after a Gemini → Claude switch posted the **Gemini key to Anthropic** —
a funded secret delivered to the wrong company and into their request
logs. Nothing failed visibly: the request was well-formed and the
provider simply rejected an unfamiliar credential, which reads as
"wrong key, paste it again". The lesser complaint, re-pasting on every
switch, was the same defect wearing a friendlier face.

The differential workflow this arc was built for — one document, two
providers, compare — **is** that switching pattern. The feature and its
worst failure mode arrived together.

Keys are now a map keyed by provider id, and the safety is STRUCTURAL
rather than a rule someone remembers: the key is looked up by the same
`providerId` that selects the base URL, so credential and destination
cannot disagree. There is no instant during a switch when the old key
is paired with the new URL, because neither is carried — both are
derived. `currentKey()` is the only way to reach one.

Decisions worth stating:

- **Lifetime is unchanged.** Keys still live in memory unless "remember
  on this device" is on, and that checkbox stays global — it is a
  persistence preference, not a fact about any one key. The recorded
  story was checked against the code rather than assumed, and it was
  accurate.
- **A legacy single key is not migrated.** It could only be attributed
  by assuming it belonged to the last-stored provider — and the bug
  being fixed is precisely that the shared field carried keys across
  providers, so that assumption is unreliable exactly where it matters.
  One re-entry, correctly attributed, beats a guess that posts a secret
  to the wrong endpoint. Everything else in the stored settings
  survives.
- **The custom provider gets ONE slot**, keyed by preset id rather than
  by base URL. Editing a custom URL therefore keeps the key. The
  distinction is VISIBILITY: switching presets changes a destination
  the user cannot see (no base URL is shown for a preset), while
  editing the custom URL puts key and destination in view together, one
  field apart. Per-URL keying would also blank the field mid-typing,
  which reads as broken. Stated because it is a judgment call, and the
  residual is real.
- **`forgetKey` clears every provider**, not just the visible one. With
  keys plural, a forget that left another provider's funded key live in
  memory would surprise in the dangerous direction, and nothing in the
  UI would show it was still there. Clearing one is still possible: the
  text field.

The guard is pinned on the BYTES THAT LEAVE, not on the store's shape —
a store-only test passes while some call site still reads a stale key.
Mutation says which case is load-bearing: reverting to shared-field
behaviour kills exactly one of the five, the one where the destination
provider has NO key. The others give both providers a key and never
reach that branch. The dangerous state is an empty slot, so the guard's
fixture is a configured provider and an unconfigured one together.

## Amendment 2026-08-19 — the wait becomes a log

The wait dialog showed a spinner and a seconds counter. That is
evidence that time is passing and evidence of nothing else, and it left
two true things invisible: the **privacy claim** — titles only, sent on
Run — was a sentence in the footer rather than something anyone could
watch happen; and the **guided retry** was a second paid call nobody
ever saw. Both are now on screen. Streaming is the prerequisite, not
the point.

### The transport streams, and returns exactly what it returned before

`chatCompletion` asks for `stream: true` and accumulates SSE deltas.
What it RETURNS is unchanged — the complete text — so parse, validate,
reconstruct and capture are untouched by construction. The payload
differs from the pre-streaming one by exactly that key, asserted as a
DIFF rather than as a shape: a shape assertion (`toMatchObject`) passes
while a second key rides along beside the one that was meant to change.
Claude still carries no `temperature`, and that half is asserted too.

`src/ai/stream.ts` is a pure accumulator — strings in, strings out — so
the failure shapes are unit fixtures rather than network conditions
nobody can reproduce on demand. Its fixtures are fed **one character at
a time** as well as whole, because frame boundaries do not respect
chunk boundaries and a socket splits wherever it likes, including
mid-JSON.

**Three end states, not two.** A stream stops for three
distinguishable reasons and the caller needs all of them:

| state | means |
| --- | --- |
| `sawDone` | the endpoint sent `[DONE]` — the answer is whole |
| `finishReason` | why the MODEL stopped, and it rides the LAST chunk, so every earlier one reports `null` and a reader that peeks at the first sees health |
| `providerError` | an error object arrived mid-stream, after `200 OK` and after part of the answer |

A stream that ends with none of them set closed **abruptly**, which is
its own answer and not a tidier name for either other one. The module
reports; the client decides — the same split as every instrument in
this project, health separately from measurement.

### The fallback is a classifier, so both sides are asserted

| answer | reading | action |
| --- | --- | --- |
| `200`, not `text/event-stream` | the endpoint IGNORED `stream` and answered whole | READ it — the answer is in hand, and asking again spends a call to learn nothing |
| `400` | the only status that can complain about the request BODY, and `stream` is the only thing new in it | retry once with the key REMOVED, not falsified — an endpoint that rejects the key may reject `false` too |
| `401` / `403` | not a streaming failure | no retry |
| `429` | retrying a rate limit is the worst available answer | no retry |
| `5xx` | the endpoint is down, not fussy about SSE | no retry |
| a throw | there was no answer to classify | no retry |

Narrowing a classifier obligates the other side's receipt, and the
exclusions are not decoration: mutating the predicate to `!response.ok`
kills three of those four tests. A fallback is a **behaviour, not an
error**, so it is stated in one line in the log rather than hidden.

### A broken stream keeps its bytes — and one earlier ruling is reversed

Partial bytes ride the thrown error as `AiError.partial`; `run.ts`
turns them into a capture at a third stage, **`stream`**. That is
genuinely a third answer rather than a tidier name for one of the other
two: the response was refused by NEITHER parse nor validate, because it
never became a whole response.

This **reverses the earlier ruling that a truncated response carries no
capture**, and reconciles rather than overrules it. The original
objection was real and is recorded in `capture.test.ts`: a cut-off
answer is not a proposal the model stands behind, and offering one for
a report invites a parser bug to be filed against a sentence the model
never finished writing. That was correct *while `stage` could only say
`parse` or `validate`* — either of which WOULD have misdescribed a
fragment. `stream` says what it is, and the dialog's copy says
"answer arrived incomplete", so a reader is told what they are holding.
Auth and network stay on the other side, which is why the block still
has two sides to assert.

The dialog's stage copy became a `Record<CaptureStage, string>` in the
same change. It had been a ternary, whose `else` branch would have
described the new fragment as a refused result — silently, because a
message is DATA and no test fails when one is missing. The record makes
`pnpm check` name the omission, the same discipline the command
switches use.

### Cancel: a user's own stop is not a failure

An `AbortController` is wired to a Cancel control active during the
run. It aborts the in-flight request, stops reading the body, returns
the dialog to its pre-run state and opens no tab. **It populates no
capture.**

The interesting half is that the guard is not vacuous. The client
attaches partial bytes to an aborted call *exactly* as to a broken one,
deliberately, so the rule in `run.ts` declines something real rather
than being a comment over a branch that never fires — removing the
guard fails a test. Had the client special-cased abort instead, the
rule would have been enforced in two places and provable in neither.

### The log is a claim

`src/ai/runLog.ts` is a transient store outside the main app store, for
the reason every high-frequency surface in this project is: a delta
arrives dozens of times a second and must not re-render the canvas.

What the pane shows is what was sent and what came back, not a summary
of either. **One liberty is taken and it says so where it is taken:**
`formatSentPayload` parses the exact posted body and prints the message
contents verbatim under role headings, because a JSON string with every
newline escaped is unreadable for precisely the audience this pane
exists for. It is derived FROM the bytes that left, never assembled a
second time from the same intent — a rendering built beside the real
one is free to drift, and a drifted log is worse than no log.

**`call` and `request` are two events.** One call makes two requests
when the fallback engages; one run makes two calls on the guided retry.
Merged, neither shape is expressible. So the retry marker is
STRUCTURAL — a second entry with its own heading — rather than a string
this component synthesizes from a count it happened to notice.
Grouped by declared relationship, never by invented category.

**Collapsed-and-says-so.** The sent payload sits behind one line
carrying its own measurement (`sent · N lines · ~M tokens`), because
the live response is what a waiting user came for and a screenful of
system prompt above it would bury the thing that moves.

**`waiting for the first token` is its own state**, and it is not
decoration. A reasoning model connects and then emits nothing for tens
of seconds; a still log with no word for that reads as hung, which is
the failure this pane exists to end, reintroduced one layer up.

**Thinking content is a recorded absence, not a gap to close.** The
OpenAI-compatibility layer streams no thinking blocks, so there is
nothing to display during that silence — naming the state honestly is
the whole remedy available. This is an absence with a reason rather
than a deferral: closing it would mean a second client path against
Anthropic's native Messages API, which is a different transport, not a
missing feature of this one.

**It vanishes on success** (ruled), and it is cleared on the failure
path too — the capture is the record there. The store is therefore
never left holding a finished run that nothing is rendering, which is
the lifecycle `capture.ts` avoids by riding an error.

### Tab provenance — splitting a fact from its only witness

A reorganized tab was named `"<source> (reorganized)"`, and that name
was the entire record of its origin: provider, model, preset, when. It
is also the one thing a user is invited to change. The fact and its
only witness were the same string, so renaming a tab silently deleted
the answer to *which model produced this?*

`store/provenance.ts` separates them. The name is SEEDED from the
provenance at creation and belongs to the user afterwards; the
provenance is durable and no gesture in the app alters it. Every path
that carries a document forward carries it — rename, duplicate,
close-and-reopen, a session restored from localStorage — and each is a
separate consumer that could have dropped it silently, so each has its
own assertion.

```
{ kind: "ai-reorganize", providerId, providerLabel, model,
  presetId, presetName, at }   // ISO 8601, UTC
```

- **The name is the MODEL**, not the word "reorganized" it replaces.
  The differential workflow this arc exists for is two runs of one
  document side by side, where `Toc (reorganized)` twice is two
  identical labels for the two things being compared;
  `gemini-flash-latest` against `claude-opus-5` tells them apart in the
  tab strip, which is the only place the comparison happens. That is a
  user-facing copy change, so the sweep ran.
- **`providerLabel` is stored, not looked up.** A preset can be
  relabelled or removed, and the fact being recorded is what the run
  actually used.
- **No `PERSIST_VERSION` bump.** An absent optional field rehydrates as
  `undefined`, which is the correct reading of a tab that was loaded
  rather than generated. Asserted rather than assumed, because the cost
  of being wrong is every user's tabs discarded on upgrade. Absent is
  its own answer here, as everywhere.
- **Single producer, pre-declared.** Nothing branches on `kind` today.
  It exists because every other field is meaningless for another
  origin, so a second producer must add a VARIANT rather than
  reinterpret these — but until that producer exists this is a
  parameterised shape nothing distinguishes from a hardcoded one:
  staged, not proved.
- **Storage only.** docs/08 names diff-view-between-tabs the
  highest-value backlog item and this is its feed. No diff UI is built,
  and building one on a shape with one producer would be the same
  mistake one layer up.

### The instruments, and what each one's green means

| instrument | what its green means | what it says nothing about |
| --- | --- | --- |
| `src/ai/__tests__/stream.test.ts` | given these bytes, the accumulator concludes correctly | whether any server emits those bytes |
| `streamingClient.test.ts` | the request body, the fallback classifier both ways, partials, abort | timing; nothing here arrives progressively |
| `runLog.test.ts` | the event sequence a run narrates, and the capture rules | anything rendered |
| `e2e/flow13-ai-streaming.spec.ts` | SSE parses in a real browser; the pane, retry marker, fallback line, cancel and provenance all render and behave | **that the tail GROWS** — `route.fulfill` delivers a whole body, so it proves the bytes parse and nothing about time |
| `pnpm receipt-stream` | the tail grows across frames against a real endpoint over real seconds, cancel stops the wire, provenance survives a hand rename, each mock mode emits the shape its name claims, and (since 2026-08-20) every timed probe cleared a floor derived from what the mock announced on its own port | anything about a real provider — that is Roger's live receipt; and the floors are LOWER bounds, so they catch a probe that skipped its work and not one that did it badly |

`scripts/mock-provider.ts` gained the four stream shapes plus
`no-stream` (a `400` to any streamed request, then a whole answer — the
only producer of the client's fallback branch), and a `--ttft` pause
before the first token. The pause is not padding: without it the
`waiting` state is real code no receipt can ever observe.

**Three harness defects were found collecting these, every one
reporting working code as broken** — the base rate this project already
records, holding again:

- An **unbounded `ReadableStream` fixture** OOM'd the runner instead of
  failing the assertion it was written for. A fixture that fails by
  exhaustion is not a failing test, it is a dead run.
- **`controller.error()` after `enqueue` RESETS the queue**, so "a
  socket that dies mid-answer" was silently testing "a socket that died
  before any bytes" — a different scenario wearing this one's name.
- A **duration floor computed from "~30 chunks" against a stream of
  five**, which is the wrong-quantity error the corpus paint check
  already paid for once. The floor now derives from the count the mock
  itself announces, so the number asserted comes from the instrument
  that produced it.

And one instrument defect that was diagnosed rather than assumed:
`--ttft` did nothing at all, because **node holds a response head until
the first `write()`** — headers and first token arrived in one tick and
`waiting` measured zero. `res.flushHeaders()` is the fix, and the
MEASURED-ABSENT verdict that led to it was a true reading of a broken
instrument, which is exactly what the three-verdict rule is for.

## Amendment 2026-08-19 — constraint parity

**Every constraint the layer below enforces, the model is told.** Not
as a habit somebody keeps, but as an arrangement in which the mistake
has nowhere to live.

### The incident

A whole-corpus reorganize of godot-docs moved "Using the Project
Manager". The Sphinx source pins that row; `validate.ts`'s lock net
refused the result; the entire corpus-scale call was discarded. The
rule was real and the enforcement was correct. The only party who
could have complied was the one party never told.

### The premise, corrected against the code

Reparent was the FIRST instance of this class and was **already
fixed**: `prompt.ts` has carried the "Do NOT move a topic to a
different section" branch since `8a193af` (docs/16 step 6a). The
handoff for this arc, and CLAUDE.md's own conventions section, both
still described reparent as the outstanding IOU — the inverted
`Decided ≠ built` failure, where shipped work reads as merely decided
and nothing ever contradicts it. That line is corrected in the same
change as this note.

So the genuinely uncommunicated constraint was **locks, and only
locks**. Before this arc the system message stated: response format,
new sections, reparent, section-nesting, renames, never-empty groups,
scope. Locks appeared nowhere.

And the first fix left a hole of its own. It created a SECOND
hand-wired path from a source fact to a prompt sentence, so "a
constraint enforced but uncommunicated" stopped being one pattern and
became two one-offs. A third would have been a third.

### Parity is structural

A constraint is one member of a discriminated union
(`src/ai/constraints.ts`). Both consumers switch over it exhaustively:

| consumer | question it answers |
| --- | --- |
| `constraintPromptLines` | what is the model TOLD |
| `explicitViolations` | what is CHECKED |

**Receipt:** adding a third kind answered nowhere fails `pnpm check` at
**both** sites (`constraints.ts:168` and `:238`). There is no diff that
adds enforcement while forgetting the prompt — the same shape as the
per-provider key map, where credential and destination derive from one
id and so cannot disagree.

Reparent's line moved onto that seam rather than surviving beside it.
The sentence is byte-identical, deliberately: this arc rewired it and
did not reword it, so a failure there means the wiring.

### The prompt side, and what it costs

Pinned rows are marked **at the point of use** — `[pinned]` on the row
itself — and the explanation is stated **once** in the system message.
O(rows) for eight characters plus O(1) for the block.

The alternative, a block naming every pinned id, costs the same order
and puts the constraint somewhere other than where it applies. Naming
ids is right where a thing is INVISIBLE — which is exactly why
`neverEmptyGroups` lists them, containers having no outline presence at
all — and wrong where the constraint is already on the line.

**Measured at godot scale** (`pnpm measure-constraint-cost ~/godot-docs`),
through the shipped serializer, with the counterfactual derived from
the real artifact by removing its marks rather than from a second
serializer mode:

| granularity | rows | pinned | outline B | marks B | block B | added | tokens |
| --- | --- | --- | --- | --- | --- | --- | --- |
| full | 515 | 47 | 17,019 | 423 | 331 | 4.08% | +189 |
| two | 515 | 1 | 1,512 | 9 | 331 | 11.38% | +85 |
| top | 515 | 0 | 164 | 0 | 0 | 0.00% | +0 |

**Not material at full granularity**, which is the granularity the
incident ran at. Two things in that table are worth more than the
headline. The `two` row is 11% because the O(1) block dominates a small
payload — the percentage is a ratio, not a cost, and the absolute
figure (+85 tokens) is what a reader should carry. And the `top` row is
0 across the board: with no topic ids there is nothing to mark and
nothing to violate, so the mechanism costs exactly nothing where it has
nothing to say.

Godot's 47 locks are 46 `outside-region` and 1 `atomic`. That is not in
tension with the "85 duplicate references" figure: the 85 counts
duplicate docnames across the whole 1,594-document closure, while these
47 are locks on the 515 rows the canvas actually shows under the
declared root. Different denominators, recorded here because someone
comparing the two numbers would reasonably think one of them is wrong.

> **[corrected 2026-08-19]** This paragraph attributed the 85 figure to
> **docs/19**, which carries no duplicate-reference evidence for godot
> at all. Its home is **docs/12** (`classes/`, 1,163 entries) and
> `validate.ts`'s parent-change-only comment. Corrected here rather
> than quietly rewritten, because a pointer to the wrong note is how a
> reader spends an afternoon looking for a measurement that was never
> there (docs/21, Decision 8 carries the receipt).

**The measurement is its own oracle.** The pinned count is produced two
ways — a walk over the id map and a walk over the tree — and the script
exits non-zero if they disagree. At full granularity every topic has an
id, so they must be equal; a drift in either the predicate or the id
map shows up as a failed measurement rather than as a wrong prompt.

### Seven kinds, one marker

`Topic.lock` has seven kinds across two tiers, so "pinned" is a family
rather than one thing. For THIS constraint the family is uniform, and
the reason is docs/19's promise analysis: the kinds differ in WHY
(`atomic` is about size, `reference` about identity, `pattern` about
syntax, `external` and `missing` about the target) and none of them
says anything about POSITION. That is also why the net they feed is
parent-change only — refusing a locked row's index among its siblings
would refuse nearly every proposal on a corpus with scattered
references, for a claim no lock makes.

So the model gets one marker. A distinction it cannot act on is a
distinction that costs tokens and buys confusion.

### Retry reachability (ruled 1b)

The lock net throws from `reconstructDocument`, which runs AFTER the
guided retry — so a violation had exactly one outcome, and the retry
that already existed and already carried specifics could not see this
class of problem at all.

A pre-check now runs on the parsed proposal and feeds that retry with
the offending rows named. It is **sound, not complete**, and the
asymmetry is deliberate in both directions:

- **no false positives** — this spends the one retry, and a retry spent
  correcting an answer that was already right is worse than no retry.
  Root placements and `+ new group` placements are DECLINED rather than
  guessed at, because reconstruction may re-wrap an orphan into its
  original section or mint a fresh one and only the finished document
  says which. Both exclusions are asserted.
- **incompleteness is free** — `validate.ts` sees the finished document
  and refuses whatever this missed. Nothing gets through; the only
  thing lost is the chance to have asked again.

The soundness argument rests on children-follow: an explicit listing is
honoured by reconstruction, so a pinned row explicitly placed under an
explicitly identified parent that is not its own has certainly moved,
and an UNLISTED row keeps its parent by construction and can never be a
violation.

A violation that survives the retry is deliberately not re-checked.
`reconstructDocument` is both the complete enforcer and the one site
that owns the discard copy; checking twice would mean two messages for
one refusal to keep in step.

**Confirmed live, 2026-08-19** (receipt 5, the oracle log's second
entry): a whole-godot run against `claude-opus-5` moved a pinned row on
its first answer, the pre-check named it, and the retry complied. That
is the ruling's whole value arriving on the first real run — and it
also settles a question the keyless receipts could not, because the
model had been told and moved the row regardless. Marking the rows is
necessary and not sufficient; the retry is what converts the residual
non-compliance from a discarded call into a result.

### The copy is a claim, and the world changed under it

*"The result was discarded; try an instruction that leaves the pinned
rows where they are"* was honest while the model had never been told.
The moment the request marks every pinned row, that sentence blames the
user for the model's non-compliance and sends them to edit an
instruction that was never the problem.

Which replacement is true depends on whether THIS request could mark
the rows, so it is asked rather than assumed:

- **rows were marked** — "The request marks every pinned row, and this
  answer moved it anyway — the result was discarded and nothing
  changed. Running again often works, since the same request can
  produce a different answer."
- **rows could not be marked** — a pinned row inside a collapsed
  subtree has no compact id, so nothing could name it. Telling that
  user the model ignored a mark they never sent would be the same lie
  in the other direction. That branch names the collapsed subtree and
  points at a finer granularity.

Both branches ship and both are tested; asserting only one would leave
the other resting on nothing.

### Instruments

`scripts/mock-provider.ts` gains `compliant`, `violation` and
`violation-once`. These **answer the request they were sent** rather
than a canned string: they read the outline back out of the payload and
find the pinned rows by the mark the serializer wrote. That makes them
fixture-independent and a small differential — a mock that stops
finding marks is evidence the marking stopped.

`pnpm receipt-constraints` drives the real client against that real
local endpoint, keyless: **4/4 MEASURED-PRESENT**. Compliant spends no
extra call; `violation-once` is RESCUED by the retry, which is the
outcome this arc exists to buy; violating twice discards under the new
copy with the retired advice absent. `e2e/flow14-constraint-parity.spec.ts`
paint-checks the copy with a hit test at a content anchor.

**Three instrument defects, each caught by the receipt rather than by
review**, and all three the same species — an instrument reporting
about nothing:

- the fixture had ONE card, so the mock had nowhere to move a row and
  answered compliantly;
- its log reported the MODE rather than what it did, so that ran green
  while printing "VIOLATION";
- `readOutline` took the LAST user message, which on a guided retry is
  the correction and not the outline, so call two saw zero rows and
  answered empty — surfacing as "The model returned an empty response",
  a true statement about a broken instrument.

The mock now states what it MOVED, from the variables it decided with,
and the receipt treats "could not violate" as INDETERMINATE rather than
as a measured absence — the instrument's health reported separately
from its measurement.

### A third instance, recorded and not fixed

`renameCapability` is enforced in `validate.ts` by **silently dropping**
a rename the format cannot record (Mintlify declares
`{sections: true, topics: false}`). The prompt says "you may rename"
and the net quietly refuses half of them.

It is the same class with a different failure mode: output tokens spent
on work that vanishes, and a summary reading "0 renamed" with no
explanation — not a discarded call. None of this arc's machinery
applies to it, because its enforcement is *ignore* rather than
*discard*. Recorded at the constraints declaration and here so it is a
decision rather than an oversight.

**Also outside the object, and why that is a boundary rather than a
gap:** never-empty containers and `nodesNeedTargets` are source facts
with prompt blocks that already have one producer each feeding both
sides — parity-compliant by hand. Folding them in is a refactor this
arc did not rule on, and the seam is now there for it.

### This is the incumbent, and its successor has LANDED

**[updated 2026-08-19]** `docs/21` was certified at revision 2
(`4d56893`, merged `ce6dcda`) and its first build arc has shipped: the
pin now splits into write authority and imagination, and the mode that
carries the split is on `ReorganizeOptions` and `TabProvenance`. What
this note describes is the GROUNDED half, unchanged in every byte — the
payload-diff test in `src/ai/__tests__/aspirationalPrompt.test.ts`
quotes the block below verbatim so a grounded run cannot drift without
failing.

Two things remain worth stating about the relationship, because two
notes describing one area is how one of them goes stale:

- **This amendment is about COMMUNICATION, not about the policy.** It
  changes what the model is told and when a violation can be retried.
  It does not change what the lock net refuses, and docs/21 is where
  that question lives.
- **docs/21 anticipated this union and said so** — "if it lands with a
  different union shape, the taxonomy still classifies the same
  underlying facts; only the member names move." It also assigned the
  CLAUDE.md correction to this arc, which is where it happened.
- **What the build actually did to this object:** `buildConstraints`
  takes the mode, the `pinned-rows` member carries it, and both
  consumers branch on it — the prompt renders a different block, and
  `explicitViolations` returns `[]` in aspirational mode with the
  reason at the clause. One producer, two consumers, one more input;
  no second source of constraint truth. Never-empty stayed hand-wired
  and became mode-aware, which was the build's refactor choice and
  which "the seam is now there for it" above still describes
  accurately.


## Amendment 2026-08-20 — the receipt's own precondition, and a floor on every probe

`pnpm receipt-stream` was reported failing: three probes INDETERMINATE
— tail, cancel, provenance — under its own banner, "HARNESS DEFECT: at
least one probe could not measure. Fix the probe."

**The probes were fine.** Re-measured at `15e3e26`, with the dev server
up, the receipt ran 11/11 MEASURED-PRESENT twice, exit 0. The symptom
reproduced exactly on the first try with `APP_URL` pointed at a dead
port, and the recorded note said so in as many words:
`page.goto: net::ERR_CONNECTION_REFUSED`. Nothing was serving the app.

### A PRECONDITION is not a PROBE

Two ideas had one name. "A probe broke while measuring" sends a reader
into the instrument, which is right. "The run could never have started"
sends them into an instrument that is fine — and this one cost an arc
its charter, because the banner named the probes and the probes were
the one thing not at fault. The base-rate rule (suspect the probe
before opening product code) held perfectly and still pointed at the
wrong file, because the reported category was wrong before the rule was
applied.

`paint-check.ts` and `paint-glyphs.ts` had the answer already: both
catch the unreachable-app goto and print the URL with its remedy. This
receipt was the one browser-driving script in `scripts/` that did not.
It now refuses BEFORE the browser launches, and exits **3** — a rung of
its own, because the existing ladder had two rungs for three kinds of
failure (1 = a claim did not hold, 2 = a probe could not measure,
3 = the run could not start).

### The 0ms was a literal, and that is what made it evidence

The failure path recorded `record(name, "INDETERMINATE", error, 0)` —
the duration was a constant, so every INDETERMINATE printed "(0ms)"
whatever it had cost. That number was then read as a measurement, and
a plausible mechanism was inferred from it: a setup-time throw fast
enough to register as zero. The 0 measured nothing. **Logs state what
was measured, from the measurement's own variables** — applied here to
the path that reports a failure, which is the path nobody reads until
it fires.

The fix is structural rather than remembered: `timed()` is the only
producer of a `Millis`, `report()` accepts nothing else, and a literal
now fails `pnpm check` at the call site. Mutation-verified both ways.

### Every probe that claims elapsed time now has a floor

A3's derived floor was the prior art and it covered ONE probe. Cancel,
provenance and the four streaming mock modes claimed work that implies
time and were guarded by nothing — a cancel probe could report all five
of its conditions healthy without ever having watched the stream.

Each floor derives from what the mock announces **on that probe's own
port**, and the announcement line gained its third term (`delay=`) so
that no part of the floor comes from a constant on the reading side.
The earlier version took only the COUNT from the server and ttft and
delay from its own constants, which cannot notice a flag the server
ignored — and this note already records `--ttft` doing exactly that.

Below its floor, a probe's verdicts are VOIDED to INDETERMINATE
whichever way they pointed, because an unfounded ABSENT is worth no
more than an unfounded PRESENT.

**The exclusion is `no-stream`**, which 400s the streamed request and
answers whole. Measured, it completes in **7ms** against the 900ms
floor the other four modes clear — so an omission there would void a
correct probe every run. Narrowing a classifier obligates the other
side's receipt, and this one is asserted as an exclusion rather than
left out of a list.

### Three defects in the instrument, all invisible to a green run

- **The precondition, misreported as three harness defects** (above).
- **A fabricated duration** on the failure path (above).
- **One announcement shared by every endpoint.** `announcedChunks` was
  a single module-level variable, and receipt D starts a fresh server
  per mode; `stream-abrupt` announces half as many chunks as the rest.
  Whichever process logged last owned the number, so a floor could be
  computed for one endpoint out of another's stream. Now keyed by port.

The mutation receipt worth keeping: deleting receipt B's observation
window — the edit somebody makes to "speed up the harness" — leaves all
five of B's own conditions passing, and its note still reads "log after
2000ms cleared", a wait it never made. Only the floor caught it:
`1364ms elapsed against a 2800ms floor`. That is what a probe reporting
without measuring looks like from the inside of a green suite.

Count of record after the fix: **17/17 MEASURED-PRESENT**, exit 0.
