# Implementation Plan: Hazbot Visual-Feedback Overlay Renderer

**Jira**: https://concord-consortium.atlassian.net/browse/WM-17
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **In Development**

## Architecture summary

WM-17 (wildfire side) turns each coaching category's authored `visualFeedback` + `arrowText`
into a rendered coachmark tour, driven by a host-app `(ruleSetId, categoryId)` map and a
build-time-generated tour-text artifact, consuming a **published** `@concord-consortium/coachmarks`
version that already implements the library changes specced in
`coachmarks/specs/WM-17-coachmarks-hazbot-tour-support/`.

**Pinned coachmarks version: `0.0.1-pre.8`** (current is `0.0.1-pre.7` in
[package.json](../../package.json)). `pre.8` is the published version delivering: engine
`actionGated` + `showAvatar` options; `SelectorPopover` (`target` CSS selector) with
wait-for-target; `advanceOn: { event: "click" }`; gated button/keyboard/focus behavior
(intermediate steps hide Next/Previous, terminal Done kept); the decorative hazbot avatar badge;
`image?: ReactNode` on popover content; and **gated degrade-on-removal** (coachmarks requirements
Round 4, generalized: in an `actionGated` tour, a step whose anchor leaves layout re-floats as an
anchorless centered popover instead of cancelling — covers both the held-during-wait case, 24's Next,
and the terminal-on-panel-close case, see the contract note below).
This plan is written as if `pre.8` is published and `npm install`ed.

### How the three authored fields compose (verified against the committed rule-sets)

For each **coaching** category (one with a non-empty `arrowText`; this excludes Category 1 and the
success/celebratory categories, which have no `arrowText`):

- `feedback` → the intro bubble text + trailing `[Show me]` token (parsed by the existing
  `parseFeedback`, [hazbot-button.tsx:21](../../src/components/hazbot-button.tsx#L21)).
- `arrowText` → N numbered step lines, each `"<n>. Hazbot: <text> (Step n of N)"`, then a trailing
  `[Got it!]`. Parsed **at build time** into clean per-step text + the done label.
- `visualFeedback` → N numbered lines naming each step's **target + style**. The map (hand-authored)
  encodes the anchor/style per step; `visualFeedback` prose is the author's reference, **not**
  parsed at runtime.

A category's tour = `zip(generated arrowText step text, map anchor[i])`; `[Show me]` launches it;
the final step is Done-terminated by `[Got it!]`.

### Contract checkpoints — verification results

Each checkpoint from the story was deep-dive-verified against both repos' source before this plan:

| # | Checkpoint | Result |
|---|------------|--------|
| 1 | Two-engine lifecycle (intro `highlight` `showAvatar:false` → destroy + create gated `drive` `actionGated:true`) | **Composes.** `createCoachmarksEngine` takes `actionGated`/`showAvatar` as engine options; the existing effect already creates/destroys an engine per open ([hazbot-button.tsx:81-139](../../src/components/hazbot-button.tsx#L81-L139)). Intro→tour is a destroy-then-create of two independent engines (each owns its own container + React root). See "The renderer" step. |
| 2 | Advance-model coverage across all 11 tabs' tours | **`advanceOn:{event:"click"}` alone covers every intermediate step; the terminal step is always Done.** Verified: across all 33 coaching tours, every intermediate step is an anchor click (Restart/Setup/Next/Reload/Start) and the final step is Done-terminated (`[Got it!]`). The "place sparks / run the model again" actions always live in that final Done step, completed by clicking Got it! — never an intermediate advance. So imperative `moveNext()`/`SimulationStarted` wiring is **not required by any wildfire tour** (it remains available but unused). |
| 3 | Selector `target` + wait-for-target for the appears-after-click case | **Expressible.** The Setup panel container ([terrain-panel.tsx:236](../../src/components/terrain-panel.tsx#L236)) mounts only on `ui.showTerrainUI`; the terminal "Setup panel" step (and 24's intermediate "Click Next" step) uses a `target` selector and waits. The held step during the wait is the persistent **Setup** button (or, for 24's Next→Wind, the panel-1 Next — covered by `pre.8`'s gated degrade-on-removal). New `terrain-panel-container` / `terrain-next` / `terrain-wind` testids added. |
| 4 | `["next","close"]` Done-terminated rule | **Holds.** Every coaching `arrowText` ends in `[Got it!]` (verified all 33). Tours use `showButtons: ["next","close"]`; the gated rule hides Next on intermediate steps and renders Done on the terminal. |
| 5 | `image?: ReactNode` for ruleset 25 Cat 4 mountain imagery | **Passthrough.** 25/4 step 2 is a `ViewportPopover` (centered top) carrying `image: <MountainPlaceholder/>`; final art swaps the asset, no code change. |
| 6 | `(ruleSetId, categoryId)` → anchor/style map zipped with the build-time `arrowText` artifact | **Built.** A standalone generator parses `arrowText` (prefix strip, `(Step n of N)` strip, line split, `[Got it!]` extraction, line-count validation) into `src/hazbot/wildfire/tour-data.generated.ts`; the map supplies per-step anchors; the renderer zips them. |
| 7 | New `data-testid`s and exact targets | **Three**, all in the Setup wizard: `terrain-panel-container` (terminal "Setup panel" steps), `terrain-next` (24's Next step), `terrain-wind` (24's terminal Wind step). Every other target already has a testid. |

**Contract note — anchor-removal in two places, one general coachmarks rule (gated degrade-on-removal):**
two distinct wildfire interactions remove a gated step's anchor mid-tour, and `pre.8` handles both
with a single rule rather than letting either cancel the tour:
1. **24's Next→Wind (held-during-wait).** 24's tour goes "… → Click Next → Change Wind", and the Setup
   wizard's Next button (panel 1) and Wind section (panel 2) live in **different sub-panels that
   mount/unmount** ([terrain-panel.tsx:318](../../src/components/terrain-panel.tsx#L318) vs
   [:331](../../src/components/terrain-panel.tsx#L331)). Clicking Next advances the tour *and* removes
   the held Next anchor while the engine waits for Wind to appear.
2. **Terminal-on-panel-close (Zeplin-anchored terminals).** The terminal "Setup panel" / "Wind" steps
   (23/2·3 → `terrain-panel-container`, 24/2·3·4 → `terrain-wind`, 34/2, etc.) stay **anchored to the
   panel** per the Zeplin design ("Step N of N", arrow at the panel). Their instruction is "…then run
   the model again", which requires closing the panel (Create → `applyAndClose` → unmount), removing
   the terminal step's anchor.
Without a fix, case 1 races the held step's removal-watcher into a cancel, and case 2 cancels the
terminal Done before `[Got it!]` (mis-logging `HazbotTourDismissed`). **`pre.8`'s gated
degrade-on-removal** (coachmarks Round 4, generalized) handles both: in an `actionGated` tour, a step
whose anchor leaves layout re-floats as an anchorless centered popover (same content + step number +
Done/close) instead of cancelling — case 1 re-floats briefly then advances when Wind appears, case 2
re-floats and stays until `[Got it!]`. So wildfire authors every tour faithfully to the Zeplin design
(terminals anchored to the panel); the library keeps them alive across the panel close.

---

## Implementation Plan

### New `data-testid`s on the Setup wizard panel

**Summary**: Add the three anchor testids the tours need (`terrain-panel-container`, `terrain-next`,
`terrain-wind`). Pure additive markup; no behavior change. Standalone, no dependency on the rest of
the plan, so it can land first.

**Files affected**:
- `src/components/terrain-panel.tsx` — add three `data-testid`s.

**Estimated diff size**: ~6 lines.

The wizard ([terrain-panel.tsx](../../src/components/terrain-panel.tsx)) is a 3-sub-panel stepper
gated by `currentPanel` (0/1/2). Verified structure: the **inner container** (`css.background`,
[:236](../../src/components/terrain-panel.tsx#L236)) mounts only when `ui.showTerrainUI` is true and
**persists across sub-panel changes** (only its class changes). The **Next** button exists in
sub-panel 0 ([:258](../../src/components/terrain-panel.tsx#L258)) and sub-panel 1
([:318](../../src/components/terrain-panel.tsx#L318)) — only one mounts at a time, so a shared testid
is unique in the DOM at any moment. The **Wind** section (`css.wind`,
[:331](../../src/components/terrain-panel.tsx#L331)) exists only in sub-panel 2.

Edits (before → after):

```diff
- <div className={`${css.background} ${cssClasses[selectedZone]} ${panelClasses[currentPanel]}`}>
+ <div className={`${css.background} ${cssClasses[selectedZone]} ${panelClasses[currentPanel]}`}
+      data-testid="terrain-panel-container">
```

```diff
  <div className={css.buttonContainer}>
-   <Button className={css.continueButton} onClick={showNextPanel}>
+   <Button className={css.continueButton} onClick={showNextPanel} data-testid="terrain-next">
      Next
    </Button>
  </div>
```
(apply the same `data-testid="terrain-next"` to **both** Next buttons, [:258](../../src/components/terrain-panel.tsx#L258) and [:318](../../src/components/terrain-panel.tsx#L318)).

```diff
- <div className={css.wind}>
+ <div className={css.wind} data-testid="terrain-wind">
    <WindCircularControl …/>
  </div>
```

**Why the container goes on `css.background` (the open-only inner div), not the always-mounted
`css.terrain` wrapper** ([:233](../../src/components/terrain-panel.tsx#L233)): the "Setup panel" tour
step must resolve **after** the student clicks Setup. `css.terrain` is always in the DOM (toggled by
the `css.disabled` class), so a selector on it could resolve before the panel opens; `css.background`
mounts on open, giving wait-for-target a clean appearance signal.

**Tests**: extend the existing terrain-panel test (or add a small render test) asserting the three
testids are present when the panel is open at the relevant sub-panel; covered more meaningfully by
the anchor-resolvability test in the map step and per-tab Playwright validation.

---

### Build-time tour-text generator (`arrowText` → generated artifact)

**Summary**: A standalone script parses every coaching category's `arrowText` into clean per-step
text + a done label, validates the authoring invariants, and writes a committed generated TS module.
Mirrors the established **pure-impl + thin-runner + impl-test** convention
([scripts/playbook-impl.js](../../scripts/playbook-impl.js) +
[scripts/generate-hazbot-validation-playbook.js](../../scripts/generate-hazbot-validation-playbook.js)
+ [scripts/playbook-impl.test.js](../../scripts/playbook-impl.test.js)). It does **not** touch the
rule-set modules, the extractor's emission, or the `Category` type — sidestepping WM-18 entirely.

**Files affected**:
- `scripts/tour-data-impl.js` — **new**, pure parser/validator (CommonJS, exports `buildTourData` + helpers).
- `scripts/generate-hazbot-tour-data.js` — **new**, thin runner (`ts-node/register` → import committed rule-sets → write artifact).
- `scripts/tour-data-impl.test.js` — **new**, Jest unit tests on the pure impl.
- `src/hazbot/wildfire/tour-data.generated.ts` — **new**, generated committed artifact.
- `package.json` — add a script alias `"generate-hazbot-tour-data": "node scripts/generate-hazbot-tour-data.js"`.

**Estimated diff size**: ~260 lines (impl ~120, runner ~40, tests ~80, generated artifact regenerated).

**Loading mechanism** (mirrors the playbook generator, verified): the runner reads the **committed**
rule-set modules, not the xlsx —
```js
require("ts-node/register");
const { buildTourData, GENERATED_HEADER } = require("./tour-data-impl");
const { ruleSets } = require("../src/hazbot/rule-sets"); // committed barrel
// ... buildTourData(ruleSets) → { artifactSource } → fs.writeFileSync(OUT, artifactSource)
```

**The parser** (`tour-data-impl.js`). For each rule set, for each category that **has** a non-empty
`arrowText`, parse its lines. Verified `arrowText` shape facts that drive the parser:
- Lines are `"<n>. Hazbot: <text> (Step n of N)"`, then a final `"[Got it!]"` line.
- A few step lines **omit** the `Hazbot:` prefix (24 step 4, e.g. `"4. Change the Wind Direction…"`),
  so the prefix strip must be optional.
- The trailing token is always `[Got it!]` (verified across all 33 coaching categories).

```js
// tour-data-impl.js (core)
const DONE_RE = /^\[([^\]]+)\]$/;
const STEP_RE = /^\s*(\d+)\.\s*/;                 // leading ordinal
const HAZBOT_RE = /^Hazbot:\s*/i;                 // optional speaker prefix
const STEPNUM_RE = /\s*\(Step\s+(\d+)\s+of\s+(\d+)\)\s*$/i;
const VF_STEP_RE = /^\s*\d+\.\s/;                 // numbered visualFeedback line
const VF_SUBBULLET_RE = /^\s*-\s/;                // "- If …" conditional sub-bullet (excluded)

function parseArrowText(arrowText, ctx /* {ruleSetId, categoryId, warn, fail} */) {
  const lines = arrowText.split("\n").map(l => l.trimEnd()).filter(l => l.trim() !== "");
  const last = lines[lines.length - 1]?.trim() ?? "";
  const done = last.match(DONE_RE);
  if (!done) ctx.fail(`arrowText does not end in a [Done] token (got ${JSON.stringify(last)})`);
  if (done && done[1].trim() !== "Got it!") {
    ctx.fail(`arrowText done token is [${done[1].trim()}], expected [Got it!]`);
  }
  const stepLines = lines.slice(0, -1);
  let declaredTotal = null;
  const steps = stepLines.map((raw, i) => {
    if (!STEP_RE.test(raw)) ctx.fail(`step line ${i + 1} missing leading ordinal: ${JSON.stringify(raw)}`);
    let t = raw.replace(STEP_RE, "");
    const m = t.match(STEPNUM_RE);
    if (!m) ctx.fail(`step line ${i + 1} missing "(Step n of N)": ${JSON.stringify(raw)}`);
    const n = m && Number(m[1]); const total = m && Number(m[2]);
    if (m) {
      if (n !== i + 1) ctx.fail(`step ${i + 1} numbered "(Step ${n} …)" — out of order`);
      if (declaredTotal === null) declaredTotal = total;
      else if (declaredTotal !== total) ctx.fail(`inconsistent "(… of N)": ${declaredTotal} vs ${total}`);
    }
    t = t.replace(STEPNUM_RE, "").replace(HAZBOT_RE, "").trim();
    return { text: t };
  });
  if (declaredTotal !== null && steps.length !== declaredTotal) {
    ctx.fail(`${steps.length} step lines but "(… of ${declaredTotal})"`);
  }
  return { stepCount: steps.length, doneLabel: done ? done[1].trim() : "Got it!", steps };
}
```

**Validation policy** (the line-count invariant, with the ruleset-34 quirk handled):
- **Hard errors** (`ctx.fail` → non-zero exit, abort write): a coaching category whose `arrowText`
  doesn't end in `[Got it!]`; a step line missing its ordinal or `(Step n of N)`; out-of-order or
  inconsistent step numbers; step-line count ≠ the declared `N`. These are internal `arrowText`
  consistency checks — the authoritative step count is `N` from `(Step n of N)`.
- **Warnings** (`ctx.warn`, non-fatal): a category with **numbered** `visualFeedback` lines
  (`VF_STEP_RE`, excluding `VF_SUBBULLET_RE`) but **no** `arrowText` (an under-authored coaching
  category — does not false-flag success categories, whose `visualFeedback` is prose with no
  numbered lines); and a **vF-numbered-line count ≠ arrowText step count**. The latter intentionally
  **warns, not errors**, because ruleset 34/2 and 34/3 legitimately carry an extra `0. Arrow pointing
  to the Intensity scale` cue (verified [34.ts:22-25,37-40](../../src/hazbot/rule-sets/34.ts#L22-L25)):
  vF has 4 numbered lines, `arrowText` has 3 steps. Erroring here would block a valid sheet; the
  warning surfaces the quirk for the map author. (How 34's `0.` cue renders is an Open Question
  below; the *tour* is 3 steps either way.)

**The generated artifact** (`src/hazbot/wildfire/tour-data.generated.ts`):

```ts
// AUTO-GENERATED — DO NOT EDIT — re-run scripts/generate-hazbot-tour-data.js
export interface TourStepText { text: string; }
export interface TourData { stepCount: number; doneLabel: string; steps: TourStepText[]; }

/** Keyed by ruleSetId (string, e.g. "23") then categoryId (number). */
export const tourData: Record<string, Record<number, TourData>> = {
  "23": {
    2: { stepCount: 3, doneLabel: "Got it!", steps: [
      { text: "First, Restart your model." },
      { text: "Now click the Setup button." },
      { text: "Click each zone to change its drought conditions to match the instructions. Then run the model again." },
    ] },
    // 3, 4 …
  },
  // 24, 25, 32, 33, 34, 35, 42, 45, 47, 54 …
};
```

**Tests** (`tour-data-impl.test.js`, Jest, mirroring `playbook-impl.test.js`): fixture rule sets →
`buildTourData` → assert (a) `Hazbot:`/ordinal/`(Step n of N)` are stripped and `[Got it!]` extracted;
(b) step text is clean; (c) a missing-`Hazbot:` line (the 24-step-4 shape) still parses; (d) errors
fire on a wrong done token, a count/`N` mismatch, and an out-of-order step; (e) the vF/arrowText
count-mismatch (34 shape) **warns** but still emits; (f) a category with no `arrowText` is skipped;
(g) a category with numbered vF but no `arrowText` warns. Warnings asserted via
`jest.spyOn(console, "warn")`.

**Workflow integration**: add the generator as a post-extraction step in
[docs/hazbot-update-workflow.md](../../docs/hazbot-update-workflow.md) so a future full extraction
regenerates the tour data, and add a line to that doc's PR checklist ("Regenerated
`tour-data.generated.ts` if any `arrowText` changed"); it also runs standalone today (no rule-set
regeneration needed). Drift is guarded the same way as every other generated artifact in this repo —
the `AUTO-GENERATED — DO NOT EDIT` header + PR review — **not** a CI diff check (which would be a
novel pattern here and would conflict with the WM-27 "modules are intentionally not a clean
regenerate" reality).

---

### The `(ruleSetId, categoryId)` tour anchor map + invariants

**Summary**: A host-app map keyed by `(ruleSetId, categoryId)` whose value is a **factory** returning
per-step anchor/style descriptors (the part not reliably parseable from prose). The renderer zips
`tourData[rs][cat].steps[i].text` (text) with `tourMap[rs][cat](ctx)[i]` (anchor/style). A factory
(not a literal) because some steps branch on live sim state. Plus a canonical testid list and the
acceptance-criteria invariant tests.

**Files affected**:
- `src/hazbot/wildfire/anchor-testids.ts` — **new**, the canonical set of anchor testids.
- `src/hazbot/wildfire/tour-map.tsx` — **new**, the `(ruleSetId, categoryId)` factory map + types. (`.tsx`, not `.ts`: the 25/4 entry holds a JSX image element, `image: <MountainPlaceholder />`.)
- `src/hazbot/wildfire/tour-map.test.ts` — **new**, the map-coverage / step-count / anchor-resolvability invariants.
- `src/assets/hazbot/mountain-placeholder.svg` — **new**, the 25/4 placeholder figure (created here so the map can import it without a forward dependency; the library `image` slot that renders it ships in the version-pin step).

**Estimated diff size**: ~325 lines (map ~210, testids ~20, tests ~90) + asset.

**Step-anchor descriptor types** (`tour-map.tsx`):

```ts
import type { ReactNode } from "react";

export type StepAnchor =
  // Bubble anchored to a control; the engine's showOutlineRing draws the ring on it;
  // intermediate steps advance on click (added by the renderer, not the map).
  | { kind: "anchor"; testid: AnchorTestId }
  // No-pointer bubble centered at top; no ring (a ViewportPopover has no ring); optional figure.
  | { kind: "viewport"; position: "top-center"; image?: ReactNode };

/** ctx carries live sim state read at open time (for conditional steps). */
export interface TourContext {
  sparkZoneCount: number;   // distinct zones holding a spark in the just-run sim
}

export type TourFactory = (ctx: TourContext) => StepAnchor[];

/** Keyed ruleSetId (string) → categoryId (number) → factory. */
export const tourMap: Record<string, Record<number, TourFactory>> = { /* … */ };
```

The renderer decides advance/terminal per index (last index = Done-terminated; earlier `anchor`
steps get `advanceOn:{event:"click"}`), so the map encodes **only** anchor + style, not advance
semantics — keeping it declarative.

**Representative entries** (one per distinct shape; the full map covers all 33 coaching categories):

```ts
// 23/2 — the canonical 3-step Setup tour: Restart → Setup → Setup panel (terminal).
"23": {
  2: () => [
    { kind: "anchor", testid: "restart-button" },
    { kind: "anchor", testid: "terrain-button" },         // "Setup" button
    // Terminal step anchored to the Setup panel (Zeplin design: arrow points at the panel,
    // "Step 3 of 3"). Appears after Setup click → selector + wait. When the student closes the
    // panel to run (Create → unmount), coachmarks' gated degrade-on-removal re-floats this step
    // as a center-center bubble (same step number + Done) instead of cancelling — see Self-Review.
    { kind: "anchor", testid: "terrain-panel-container" },
  ],
  3: () => [ /* identical anchors to 23/2; text differs via tourData */
    { kind: "anchor", testid: "restart-button" },
    { kind: "anchor", testid: "terrain-button" },
    { kind: "anchor", testid: "terrain-panel-container" },
  ],
  // 23/4 — conditional terminal step (decision A): anchor the bubble+ring to the Spark button
  // when a zone is missing its spark; otherwise a plain centered-top no-pointer bubble.
  4: (ctx) => [
    { kind: "anchor", testid: "restart-button" },
    ctx.sparkZoneCount >= 2
      ? { kind: "viewport", position: "top-center" }
      : { kind: "anchor", testid: "spark-button" },
  ],
},
// 24/2 — Restart → Setup → Next → Wind (the Round-4 held-anchor-removal case).
"24": {
  2: () => [
    { kind: "anchor", testid: "restart-button" },
    { kind: "anchor", testid: "terrain-button" },
    { kind: "anchor", testid: "terrain-next" },                       // panel-1 Next; removed on click
    { kind: "anchor", testid: "terrain-wind" },                       // panel-2 Wind; selector + wait (terminal)
  ],
  // 3, 4 identical anchors
},
// 25/2 — "Spark button outlined; centered top" (decision A): anchor bubble+ring to the Spark button.
// 25/4 — mountain imagery (placeholder now), centered-top terminal step.
"25": {
  2: () => [
    { kind: "anchor", testid: "restart-button" },
    { kind: "anchor", testid: "spark-button" },
  ],
  4: () => [
    { kind: "anchor", testid: "restart-button" },
    { kind: "viewport", position: "top-center", image: <MountainPlaceholder /> },
  ],
},
// 34/2 — Intensity-scale 0. cue deferred (decision A): tour = the 3 arrowText steps.
"34": {
  2: () => [
    { kind: "anchor", testid: "restart-button" },
    { kind: "anchor", testid: "terrain-button" },
    { kind: "anchor", testid: "terrain-panel-container" },// terminal: anchored to panel; degrades on close
  ],
},
// 45/3 — Fireline+Helitack+Start outline (decision A): bubble+ring on Fireline only.
"45": {
  3: () => [
    { kind: "anchor", testid: "restart-button" },
    { kind: "anchor", testid: "fireline-button" },                    // bubble + ring on Fireline
  ],
},
```

**Terminal-step anchoring + degrade-on-removal (correctness):** terminal steps that point at the Setup panel stay **anchored to it** (the Zeplin design: arrow at the panel, "Step N of N"). The hazard: the terminal instruction is typically "…then run the model again," which requires closing the panel (Create → `applyAndClose` → panel unmount), and a panel-anchored step whose anchor is removed would be cancelled by coachmarks' anchor-removal watcher the instant the student runs (losing `[Got it!]` and mis-logging `HazbotTourDismissed`). This is handled **library-side** by `pre.8`'s **gated degrade-on-removal**: in an `actionGated` tour, when a step's anchor leaves layout the engine re-floats it as an anchorless centered popover (same content, step number, and Done/close) instead of cancelling — so the panel-anchored terminal degrades to a center-center bubble (viewport `position: "center"`) on Create and the student can still click `[Got it!]`. This generalizes the Round-4 held-anchor-removal suppression (decision A) into one rule covering both the held-during-wait case (24's Next) and the terminal case. `buildTour` therefore emits the **anchored** selector step for these terminals unchanged; no wildfire-side branch is needed.

**Conditional steps** (verified 23/4, 33/4, 35/6 — identical `- If 2 sparks … / If only one …`
sub-bullets): the factory reads `ctx.sparkZoneCount` (computed by the renderer from
`simulation.sparks` zone coverage at open time) and, per decision A, emits either an `anchor` step on
`spark-button` (bubble + ring, when a zone is missing its spark) or a plain centered-top `viewport`
step (when both zones already have one). Either way it is **one** step corresponding to one
`arrowText` line, so step-count invariants hold.

**Canonical testids** (`anchor-testids.ts`): a `const ANCHOR_TESTIDS = [...] as const` listing every
testid the map may reference (`restart-button`, `reload-button`, `terrain-button`, `spark-button`,
`start-button`, `fireline-button`, `helitack-button`, `terrain-panel-container`, `terrain-next`,
`terrain-wind`) with a derived `AnchorTestId` union type. Typing the map's `testid` field as
`AnchorTestId` makes "map references an unlisted testid" a **compile error**, not a runtime risk.
(`fire-intensity-scale` is intentionally **not** listed — after decision A deferred 34's intensity
cue no map entry anchors to it, and it is the one id that is config-conditional, rendered only when
`simulation.config.showBurnIndex` is set, [bottom-bar.tsx:216-218](../../src/components/bottom-bar.tsx#L216).)

**Resolvability is structural, not preset-dependent.** Verified the bottom-bar seven are
**unconditionally rendered** with only a `disabled` prop toggled (via `<Button data-testid>` /
`IconButton`'s `dataTest` → `data-testid`, [bottom-bar.tsx:156-213](../../src/components/bottom-bar.tsx#L156)),
so a preset that disables a tool still leaves its anchor in the DOM; the three Setup-panel testids are
added in this PR and present whenever the panel is open at the right sub-panel. So no map anchor's
*presence* depends on a preset/config flag — the rulesets are authored against presets that guarantee
the relevant controls, and the controls are structurally present regardless.

**Invariant tests** (`tour-map.test.ts`, the acceptance criteria):
- **Map coverage**: for every rule set, the set of map category keys equals the set of categories with
  `tourData` (i.e. with parsed `arrowText`); no orphan entries for Category 1 or success categories.
  Cross-checks `tourMap` against `tourData.generated`.
- **Step-count agreement**: for every `(rs, cat)`, `tourMap[rs][cat](ctx).length === tourData[rs][cat].stepCount`
  for both branches of each conditional factory (`sparkZoneCount` 1 and 2).
- **Anchor resolvability**: map ⊆ `ANCHOR_TESTIDS` is **type-enforced** (the map's `testid` field is
  `AnchorTestId`), backed by a trivial assertion that every id a conditional factory can emit (both
  branches) is in the list. **Runtime** resolvability is the per-tab Playwright deliverable — anchors
  are config-independent in presence (bottom-bar buttons always mounted; Setup-panel testids added
  here), so there is no preset-coverage gap and no separate render smoke test is needed.

---

### Coachmarks version pin (and the popover image slot)

**Summary**: Pin the published `pre.8` — the version that delivers `actionGated`/`showAvatar`,
`SelectorPopover` + wait-for-target (with the Round-4 held-anchor-removal suppression), `advanceOn`,
the gated button/keyboard/focus behavior, the avatar badge, and `image?: ReactNode`. This is a
prerequisite for the renderer step; the `MountainPlaceholder` asset it renders is created in the map
step.

**Files affected**:
- `package.json` — bump `@concord-consortium/coachmarks` `0.0.1-pre.7` → `0.0.1-pre.8`.

**Estimated diff size**: ~2 lines.

The repo already imports `*.svg` as React components (e.g.
[hazbot-button.tsx:9-11](../../src/components/hazbot-button.tsx#L9-L11)), so the map's
`import MountainPlaceholder from "../../assets/hazbot/mountain-placeholder.svg"` yields a component
passed straight through as the popover `image` `ReactNode` by `build-tour`. The consumer owns
`alt`/`aria`; per the coachmarks spec the meaningful text is already in the step's `arrowText`
description, so the placeholder SVG is `aria-hidden`. Final PI artwork later swaps the asset file
only — no code change. `pre.8`'s `image?: ReactNode` renders it in the figure slot. (This step is
sequenced before the renderer; it can also be done first via `yalc` per the cross-repo workflow,
[~/tmp/wildfire-yalc.md](file:///home/doug/tmp/wildfire-yalc.md), then pinned on publish.)

**Tests**: none beyond the map/renderer tests; image presence is a Playwright check on 25/4.

---

### The renderer — two-engine lifecycle, gated tour, logging

**Summary**: Extend the Hazbot-button effect to (1) show the intro `feedback` popover with the avatar
badge suppressed, (2) on `[Show me]`, destroy the intro engine and create a **gated** tour engine that
drives the zipped tour, and (3) emit the launch/completion/dismissal log events. Pure tour-building
logic is extracted to a testable helper; the engine lifecycle stays in the effect.

**Files affected**:
- `src/hazbot/wildfire/build-tour.ts` — **new**, pure `buildTour(ruleSetId, categoryId, ctx)` → `EngineStep[] | null`.
- `src/hazbot/wildfire/build-tour.test.ts` — **new**, unit tests on the zip/anchor/advance logic.
- `src/components/hazbot-button.tsx` — extend the `ui.showHazbotFeedback` effect into the two-engine lifecycle.

**Estimated diff size**: ~340 lines (build-tour ~120, tests ~90, hazbot-button ~130).

**`buildTour`** zips text + anchors into coachmarks `EngineStep[]`. Selector targets (`target`) +
`advanceOn` come from `pre.8`. Last index = Done-terminated (no `advanceOn`); earlier `anchor` steps
get `advanceOn:{event:"click"}`:

```ts
export function buildTour(ruleSetId: string, categoryId: number, ctx: TourContext): EngineStep[] | null {
  const data = tourData[ruleSetId]?.[categoryId];
  const factory = tourMap[ruleSetId]?.[categoryId];
  if (!data || !factory) return null;                 // non-coaching → no tour
  const anchors = factory(ctx);
  // Invariant also asserted in tour-map.test.ts; guard defensively at runtime.
  if (anchors.length !== data.steps.length) return null;
  return anchors.map((a, i) => {
    const isLast = i === anchors.length - 1;
    const description = data.steps[i].text;
    if (a.kind === "viewport") {                       // no-pointer centered-top bubble, no ring
      return { popover: { position: "top-center", description,
        ...(a.image ? { image: a.image } : {}) } };
    }
    // anchor step → selector target; engine showOutlineRing draws the ring (ringTarget defaults
    // to target). Intermediate steps advance on click; the terminal step is Done-terminated.
    return {
      target: `[data-testid="${a.testid}"]`,
      ...(isLast ? {} : { advanceOn: { event: "click" } }),
      popover: { side: "top", align: "center", description },
    };
  });
}
```

**The two-engine lifecycle** in [hazbot-button.tsx](../../src/components/hazbot-button.tsx). The
current effect ([:81-139](../../src/components/hazbot-button.tsx#L81-L139)) creates a single intro
engine. Extend it to a small phase machine. Key shape (abbreviated):

```ts
useEffect(() => {
  if (!ui.showHazbotFeedback || !avatarRef.current) return;
  const engine = getAnalysisEngine();
  const matched = engine ? computeMatchedCategoryForEngine(engine) : null;
  const ruleSetId = engine?.ruleSet?.id ?? null;
  const cat = engine?.ruleSet?.categories.find(c => c.id === matched) ?? null;
  if (!ruleSetId || !cat?.feedback) { ui.showHazbotFeedback = false; return; }
  const { body, label } = parseFeedback(cat.feedback);

  const ctx: TourContext = { sparkZoneCount: countSparkZones(simulation) };
  const tour = matched != null ? buildTour(ruleSetId, matched, ctx) : null;  // null → non-coaching

  let phase: "intro" | "tour" | "done" = "intro";
  let intro: EngineHandle | null = null;        // EngineHandle: the exported coachmarks engine type
  let tourEngine: EngineHandle | null = null;
  let introCancelled = false;
  let tourCancelled = false;
  // `cleanup` distinguishes a real Done/Show-me activation from a programmatic teardown
  // (effect cleanup / unmount), since onDestroyed fires for every destroy route. Without it,
  // the cleanup path would spuriously launch a tour and mis-log Completed (see Self-Review #1).
  let cleanup = false;

  const openIntro = () => {
    intro = createCoachmarksEngine({
      showButtons: ["next", "close"],
      doneBtnText: label || undefined,      // "Show me" for coaching cats; "Okay"/"Hooray!" otherwise
      showOutlineRing: false,
      showAvatar: false,                    // intro already points at the robot button (pre.8)
      popoverOffset: 25, arrow: HAZBOT_ARROW, // shared hazbot arrow geometry (module const below)
      onCancelRequested: () => { introCancelled = true; intro?.destroy(); },
      onDestroyed: () => {
        // Launch the tour ONLY on a real Show-me activation (not cancelled, not cleanup).
        if (phase === "intro" && !introCancelled && !cleanup && tour) { phase = "tour"; openTour(); }
        else if (!cleanup) { phase = "done"; ui.showHazbotFeedback = false; }
      },
    });
    intro.highlight({
      element: avatarRef.current!, ringElement: buttonRef.current ?? undefined,
      popover: { side: "top", align: "center", description: body },
    });
  };

  const openTour = () => {
    log("HazbotShowMeClicked", { ruleSetId, categoryId: matched, stepCount: tour!.length });
    let lastStepIndex = 0;
    tourEngine = createCoachmarksEngine({
      actionGated: true,                    // gated nav/keyboard/focus + wait-for-target (pre.8)
      showProgress: true, progressText: "Step {{current}} of {{total}}", // Zeplin: "Step N of M"
      // Same hazbot arrow geometry as the intro so tour coach marks match the Zeplin design and the
      // intro styling (strokeWidth 3 = the theme's 3px border). popoverOffset = 27, derived from the
      // Zeplin tour mock: the measured arrow-tip→Setup-button gap is 9px (matching the design rule
      // "no closer than 8px"), and coachmarks places the popover BOX at popoverOffset and the arrow
      // protrudes its height (18) toward the anchor, so visible gap = popoverOffset − arrowHeight ⇒
      // popoverOffset = 9 + 18 = 27. (~same as the intro's 25, which yields a ~7px gap; the static
      // Setup button fills its box, unlike the inset robot, so the gap reads tighter at the same
      // offset.) Confirm the rendered ~9px gap in the per-tab Playwright pass. Anchored steps draw
      // this arrow toward their target; a degraded/viewport step (no anchor, no popover.arrow)
      // renders ARROWLESS — see notes below.
      arrow: HAZBOT_ARROW, popoverOffset: 27,
      showButtons: ["next", "close"], doneBtnText: tourData[ruleSetId][matched!].doneLabel, // "Got it!"
      onHighlightStarted: (_el, _step, { state }) => { lastStepIndex = state.activeIndex; },
      onCancelRequested: () => {
        tourCancelled = true;
        log("HazbotTourDismissed", { ruleSetId, categoryId: matched, lastStepIndex });
        tourEngine?.destroy();
      },
      onDestroyed: () => {
        // Completed ONLY on a terminal Done click: not cancelled (×/Escape) and not cleanup.
        if (!tourCancelled && !cleanup) {
          log("HazbotTourCompleted", { ruleSetId, categoryId: matched, lastStepIndex });
        }
        if (!cleanup) { phase = "done"; ui.showHazbotFeedback = false; }
      },
    });
    tourEngine.drive(tour!);
  };

  // open after the avatar scale-up settles (existing transitionend/fallback pattern, unchanged)
  …openOnce → openIntro()…

  // Programmatic teardown: set `cleanup` BEFORE destroying so neither engine's onDestroyed
  // launches a tour or logs a Completed/dismissed event for an interrupted (not user-driven) close.
  return () => { cleanup = true; intro?.destroy(); tourEngine?.destroy(); };
}, [ui.showHazbotFeedback]);
```

`HAZBOT_ARROW` is a module-level const shared by both engines — `const HAZBOT_ARROW = { width: 36,
height: 18, strokeWidth: 3 }` (the existing intro value; `strokeWidth: 3` matches the hazbot theme's
3px popover border). Setting it on the **tour** engine too keeps the walk-through arrows identical to
the intro and the Zeplin design rather than falling back to floating-ui defaults. **Arrows only render
on anchored steps**, pointing at the resolved target; the engine-level geometry does not force an
arrow onto an anchorless popover. So the **degraded** center-center terminal (no anchor, no
`popover.arrow`) and the authored **"no pointer" centered cues** (25/3, 25/4, and the `viewport`
branch of `buildTour`, which never sets `popover.arrow`) both render **arrowless** — correct, since
they point at nothing. The per-tab Playwright pass confirms the tour arrow matches Zeplin on anchored
steps and that the degraded/centered bubbles show no arrow.

Verified lifecycle facts that make this correct:
- **Intro Done vs ×/Escape are distinguishable.** The intro `highlight` Done button (the `[Show me]`
  token) routes `moveNext()` → terminal → `destroy()` → `onDestroyed` **without** `onCancelRequested`
  ([engine.tsx:308-322,369-420](../../../coachmarks/src/engine.tsx#L308-L322)); the × / Escape route
  fires `onCancelRequested` first ([engine.tsx:193-238](../../../coachmarks/src/engine.tsx#L193-L238)).
  So `introCancelled` cleanly gates "launch the tour" to the Show-me click.
- **Two independent engines.** Each `createCoachmarksEngine` makes its own container + React root
  ([engine.tsx:77-81](../../../coachmarks/src/engine.tsx#L77-L81)), so destroying the intro and
  creating the gated tour engine compose without interference — and `actionGated`/`showAvatar` differ
  per engine, which the resolved coachmarks granularity decision requires (engine-level options, two
  engines).
- **`onHighlightStarted` fires per gated step** (coachmarks requirement #1), so `lastStepIndex` is
  tracked for the completion/dismissal payloads without per-step logging.
- **Non-coaching categories** (`tour === null`: Category 1's `[Okay]`, success `[Hooray!]`) keep
  today's behavior exactly — the intro popover is the whole interaction; `onDestroyed` just resets the
  flag.

`countSparkZones(simulation)` computes how many distinct zones currently hold a spark, read at open
time for the conditional factories. Note `simulation.sparks` is `Vector2[]` ([simulation.ts:49](../../src/models/simulation.ts#L49))
— bare positions with **no** `zoneIdx` — so the helper maps each spark to its cell's `zoneIdx` the
same way the run-snapshot builder does ([simulation.ts:281-287](../../src/models/simulation.ts#L281):
`cellAt(position)?.zoneIdx`); extract/reuse that path rather than duplicating it. **Source = live
sparks** (current on-screen placement), deliberately, so the ring reflects what is actually placed
right now. Edge case (accepted): if the student adds/removes a spark *after* the analyzed run without
re-running, the conditional reflects the current sparks rather than the run that set the matched
category — the correct current-state truth, and benign because sparks persist across Restart (so live
== the analyzed run in the common flow; Reload clears sparks but forces re-setup, changing the matched
category anyway).

**Tests** (`build-tour.test.ts`): a multi-step tour zips text+anchors in order; intermediate anchor
steps carry `advanceOn:{event:"click"}` and the terminal step does not; the terminal step uses the
selector/viewport from the map; a conditional `(rs,cat)` emits the `spark-button` **anchor** step when
`sparkZoneCount < 2` and a centered-top `viewport` step otherwise (both two steps); a non-coaching
`(rs,cat)` returns `null`; the 25/4 viewport step carries the `image`. The engine-lifecycle branch (intro→tour vs intro→dismiss, log payloads) is asserted via a
small test that drives the effect's callbacks with a mocked engine, plus per-tab Playwright validation.

---

### Logging documentation and workflow doc

**Summary**: Document the three new events in `LOGGED-EVENTS.md` and add the generator to the hazbot
workflow doc. Required deliverables; no app code.

**Files affected**:
- `LOGGED-EVENTS.md` — three rows in the Hazbot section.
- `docs/hazbot-update-workflow.md` — post-extraction generator step (also referenced in the generator step above).

**Estimated diff size**: ~12 lines.

Verified `log()` ([log.ts:16](../../src/log.ts#L16), `log(name: string, data?: object)`) routes every
event through `getAnalysisEngine()?.consume(...)`. Like `HazbotButtonClicked`, the three new events
must stay **unhandled** in the engine's `translate.ts` (deliberate no-ops, so they don't mutate the
matched category). Add to the Hazbot table (matching the existing `| Event | Parameters | When |`
format, escaping `|` in unions as `\|`):

| `HazbotShowMeClicked` | `{ ruleSetId: string, categoryId: number, stepCount: number }` | Student activates `[Show me]` on the intro popover, launching the walk-through. |
| `HazbotTourCompleted` | `{ ruleSetId: string, categoryId: number, lastStepIndex: number }` | Student finishes the walk-through via the terminal `[Got it!]` (engine `onDestroyed` without a cancel). |
| `HazbotTourDismissed` | `{ ruleSetId: string, categoryId: number, lastStepIndex: number }` | Student closes/Escapes the walk-through before the end (engine `onCancelRequested`). |

---

### Per-tab Playwright validation deliverable

**Summary**: Walk each tab's coaching categories against a running dev server (yalc-linked `pre.8`)
and confirm each tour anchors, advances (action-gated), and reads correctly. An explicit deliverable,
not just guidance.

**Files affected**: none (manual validation; notes captured in the PR / a scratch checklist).

For each of the 11 tabs, using the ruleset URL params + `window.test.*` helpers from
[CLAUDE.md](../../CLAUDE.md): load the tab, reach each coaching category's matched state, click Hazbot
→ `[Show me]`, and verify per step: the bubble anchors to the right control with an outline ring;
`advanceOn` click advances; the Setup-panel / Next / Wind selector steps wait-for-target and anchor
once present (especially **24**: Next→Wind across the wizard sub-panel swap exercises the Round-4
held-anchor-removal fix); the terminal step shows `[Got it!]`, lands focus, and completes; the avatar
badge shows on tour steps but not the intro; `showProgress` reads "Step N of M"; conditional spark steps
(23/4, 33/4, 35/6) outline the Spark button only when one zone has a spark; 25/4 shows the placeholder
mountain figure. Log `HazbotShowMeClicked`/`Completed`/`Dismissed` payloads observed in the
log-monitor sidebar.

---

## Open Questions

### RESOLVED: How to render decoupled / multi-element outline rings the coachmarks single-`ringElement` model can't directly express?
**Decision: A — v1 simplification, no library change.** Deep-dive verified that rings and bubbles are separate render paths (`OutlineRings` draws one ring per popover with `ringElement ?? element`, [outline-ring.tsx:34-39](../../../coachmarks/src/outline-ring.tsx#L34-L39); the `Popover` always renders the themed `role="dialog"` box, [popover.tsx:655-736](../../../coachmarks/src/popover.tsx#L655)), so a "ring-only companion" (Option B) renders a visible empty box — not clean without a library change. Resolution applied:
- Plain anchored steps auto-ring their element via engine `showOutlineRing: true` (matches every "X button outlined" cue) — no per-step ring plumbing.
- **Conditional spark cue (23/4, 33/4, 35/6)** and **25/2**: the factory *anchors the bubble to the Spark button* (single `AnchoredPopover` → bubble **+** ring, no empty box) when a spark ring is wanted (for the conditionals, when `sparkZoneCount < 2`), and a plain centered-top `ViewportPopover` (no ring) otherwise. This preserves the conditional "add the missing spark" ring with full fidelity; the only deviation is the bubble points at the Spark button instead of floating top-center.
- **Fireline/Helitack/Start (45/3, 47/3, 54/3)**: anchor the bubble at Fireline and ring Fireline only (single ring); the step text covers "add both… click Start." (Verified the three are separate `widgetGroup` siblings in [bottom-bar.tsx](../../src/components/bottom-bar.tsx) with no shared enclosing element, so no container-ring covers all three.)
- **34 `0.` intensity-scale arrow**: deferred (tour = the 3 `arrowText` steps; the generator warns, not errors, on the count mismatch; the intensity scale is always on-screen).
- 25/3 (pure centered-top no-pointer) and 25/4 (mountain image) stay `ViewportPopover`, correct as-is.

A coachmarks multi-ring / ring-only-companion enhancement (Option C) is deferred as non-blocking; revisit only if PIs deem the triple outline or true centered-top-with-ring must-haves. Original finding below.

### (original) How to render decoupled / multi-element outline rings the coachmarks single-`ringElement` model can't directly express?
**Context**: A coachmarks step couples one outline ring to the bubble's anchor (`AnchoredPopover.ringElement`); `ViewportPopover` has no ring. Three authored cues want rings **decoupled** from (or **multiplied** beyond) a single bubble anchor:
- **Centered-top bubble + Spark-button ring** (25/2; and the conditional 23/4 / 33/4 / 35/6): the bubble is a no-pointer centered-top `ViewportPopover` while the ring should sit on the Spark button (a different element).
- **Fireline + Helitack + Start triple outline** (45/3, 47/3, 54/3): one bubble pointing at Fireline/Helitack while outlining three separate bottom-bar buttons.
- **Intensity-scale `0.` arrow cue** (34/2, 34/3): a persistent pointer at `fire-intensity-scale` alongside the 3-step tour (the `0.` line that makes 34's vF-line count exceed its 3 `arrowText` steps).

These are **visual-emphasis** cues, not functional blockers: the authored `arrowText` already carries the full instruction text in every case, so a missing/simplified ring degrades emphasis but never breaks a tour (unlike the Round-4 held-anchor-removal, which was functional and went to the coachmarks spec). Per the resolved requirements design question, the map author owns per-step ring/pointer style, so this is a wildfire-side styling decision.
**Options considered**:
- A) **v1 simplification (recommended):** render the centered-top bubble with **no** decoupled ring (25/2 and the conditionals show the bubble only); ring the **primary** anchor for the Fireline/Helitack/Start step (ring Fireline, point at Fireline/Helitack); **defer** the 34 `0.` intensity arrow (tour = the 3 `arrowText` steps). No library change; matches the "placeholder mountain art" deferral philosophy. The generator's vF/arrowText count check already **warns** (not errors) on 34.
- B) **PopoverGroup companions:** express each decoupled/extra ring as a ring-only companion popover in a `PopoverGroup`. Risk: companions render their own bubble; a "ring-only, no text" companion may show an empty box. Needs a coachmarks demo spike to confirm a clean ring-only companion is possible; if not, it becomes a coachmarks enhancement (a new Round-4-style finding).
- C) **Coachmarks enhancement:** add multi-ring / decoupled-ring support to the library (a `rings: string[]` or viewport `ring`); larger cross-repo scope, beyond `pre.8`.

**Decision**: **A** (recorded above).

## Self-Review

Multi-role review of the implementation plan. Each finding was deep-dive-verified against the
coachmarks/wildfire source before being written, then processed one at a time.

### Senior Engineer

#### RESOLVED: Two-engine `onDestroyed` handlers misfire on teardown (spurious tour launch + wrong log events)
The renderer sample used `introCancelled` to distinguish Show-me from ×/Escape but carried no guard for **programmatic teardown**, and the tour engine had no guards at all. Verified against [engine.tsx](../../../coachmarks/src/engine.tsx): `onDestroyed` fires for every destroy route (Done → `moveNext()` → `destroy()` [:316-318](../../../coachmarks/src/engine.tsx#L316-L318); ×/Escape → `onCancelRequested` [:206](../../../coachmarks/src/engine.tsx#L206) → consumer `destroy()`; effect cleanup → `destroy()`), with no intrinsic way to tell them apart. As originally written: (1) the effect-cleanup path hit the intro's `onDestroyed` with `!introCancelled && tour` still true → **spuriously launched a tour during unmount**; (2) on ×/Escape the tour logged **both** `HazbotTourDismissed` and `HazbotTourCompleted`, and on cleanup logged a **spurious `HazbotTourCompleted`**. **Resolution:** added `cleanup` (set before any teardown `destroy()`) and `tourCancelled` flags; the intro launches the tour only on `!introCancelled && !cleanup`, and the tour logs `Completed` only on `!tourCancelled && !cleanup` — so Done → Completed only, ×/Escape → Dismissed only, cleanup → neither and no spurious launch. Renderer step updated.

---

### QA Engineer

#### RESOLVED: Anchor-resolvability was specced against a self-referential list; the proposed render smoke test is unnecessary
Original concern: the unit assertion only checks map ⊆ `ANCHOR_TESTIDS` (both hand-maintained in the same module), so a component-side testid rename isn't caught by it. On review (per project owner), a dedicated render smoke test is **not** warranted: (a) the map's `testid` field is typed `AnchorTestId` (the union from `ANCHOR_TESTIDS as const`), so an unlisted testid is a compile error; (b) verified the bottom-bar anchors are unconditionally rendered (only `disabled` toggled, [bottom-bar.tsx:156-213](../../src/components/bottom-bar.tsx#L156)) and the Setup-panel testids are added in this PR, so anchor *presence* is config-independent — rulesets are authored against presets that guarantee the controls, and the controls are structurally present regardless; (c) the per-tab Playwright validation already walks every tour live and catches a non-resolving anchor. **Resolution:** dropped the smoke test; reframed acceptance criterion #3 to type-enforced consistency + the Playwright deliverable; removed `fire-intensity-scale` from `ANCHOR_TESTIDS` (unused after deferring 34's cue, and the one config-conditional id).

#### RESOLVED: Conditional factory's spark source underspecified; `countSparkZones` was described as a one-liner it can't be
Verified `simulation.sparks` is `Vector2[]` with no `zoneIdx` ([simulation.ts:49](../../src/models/simulation.ts#L49)); zone coverage requires the cell lookup the run-snapshot builder does ([simulation.ts:281-287](../../src/models/simulation.ts#L281)), and the factor `OneSparkPerZone` reads the *run snapshot's* baked-in `zoneIdx` ([sim-props.ts:13-24](../../src/hazbot/wildfire/sim-props.ts#L13)) — so "live sparks vs analyzed-run sparks" was ambiguous and my one-line `countSparkZones` description was wrong. **Resolution:** specified the helper maps each live spark to its cell's `zoneIdx` (reusing the snapshot path, not duplicating it); chose **live sparks** as the source (the ring should reflect current placement) with the benign post-run-edit edge documented; corrected the `build-tour.test.ts` bullet to decision-A behavior (spark-button anchor step when `< 2`, else centered-top viewport).

---

### Build / Tooling & Generator

#### RESOLVED: Stale generated tour-data could pass the map tests — but a CI drift check is the wrong fix
The map tests import the committed `tour-data.generated.ts`, so a stale artifact (rule-set `arrowText` changed, generator not re-run) could pass against old data. Verified the repo has **no** drift-check convention (`playbook-impl.test.js` tests the pure renderer with fixtures, not committed-doc currency; `.github/` has no regeneration/`git diff` step; WM-27 says the rule-set modules are intentionally not a clean regenerate, so a strict drift check would fail). Within WM-17 the `arrowText` is frozen (committed modules), so the artifact is generated once and stable; drift only arises on a future WM-18 re-extraction, which the plan already wires the generator into. **Resolution:** follow the repo convention — `AUTO-GENERATED` header on `tour-data.generated.ts` + the post-extraction generator step and a new PR-checklist line in [hazbot-update-workflow.md](../../docs/hazbot-update-workflow.md) + PR review; **no** CI drift check.

---

### Cross-Repo Contract (Round 2)

#### RESOLVED: Terminal Done steps anchored inside the Setup panel are cancelled by the run action; handled library-side by gated degrade-on-removal
Full finding + verification in [requirements.md](requirements.md) Self-Review Round 2. The terminal Setup-panel steps (23/2·3 → `terrain-panel-container`, 24/2·3·4 → `terrain-wind`, 34/2) are anchored to the panel per the **Zeplin design** (arrow at the panel, "Step N of N"). Their instruction is "…then run the model again", which closes the panel (Create → unmount), removing the anchor; coachmarks' `useTargetWatcher` would then cancel the terminal Done before `[Got it!]`, mis-logging `HazbotTourDismissed`. **Resolution (Option B, coachmarks-side):** `pre.8` adds **gated degrade-on-removal** — in an `actionGated` tour, a step whose anchor leaves layout re-floats as an anchorless centered popover (same content + step number + Done/close) instead of cancelling. So the terminal stays anchored to the panel (Zeplin) while it is open and degrades to a center-center bubble on Create, keeping `[Got it!]` reachable and logging `HazbotTourCompleted`. The wildfire map keeps the **anchored** terminal entries (reverted from the earlier centered-top-viewport approach, which dropped the Zeplin anchored design); no wildfire-side branch is added. This same rule covers 24's Next→Wind held-anchor-removal (decision A is its special case), tracked next.
