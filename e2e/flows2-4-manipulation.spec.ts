/**
 * Flows 2–4 (docs/07 Layer 5) — the M4 definition of done:
 *   2. Drag a topic to another card → appears there; Ctrl+Z → returns.
 *   3. Drag a parent topic to empty canvas → new section (unwrapped);
 *      undo → restored. (Ghost animation is M5; end states only here.)
 *   4. Rename a section inline → sidebar reflects it.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";
import { watchConsole } from "./helpers";

test.use({ viewport: { width: 1600, height: 1000 } });

async function loadSample(page: Page) {
  await page.goto("/");
  await page.getByTestId("empty-load-sample-docfx").click();
  await expect(page.getByTestId("card")).toHaveCount(8);
}

function sectionCard(page: Page, title: string): Locator {
  return page
    .locator('[data-card-variant="section"]')
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
}

/** Pointer drag from the center of `from` to a relative point in `to`. */
async function drag(
  page: Page,
  from: Locator,
  to: Locator,
  offset: { xr: number; yr: number } = { xr: 0.5, yr: 0.5 },
) {
  const f = (await from.boundingBox())!;
  const t = (await to.boundingBox())!;
  const sx = f.x + f.width / 2;
  const sy = f.y + f.height / 2;
  const tx = t.x + t.width * offset.xr;
  const ty = t.y + t.height * offset.yr;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move((sx + tx) / 2, (sy + ty) / 2, { steps: 6 });
  await page.mouse.move(tx, ty, { steps: 10 });
  await page.mouse.up();
}

test("flow 2: drag a topic to another card, undo returns it", async ({ page }) => {
  const console_ = watchConsole(page);
  await loadSample(page);

  const guides = sectionCard(page, "Guides");
  const tutorials = sectionCard(page, "Tutorials");
  const versioning = guides.getByText("Versioning", { exact: true });
  const firstSite = tutorials.getByText("Build Your First Site", { exact: true });

  // drop in the top band of the first Tutorials row → insert before it
  await drag(page, versioning, firstSite, { xr: 0.5, yr: 0.15 });

  await expect(tutorials.getByText("Versioning", { exact: true })).toBeVisible();
  await expect(guides.getByText("Versioning", { exact: true })).toBeHidden();
  await expect(tutorials.getByTestId("topic-count")).toHaveText("5");

  await page.keyboard.press("Control+z");
  await expect(guides.getByText("Versioning", { exact: true })).toBeVisible();
  await expect(tutorials.getByTestId("topic-count")).toHaveText("4");

  console_.assertClean();
});

test("flow 2b: drop as child nests the topic", async ({ page }) => {
  const console_ = watchConsole(page);
  await loadSample(page);

  const guides = sectionCard(page, "Guides");
  const localization = guides.getByText("Localization", { exact: true });
  const versioning = guides.getByText("Versioning", { exact: true });

  // middle band → becomes a child of Versioning
  await drag(page, localization, versioning, { xr: 0.5, yr: 0.5 });

  // Versioning is now a parent (shows a child count badge of 1)
  const versioningRow = guides.locator("[data-topic-row]", {
    has: page.getByText("Versioning", { exact: true }),
  });
  await expect(versioningRow.locator("span").last()).toHaveText("1");

  await page.keyboard.press("Control+z");
  await expect(versioningRow.locator("button")).toHaveCount(0); // leaf again

  console_.assertClean();
});

test("flow 3: drag a parent topic to canvas creates an unwrapped section, undo restores", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await loadSample(page);

  const gettingStarted = sectionCard(page, "Getting Started");
  const installation = gettingStarted.getByText("Installation", { exact: true });
  const canvas = page.getByTestId("canvas");

  // drop on empty canvas far right → new section in a new column
  await drag(page, installation, canvas, { xr: 0.97, yr: 0.4 });

  await expect(page.getByTestId("card")).toHaveCount(9);
  const created = sectionCard(page, "Installation");
  await expect(created).toBeVisible();
  // unwrap: children became the section's top level
  await expect(created.getByText("Install Windows", { exact: true })).toBeVisible();
  await expect(created.getByTestId("topic-count")).toHaveText("3");
  // source no longer holds the subtree
  await expect(gettingStarted.getByText("Installation", { exact: true })).toBeHidden();
  await expect(gettingStarted.getByTestId("topic-count")).toHaveText("5");

  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("card")).toHaveCount(8);
  await expect(gettingStarted.getByText("Installation", { exact: true })).toBeVisible();
  await expect(gettingStarted.getByTestId("topic-count")).toHaveText("9");

  console_.assertClean();
});

test("flow 4: inline rename of a section reflects in the sidebar", async ({ page }) => {
  const console_ = watchConsole(page);
  await loadSample(page);

  await page.getByRole("heading", { name: "Guides", exact: true }).dblclick();
  const input = page.getByTestId("inline-edit");
  await expect(input).toBeVisible();
  await input.fill("Handbook");
  await input.press("Enter");

  await expect(page.getByRole("heading", { name: "Handbook" })).toBeVisible();
  await expect(page.getByTestId("section-list")).toContainText("Handbook");
  await expect(page.getByTestId("section-list")).not.toContainText("Guides");

  // Escape cancels an edit without committing
  await page.getByRole("heading", { name: "Handbook", exact: true }).dblclick();
  await page.getByTestId("inline-edit").fill("Nope");
  await page.getByTestId("inline-edit").press("Escape");
  await expect(page.getByRole("heading", { name: "Handbook" })).toBeVisible();

  // undo restores the old name
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("section-list")).toContainText("Guides");

  console_.assertClean();
});

test("multi-select: shift-click then group drag moves both topics", async ({ page }) => {
  const console_ = watchConsole(page);
  await loadSample(page);

  const guides = sectionCard(page, "Guides");
  const tutorials = sectionCard(page, "Tutorials");

  await guides.getByText("Versioning", { exact: true }).click();
  await guides.getByText("Localization", { exact: true }).click({ modifiers: ["Shift"] });

  await drag(
    page,
    guides.getByText("Versioning", { exact: true }),
    tutorials.getByText("Build Your First Site", { exact: true }),
    { xr: 0.5, yr: 0.15 },
  );

  await expect(tutorials.getByTestId("topic-count")).toHaveText("6");
  await expect(tutorials.getByText("Versioning", { exact: true })).toBeVisible();
  await expect(tutorials.getByText("Localization", { exact: true })).toBeVisible();

  // ONE undo restores both (transactionality)
  await page.keyboard.press("Control+z");
  await expect(tutorials.getByTestId("topic-count")).toHaveText("4");
  await expect(guides.getByText("Versioning", { exact: true })).toBeVisible();
  await expect(guides.getByText("Localization", { exact: true })).toBeVisible();

  console_.assertClean();
});

test("card drag: reorder via sidebar list is undoable", async ({ page }) => {
  const console_ = watchConsole(page);
  await loadSample(page);

  const list = page.getByTestId("section-list");
  const rows = list.locator("[data-sidebar-row]");
  await expect(rows.first()).toContainText("Overview");

  // drag the first sidebar row below the third
  await drag(page, rows.first(), rows.nth(2), { xr: 0.5, yr: 0.85 });
  await expect(rows.first()).not.toContainText("Overview");

  await page.keyboard.press("Control+z");
  await expect(rows.first()).toContainText("Overview");

  console_.assertClean();
});

test("auto-arrange re-packs a scattered card and is undoable", async ({ page }) => {
  const console_ = watchConsole(page);
  await loadSample(page);

  // scatter: drag the Tutorials card far right into a new column
  const tutorials = sectionCard(page, "Tutorials");
  const header = tutorials.getByRole("heading", { name: "Tutorials" });
  const canvas = page.getByTestId("canvas");
  await drag(page, header, canvas, { xr: 0.97, yr: 0.3 });

  await page.getByTestId("auto-arrange").click();
  // the arrangement command lands with an undo toast
  await expect(
    page.locator("[data-sonner-toast]", { hasText: "Arrange cards" }),
  ).toBeVisible();
  await page.keyboard.press("Control+z");
  // undo restores the scattered layout without error; cards all intact
  await expect(page.getByTestId("card")).toHaveCount(8);

  console_.assertClean();
});

test("topics lock disables topic drag but keeps card selection", async ({ page }) => {
  const console_ = watchConsole(page);
  await loadSample(page);

  await page.keyboard.press("l");
  await expect(page.getByRole("button", { name: "Unlock topics" })).toBeVisible();

  const guides = sectionCard(page, "Guides");
  const tutorials = sectionCard(page, "Tutorials");
  await drag(
    page,
    guides.getByText("Versioning", { exact: true }),
    tutorials.getByText("Build Your First Site", { exact: true }),
  );
  // nothing moved
  await expect(guides.getByText("Versioning", { exact: true })).toBeVisible();
  await expect(tutorials.getByTestId("topic-count")).toHaveText("4");

  console_.assertClean();
});

test("cards and topics are removable — trash button and Delete key, both undoable", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await loadSample(page);

  // trash button on the card header
  await sectionCard(page, "Tutorials").getByTestId("remove-section").click();
  await expect(page.getByTestId("card")).toHaveCount(7);
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("card")).toHaveCount(8);

  // Delete key on a selected topic
  const guides = sectionCard(page, "Guides");
  await guides.getByText("Versioning", { exact: true }).click();
  await page.keyboard.press("Delete");
  await expect(guides.getByText("Versioning", { exact: true })).not.toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(guides.getByText("Versioning", { exact: true })).toBeVisible();

  // Delete with a card selected (no topic selection) removes the card —
  // click the HEADER: a card-center click would select a topic row
  await page.keyboard.press("Escape");
  await page.getByRole("heading", { name: "Extensibility", exact: true }).click();
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("card")).toHaveCount(7);
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("card")).toHaveCount(8);

  // clicking the header CLEARS a topic selection made earlier — the
  // header means the card, so Delete must remove the card, not the row
  const extensibility = sectionCard(page, "Extensibility");
  await extensibility.getByText("Plugin Development", { exact: true }).click();
  await extensibility
    .getByRole("heading", { name: "Extensibility", exact: true })
    .click();
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("card")).toHaveCount(7);
  // the topic went WITH its card, not separately
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("card")).toHaveCount(8);
  await expect(
    sectionCard(page, "Extensibility").getByText("Plugin Development", { exact: true }),
  ).toBeVisible();

  console_.assertClean();
});

test("a drag from a row's empty trailing space rubber-bands instead of dragging the title", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await loadSample(page);

  const guides = sectionCard(page, "Guides");
  // "Markdown Syntax" is a leaf row: everything right of the label is
  // empty-looking flex leftover that used to start a topic drag
  const row = guides.locator("[data-topic-row]", {
    hasText: "Markdown Syntax",
  });
  const r = (await row.boundingBox())!;
  const startX = r.x + r.width - 20; // deep in the trailing empty space
  const startY = r.y + r.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX - 60, startY + 40, { steps: 8 }); // sweep 2-3 rows
  await page.mouse.move(startX - 60, startY + 44, { steps: 2 });
  await page.mouse.up();

  // multiple rows selected; nothing moved anywhere
  const selected = guides.locator("[data-topic-row].bg-sky-100");
  await expect(await selected.count()).toBeGreaterThan(1);
  await expect(guides.getByTestId("topic-count")).toHaveText("9");

  // and the selection is live ammo for the Delete key
  const before = await selected.count();
  await page.keyboard.press("Delete");
  await expect(guides.getByTestId("topic-count")).toHaveText(String(9 - before));
  await page.keyboard.press("Control+z");
  await expect(guides.getByTestId("topic-count")).toHaveText("9");

  console_.assertClean();
});

test("context menus: row → move to new card / remove selection; card → AI scope", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await loadSample(page);

  // single row: Move to new card (was drag-to-canvas-only)
  //
  // THE BIRTH SHAPE CHANGED IN ARC 2 (docs/22, OR-5b). "Versioning" is a
  // CHILDLESS entry, and promoting a leaf IS the standalone — the entry
  // at top level, wrapped in nothing. It used to mint a one-entry GROUP
  // whose heading duplicated the entry's own name, which the ruling
  // calls the misreading of the motive. So the card that appears is the
  // compact `orphan` variant, not a `section` with an `h3`.
  const guides = sectionCard(page, "Guides");
  await guides.getByText("Versioning", { exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Move to new card" }).click();
  await expect(page.getByTestId("card")).toHaveCount(9);
  const born = page.locator('[data-card-variant="orphan"]').filter({
    hasText: "Versioning",
  });
  await expect(born).toHaveCount(1);
  // AND THE OLD SHAPE IS GONE — the regression, asserted where the
  // gesture is, not only at the command.
  await expect(sectionCard(page, "Versioning")).toHaveCount(0, { timeout: 2000 });
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("card")).toHaveCount(8);

  // multi-selection: the menu names the count and acts on the group
  await guides.getByText("Versioning", { exact: true }).click();
  await guides.getByText("Localization", { exact: true }).click({ modifiers: ["Shift"] });
  await guides.getByText("Versioning", { exact: true }).click({ button: "right" });
  await expect(
    page.getByRole("menuitem", { name: "Move 2 topics to new card" }),
  ).toBeVisible();
  await page.getByRole("menuitem", { name: "Remove 2 topics" }).click();
  await expect(guides.getByTestId("topic-count")).toHaveText("7");
  await page.keyboard.press("Control+z");
  await expect(guides.getByTestId("topic-count")).toHaveText("9");

  // right-click an UNSELECTED row while others are selected → acts on
  // that row alone (select-first rule)
  await guides.getByText("Versioning", { exact: true }).click();
  await guides.getByText("Diagrams", { exact: true }).click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Remove topic" })).toBeVisible();
  await page.keyboard.press("Escape");

  // card menu: Reorganize with AI opens the dialog scoped to the card
  await page
    .getByRole("heading", { name: "Tutorials", exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Reorganize with AI…" }).click();
  await expect(page.getByTestId("ai-dialog")).toBeVisible();
  await expect(page.getByTestId("ai-dialog")).toContainText("Tutorials");
  await page.keyboard.press("Escape");

  console_.assertClean();
});

test("selection gestures: shift ranges, alt/cmd toggles — rows and cards", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await loadSample(page);

  // ── rows: anchor click, then shift-click selects the RANGE ──
  const guides = sectionCard(page, "Guides");
  await guides.getByText("Markdown Syntax", { exact: true }).click();
  await guides.getByText("Diagrams", { exact: true }).click({ modifiers: ["Shift"] });
  const guidesSelected = guides.locator("[data-topic-row].bg-sky-100");
  await expect(guidesSelected).toHaveCount(3); // Markdown · Code Snippets · Diagrams

  // alt/cmd toggles an individual row out of the range
  await guides.getByText("Code Snippets", { exact: true }).click({ modifiers: ["Alt"] });
  await expect(guidesSelected).toHaveCount(2);

  // modifier click in ANOTHER card doesn't mix — starts fresh there
  const tutorials = sectionCard(page, "Tutorials");
  await tutorials
    .getByText("Customize the Theme", { exact: true })
    .click({ modifiers: ["Alt"] });
  await expect(tutorials.locator("[data-topic-row].bg-sky-100")).toHaveCount(1);
  await expect(guidesSelected).toHaveCount(0);

  // ── cards: shift-click selects the range in reading order ──
  await page.keyboard.press("Escape");
  await page.getByRole("heading", { name: "Getting Started", exact: true }).click();
  await page
    .getByRole("heading", { name: "Tutorials", exact: true })
    .click({ modifiers: ["Shift"] });
  // Getting Started → Guides → Tutorials: Delete removes all three…
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("card")).toHaveCount(5);
  // …and ONE undo restores them (removeSections is transactional)
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("card")).toHaveCount(8);

  // alt/cmd-click collects cards in any order
  await page.getByRole("heading", { name: "Extensibility", exact: true }).click();
  await page
    .getByRole("heading", { name: "Getting Started", exact: true })
    .click({ modifiers: ["Alt"] });
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("card")).toHaveCount(6);
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("card")).toHaveCount(8);

  console_.assertClean();
});

test("shift-range captures the entirety of collapsed subtrees", async ({ page }) => {
  const console_ = watchConsole(page);
  await loadSample(page);

  // collapse "Organizing Docs" (2 hidden children), then range across it
  const guides = sectionCard(page, "Guides");
  await page.getByRole("button", { name: "Collapse Organizing Docs" }).click();
  await guides.getByText("Diagrams", { exact: true }).click();
  await guides.getByText("Versioning", { exact: true }).click({ modifiers: ["Shift"] });

  // 3 visible rows highlight…
  await expect(guides.locator("[data-topic-row].bg-sky-100")).toHaveCount(3);
  // …but the selection holds 5: Delete removes the hidden children too
  await page.keyboard.press("Delete");
  await expect(guides.getByTestId("topic-count")).toHaveText("4");
  await page.keyboard.press("Control+z");
  await expect(guides.getByTestId("topic-count")).toHaveText("9");

  // expanding after a fresh range shows the children already selected
  await guides.getByText("Diagrams", { exact: true }).click();
  await guides.getByText("Versioning", { exact: true }).click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: "Expand Organizing Docs" }).click();
  await expect(guides.locator("[data-topic-row].bg-sky-100")).toHaveCount(5);

  console_.assertClean();
});

test("a reparent drag says what it will do — and refuses the two it cannot", async ({
  page,
}) => {
  // docs/16 step 5. Hugo now MOVES the file, so the gesture states the
  // consequence in Hugo's own terms instead of refusing. The two
  // refusals that remain are about the destination, not the capability.
  const console_ = watchConsole(page);
  await page.goto("/");
  await page.evaluate(() => {
    const t = (id: string, title: string, path: string) => ({
      id,
      title,
      path,
      children: [],
    });
    localStorage.setItem(
      "toc-fable/session",
      JSON.stringify({
        version: 3,
        activeTabId: "t1",
        tabs: [
          {
            id: "t1",
            name: "Hugo",
            topicsLocked: false,
            undo: [],
            redo: [],
            editor: {
              document: {
                id: "d1",
                name: "Hugo",
                formatId: "hugo",
                extras: {
                  // A file already sitting where "Two" would land, so the
                  // collision is real rather than simulated.
                  files: {
                    "content/en/docs/beta/two.md": "---\ntitle: Two\n---\n",
                  },
                  linkIndex: {
                    observedAt: "2026-08-16T00:00:00.000Z",
                    species: ["absolute-site-path"],
                    paths: [],
                    targets: { "content/en/docs/alpha/one.md": { n: 12, from: [] } },
                  },
                },
                sections: [
                  {
                    id: "s1",
                    title: "Alpha",
                    path: "content/en/docs/alpha/_index.md",
                    topics: [
                      t("t1a", "One", "content/en/docs/alpha/one.md"),
                      t("t1b", "Two", "content/en/docs/alpha/two.md"),
                      t("t1c", "Bundled", "content/en/docs/alpha/leafy/index.md"),
                      t("t1d", "Sub", "content/en/docs/alpha/sub/_index.md"),
                    ],
                  },
                  {
                    id: "s2",
                    title: "Beta",
                    path: "content/en/docs/beta/_index.md",
                    topics: [t("t2a", "Three", "content/en/docs/beta/three.md")],
                  },
                ],
              },
              columns: [["s1"], ["s2"]],
              view: { globalDepth: 3, cardDepths: {} },
            },
          },
        ],
      }),
    );
  });
  await page.reload();
  await expect(page.getByTestId("card")).toHaveCount(2);

  const grip = (id: string, text: string) =>
    page.locator(`[data-topic-id="${id}"]`).getByText(text, { exact: true });
  const box = async (id: string, text: string) => (await grip(id, text).boundingBox())!;
  // Re-queried before EVERY drag, never captured up front: the first
  // move relayouts both cards, and stale boxes silently grab whichever
  // row slid into those coordinates. That failure reads as the wrong
  // refusal message rather than as a missing element.

  const dragFrom = async (from: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => {
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 6, {
      steps: 3,
    });
  };
  const over = async (t: { x: number; y: number; width: number; height: number }) =>
    page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 8 });

  // ── eligible targets light up, refused ones do not ──
  await dragFrom(await box("t1a", "One"));
  // Read the PAINT, not the attribute: an eligible card must actually
  // differ from a normal one on screen. The attribute is the handle;
  // the box-shadow is the claim.
  const shadowOf = (id: string) =>
    page
      .locator(`[data-card-id="${id}"]`)
      .evaluate((el) => getComputedStyle(el).boxShadow);
  expect(
    await page.locator('[data-card-id="s2"]').getAttribute("data-drop-eligible"),
  ).toBe("true");
  const litShadow = await shadowOf("s2");
  expect(litShadow).not.toBe("none");
  await page.mouse.up();
  // …and it clears when the drag ends, rather than staying lit.
  await expect(page.locator('[data-card-id="s2"][data-drop-eligible]')).toHaveCount(0);
  expect(await shadowOf("s2")).not.toBe(litShadow);
  // put it back for the rest of the test
  await page.keyboard.press("Meta+z");
  await expect(page.getByTestId("card").first()).toContainText("One");

  // ── an ALLOWED move: the consequence, in Hugo's own terms ──
  await dragFrom(await box("t1a", "One"));
  await over(await box("t2a", "Three"));
  await expect(page.getByTestId("drag-refusal")).toHaveCount(0);
  await expect(page.getByTestId("drag-drop-label")).toContainText(
    "moves file to content/en/docs/beta/",
  );
  // The cost, on its own line — and it must actually be VISIBLE, not
  // merely present: the first cut joined both lines into one truncating
  // span, where the count rendered as invisible clipped text.
  const detail = page.getByTestId("drag-drop-detail");
  await expect(detail).toContainText("12 inbound links, as of import");
  expect(
    await detail.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && el.scrollWidth <= el.clientWidth + 1;
    }),
  ).toBe(true);
  await page.mouse.up();
  await expect(page.getByTestId("card").nth(1)).toContainText("One");

  // nothing is left stuck
  await expect(page.getByTestId("drag-refusal")).toHaveCount(0);
  expect(await page.evaluate(() => document.body.dataset.dragRefused ?? "(none)")).toBe(
    "(none)",
  );
  console_.assertClean();
});

test("Review shows a move as four stacked facts, and the alias is revocable", async ({
  page,
}) => {
  // docs/16 step 5b. Disk consequence lives at Review, which is what
  // lets the drag stay light — so this is where the four facts of a
  // move have to be legible: where from, where to, what redirect, what
  // it costs.
  const console_ = watchConsole(page);
  await page.goto("/");
  await page.evaluate(() => {
    const head = (title: string, weight?: number) =>
      `---\ntitle: ${title}\n${weight === undefined ? "" : `weight: ${weight}\n`}---\nBody.\n`;
    localStorage.setItem(
      "toc-fable/session",
      JSON.stringify({
        version: 3,
        activeTabId: "t1",
        tabs: [
          {
            id: "t1",
            name: "Hugo",
            topicsLocked: false,
            undo: [],
            redo: [],
            editor: {
              document: {
                id: "d1",
                name: "Hugo",
                formatId: "hugo",
                extras: {
                  files: {
                    "hugo.toml": 'contentDir = "content"\n',
                    "content/docs/alpha/_index.md": head("Alpha", 10),
                    "content/docs/alpha/one.md": head("One", 10),
                    "content/docs/beta/_index.md": head("Beta", 20),
                    // No weight: the destination is all-unweighted, the
                    // case that forces a multi-file edit.
                    "content/docs/beta/three.md": head("Three"),
                  },
                  linkIndex: {
                    observedAt: "2026-08-16T00:00:00.000Z",
                    species: ["absolute-site-path"],
                    paths: [],
                    targets: { "content/docs/alpha/one.md": { n: 12, from: [] } },
                  },
                },
                sections: [
                  {
                    id: "s1",
                    title: "Alpha",
                    path: "content/docs/alpha/_index.md",
                    topics: [
                      {
                        id: "t1a",
                        title: "One",
                        path: "content/docs/alpha/one.md",
                        children: [],
                      },
                    ],
                  },
                  {
                    id: "s2",
                    title: "Beta",
                    path: "content/docs/beta/_index.md",
                    topics: [
                      {
                        id: "t2a",
                        title: "Three",
                        path: "content/docs/beta/three.md",
                        children: [],
                      },
                    ],
                  },
                ],
              },
              columns: [["s1"], ["s2"]],
              view: { globalDepth: 3, cardDepths: {} },
            },
          },
        ],
      }),
    );
  });
  await page.reload();
  await expect(page.getByTestId("card")).toHaveCount(2);

  // Drop BELOW the existing row, so the destination's unweighted page
  // has to gain a weight for the order to be expressible at all.
  const box = async (id: string, text: string) =>
    (await page
      .locator(`[data-topic-id="${id}"]`)
      .getByText(text, { exact: true })
      .boundingBox())!;
  const from = await box("t1a", "One");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 6, {
    steps: 3,
  });
  const target = await box("t2a", "Three");
  await page.mouse.move(target.x + target.width / 2, target.y + target.height - 2, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(page.getByTestId("card").nth(1)).toContainText("One");

  await page.getByTestId("review-changes-button").click();
  await expect(page.getByTestId("changes-dialog")).toBeVisible();

  // ── the move, as four facts ──
  const move = page.getByTestId("change-move");
  await expect(move).toContainText("content/docs/alpha/one.md");
  await expect(move).toContainText("→ content/docs/beta/one.md");
  await expect(page.getByTestId("change-move-alias")).toContainText("/docs/alpha/one/");
  await expect(page.getByTestId("change-move-inbound")).toContainText(
    "12 inbound links, as of import — not rewritten",
  );
  // Every line VISIBLE, not merely present: this row is composed
  // content, and composed content inside a truncating wrapper renders
  // as invisible clipped text while every assertion still passes.
  for (const id of ["change-move-alias", "change-move-inbound"]) {
    expect(
      await page.getByTestId(id).evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }),
    ).toBe(true);
  }

  // ── the multi-file disclosure never folds into "1 file changed" ──
  await expect(page.getByTestId("changes-list").locator("> li")).toHaveCount(2);
  await expect(page.getByTestId("plan-warnings")).toContainText(
    "had no weight and must gain one",
  );

  // ── the alias is a plan line, so it is revocable ──
  await page.getByTestId("alias-toggle").getByRole("checkbox").uncheck();
  await expect(page.getByTestId("change-move-alias")).toHaveCount(0);
  // …and the move itself survives: the alias is the mitigation, never
  // the permission.
  await expect(page.getByTestId("change-move")).toContainText(
    "→ content/docs/beta/one.md",
  );

  console_.assertClean();
});

test("the four refusals each say their own reason", async ({ page }) => {
  // Separate from the allowed-move spec ON PURPOSE. A refused drag
  // mutates nothing, so these four compose safely in one test — while
  // chaining them AFTER a committed move does not, because every later
  // coordinate depends on a relayout the earlier drop caused. Splitting
  // on "does this mutate?" is what keeps the sequence honest.
  const console_ = watchConsole(page);
  await page.goto("/");
  await page.evaluate(() => {
    const t = (id: string, title: string, path: string) => ({
      id,
      title,
      path,
      children: [],
    });
    localStorage.setItem(
      "toc-fable/session",
      JSON.stringify({
        version: 3,
        activeTabId: "t1",
        tabs: [
          {
            id: "t1",
            name: "Hugo",
            topicsLocked: false,
            undo: [],
            redo: [],
            editor: {
              document: {
                id: "d1",
                name: "Hugo",
                formatId: "hugo",
                extras: {
                  files: {
                    "content/en/docs/beta/two.md": "---\ntitle: Two\n---\n",
                    "content/en/docs/beta/_index.md": "---\ntitle: Beta\n---\n",
                  },
                },
                sections: [
                  {
                    id: "s1",
                    title: "Alpha",
                    path: "content/en/docs/alpha/_index.md",
                    topics: [
                      t("t1b", "Two", "content/en/docs/alpha/two.md"),
                      t("t1c", "Bundled", "content/en/docs/alpha/leafy/index.md"),
                      t("t1d", "Sub", "content/en/docs/alpha/sub/_index.md"),
                    ],
                  },
                  {
                    id: "s2",
                    title: "Beta",
                    path: "content/en/docs/beta/_index.md",
                    topics: [t("t2a", "Three", "content/en/docs/beta/three.md")],
                  },
                ],
              },
              columns: [["s1"], ["s2"]],
              view: { globalDepth: 3, cardDepths: {} },
            },
          },
        ],
      }),
    );
  });
  await page.reload();
  await expect(page.getByTestId("card")).toHaveCount(2);

  const box = async (id: string, text: string) =>
    (await page
      .locator(`[data-topic-id="${id}"]`)
      .getByText(text, { exact: true })
      .boundingBox())!;
  const refuse = async (id: string, text: string, expected: RegExp, absent?: RegExp) => {
    const from = await box(id, text);
    const onto = await box("t2a", "Three");
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 6, {
      steps: 3,
    });
    await page.mouse.move(onto.x + onto.width / 2, onto.y + onto.height / 2, {
      steps: 8,
    });
    await expect(page.getByTestId("drag-refusal")).toContainText(expected);
    if (absent) await expect(page.getByTestId("drag-refusal")).not.toContainText(absent);
    expect(
      await page.evaluate(
        () => getComputedStyle(document.querySelector("[data-topic-row]")!).cursor,
      ),
    ).toBe("not-allowed");
    await page.mouse.up();
    await expect(page.getByTestId("drag-refusal")).toHaveCount(0);
  };

  // A bundle's folder holds files this app never read.
  await refuse("t1c", "Bundled", /bundle/);
  // And the bundle is told plainly that there is no way around it.
  await refuse("t1c", "Bundled", /left behind/i);
  // A subsection is a DIRECTORY move — docs/16's designed absence — and
  // must not be reported as a filename clash, which would send the user
  // off to rename a file that no rename would fix.
  // The second sentence is what deferral owes: the wall, then the path.
  await refuse("t1d", "Sub", /whole folder/, /filename/);
  await refuse("t1d", "Sub", /select them and drag them together/i);
  // A real path collision.
  await refuse("t1b", "Two", /already there/);

  expect(await page.evaluate(() => document.body.dataset.dragRefused ?? "(none)")).toBe(
    "(none)",
  );
  console_.assertClean();
});
