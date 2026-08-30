# Implementation Plan: Skip already-satisfied leading steps when a Hazbot tour is re-opened

**Jira**: https://concord-consortium.atlassian.net/browse/WM-32
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **Ready to implement** (no code on the branch; see Provenance)

## Provenance

The code and tests below are not a sketch. They were written, run and live-verified, then folded back into this document so the story could carry a complete requirements-plus-implementation spec before any code lands on the branch.

- **2026-08-07** a prototype of the helper and the call-site change was written against the pre-rebase tree and walked live in the browser (rulesets 23/2, 25/2 and 42/2 under the old numbering): bug reproduced, first open unchanged, reopen fixed, tour still completed, Reload trap fixed.
- **2026-08-24** unit tests were written for the skip path and the log payload, and passed.
- **2026-08-30** the branch was rebased onto `origin/master` at `c692687` and both commits were unwound into this plan. Everything the code asserted about the tree was then re-verified against the new base; what moved is recorded under "Drift since the prototype" below, and the code in this document is written against the **new** base, not the old one.

The pre-rebase commits were `2ff8043` (the fix) and `067cda5` (the tests). They exist only in this document and in the local reflog, so this document is the source of truth for both.

## Architecture summary

The whole change is a slice applied at the `drive()` call site in [hazbot-button.tsx](../../src/components/hazbot-button.tsx), plus a one-word change to the tour engine's `showProgress` option and one extra field on the `HazbotShowMeClicked` payload. Nothing else moves.

Choosing the call site over `buildTour` is what keeps the change cheap. `buildTour` keeps returning the full authored array, so `tour-map.tsx`, `tour-map.test.ts`, `build-tour.ts` and `tour-data.generated.ts` are all untouched and their step-count invariants keep holding. The alternative shapes were considered and rejected in the requirements: driving the full array and calling `moveTo(1)` trips the engine's `isLaidOut` zero-rect check, and re-authoring `buildTour` to emit a shorter array would have to be undone every time the student's state changes.

The slice reads MobX state through a per-anchor predicate rather than the rendered `disabled` attribute. That is the second review pass's decision, and the reason is that the two are not the same question: `clear-all-button` is `disabled={!simulation.reloadEnabled || ui.showTerrainUI}` (`bottom-bar.tsx:147`), so with the Setup panel open it renders dead while `reloadEnabled` is still true. Reading the DOM would drop a step the student never did, on the three Clear All tours, irrecoverably for that open. The step that is merely suppressed stays in the tour, and the library's Continue affordance is what keeps it from being a dead end.

## The library change (coachmarks `0.0.1-pre.10`)

Lands first, in `~/projects/coachmarks` on the `hazbot-feedback-changes` branch, which is where
`pre.9` was cut and is 16 commits ahead of `main`. The wildfire branch cannot be pushed until
this is published and repinned. Local iteration goes through yalc; the workflow is in
`~/tmp/wildfire-yalc.md`.

**What it is.** A gated step whose anchor is un-clickable renders its Next button, so no gated
step can be a dead end. While the anchor is clickable the step stays gated exactly as today, so
the affordance can never be used to skip a step the student could have acted on.

**What it is not, and why the obvious route fails.** Extending `useTargetWatcher`'s predicate
past `isLaidOut` to cover `disabled` does not work, for two independent reasons, both confirmed
by probe:

- That hook's only output is `onRemoved`, wired at `popover.tsx:566` to `onTargetRemoved`, which
  under `onTargetLost: "close"` (what the wildfire tour sets) calls `s.cancel()`. A disable would
  therefore **destroy** the tour rather than offer a way past it.
- The hook is one-shot: it calls `observer.disconnect()` after firing, and there is no
  "un-removed" signal. Un-clickability is reversible (closing the Setup panel re-enables
  `clear-all-button`), so it cannot be modeled as a removal.

Un-clickability is a separate, reversible, per-step signal and needs its own hook.

### New file: `src/use-target-unclickable.ts`

```ts
import { useEffect, useState } from "react";

/**
 * Reactive un-clickability of an anchored target: true while the element is `disabled` or
 * `aria-disabled="true"`. Read at effect mount (step entry) and re-read on the attribute
 * mutation, so a gated step whose anchor is dead can offer Next, and one whose anchor comes
 * back is gated again.
 *
 * Deliberately not part of `useTargetWatcher`. That hook answers "is the target gone" once and
 * disconnects, and its callback cancels the tour; un-clickability is reversible and must not
 * reach that path.
 *
 * Pass `null` for viewport popovers, which have no anchor.
 */
export function useTargetUnclickable(target: HTMLElement | null): boolean {
  const [unclickable, setUnclickable] = useState(false);
  useEffect(() => {
    if (!target) {
      setUnclickable(false);
      return;
    }
    const read = () =>
      (target as HTMLButtonElement).disabled === true ||
      target.getAttribute("aria-disabled") === "true";
    setUnclickable(read());
    const observer = new MutationObserver(() => setUnclickable(read()));
    observer.observe(target, {
      attributes: true,
      attributeFilter: ["disabled", "aria-disabled"],
    });
    return () => observer.disconnect();
  }, [target]);
  return unclickable;
}
```

Reading at effect mount is what covers the at-entry case, which is the one this story creates:
the skip deliberately keeps a transiently suppressed step, so that step is entered with its
anchor already dead and a mutation-only watcher would never fire for it.

### `src/popover.tsx`

`anchored` is in scope from `:317`, so the hook call sits with the rest of the gated-navigation
block. Export the hook from `src/index.ts` only if the demo needs it; the app does not.

```diff
+  const targetUnclickable = useTargetUnclickable(
+    anchored ? ((spec as AnchoredPopover).element ?? null) : null,
+  );
-  const showNext = showButtons.includes("next") && (!actionGated || isLast);
+  const showNext =
+    showButtons.includes("next") && (!actionGated || isLast || targetUnclickable);
```

Two consequences worth knowing rather than fixing. `initialFocus` (`:492`) keys on
`isLast && showNext`, so a non-terminal step that grows a Next button still does not steal
focus; only the terminal Done does, which is the existing rule and is unchanged. And the button
text comes from `opts.nextBtnText ?? "Next"` (`:779`), so the label is the consumer's to set.

### Tests: `src/use-target-unclickable.test.ts` and `src/engine.test.tsx`

Hook-level, against a real button: reads true at mount for an already-disabled target; flips
true on a mid-life disable; flips **back** to false on re-enable; covers `aria-disabled` for a
non-button anchor; returns false for a `null` target.

Engine-level, driving a real two-step gated tour through `createCoachmarksEngine`:

- no `coachmarks-popover-next-btn` while the anchor is live (today's gated behavior preserved),
- the button appears on a mid-step disable, and clicking it advances to step 2,
- the button is present **at step entry** when the anchor was already disabled when the tour was
  driven,
- the button disappears again when the anchor is re-enabled.

All nine cases were written and run against a probe of this exact change, and the existing
coachmarks suite stayed at **198 passed of 198 across 15 files** under it, so the change adds no
regressions. The probe has been reverted; the coachmarks tree is clean at `c70cd4c`.

### Publish and repin

Bump `package.json` to `0.0.1-pre.10` in its own `chore: bump version to 0.0.1-pre.10 [WM-32]`
commit, matching `265e299`'s precedent. Then `npm run check` and `npm test`, `npm run build`,
publish, and repin `wildfire-model/package.json:126` from `0.0.1-pre.9` to `0.0.1-pre.10`.

**Estimated diff size**: ~30 lines new file, +5/-1 in `popover.tsx`, ~90 lines of tests, 1 line
in `package.json`; 1 line in wildfire's `package.json`.

### The wildfire side of it

`createCoachmarksEngine` in `hazbot-button.tsx` already passes `showButtons: ["next", "close"]`,
so the button is enabled by the option it already sets and nothing else has to change for the
affordance to work. Add `nextBtnText: "Continue"` alongside the existing `doneBtnText` so the
button reads as the ticket describes it rather than as "Next". That is one student-facing string
living in the app rather than the sheet, so it goes on the content list for Trudi.

## The helper

Added to [hazbot-button.tsx](../../src/components/hazbot-button.tsx) directly below `parseFeedback` (which ends at line 54 on the current base). Exported for the same reason `parseFeedback` is: so its guards can be driven with synthetic step arrays instead of only through the full component.

One import is added alongside it. `SimulationModel` and `EngineStep` are already imported; `AnchorTestId` is not:

```ts
import { AnchorTestId } from "../hazbot/wildfire/anchor-testids";
```

```ts
// What "already satisfied" means, per anchor. Each predicate references the getter that
// owns that control's enabled state rather than re-deriving it, so there is one source of
// truth. NOT the rendered `disabled` attribute: `clear-all-button` is disabled by
// `ui.showTerrainUI` too (bottom-bar.tsx), and a control the Setup panel is suppressing is
// not a step the student has done. An anchor with no entry here is never dropped; the
// tour-map test below fails until a new leading anchor declares what satisfied means for it.
export const SATISFIED_BY: Partial<Record<AnchorTestId, (sim: SimulationModel) => boolean>> = {
  "restart-button": (sim) => !sim.restartEnabled,      // nothing to restart
  "clear-all-button": (sim) => !sim.reloadEnabled,     // nothing to clear
};

// Drop leading gated steps the student has already satisfied, so a re-opened tour starts at
// the first step they have NOT done. Every tour opens with "First, Restart your model" or
// "First, click Clear All to reset your model", and both controls disable themselves once
// used, so a tour rebuilt from index 0 would gate on a dead button with no way forward: an
// intermediate gated step renders no Next button.
//
// Two guards, each owning a different rule:
//  - `i < steps.length - 1` is the collapse-to-zero guarantee. The terminal step is never
//    dropped, so a tour always has something to show.
//  - `!step.advanceOn` restricts dropping to click-gated steps. An ungated step (a viewport
//    bubble) is not something the student can satisfy, so it is never treated as satisfied.
export function dropSatisfiedLeadingSteps(
  steps: EngineStep[], simulation: SimulationModel,
): EngineStep[] {
  let i = 0;
  while (i < steps.length - 1) {
    const step = steps[i] as { target?: string; advanceOn?: unknown };
    if (!step.target || !step.advanceOn) break;
    const testid = step.target.match(/^\[data-testid="(.+)"\]$/)?.[1] as AnchorTestId | undefined;
    const satisfied = testid && SATISFIED_BY[testid];
    if (!satisfied?.(simulation)) break;
    i++;
  }
  return i === 0 ? steps : steps.slice(i);
}
```

The `as` cast is required by the library's types: `EngineStep` is `PopoverSpec | PopoverGroup`, and a `ViewportPopover` declares `target?: undefined`, so the union has no common readable `target`. `build-tour.ts:55` is the only writer of `target`, and it always emits `[data-testid="…"]`, which is what makes the reverse match total.

## The call-site change

`openTour` currently starts at [hazbot-button.tsx:182](../../src/components/hazbot-button.tsx#L182). Three edits, all inside it:

`skippedSteps` is declared at **effect scope**, next to `lastStepIndex`, not inside `openTour`. The cleanup path logs `HazbotCoachMarkHiddenByRun` from outside `openTour`'s closure, so a `const` inside it would be invisible there; and typing it `number | null` makes the intro phase carry `skippedSteps: null` alongside the `lastStepIndex: null` it already carries, which is the convention that row already documents.

```diff
     let lastStepIndex: number | null = null;
+    // Leading steps the skip dropped, in the same null-on-intro coordinate system as
+    // lastStepIndex: authored index = lastStepIndex + skippedSteps.
+    let skippedSteps: number | null = null;

-    const openTour = (steps: EngineStep[]) => {
+    const openTour = (fullSteps: EngineStep[]) => {
+      const steps = dropSatisfiedLeadingSteps(fullSteps, simulation);
+      skippedSteps = fullSteps.length - steps.length;
       log("HazbotShowMeClicked", {
-        ruleSetId, categoryId: matched, stepCount: steps.length, feedbackLevel: selected?.level ?? null,
+        ruleSetId, categoryId: matched, stepCount: steps.length, skippedSteps,
+        feedbackLevel: selected?.level ?? null,
       });
       setTourActive(true);
       lastStepIndex = 0;
       tourEngine = createCoachmarksEngine({
         actionGated: true,                       // gated nav/keyboard/focus + wait-for-target
         onTargetLost: "close",                   // close the tour if a step's anchor unmounts (vs degrade-to-centered)
-        showProgress: true,
+        showProgress: steps.length > 1,          // a collapsed one-step tour must not read "Step 1 of 1"
         progressText: "Step {{current}} of {{total}}",
```

All three tour-outcome payloads gain the field too, so no row needs a join to be read (resolved in the self-review below). `HazbotTourDismissed` and `HazbotTourCompleted` are inside `openTour`; `HazbotCoachMarkHiddenByRun` is in the effect's cleanup, which is what the effect-scope declaration is for.

```diff
           log("HazbotTourDismissed", {
-            ruleSetId, categoryId: matched, lastStepIndex, feedbackLevel: selected?.level ?? null,
+            ruleSetId, categoryId: matched, lastStepIndex, skippedSteps,
+            feedbackLevel: selected?.level ?? null,
           });
...
             log("HazbotTourCompleted", {
-              ruleSetId, categoryId: matched, lastStepIndex, feedbackLevel: selected?.level ?? null,
+              ruleSetId, categoryId: matched, lastStepIndex, skippedSteps,
+              feedbackLevel: selected?.level ?? null,
             });
...
         log("HazbotCoachMarkHiddenByRun", {
           ruleSetId,
           categoryId: matched,
           phase: tourEngine ? "tour" : "intro",
           lastStepIndex,
+          skippedSteps,
           feedbackLevel: selected?.level ?? null,
         });
```

`lastStepIndex` and `stepCount` stay in the same coordinate system (the driven array), which is what the derivation documented in `LOGGED-EVENTS.md` needs. `skippedSteps` is what makes the authored coordinate recoverable, and carrying it on all four events is what makes each row recoverable on its own.

### There is no render-timing question

The helper reads MobX state and never touches the document, so the unflushed-prop window raised in the first review pass cannot arise by construction. `simulation` is already in scope in the effect; nothing new is captured.

## Test plan

All of it lands in [hazbot-button.test.tsx](../../src/components/hazbot-button.test.tsx), in the existing `describe("Hazbot walk-through tour")` block. Reading model state removes the anchor-injection scaffolding the DOM shape needed: the cases set store state instead.

It also changes what the existing suite sees, and this is the one thing to get right before writing anything. `createStores()` starts with `simulationStarted === false`, no sparks and `setupChanged === false`, so **both** predicates read satisfied by default. Under the DOM shape the existing cases saw `skippedSteps: 0` because no anchor was in the document, which was structural rather than behavioral; now they see a skip unless the state says otherwise. `renderWithStores()` takes a `stores` argument already, so each case builds the state it means.

```ts
const afterARun = () => {
  const stores = createStores();
  stores.simulation.simulationStarted = true;   // Restart live, Setup dead
  return stores;
};
```

### Cases driven through the component

23/2 is `restart-button` then `terrain-button` then the Done-terminated Setup-panel step, so it exercises every branch.

```ts
it("does not drop a leading step the student can still act on", () => {
  const logSpy = jest.spyOn(logModule, "log").mockImplementation(() => undefined);
  renderWithStores(afterARun());              // a run started, so Restart is live
  openPanel();
  activateShowMe();
  expect(engines[1].drive.mock.calls[0][0]).toHaveLength(3);
  expect(logSpy).toHaveBeenCalledWith(
    "HazbotShowMeClicked",
    { ruleSetId: "23", categoryId: 2, stepCount: 3, skippedSteps: 0, feedbackLevel: 1 },
  );
});

it("drops a leading gated step the student has already satisfied, and counts it in the log", () => {
  const logSpy = jest.spyOn(logModule, "log").mockImplementation(() => undefined);
  renderWithStores();                         // simulationStarted false: already restarted
  openPanel();
  activateShowMe();
  const driven = engines[1].drive.mock.calls[0][0];
  expect(driven).toHaveLength(2);             // terrain-button has no predicate, so the loop stops
  expect(driven[0].target).toBe('[data-testid="terrain-button"]');
  expect(logSpy).toHaveBeenCalledWith(
    "HazbotShowMeClicked",
    { ruleSetId: "23", categoryId: 2, stepCount: 2, skippedSteps: 1, feedbackLevel: 1 },
  );
});

// Rendered through <BottomBar />, not the helper: what this case turns on is the button
// being DISABLED in the document while reloadEnabled is still true, which only a rendered
// tree shows. Needs coachingEngine41() (coachingEngine() with id "41") so the tour is
// 41/2, and a BottomBar import.
it("keeps a step whose control is only suppressed by the Setup panel", () => {
  const logSpy = jest.spyOn(logModule, "log").mockImplementation(() => undefined);
  mockGetEngine.mockReturnValue(coachingEngine41());
  const stores = createStores();
  stores.simulation.sparks.push(new Vector2(1, 1));   // reloadEnabled true: NOT cleared
  stores.ui.showTerrainUI = true;                     // ...but clear-all renders disabled
  renderBar(stores);
  expect(screen.getByTestId("clear-all-button")).toBeDisabled();
  expect(stores.simulation.reloadEnabled).toBe(true);
  openPanel();
  activateShowMe();
  const driven = engines[1].drive.mock.calls[0][0];
  expect(driven).toHaveLength(2);                     // nothing dropped
  expect(driven[0].target).toBe('[data-testid="clear-all-button"]');
  expect(logSpy).toHaveBeenCalledWith(
    "HazbotShowMeClicked",
    { ruleSetId: "41", categoryId: 2, stepCount: 2, skippedSteps: 0, feedbackLevel: 1 },
  );
});
```

`renderBar` is `renderWithStores` with `<BottomBar />` in place of `<HazbotButton />`; `bottom-bar.test.tsx` already renders it in jsdom and `BottomBar` renders `HazbotButton`, so the existing `openPanel()` / `activateShowMe()` helpers drive straight through it with the coachmarks mock intact. The dependency on `BottomBar` inside a focused unit-test file is the price of the assertion being able to fail at all: with `ui.showTerrainUI` unset the case is indistinguishable from the no-skip case, which is what the first self-review pass caught.

The two-steps-remain counterpart to the progress assertion belongs on the skip case above rather than in a case of its own, since the state that produces it is already there:

```diff
   expect(driven[0].target).toBe('[data-testid="terrain-button"]');
+  expect(engines[1].opts.showProgress).toBe(true);   // 2 steps left, so the counter stays
```

The collapse-to-one case is reached on a **two-step** tour whose opener is satisfied, which is 41/2 with no sparks and `setupChanged` false. It is its own case rather than a sentence, because `showProgress` is the one option the change touches and nothing else asserts it:

```ts
it("suppresses the progress counter when a skip leaves a single step", () => {
  mockGetEngine.mockReturnValue(coachingEngine41());
  renderBar();                              // no sparks, setupChanged false: Clear All is satisfied
  openPanel();
  activateShowMe();
  const driven = engines[1].drive.mock.calls[0][0];
  expect(driven).toHaveLength(1);
  expect(driven[0].target).toBe('[data-testid="start-button"]');
  expect(engines[1].opts.showProgress).toBe(false);   // "Step 1 of 1" never renders
});
```

Driven through the component rather than the helper, because `showProgress` is the one engine
option this change touches and only the component passes it. An earlier draft asserted
`expect(driven.length > 1).toBe(false)` beside the `toHaveLength(1)` above it, which is
`expect(1 > 1).toBe(false)`: the test re-typing the production expression instead of observing
it, and green under a mutation back to `showProgress: true`.

### Cases driven against the exported helper

The two guards are **not** redundant, and driving the exported helper with synthetic arrays is the only way to show it. Testing through `buildTour` cannot separate them, because `build-tour.ts:56` never stamps `advanceOn` on a terminal step, so on real input the two guards always fire together. Each of these cases fails under exactly one mutation:

- **Index bound.** A two-step array in which **both** steps carry `advanceOn` and both anchors are disabled. Widening `i < steps.length - 1` to `i < steps.length` drops it to zero steps and this case fails; removing the `!step.advanceOn` break changes nothing here.
- **Gated-only break.** A leading step carrying a `target` but **no** `advanceOn`, followed by a gated dead one. Removing the `!step.advanceOn` break drops both and this case fails; the index bound never fires. Do **not** write this with a viewport step: a viewport step has no `target`, so the `!step.target` break catches it first and the case stays green under the mutation.

Both mutations were re-run against the corrected cases and each failed exactly one. Write these two as direct `dropSatisfiedLeadingSteps([...], stores.simulation)` calls with hand-built step objects targeting `[data-testid="restart-button"]`, so neither depends on what `buildTour` happens to emit.

That independence is the point rather than a convenience. Neither break is reachable through `buildTour`: it stamps `advanceOn` on every non-terminal anchored step (`build-tour.ts:56`) and no tour authors a viewport step anywhere but its terminal. Swept over all 32 tours, both `ctx` branches and all 8 reachable model states, removing the `!step.advanceOn` break changes none of the 512 outputs. The break is kept because the exported helper takes `EngineStep[]`, a public library type, so a mid-tour ungated step is inside its contract; it is pinned by a synthetic case because a case over real tour data could not fail.

### Cases still to add

The requirements name two acceptance criteria that the prototype's tests did not cover, and both belong here:

- **A Clear All first open drops nothing.** Build the 41/2 shape (`clear-all-button` then `start-button`) with `sparks.length > 0`, and assert both steps are driven with `skippedSteps: 0`. The state reasoning is that a student only reaches one of these categories by running a model, which requires `ready === dataReady && sparks.length > 0` ([simulation.ts:78](../../src/models/simulation.ts#L78)), so `reloadEnabled` is true at first open.
- **The no-predicate path.** Assert that a step whose anchor has no `SATISFIED_BY` entry is never dropped, using `terrain-button`, and that `tour-map.test.ts`'s coverage case fails when an entry is removed.

### The predicate-coverage guard (decided in the second review pass)

A case in `tour-map.test.ts`, so a new leading anchor cannot inherit the wrong rule silently. Every anchor the map can emit as a **non-terminal** step, over both conditional branches, must have a `SATISFIED_BY` entry. On today's map that is `restart-button`, `clear-all-button`, `terrain-button` and `terrain-next`; the last two are deliberate omissions, so the assertion is over the two that carry predicates plus an explicit allowlist of the two that do not, with a comment saying why (`terrain-button` can only be disabled in a state where `restart-button` is live, and `terrain-next` lives inside the closed Setup panel). Removing a `SATISFIED_BY` entry then fails this case by name.

### The authored-order guard (decided in the requirements, question 6)

A new case in `tour-map.test.ts`, over `tourData` rather than the map. The skip can promote any step to be the tour's opener, so no step after the first may open with a connective pointing back at one the student never saw.

```ts
const LEADING_CONNECTIVE = /^\s*(first|second|third|then|now|next|also|finally)\b/i;

it("no step after the first opens with a connective, so any of them reads as an opener", () => {
  const offenders: string[] = [];
  for (const ruleSetId of Object.keys(tourData)) {
    for (const categoryId of Object.keys(tourData[ruleSetId]).map(Number)) {
      tourData[ruleSetId][categoryId].steps.forEach((step, i) => {
        if (i > 0 && LEADING_CONNECTIVE.test(step.text)) {
          offenders.push(`${ruleSetId}/${categoryId} step ${i + 1}: ${JSON.stringify(step.text)}`);
        }
      });
    }
  }
  expect(offenders).toEqual([]);
});
```

Prototyped both directions before being specced: green on today's sheet, and with `"Now click the **Setup** button."` injected onto 23/2's second step it fails with `23/2 step 2: "Now click the **Setup** button."`. The word list is deliberately tight, and a hit means look at the line rather than that the line is definitely wrong, so say that in the failure path or a comment.

### The existing assertions that change, measured

Measured by applying the whole change as a throwaway probe and running the suite, then reverting. **3 failed of 1022** across the full 82-suite run, all three in `hazbot-button.test.tsx`.

- "launches a gated tour on [Show me]" (`:376`). Two assertions inside it move: `:394` (driven length 3 to 2) and `:396` (the exact-match payload, which gains `skippedSteps`). Both move because `createStores()` leaves `simulationStarted` false. Give the case `afterARun()` and both go back to their current values, with `skippedSteps: 0` added. Update the payload assertion rather than loosening it to `objectContaining`, and keep the non-zero case above as its own test.
- `:863` "never shows the tour's click-blocking faded state while the panel is closed" and `:879` "reopening after a Clear All never commits .noHazbot either". Both assert the contract the WM-46 regression fix reverses, and both are correct to fail: with the fix a driving tour survives Clear All, so `.noHazbot` legitimately stays. Rewrite `:879` to assert that a reopen after a **completed** tour still never commits it.

  `:863` needs care rather than a straight inversion. Its current assertions are `.noHazbot` gone **and** `expect(screen.getByTestId("hazbot-button")).not.toBeDisabled()`, and its comment says why: `.noHazbot` carries `pointer-events: none` with no `disabled` attribute, so a leaked `tourActive` bricks the button silently. Asserting only that a driving tour *keeps* `.noHazbot` would delete that guarantee without re-homing it. Keep both halves in the one case, which was probed and passes:

  ```ts
  openPanel();
  activateShowMe();
  expect(wrap().className).toMatch(/noHazbot/);
  act(() => { stores.ui.resetHazbotFeedback(); });
  expect(wrap().className).toMatch(/noHazbot/);        // the driving tour survives
  expect(stores.ui.showHazbotFeedback).toBe(true);
  act(() => { engines[1].opts.onDestroyed(); });        // "Got it!"
  expect(wrap().className).not.toMatch(/noHazbot/);     // ...and it is not permanent
  expect(screen.getByTestId("hazbot-button")).not.toBeDisabled();
  ```

Carrying `skippedSteps` on the three tour-outcome events moves five more exact-match payload assertions, none of them a behavior change: `:427` (`HazbotTourCompleted`), `:442` and `:938` (`HazbotTourDismissed`), and `:798` and `:822` (`HazbotCoachMarkHiddenByRun`, whose intro case gains `skippedSteps: null` beside its existing `lastStepIndex: null`). Nothing outside `hazbot-button.test.tsx` reads these events: there is no Cypress spec and no script that consumes them.

WM-46's own guarantee is unaffected: `:615` "cancels a deferred open when a reset lands before the popover appears" stays green under the probe, which is what the regression fix rests on.

## The WM-46 regression fix (decided in the requirements, question 3)

Separate from the skip, and in different files. `bottom-bar.tsx:346` calls `ui.resetHazbotFeedback()`, which lowers `showHazbotFeedback` and so destroys an in-flight tour. The three Clear All tours instruct that very click as their step 1, which makes their step 2 unreachable.

The fix keeps WM-46's actual guarantee (a **deferred** open is canceled, so a level is never spent on a popover that a reset superseded) and drops the collateral (a **driving** tour is destroyed). The two states cannot overlap: the deferred open is pending only inside the avatar's 400ms scale-up window, and `openOnce` sets `opened = true` before any tour is created.

```ts
// ui.ts
public resetHazbotFeedback() {
  // A driving tour has to survive: the Clear All tours instruct this very click as their
  // first step, and tearing the tour down here leaves their second step unreachable. A
  // deferred open has no tour yet, and lowering the flag is what cancels it.
  if (!this.hazbotTourActive) this.showHazbotFeedback = false;
  this.hazbotFeedbackLevels.clear();
  this.hazbotLastFeedbackShown = undefined;
}
```

`hazbotTourActive` is `HazbotButton`'s local `tourActive` **moved** into the UI store, not copied: the component reads `ui.hazbotTourActive` for its `.noHazbot` class the same way it already reads `ui.showHazbotFeedback` for `.coached`. Keep the closed-branch write (`if (!ui.showHazbotFeedback) { ui.hazbotTourActive = false; return; }`), which is what stops a stale value reaching the render that reopens the panel.

Unmount scoping is the one behavior the move does not preserve on its own, so the effect's cleanup has to clear the flag as well:

```diff
     return () => {
       cleanup = true;
+      // hazbotTourActive must be false whenever no tour is driving: it gates both
+      // resetHazbotFeedback() and the `.noHazbot` class, and the store outlives this
+      // component, so clearing it is this cleanup's job.
+      ui.hazbotTourActive = false;
```

It is a no-op on every dep-change route, since the effect's own next run sets the flag false anyway, and the full suite stays at exactly 3 failed of 1022 with it in place.

Tests: a driving tour survives `resetHazbotFeedback()` and keeps its engine; a deferred open (reset inside the scale-up window, no tour) still has its flag lowered and still commits no level, which is WM-46's existing case and must stay green.

Verified live before planning: with the flag lowering disabled as a throwaway probe, the 41/2 tour survived the Clear All click and advanced to "Step 2 of 2 / Click **Start** to run the model! / [Got it!]" with Start grayed. Screenshot at `tmp/playwright/wm32-step2-restored-grayed-start.png`.

**Deliverable for review handoff.** The fix makes those three tours' second step reachable for the first time, and as authored its instruction cannot be followed: after a Clear All the student must place sparks before Start is enabled, and no Clear All tour mentions that. Tell Trudi when the branch goes up for review. This is content, not code, and is explicitly out of WM-32's scope.

## The Fireline ring move (decided in the requirements, question 4)

Two lines, both byte-identical, in `tour-map.tsx`:

```diff
   // 44: Clear All -> Start; and a Restart -> Fireline (ring Fireline only, v1).
   "44": {
     2: () => [anchor("clear-all-button"), anchor("start-button")],
-    3: () => [anchor("restart-button"), anchor("fireline-button")],
+    3: () => [anchor("restart-button"), anchor("start-button")],
   },
   // 46: Clear All -> Start; Restart -> Fireline; Restart -> Start.
   "46": {
     2: () => [anchor("clear-all-button"), anchor("start-button")],
-    3: () => [anchor("restart-button"), anchor("fireline-button")],
+    3: () => [anchor("restart-button"), anchor("start-button")],
     4: () => [anchor("restart-button"), anchor("start-button")],
   },
```

`fireLineEnabled` requires `simulation.simulationStarted` (`bottom-bar.tsx:88`) and both tours open with "First, **Restart** your model.", so the terminal step always rang a disabled button. Start is live there, since `restart()` does not clear sparks.

Update the header comments on both entries: they currently say "ring Fireline only, v1" and "Restart -> Fireline", which the change invalidates. `tour-map.test.ts` needs no change (arity and the anchor-testid allowlist are both unaffected), and no step counts move.

## Documentation

`LOGGED-EVENTS.md` line 82 describes `stepCount` as "the number of steps in the launched tour" and says nothing about skipping. Three rows need the coordinate system stated, and a fourth now exists that did not when this story was written:

- **`HazbotShowMeClicked`** gains the `skippedSteps` field in its type column and a sentence saying `stepCount` is the **driven** count, with `stepCount + skippedSteps` giving the authored one. The same sentence carries the release boundary, since `APP_RULES_VERSION` is deliberately not bumped: the presence of `skippedSteps` is itself the marker, and the driven and authored coordinates coincide wherever it is `0`, so a query spanning the boundary needs no release date.
- **`HazbotTourCompleted`** and **`HazbotTourDismissed`** gain `skippedSteps` in their type column, and a sentence saying `lastStepIndex` is an index into the driven array whose authored equivalent is `lastStepIndex + skippedSteps`. Repeating the field here rather than leaving it to a join is the same rule the `HazbotCoachMarkHiddenByRun` row already applies to `feedbackLevel` ("it is repeated here so the row reads without a join").
- **`HazbotCoachMarkHiddenByRun`** (line 85) needs two edits, one of them nothing to do with the skip.
  - It gains `skippedSteps` on the same terms, `null` on the intro phase exactly as `lastStepIndex` already is. Its existing derivation prose (`lastStepIndex` against `stepCount - 1`) stays correct as written, because both fields remain in driven coordinates.
  - Its anchor prose is broken by the Fireline ring move and must be rewritten, not merely checked. The row currently reads "**44/3 and 46/3** are anchored on the Fireline button and end 'Add both a **Fireline** and a **Helitack** ... ', so a terminal index there is *partial* compliance". After the move they are anchored on `start-button`, so the clause is false and the row's six-tour split no longer partitions anything. Separate all six by what their step *asks for* rather than by what it is anchored to, which is the guidance the row already gives and which the ring move makes literally true for the first time; 44/3 and 46/3 stay the partial-compliance pair on the strength of their text alone.

`docs/hazbot-update-workflow.md` gains the authoring convention the guard test enforces: any step after the first can become a tour's opener, so no step may open with a connective pointing back at the previous one.

Two more places state contracts this story reverses, and both are in the same PR:

- `CLAUDE.md:83` documents `window.test.resetHazbotFeedbackLevels()` as "also closes an open Hazbot popover (WM-46)", and `:144` says the same thing again in prose. That hook routes through `resetHazbotFeedback()` (`stores.ts:72`), so after the gating it no longer closes a driving **tour**. Both lines say so.
- `tour-map.tsx:19`, in the file-level header, states the rule the ring move reverses: "44/3 and 46/3 ring the Fireline button only (not Fireline + Helitack + Start)". This is the file's own header, distinct from the two per-entry comments named in the Fireline section above; leaving it would have the header contradicting the map below it.

**Content items for Trudi, to raise when the branch goes up for review.** All three are out of WM-32's scope and none blocks it:

1. The three Clear All tours' second step is reachable for the first time (see the regression fix below), and its instruction cannot be followed as authored: after a Clear All the student must place sparks before Start enables, and no Clear All tour mentions that.
2. On 44/3 and 46/3, the ring moves to Start (below). The step still reads "Add both a **Fireline** and a **Helitack** while the model is running. Click **Start** to begin!", and the run gate removes the coach mark the moment Start is pressed, so the during-run half leaves the screen as it becomes actionable. Already documented at `LOGGED-EVENTS.md:85`.
3. A reopened tour opens on a later step with no textual acknowledgment. Decided as intentional (the grayed control carries the signal), but it changes what a student sees and she may disagree.
4. Same family as item 1, on the spark tours. Thirteen of the 32 tours are two steps, so after a Restart the skip leaves them a single coach mark, and on several that lone instruction cannot be followed as authored. Walked live on 25/3: the terminal reads "Place one spark in Zone 1 and one spark in Zone 2, then run the model again", but both sparks are still on the map, `canAddSpark` is `zonesCount - sparks.length` = 0 and the Spark button is grayed, so the student has to Clear All first and no step says so. On 23/4, 33/4 and 35/6 in their `sparkZoneCount >= 2` branch the collapsed instruction describes the state that selected the branch. Pre-existing on a forward walk; what the skip changes is that it becomes the whole tour.

Two near-duplicate pairs in the sheet also remain, differing only in bolding: "Make sure there is a **Spark** in each zone." against "a spark", and "Place one **Spark** in Zone 1 and one **Spark** in Zone 2" against "one spark".

## Drift since the prototype

Everything in this section was re-verified against `origin/master` at `c692687` on 2026-08-30. The requirements' Technical Notes were updated to match; this list is the record of what moved, so a reader of the old commits is not misled.

- **The rulesets were renumbered by a re-extract.** 42, 45, 47 and 54 no longer exist. The map is now 23, 24, 25, 32, 33, 34, 35, 41, 44, 46.
- **32 tours, not 34.** 29 open on `anchor("restart-button")`, 3 on `anchor("clear-all-button")` (41/2, 44/2, 46/2).
- **Reload is now Clear All** in the UI and in the sheet. WM-47 landed the rename: the anchor is `clear-all-button`, and the three openers read "First, click **Clear All** to reset your model." The model getter and method keep their old names (`reloadEnabled`, `reload()`), so `SATISFIED_BY` keys on the new testid and references the old getter.
- **`simulation.ts` line numbers moved.** `ready` is still 78; `setupEnabled` 146 to 154, `startEnabled` 150 to 158, `reloadEnabled` 154 to 162, `restartEnabled` 158 to 166. The predicates themselves are unchanged, so `restartEnabled` and `setupEnabled` are still exact complements.
- **Eight promotable openers, not nine.** "Click the **Setup** button." covers 19 of the 32 tours; the rest are one to four tours each.
- **The "Click to **Start**" typo is gone.** All four Start openers now read "Click **Start** to run the model!", so the resolved question about reporting it to Sam is moot. The two bolding near-duplicates remain ("Make sure there is a **Spark** in each zone." against "a spark", and "Place one **Spark** in Zone 1..." against "one spark").
- **The Fireline ring question covers two tours, not three.** Only 44/3 and 46/3 anchor `fireline-button` ([tour-map.tsx:131](../../src/hazbot/wildfire/tour-map.tsx#L131), [:136](../../src/hazbot/wildfire/tour-map.tsx#L136)).
- **A run now tears the coach mark down.** `runInProgress` disables the Hazbot button and clears `ui.showHazbotFeedback`, logging the new `HazbotCoachMarkHiddenByRun`. This closes the specific mid-tour repro the requirements name (sit on 23/2's Setup step, click Start): the tour is destroyed rather than stranded. The mid-tour dead end is **not** fully gone, because a route that kills an anchor without starting a run still strands the student, but the repro has to be re-derived before that out-of-scope item is filed as its own ticket. See the note under Out of Scope in the requirements.
- **Suite baseline.** `npx jest` on this base reports **1022 passed of 1022** across 82 suites, all green, since the branch now carries no code. The prototype's "878 passed, 1 failed of 879" described the old tree and no longer means anything.
- **The coachmarks pin is unchanged** at `0.0.1-pre.9`, so the library gap is exactly as the requirements describe it: no per-step `showNext`, no `advanceTarget`/`advanceElement`, and no progress offset or explicit-total option.

## Build order

All open questions are resolved, so this is a straight build.

1. **coachmarks**: the Continue affordance, per "The library change" above. New
   `use-target-unclickable.ts`, one line at `popover.tsx:469`, hook and engine tests. Publish
   `0.0.1-pre.10`.
2. **wildfire**: repin to `pre.10`, and add `nextBtnText: "Continue"` to the tour engine options.
   The branch must not be pushed while it points at an unpublished version.
3. Add `SATISFIED_BY`, the exported helper and the call-site change (driven numbering, so `showProgress: steps.length > 1` stays and no `progressOffset` is used).
4. The WM-46 regression fix: move `tourActive` into the UI store, clear it in the panel effect's cleanup, and gate the flag lowering in `resetHazbotFeedback()`.
5. The Fireline ring move: `tour-map.tsx:131` and `:136`, plus the two header comments.
6. Tests: fix the three existing cases above, then add the component-driven cases, the transient-suppression case, the two helper-guard cases, the Clear All first-open case, the no-predicate case, the two regression-fix cases, the predicate-coverage guard and the authored-order guard.
7. Docs: the four `LOGGED-EVENTS.md` rows (all four gain `skippedSteps`; `HazbotCoachMarkHiddenByRun` additionally has its Fireline-anchor clause rewritten) (no `APP_RULES_VERSION` bump; the presence of `skippedSteps` is the release marker), the `docs/hazbot-update-workflow.md` convention, `CLAUDE.md:83` and `:144`, and the `tour-map.tsx:19` file header.
8. Re-walk the live verification on the current rulesets: 23/2 (Restart, 3 steps), 25/2 (Restart, 2 steps, collapses to one anchored step), 25/3 (Restart, 2 steps, collapses to one **viewport** step, the shape none of the others covers) and 41/2 (Clear All, 2 steps, now reaching its terminal).
9. Raise the three content items with Trudi at review handoff, and the no-bump decision with Sam in the same handoff.

## Self-Review

Roles: QA Engineer, Senior Engineer, Student, Education Researcher, Technical Writer. Accessibility is out of scope for this repo. Everything below was verified against `origin/master` at `c692687` by reading the code, by throwaway Jest probes (the helper, the call-site change and the WM-46 fix applied as a patch, suite run, patch reverted, tree clean and 1022/1022 green afterward), and for the visual items by a live Playwright walk of ruleset 25 category 3.

**Measurements re-confirmed on the head commit.** Skip slice alone: 1 failed of 48 in `hazbot-button.test.tsx`, at `:394`. Skip slice plus the WM-46 regression fix: 3 failed of 1022 across 82 suites, exactly the three cases the plan names, with `:615` staying green. Adding the two fixes resolved below (the cleanup-path flag clear and the effect-scope `skippedSteps`) leaves that at 3 failed of 1022, so neither costs extra breakage. The helper compiles as written (`tsc --noEmit` clean apart from the two pre-existing `line-chart.tsx` errors). The 32-tour / 29-3 opener split, the eight distinct index-1 texts, the 26/3/3 index-0 split, `grep -c 'Now '` = 0, and every `dist/index.js` reference (`:82`, `:747`, `:897`, `:937-941`) are exact.

### QA Engineer

#### RESOLVED: The transient-suppression case cannot fail on the line that gives it its name

`stores.ui.showTerrainUI = true` in "keeps a step whose control is only suppressed by the Setup panel" is inert. `dropSatisfiedLeadingSteps(steps, simulation)` never receives the UI store and never reads the document, so the case reduces to "`reloadEnabled` is true, therefore nothing is dropped", which the no-skip case already asserts. Verified by mutation: deleting the `showTerrainUI` line leaves the case green. The model-state-not-DOM-state decision is enforced by the helper's *signature*, not by anything this case observes, so the comment above it ("The finding this decision exists for") claims a guarantee the test does not carry.

**Decision**: drive the case through `<BottomBar />` instead of the helper, so a DOM-reading reimplementation genuinely fails it. Probed as feasible and cheap: `bottom-bar.test.tsx` already renders `<BottomBar />` in jsdom, `BottomBar` renders `HazbotButton`, and the whole `openPanel()` / `activateShowMe()` flow drives through it inside the existing `hazbot-button.test.tsx` harness with the coachmarks mock intact. With `sparks.length > 0` and `ui.showTerrainUI = true` the rendered `clear-all-button` really is `disabled` while `reloadEnabled` stays true, which is the discrimination the case needs. Cost is a `coachingEngine41()` fixture (a five-line variant of `coachingEngine()` with `id: "41"`) and a `BottomBar` import in the test file. The tradeoff to name in review is that a focused unit-test file grows a dependency on `BottomBar`; that is the price of the assertion being able to fail at all.

#### RESOLVED: The progress-suppression case asserts a tautology instead of the production expression

`expect(driven.length > 1).toBe(false)` is `expect(1 > 1).toBe(false)` given the `toHaveLength(1)` above it, and it is the test re-typing the production expression rather than observing it. Nothing in it breaks if `showProgress: steps.length > 1` becomes `showProgress: true`.

**Decision**: delete the tautology and make the component-driven assertion the case, which is what the paragraph after it already asks for: drive 41/2 through the component with `createStores()` defaults and assert `engines[1].opts.showProgress` is `false` and one step was driven. That is the only form that observes the option the change touches.

#### RESOLVED: "keeps the terminal step even when every gated step ahead of it is satisfied" duplicates the case above it and cannot test its own title

Its setup, its tour and its log assertion are identical to "drops a leading gated step the student has already satisfied", and its own comment concedes why: no real 23/2 state satisfies both leading anchors, because `terrain-button` carries no predicate. The collapse-to-zero guarantee it is named for is carried entirely by the synthetic index-bound case.

**Decision**: delete it. Move its one distinct assertion (`expect(engines[1].opts.showProgress).toBe(true)`, the two-steps-remain counterpart) into the preceding case, where the state that produces it already exists. The terminal-step guarantee stays where it can actually fail: the synthetic index-bound case.

### Technical Writer

#### RESOLVED: `LOGGED-EVENTS.md:85` states a fact the Fireline ring move makes false, and the Documentation section tells the implementer not to rewrite it

The `HazbotCoachMarkHiddenByRun` row reads "**44/3 and 46/3** are anchored on the Fireline button and end 'Add both a **Fireline** and a **Helitack** ...', so a terminal index there is *partial* compliance". After the ring move those two tours are anchored on `start-button`, so the clause is false, and the row's six-tour split ("41/2, 44/2, 46/2 and 46/4 end on the Start button" against "44/3 and 46/3 are anchored on the Fireline button") stops partitioning anything. The plan's Documentation section considers only the coordinate-system question for this row and concludes "That prose stays correct ... check it rather than rewrite it", which is right about coordinates and wrong about anchors, and would lead an implementer working the checklist to leave the false clause standing.

**Decision**: the Documentation section's third bullet changes from "check it rather than rewrite it" to a required edit. The coordinate prose stays as-is; the anchor clause is rewritten so all six tours are separated by what their step *asks for* rather than by what it is anchored to, which is the guidance the row already gives and which the ring move makes literally true for the first time. 44/3 and 46/3 stay the partial-compliance pair on the strength of their text alone.

### Student

#### RESOLVED: the "four differences" argument is wrong for the five viewport-terminal collapse branches, and the collapse promotes an unfollowable instruction to being the whole tour

Two separate claims, and the live walk separated them.

**The justification is wrong; the conclusion survives.** The requirements defend collapsing to one step with "A collapsed single-step coach mark is not visually the intro popover ... draws the outline ring on a bottom-bar control, shows the Hazbot avatar badge, sits at `popoverOffset: 27` from that control ... Four differences, all structural." Enumerated against the helper on default post-Restart state, 13 of the 32 tours collapse to a single step, and five of those branches have a **viewport** terminal: 25/3, 25/4, and 23/4 / 33/4 / 35/6 in the `sparkZoneCount >= 2` branch. A viewport popover has no `element`, and `outline-ring.tsx` returns null without one, so there is no ring; there is no anchor, so `popoverOffset` does not apply and no arrow is drawn. Two of the four named differences do not exist on those five. The conclusion still holds by *different* differences, confirmed on screen (`tmp/playwright/wm32-intro-popover-25-3.png` against `tmp/playwright/wm32-tour-step2-viewport-25-3.png`): the viewport bubble sits centered at the top of the map with no pointer and the avatar badge inside it, while the intro sits at the bottom right with an arrow into the enlarged robot and no badge. So it reads as clearly distinct, and the fix is to the paragraph rather than to the design.

**Decision**: rewrite that paragraph to hold for both shapes. Anchored terminals differ by ring, badge, offset and label; viewport terminals differ by centered-top placement, absence of the intro's arrow, badge and label. Neither can be mistaken for the intro popover.

**The content residue is real and belongs on Trudi's list.** Walked live on 25/3: after the Restart the tour's terminal instruction is "Place one spark in Zone 1 and one spark in Zone 2, then run the model again", but both sparks are still on the map in zone 0, `canAddSpark` is `zonesCount - sparks.length` = 0, and the Spark button is grayed. The student has to Clear All first, which no step says. This is pre-existing and identical in shape to the Clear All tours' unfollowable terminal already on the content list; what the skip changes is that it becomes the *entire* tour rather than its second half.

**Decision**: add it as a fourth content item for Trudi, worded as the same family as the first, and add 25/3 to the build order's live re-walk (step 8 currently names 23/2, 25/2 and 41/2, none of which is a viewport collapse).

**Alternative considered and rejected**: a floor of two steps, so a 2-step tour never skips and the library's Continue button carries the dead opener. It is coherent only now that the Continue affordance exists, but it is worse in every case checked: on 41/2 it puts the student back on a dead Clear All button needing an extra click, and on 25/3 it restores "Step 1 of 2" pointing at a dead Restart, which is the exact complaint WM-32 was filed for. Collapse stays.

### Senior Engineer

#### RESOLVED: Moving `tourActive` into the store loses the unmount-scoped cleanup `useState` gave for free

Verified by probe: with the flag moved to `ui.hazbotTourActive`, rendering, opening the panel, activating [Show me] and then unmounting `HazbotButton` leaves `ui.hazbotTourActive === true` in the store with no tour alive. The effect's cleanup destroys both engines and sets `cleanup = true` but never lowers the flag; only the closed branch does, and that needs a re-run with `showHazbotFeedback` already false. It matters in two places: `resetHazbotFeedback()` now reads the flag to decide whether to lower `showHazbotFeedback`, so a stale `true` silently disables the reset, and a remount computes `.noHazbot` from the stale value on its first render, which is the one-frame regression `:879`'s MutationObserver technique exists to catch.

**Decision**: add `ui.hazbotTourActive = false;` as the line after `cleanup = true;` in the effect's cleanup. Probed: the flag is false after unmount, and the full suite stays at exactly 3 failed of 1022, so it costs nothing. It is a no-op on every dep-change route, since the effect's own next run sets it false anyway. The plan's "a move rather than a duplication" note should say that unmount scoping is the one behavior the move does not preserve on its own.

#### RESOLVED: The `:863` rewrite replaces a permanent-brick guard with a narrower assertion and does not put the guarantee anywhere else

`:863` today asserts `.noHazbot` gone **and** `expect(screen.getByTestId("hazbot-button")).not.toBeDisabled()`, and its comment states why: `.noHazbot` carries `pointer-events: none` with no `disabled` attribute, so a leaked `tourActive` leaves the button silently unclickable forever. The plan rewrites it to assert that a driving tour **keeps** `.noHazbot` across a `resetHazbotFeedback()`, which is correct for the new contract but is the opposite assertion, and nothing re-homes the brick guarantee.

**Decision**: have the rewritten case carry both halves. Probed and passing: open, [Show me], assert `.noHazbot`; `resetHazbotFeedback()`, assert `.noHazbot` still present and `showHazbotFeedback` still true (the tour survives); then the tour's own `onDestroyed`, assert `.noHazbot` gone and the button not disabled (it is not permanent). Same case, two more lines.

#### RESOLVED: Line references that do not resolve

- `reloadEnabled` is declared at `simulation.ts:162`. The requirements cite `:163` (its return line) while this plan cites `:162`, and the requirements cite the declaration line for `ready`, `setupEnabled`, `startEnabled` and `restartEnabled`. **Decision**: `:162` in both.
- `opts.nextBtnText ?? "Next"` is at `popover.tsx:779` in the coachmarks source, not `:769`. **Decision**: corrected.
- The helper block adds `AnchorTestId` to `hazbot-button.tsx` but the file does not import it. **Decision**: add `import { AnchorTestId } from "../hazbot/wildfire/anchor-testids";` to the code block, so the step is complete as written. `SimulationModel` and `EngineStep` are already imported.

(`bottom-bar.tsx:88` for `fireLineEnabled`'s `simulationStarted` term and `bottom-bar.tsx:147`, `simulation.ts:78/:154/:158/:166/:326/:445`, `build-tour.ts:55/:56`, `tour-map.tsx:19/:131/:136`, `CLAUDE.md:83/:144`, `hazbot-button.tsx:182`, `parseFeedback` ending at `:54`, and `hazbot-button.test.tsx:376/:394/:396/:615/:863/:879` all resolve exactly.)

### Education Researcher

#### RESOLVED: `skippedSteps` rides only on `HazbotShowMeClicked`, so the three tour-outcome events cannot be read without a join

`lastStepIndex` on `HazbotTourCompleted`, `HazbotTourDismissed` and `HazbotCoachMarkHiddenByRun` becomes an index into the driven array, and the authored index is `lastStepIndex + skippedSteps` on a field none of those rows carries. The plan's Documentation section conceded the consequence ("comparable against `stepCount` on the paired `HazbotShowMeClicked` but not across sessions that skipped different amounts"), which is an admission that the rows stop being self-describing. The same table sets the opposite precedent explicitly: `HazbotCoachMarkHiddenByRun` repeats `feedbackLevel` even though it sits on the paired `HazbotShowMeClicked`, "so the row reads without a join."

**Decision**: carry `skippedSteps` on all four events, typed `number | null`.

Verified before deciding. The field has to move from a `const` inside `openTour` to an effect-scope `let skippedSteps: number | null = null` beside `lastStepIndex`, because `HazbotCoachMarkHiddenByRun` is logged from the effect's cleanup, outside that closure; probed, and the suite stays at exactly 3 failed of 1022 with the hoist in place. Typed nullable, the intro phase logs `skippedSteps: null` next to the `lastStepIndex: null` it already carries, which is the convention that row documents; confirmed against the live intro payload. Cost is five more exact-match payload assertions moving (`:427`, `:442`, `:798`, `:822`, `:938`) and three doc rows. Nothing outside `hazbot-button.test.tsx` reads these events, so that is the whole blast radius.

The join is not merely inconvenient. It is per-session and silent-failing: a session whose `HazbotShowMeClicked` row is missing or truncated leaves `lastStepIndex` uninterpretable with nothing to signal that it is wrong. Carrying the field also extends the "presence of `skippedSteps` is the release marker" device to the outcome events, which strengthens the decision not to bump `APP_RULES_VERSION` rather than complicating it.

This is Sam's data contract rather than the app's, so flag the shape to him at review handoff alongside the no-bump decision, as a notification rather than an approval gate.
