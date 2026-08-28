/**
 * mock-provider.ts — a real HTTP endpoint that speaks the
 * OpenAI-compatible shape and answers badly on purpose.
 *
 * WHY THIS EXISTS. The forced-failure receipt for the capture
 * affordance was first collected by registering a Playwright
 * `page.route` against `api.anthropic.com/**` on a long-lived browser
 * page. The route was never removed, so the next person to use that
 * browser got the canned fixture back for every Anthropic request —
 * POST and GET alike, since the glob matched every path and method. It
 * looked exactly like a live model failure. The instrument
 * manufactured a product defect that did not exist.
 *
 * The lesson is not "unroute more carefully". It is that a
 * forced-failure receipt does not need interception at all: point the
 * CUSTOM provider at this server and the app makes an ordinary network
 * request to an ordinary endpoint that happens to answer with rubbish.
 * Nothing is patched, so nothing can be left patched. The residue of a
 * finished run is a killed process, which is a state you can see.
 *
 *   pnpm mock-provider -- [--port 8787] [--mode unknown-ids]
 *                          [--content "<outline>"] [--delay 60]
 *
 * Then in the app: provider "Custom", base URL http://localhost:8787/v1
 * and any non-empty key.
 *
 * Modes that answer whole:
 *   unknown-ids  (default) a well-formed outline naming ids that are
 *                not in the document — the parse layer's L3 identity
 *                check refuses it, twice, exercising the guided retry
 *   prose        no outline lines at all
 *   not-a-list   /models answers 200 with something that is not a model
 *                list, for the "not measured is not zero" path
 *
 * Modes that STREAM (docs/10 amendment 2026-08-19) — the four shapes a
 * stream can take, which are fixtures for the accumulator's unit tests
 * and the only honest way to collect a live-tail receipt:
 *   stream-clean      deltas, then finish_reason stop, then [DONE]
 *   stream-mid-error  deltas, then a provider error object mid-stream
 *   stream-abrupt     deltas, then the socket is destroyed — no
 *                     terminator, no reason, which is a THIRD end state
 *                     and not a tidier name for either other one
 *   stream-length     deltas, then a terminal chunk carrying
 *                     finish_reason: length. The reason rides the LAST
 *                     chunk, so every earlier one reports null and a
 *                     reader that peeks at the first sees health.
 *   no-stream         400 to any request carrying `stream: true`, then
 *                     a normal whole answer — the endpoint that refuses
 *                     SSE, and the only producer of the client's
 *                     fallback branch.
 *
 * Modes that ANSWER THE REQUEST IT WAS SENT (docs/10, constraint
 * parity) — these read the outline out of the incoming payload and
 * build a reply from it, so they work against ANY document and are not
 * canned for one fixture:
 *   compliant       an identity reorganization: every id, where it
 *                   already is. The success path, unchanged.
 *   violation       moves the first `[pinned]` row into another
 *                   section, every time — the shape of the 2026-08-19
 *                   godot incident, and it keeps doing it after the
 *                   guided retry, so it drives the discard.
 *   violation-once  violates, then complies on the retry — the receipt
 *                   that the retry RESCUES a call that used to be
 *                   spent. The most valuable of the three, because it
 *                   is the behaviour the arc exists to buy.
 *
 * These read the app's OWN markers, which makes them a small
 * differential: the mock finds the pinned rows by the mark the
 * serializer wrote, so a mode that stops finding any is evidence the
 * marking stopped happening.
 *
 * `--content` is the outline the streaming modes emit; it defaults to
 * the bundled DocFX sample's top level, which is an identity
 * reorganization of it (valid, changes nothing). Any other document
 * needs its own ids passed in — the server cannot know them.
 *
 * `--delay` is the gap between chunks in ms. It exists so a receipt can
 * observe the tail growing across frames; a stream that arrives in one
 * tick is indistinguishable from a whole answer to anything watching.
 *
 * `--ttft` is the pause BEFORE the first chunk — time to first token.
 * It is not padding: a reasoning model connects and then emits nothing
 * for tens of seconds, and the compatibility layer streams no thinking
 * content, so that silence is the app's hardest state to render
 * honestly. Without a ttft the `waiting for the first token` state is
 * real code that no receipt can ever observe, because it lasts less
 * time than a sampler's interval.
 */

import { createServer, type ServerResponse } from "node:http";

const args = process.argv.slice(2);
const opt = (name: string, fallback: string): string => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : (args[i + 1] ?? fallback);
};

const port = Number(opt("port", "8787"));
const mode = opt("mode", "unknown-ids");
/** The bundled DocFX sample's top level — an identity reorganization. */
const DEFAULT_OUTLINE = "t1\ns1\ns2\ns3\ns4\ns5\nt34\nt35";
const content = opt("content", DEFAULT_OUTLINE);
const delayMs = Number(opt("delay", "60"));
const ttftMs = Number(opt("ttft", "0"));

/** Cut the outline into small pieces, so the tail arrives in more than
 *  one paint. Chunk sizes vary because real token streams do. */
function chunksOf(text: string): string[] {
  const out: string[] = [];
  let i = 0;
  let size = 3;
  while (i < text.length) {
    out.push(text.slice(i, i + size));
    i += size;
    size = (size % 5) + 3;
  }
  return out;
}

/** One outline row as the request carried it. */
interface OutlineRow {
  indent: number;
  id: string;
  pinned: boolean;
}

/** Pull the outline back out of the request the app just sent. */
function readOutline(body: string): OutlineRow[] {
  let payload: { messages?: { role: string; content: string }[] };
  try {
    payload = JSON.parse(body) as typeof payload;
  } catch {
    return [];
  }
  // The FIRST user message carrying an outline, not the last. On the
  // guided retry the last user message is the correction — which quotes
  // the previous ANSWER, not the outline — so reading the tail found
  // zero rows and answered empty. The app then reported "The model
  // returned an empty response", which is a true statement about a
  // broken instrument.
  const user =
    payload.messages
      ?.filter((m) => m.role === "user")
      .find((m) => m.content.includes("Current outline:"))?.content ?? "";
  const at = user.indexOf("Current outline:");
  if (at === -1) return [];
  const rows: OutlineRow[] = [];
  for (const line of user.slice(at).split("\n").slice(1)) {
    const match = /^(\s*)([st]\d+)\s/.exec(line);
    if (!match) continue;
    rows.push({
      indent: match[1]!.length,
      id: match[2]!,
      pinned: line.includes("[pinned]"),
    });
  }
  return rows;
}

/** Every id where it already is — a valid answer that changes nothing. */
function identityAnswer(rows: OutlineRow[]): string {
  return rows.map((r) => `${" ".repeat(r.indent)}${r.id}`).join("\n");
}

/**
 * The same answer with the first pinned row moved somewhere it is not.
 *
 * Its descendants travel with it — children-follow means listing the
 * row alone would keep them, and what is wanted is a row that genuinely
 * changed parent.
 *
 * The target is ANY node that is not the row itself, not one of its
 * descendants, and not its current parent — a sibling's subtree, a
 * different card, whatever the document offers. An earlier version
 * looked only for a second TOP-LEVEL SECTION and quietly returned the
 * identity answer when the document had one card, so the receipt drove
 * a compliant run while the log said VIOLATION. Reports what it DID,
 * from the variables it decided with.
 */
function violationAnswer(rows: OutlineRow[]): { text: string; moved: string | null } {
  const index = rows.findIndex((r) => r.pinned && r.id.startsWith("t"));
  if (index === -1) return { text: identityAnswer(rows), moved: null };

  // the row and everything nested under it
  let end = index + 1;
  while (end < rows.length && rows[end]!.indent > rows[index]!.indent) end += 1;
  const moving = rows.slice(index, end);

  // its current parent: the nearest preceding row that is shallower
  let parent: OutlineRow | undefined;
  for (let i = index - 1; i >= 0; i--) {
    if (rows[i]!.indent < rows[index]!.indent) {
      parent = rows[i];
      break;
    }
  }

  const target = rows.find((r, i) => (i < index || i >= end) && r.id !== parent?.id);
  if (target === undefined) return { text: identityAnswer(rows), moved: null };

  const out: string[] = [];
  for (const [i, row] of rows.entries()) {
    if (i >= index && i < end) continue;
    out.push(`${" ".repeat(row.indent)}${row.id}`);
    if (row.id === target.id) {
      const shift = target.indent + 2 - moving[0]!.indent;
      for (const m of moving) {
        out.push(`${" ".repeat(m.indent + shift)}${m.id}`);
      }
    }
  }
  return { text: out.join("\n"), moved: `${moving[0]!.id}→under ${target.id}` };
}

function deltaFrame(piece: string, finish: string | null = null): string {
  return `data: ${JSON.stringify({
    choices: [{ delta: { content: piece }, finish_reason: finish }],
  })}\n\n`;
}

const BODIES: Record<string, string> = {
  "unknown-ids":
    "Sure! Here's the reorganized outline:\n\n```\ns99 Invented Section\n  t404 Ghost Topic\n```\n\nLet me know if you'd like changes.",
  prose:
    "I'd be happy to help reorganize this documentation! Could you tell me a bit more about your audience first?",
};

/**
 * Emit the outline as SSE, one small chunk at a time, and end the way
 * this mode is named for.
 *
 * The four endings are written out rather than parameterised because
 * they are not variations on one thing: a terminator, a mid-stream
 * error object, a destroyed socket and a length-terminal chunk exercise
 * four different branches of the client, and collapsing them into flags
 * would hide which one a receipt actually drove.
 */
function streamAnswer(res: ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  // MEASURED: without this, node holds the response head until the
  // first `write()`, so the browser's fetch promise does not resolve
  // until the first chunk — headers and first token arrive in one tick
  // and the app's `waiting for the first token` state, which is real
  // code, lasts zero milliseconds and no receipt can ever observe it.
  // A ttft option that does not flush is a ttft option that does
  // nothing, which is how this was found: the state stayed
  // MEASURED-ABSENT at an 800ms pause and a 40ms sampling interval.
  res.flushHeaders();
  const pieces = chunksOf(content);
  // stream-abrupt stops PART WAY: an abrupt close after a complete
  // answer would be indistinguishable from a missing terminator.
  const upTo = mode === "stream-abrupt" ? Math.ceil(pieces.length / 2) : pieces.length;
  // EVERY TERM OF THE DURATION IS ANNOUNCED, because a receipt
  // asserting a duration floor has to derive it from what was actually
  // sent. The first cut of `receipt-stream.ts` hardcoded "~30 chunks"
  // against a stream of 5 and reported working code as too fast — the
  // wrong-quantity error, wearing a product defect's clothes. The
  // second cut derived the COUNT from here and still took ttft and
  // delay from its own constants, which cannot notice a flag this
  // server ignored: `--ttft` once did nothing at all, because the
  // response head was never flushed.
  console.log(
    `[mock-provider] streaming ${upTo} chunks, mode=${mode}, ` +
      `ttft=${ttftMs}ms, delay=${delayMs}ms`,
  );

  let i = 0;
  const tick = () => {
    if (i < upTo) {
      res.write(deltaFrame(pieces[i]!));
      i += 1;
      setTimeout(tick, delayMs);
      return;
    }
    switch (mode) {
      case "stream-mid-error":
        res.write(
          `data: ${JSON.stringify({ error: { message: "Overloaded, try again later" } })}\n\n`,
        );
        res.end();
        return;
      case "stream-abrupt":
        // A destroyed socket, not a clean end — the residue of a
        // finished run is still a killed process, which is a state you
        // can see.
        res.destroy();
        return;
      case "stream-length":
        res.write(deltaFrame("", "length"));
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      default:
        res.write(deltaFrame("", "stop"));
        res.write("data: [DONE]\n\n");
        res.end();
    }
  };
  setTimeout(tick, ttftMs);
}

/** Calls answered so far — `violation-once` is a fact about the
 *  SEQUENCE, not about any one request, so it needs process state. */
let calls = 0;

const server = createServer((req, res) => {
  // The app is a browser page on another origin; without CORS it never
  // gets to fail the way we want it to.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  // A header no fixture-by-interception would carry, so a receipt can
  // prove which endpoint answered it.
  res.setHeader("x-mock-provider", mode);

  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://localhost:${port}`);

  if (url.pathname.endsWith("/models")) {
    const body =
      mode === "not-a-list"
        ? { oops: "this is not a model list" }
        : { data: [{ id: "mock-model-a" }, { id: "mock-model-b" }] };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
    return;
  }

  if (url.pathname.endsWith("/chat/completions")) {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const streamed = /"stream"\s*:\s*true/.test(raw);

      // The endpoint that refuses SSE. Keyed on what the REQUEST asked
      // for, so one server exercises both halves of the client's
      // fallback: the 400, and the unstreamed answer that follows it.
      if (mode === "no-stream" && streamed) {
        console.log("[mock-provider] refused a streamed request (400)");
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ error: { message: "streaming is not supported here" } }),
        );
        return;
      }

      if (mode.startsWith("stream-") && streamed) {
        streamAnswer(res);
        return;
      }

      // Modes that answer the request they were sent, rather than a
      // canned string. `calls` is per-process, which is what makes
      // violation-once expressible at all.
      let derived: string | null = null;
      if (mode === "compliant" || mode === "violation" || mode === "violation-once") {
        const rows = readOutline(raw);
        const violate =
          mode === "violation" || (mode === "violation-once" && calls === 0);
        const attempt = violate ? violationAnswer(rows) : null;
        derived = attempt ? attempt.text : identityAnswer(rows);
        // STATES WHAT IT DID, from the decision's own variables. The
        // previous line reported the MODE, so a run that found nowhere
        // to move a row logged "VIOLATION" and answered compliantly —
        // an instrument narrating its intent rather than its result,
        // which is how two receipts came back green about nothing.
        console.log(
          `[mock-provider] call ${calls + 1}, ${rows.length} rows, ` +
            `${rows.filter((r) => r.pinned).length} pinned, ` +
            `moved=${attempt?.moved ?? "none"}`,
        );
      }
      calls += 1;

      const body = derived ?? BODIES[mode] ?? content;
      if (derived === null) {
        console.log(`[mock-provider] answered a chat call whole, mode=${mode}`);
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          choices: [{ message: { content: body }, finish_reason: "stop" }],
        }),
      );
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: { message: `no route for ${url.pathname}` } }));
});

server.listen(port, () => {
  console.log(`[mock-provider] mode=${mode} listening on http://localhost:${port}`);
  console.log(
    `[mock-provider] set the custom provider base URL to http://localhost:${port}/v1`,
  );
});
