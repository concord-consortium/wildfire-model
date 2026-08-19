# Update interaction for placing a Fireline

**Jira**: https://concord-consortium.atlassian.net/browse/WM-29
**Repo**: https://github.com/concord-consortium/wildfire-model
**Status**: **In Development**

## Overview

Change how a student draws a fire line on the 3D map: instead of pressing, holding, and dragging to
place both ends in one gesture, the first click places one end, the fire line icon stays attached to
the cursor, and a second click places the other end. Adjusting the two ends afterward is unchanged.

## Project Owner Overview

Placing a fire line is currently the only suppression tool in the model that requires a press-hold-drag
gesture. Placing a spark and placing a helitack drop are both single clicks. The drag gesture is harder
to discover, harder to perform on a trackpad, and inconsistent with the rest of the toolbar, which
costs students time and attention that should be going toward the fire behavior they are there to
reason about.

This story replaces that gesture with two ordinary clicks. The intent is that no other part of the fire
line workflow changes: the model still pauses when the Fireline tool is picked, the two ends can still
be nudged individually before the run resumes, and the fire line is still built into the terrain when
the student presses Start.

## Background

### The current gesture, as verified against the running app

Walking the current build (`plainsTwoZone`, dev server, real mouse events) confirms this sequence:

1. Clicking **Fireline** in the bottom bar calls `BottomBar.handleFireLine`, which calls
   `simulation.stop()` (logging `SimulationStopped` if a run was in progress), sets
   `ui.interaction = Interaction.DrawFireLine`, and logs `FireLineButtonClicked`.
   **The model is paused for the whole placement interaction.** Verified live:
   `simulationRunning` went `true` to `false` on that click.
2. The Fireline button becomes **disabled** as soon as the interaction is armed, because
   `BottomBar.fireLineEnabled` includes `ui.interaction !== Interaction.DrawFireLine`. Verified live.
3. `useDrawFireLineInteraction.onPointerDown` pushes **two** markers at the same point and immediately
   calls `startDragging`. `ui.dragging` flips true, which disables OrbitControls rotation via
   `enableRotate={!ui.dragging}` in `view-3d.tsx`.
4. `onDrag` calls `setFireLineMarker(lastIdx, x, y)` on every pointer move, which erases the old
   dashed preview, moves the endpoint, applies `limitFireLineLength`, and redraws. Verified live: the
   under-construction cell count grew 10 to 16 across a drag and the final length clamped to exactly
   15000 ft, the `maxFireLineLength` default.
5. `onDragEnd` compares the two markers against `MIN_DIST` (1500 ft). If both axes are under it, the
   markers are removed and **the interaction stays armed**. Otherwise `ui.interaction = null` and
   `FireLineAdded` is logged.
6. The two markers persist as draggable `<Marker>`s with the dashed preview between them. They are
   converted into real fire line cells by `applyFireLineMarkers()`, which `SimulationModel.start()`
   calls when the student presses Start.

Verified live: a press-and-release with no movement pushes 2 markers on pointer down, then resets to
0 markers and leaves the tool armed. **Today, a plain click on the terrain is a no-op.** That is
precisely the click WM-29 needs to make meaningful, which is why the `MIN_DIST` guard cannot simply be
carried over unchanged.

### What this means for the change

The model layer already supports two-click placement with no changes. A throwaway Jest probe against
`SimulationModel` confirmed:

- `addFireLineMarker` once leaves `fireLineMarkers.length === 1`, draws no preview (the
  `count % 2 === 0` guard), and leaves `canAddFireLineMarker` true, so the second click can still add.
- The second `addFireLineMarker` draws the dashed preview at the moment it lands.
- `setFireLineMarker(1, x, y)` erases and redraws cleanly with no cell leakage, so a rubber band
  preview between the two clicks needs no new model code.
- `applyFireLineMarkers()` tolerates a dangling odd marker without throwing and clears the array.

**One real gap.** `addFireLineMarker` does **not** apply `limitFireLineLength`; only `setFireLineMarker`
does. The probe placed two markers 99000 ft apart through `addFireLineMarker` and got a 99000 ft fire
line against a 15000 ft cap. So an implementation that simply pushes a marker on click one and pushes
another on click two silently removes the length limit. The second endpoint has to land through
`setFireLineMarker` (or `addFireLineMarker` has to gain the clamp).

### Interaction ownership is not a conflict

Fire line markers are draggable through `useDraggingOverPlaneInteraction`, whose `active` flag is
`enabled && (ui.interaction === null || ui.interaction === Interaction.HoverOverDraggable)`. While
`DrawFireLine` is armed that is false, and `getEventHandlers` only wires handlers for active
interactions, so a marker already on the map cannot swallow the second click or hijack the cursor.
The two-click flow does not need to defend against that.

### Abandoning a half-placed fire line (two verified failures)

Splitting placement into two clicks creates a state that cannot exist today: a fire line with one end
committed and the other not. Four bottom-bar buttons stay enabled while `DrawFireLine` is armed
(Helitack, Start, Restart, Reload; Setup, Spark and Fireline are disabled), so the student can leave
that state by several routes. Two of them are broken, both verified live:

**The crash.** `FireLineMarkersContainer`'s `onDragEnd` pairs markers by `idx % 2` and dereferences
`fireLineMarkers[idx + 1]` without a guard. Reaching an odd marker count with `ui.interaction === null`
(arm Fireline, place one end, click Helitack, drop it) and then dragging the lone marker throws
`Cannot read properties of undefined (reading 'x')` and raises the dev-server error overlay, which
blocks all further interaction until reload. Note the existing code optional-chains the *cells*
(`cell1?.elevation`) but not the *markers*, which is backwards: the markers are what go missing.

**The phantom fire line, which is worse.** If the rubber band reuses the current two-marker mechanism
(push both on click one, move the second on pointer move), then abandoning mid-placement leaves two
markers and a live preview that are indistinguishable from a confirmed line. Verified: arm Fireline,
place one end, click Helitack, drop it, press Start, and `applyFireLineMarkers()` builds a real
21-cell fire line the student never confirmed, running from their first click to wherever the cursor
happened to be. Silent, no error, and it changes fire behavior.

Two further routes contribute to this. `handleStart` never clears `ui.interaction`, so pressing Start
mid-placement resumes the run with the fire line cursor still live and the next terrain click begins a
new line mid-run (verified). `handleHelitack` replaces `ui.interaction` without touching the markers.
Restart and Reload are the only clean exits today, since both set `ui.interaction = null` and clear
`fireLineMarkers`, but each discards the whole run and so cannot serve as "cancel this fire line".

## Requirements

1. With the Fireline tool armed, the first click on the terrain places one end of the fire line. No
   press-and-hold, and no drag, is required.
2. The fire line icon stays with the cursor for the whole interaction, so the tool visibly stays armed
   and awaiting the second end. Before the first click that icon is the cursor art; after it, the marker
   tracking the pointer takes over and the cursor art gives way to a plain crosshair, so only one fire
   line icon is ever on screen.
3. A second click on the terrain places the other end and ends the interaction, leaving
   `ui.interaction = null`.
4. The resulting fire line must respect `config.maxFireLineLength` exactly as the drag gesture does
   today. A second click beyond the cap must not produce an over-length line.
5. Once both ends are placed, dragging either end individually behaves exactly as it does now,
   including the `FireLineUpdated` log event.
6. The rest of the fire line lifecycle is unchanged: the Fireline button still pauses the model, the
   dashed preview persists after placement, and Start still converts the markers into fire line cells.
   (The button no longer stays disabled while armed; see requirements 9 and 14.)
7. `FireLineAdded` continues to be logged once, with the same payload shape, when both ends are placed.
   Under two-click that is the second click rather than the drag's pointer-up. Note it records where
   the line was *first* drawn, not the final geometry: subsequent endpoint drags log `FireLineUpdated`,
   and the authoritative record of the line actually built is `configSnapshot.fireLineMarkers` in the
   `SimulationStarted` payload (from `buildStartReadingData()`), which is also the only one of the
   three the Hazbot engine reads.
8. A live preview follows the cursor between the two clicks, using the same dashed
   under-construction rendering and the same length clamping the drag shows today. Moving the cursor
   off the terrain mesh freezes the preview at the last valid terrain point, as the drag does now.
9. The student can abandon the interaction after the first click by **either** pressing Escape **or**
   clicking the Fireline button again. Both behave identically and **disarm the tool completely**: the
   placed endpoint and the preview are cleared, `ui.interaction` returns to `null`, and the cursor
   returns to default. The Fireline button is re-enabled while `DrawFireLine` is armed so it can act as
   that toggle, which makes Fireline the only tool whose button stays live while armed, unlike
   `sparkEnabled` and `helitackEnabled` (a deliberate asymmetry, not an oversight). This is distinct
   from the too-short second click in requirement 13, which is a *rejection*: it leaves the first
   endpoint in place and the tool armed.
10. **No incomplete fire line ever survives leaving the interaction.** A single cancel path clears
    `fireLineMarkers` and erases the under-construction cells, and every departure from `DrawFireLine`
    with an incomplete line routes through it, including switching to Helitack and pressing Start. This
    is the requirement that prevents the phantom fire line, not merely the crash.
11. Dragging a fire line marker whose partner is missing must not throw. `FireLineMarkersContainer`'s
    `onDragEnd` looks its partner up and returns early when it is absent, logging nothing.
12. Pressing Start clears `ui.interaction`, so a run never resumes with a placement tool still armed.
13. A second click closer than 1500 ft to the first is ignored and the tool stays armed awaiting a
    valid second end. The minimum is measured as a Euclidean distance, matching `limitFireLineLength`
    at the other end of the range, rather than the current per-axis square test.
14. While the tool is armed, the Fireline button shows a persistent armed state: a `.selected` class
    holding `iconButtonHighlightSvg` at opacity 1, reusing the existing `FireLineHighlightIcon`. No new
    art is required.
15. The first click logs **`FireLineFirstEndPlaced`** with `{ x, y, elevation }`, x and y normalized by
    `modelWidth` / `modelHeight`, matching the `SparkPlaced` payload convention.
16. Every cancel route logs **`FireLineCanceled`** with a `reason` field taking one of `"escape"`,
    `"toggle"`, `"toolSwitch"`, `"start"`, or `"other"`. The first four match the departure routes in
    requirement 10; `"other"` is emitted by the requirement 10 reaction backstop when it fires for a
    route not covered by an explicit call site, and its appearance in collected data should be treated
    as a signal that a route was missed. When an endpoint had been placed, the payload also carries
    `{ x, y, elevation }` for the discarded endpoint, normalized as in requirement 15; when the tool
    was armed but no endpoint was placed, those fields are omitted and the event still fires. The
    requirement 13 too-short rejection is **not** logged: it is a no-op click, and logging every
    rejected click would be noise.

## Technical Notes

### Files involved

| File | Role |
|---|---|
| `src/components/view-3d/use-draw-fire-line-interaction.tsx` | The whole gesture. This is the file the story is about. |
| `src/components/view-3d/use-dragging.ts` | Supplies `startDragging` / window pointermove listeners. May become unused by the fire line path. |
| `src/components/view-3d/terrain.tsx` | Registers the interaction in its `interactions` array; is the raycast surface. |
| `src/components/use-custom-cursors.ts` | Maps `Interaction.DrawFireLine` to `url(fire-line-cursor.png) 32 64, crosshair`. Gains the requirement 2 handover to the marker. |
| `src/models/simulation.ts` | `addFireLineMarker`, `setFireLineMarker`, `limitFireLineLength`, `markFireLineUnderConstruction`, `canAddFireLineMarker`. |
| `src/models/ui.ts` | `Interaction` enum, `ui.dragging`. |
| `src/components/bottom-bar.tsx` | `handleFireLine`, `fireLineEnabled`. |
| `src/components/view-3d/fire-line-marker.tsx` | Renders and drags placed markers; contains the odd-count pairing hazard noted above. |
| `src/components/icon-button.tsx` / `icon-button.scss` | Default / hover / pressed / disabled states today. Gains the persistent `.selected` armed state. |

### Precedent in the codebase

`usePlaceSparkInteraction` and `useHelitackInteraction` are both single-click, stateless, and clear
`ui.interaction` in their `onPointerDown`. WM-29 makes the fire line the **first multi-step interaction
in the app**, so where the "first end is placed, waiting for the second" state lives is a new decision.
Note that it may not need a new field at all: `fireLineMarkers.length` already distinguishes the
states, and `canAddFireLineMarker` gates on `length < 2`.

### Performance

`getEventHandlers` carries an explicit warning that defining any handler triggers @react-three/fiber
raycasting with significant cost, which is why handlers are only wired for active interactions. A
pointer-move preview would raycast per move while the tool is armed. This is the same work the current
drag already does through `use-dragging.ts`, and the model is paused throughout, so the cost profile is
comparable rather than new. The difference is duration: a drag lasts as long as the button is held,
whereas an armed tool can sit waiting indefinitely.

### The half-placed state holds two markers, not one

Requirement 8 wants the preview to show the same live length clamping the drag shows today, and the
clamp lives in `setFireLineMarker`, which requires `fireLineMarkers[1]` to already exist so it can
move it. So the first click pushes **both** markers at the same point, exactly as today's
`onPointerDown` does, and pointer-move drags the second one via `setFireLineMarker(1, x, y)`.

A one-marker design can still satisfy requirement 4 (push, then immediately `setFireLineMarker(1, ...)`
to clamp on the second click) but it cannot give a *clamped preview*, so it fails requirement 8.

Knock-on: the "incomplete line" the requirement 10 cancel path clears is normally two markers plus a
drawn under-construction line, not one marker and nothing. A probe confirmed
`markFireLineUnderConstruction(start, end, false)` clears the preview to zero flagged cells. The
odd-marker case behind requirement 11 only arises if the implementation diverges from this, which is
why that guard stays as a backstop rather than being dropped.

### Enforcing the cancel invariant (requirement 10)

`ui.interaction` is written from 10 sites across 6 files with no common setter: `bottom-bar.tsx` (325,
340, 355, 362, 375), `use-draw-fire-line-interaction.tsx:40`, `use-helitack-interaction.ts:17`,
`use-place-spark-interaction.tsx:17` and `use-dragging-over-plane-interaction.ts` (44, 53). The last is
a *hover-out* handler, which nobody adding a tool later would think to audit for fire line cancel
behavior. Requiring each site to call the cancel path would make requirement 10 a convention that
decays as tools are added.

Prefer a MobX `reaction` on `ui.interaction` that invokes the cancel whenever it transitions away from
`DrawFireLine` leaving an incomplete line, so the invariant holds for writers that do not know it
exists. `reaction` with a stored disposer is already the pattern in this codebase: `bottom-bar.tsx:116`
(the WM-6 Hazbot pulse, disposed in `componentWillUnmount`) and `app.tsx:59`.

**Ordering hazard.** The cancel must run **before `buildStartReadingData()`** (`bottom-bar.tsx:295`),
not merely before `simulation.start()` (:311). The ordering there is:

```
295: const startData = simulation.buildStartReadingData();   // captures fireLineMarkers
297: configSnapshot.fireLineMarkers = startData.fireLineMarkers;
310: log("SimulationStarted", configSnapshot);
311: simulation.start();                                     // applyFireLineMarkers()
```

A cancel anywhere between 295 and 311 leaves the log reporting a two-marker fire line that `start()`
never builds, and that snapshot is exactly what `factor-variables.ts:200` and `sim-props.ts:211` read
via `(fireLineMarkers?.length ?? 0) >= 2`, so rulesets 45, 47 and 54 would count a fire line the
student abandoned. This is the mirror image of the phantom fire line: phantom in the researcher data
rather than in the terrain. Cancel at the top of the `else` branch, before any snapshot is built.

Separately, do not rely on reaction timing for this route. The `reaction` fires synchronously only
while the mutation happens outside a MobX action. `handleStart` is a plain arrow function today, so
`ui.interaction = null` would trigger the cancel immediately, but wrapping it in `action()` defers the
reaction to the end of the batch. Verified with a probe: outside an action the order is
`cancel then applyFireLineMarkers`; inside one it is `applyFireLineMarkers then cancel`. `handleStart`
should call the cancel path explicitly, with the reaction as the backstop for routes that forget.

### Camera rotation while armed

`enableRotate={!ui.dragging}` (`view-3d.tsx:206`), ungated by `cameraSettings` (that param gates only
`enablePan` at :207 and the FOV slider at :176), so students can rotate within the configured azimuth
and polar limits. Verified without any dev param: an idle view is byte-identical across 600 ms and a
plain terrain drag changes the rendered frame.

During today's fire line drag, `startDragging` sets `ui.dragging` on pointer down and rotation is
suppressed for the gesture. Under two-click, nothing is dragging between the clicks, so rotation stays
live and a press-and-drag both rotates and acts on pointer down, as Spark and Helitack already do.

This is not a regression. Measured on the current build, a rotate-drag with Fireline armed draws a
complete two-marker fire line (14 under-construction cells), whereas two-click places a single endpoint
that the rubber band then makes visible before the student commits the second. Not addressed here.
Making a drag mean "camera" and a click mean "placement" (place on pointer up below a small movement
threshold) would fix it properly for all four tools, and is a reasonable follow-up.

### Only one fire line icon during placement

`useCustomCursor` maps `Interaction.DrawFireLine` to `url(fire-line-cursor.png)`, and the moving second
marker draws the same art in the 3D scene. The two coincide under the pointer and read as one icon until
`limitFireLineLength` stops the marker at `maxFireLineLength` while the pointer keeps going, at which
point both are plainly visible. The drag gesture never showed this because `startDragging` set
`ui.dragging`, which `useCustomCursor` checks first, returning `"move"` for the whole gesture. Under
two-click nothing is dragging, so the check has to be on `ui.fireLinePlacementInProgress` instead. The
marker is the copy worth keeping: it is the real endpoint, it is what the clamp acts on, and it is what
the second click commits.

### `handleFireLine` must branch before it logs

`handleFireLine` unconditionally sets `ui.interaction = Interaction.DrawFireLine` and logs
`FireLineButtonClicked`. With requirement 9's toggle, a cancel click reaching that code would re-arm
the tool *and* double-count tool intent in LARA. Branch at the top: if
`ui.interaction === Interaction.DrawFireLine`, run the cancel path (which logs `FireLineCanceled` with
`reason: "toggle"`, per requirement 16) and return, without re-logging `FireLineButtonClicked`.

The neighboring `SimulationStopped` is already safe: its log is guarded by `wasRunning`, and the model
is paused by the first click, so `canonical-runs.ts` (which names `handleFireLine` as a
`SimulationStopped` source) sees nothing new.

### Generic `SimulationClicked` is not affected

`specs/WM-1-add-log-events.md` describes specific interaction clicks suppressing the generic
`SimulationClicked` "via a module-level flag". The shipped code no longer works that way:
`useSimulationClickedInteraction` is gated on `active: !ui.interaction`. Both of the new clicks land
while `DrawFireLine` is armed, so neither leaks a stray `SimulationClicked` and no new suppression
logic is required. The WM-1 description is stale, not the code.

### Testing

No existing test breaks: none of the six states in `cypress/e2e/bottom-bar-state-machine.cy.ts` arms
the tool, so relaxing `fireLineEnabled` is invisible to it, and `cypress/e2e/bottom-bar-visuals.cy.ts:112`
asserts highlight opacity only in the unarmed default state. But nothing covers the new behavior
either, and both defects this spec records were found by hand rather than by a test.
`src/components/view-3d/interaction-handler.test.ts` is the unit-test precedent for this area.

Cover at the model / hook level, where it is cheapest:

- the cancel path clears `fireLineMarkers` **and** leaves zero `isFireLineUnderConstruction` cells
  (requirement 10, the phantom fire line);
- `onDragEnd` with a missing partner marker returns without throwing (requirement 11, the crash);
- a second endpoint beyond `maxFireLineLength` is clamped (requirement 4), since `addFireLineMarker`
  does not clamp and only `setFireLineMarker` does;
- a second click within 1500 ft is ignored and the tool stays armed, measured as Euclidean distance
  (requirement 13).

Extend the two Cypress specs with the new armed state: enabled-while-armed in
`bottom-bar-state-machine.cy.ts`, and highlight opacity 1 while armed in `bottom-bar-visuals.cy.ts`
alongside the existing opacity-0 default assertion.

Also assert the new log events in `log-events.test.tsx`, which already mocks `log` and asserts
payloads:

- `FireLineFirstEndPlaced` fires on the first click with normalized `{ x, y, elevation }`
  (requirement 15);
- `FireLineCanceled` fires with the correct `reason` for each route: `"escape"`, `"toggle"`,
  `"toolSwitch"` (Helitack is the only tool reachable while armed today), and `"start"`;
- `FireLineCanceled` omits the coordinate fields when the tool was armed but no endpoint was placed,
  and still fires;
- `FireLineAdded` fires exactly once per completed line, on the second click.

The `"start"` case is worth asserting against the log payload rather than the model: it is the one that
must fire before `buildStartReadingData()` at `bottom-bar.tsx:295`, so the test should confirm that the
`SimulationStarted` payload's `fireLineMarkers` is empty when a placement was abandoned. That is the
regression test for the ordering hazard, where the model looks right and only the log is wrong.

## Scope

WM-29 as written asks only for the gesture change. Requirements 9 to 12 are inseparable from it:
two-click creates the half-placed state, and without them the story ships a reproducible crash and a
fire line built from an abandoned placement. Requirement 12 in particular is not the cosmetic tidy-up
it looks like; without it the cancel reaction never fires on the Start route and the incomplete line
reaches `applyFireLineMarkers()`. Requirement 14 (the armed button state) **is** separable and could
become a follow-up; the cost is weaker feedback that the tool is armed.

## Out of Scope

- The spark and helitack placement interactions.
- Dragging placed endpoints, and the `FireLineUpdated` event (requirement 5 is "unchanged", not "changed").
- `applyFireLineMarkers` and how fire lines affect fire spread. Start behavior is otherwise unchanged,
  with one exception: requirement 12 clears `ui.interaction` on Start.
- The bottom bar's pause-on-Fireline behavior and the Hazbot pulse interaction in `handleFireLine`.
- Fire line rendering on the graph (shipped separately in WM-30).
- Touch and multi-touch input. This story is specified for mouse and trackpad.
- Extending Escape-to-cancel to the Spark and Helitack tools. Worth doing for consistency, but it
  changes two tools outside this story. Flagged as a follow-up.
- Accessibility (keyboard, screen reader, contrast), per this repo's standing convention.
- `window.test.placeFireLineInZone`, which drives the model directly and bypasses this interaction
  entirely. Worth knowing it uses `addFireLineMarker` twice and so is itself unclamped, but changing it
  is not part of this story.

## Open Questions

### RESOLVED: Does a live preview line follow the cursor between the two clicks?

**Context**: Today the drag gives continuous feedback: you watch the dashed line stretch and watch it
stop growing when it hits the 15000 ft cap. The Jira text only says the icon reattaches to the cursor,
which does not say whether the line itself previews. This is the single biggest behavioral decision in
the story, and it interacts with requirement 4: without a preview the length clamp becomes invisible,
so a student who clicks far away either gets an endpoint somewhere they did not click, or gets a
rejected click, with no warning either way. `setFireLineMarker` already does everything a preview needs,
so this is a design call rather than a feasibility one.

**Options considered**:
- A) Full rubber band. On every pointer move between the clicks, the second endpoint tracks the cursor
  with the dashed preview and the live length clamp, identical to what the drag shows today. Highest
  fidelity to current feedback; costs a per-move raycast while armed.
- B) No preview. Nothing is drawn until the second click lands, then the dashed line appears. Simplest,
  and cheapest, but the length cap becomes a silent surprise.
- C) Preview the line but not the clamp: the line follows the cursor freely and is clamped only on the
  second click.

**Decision**: **A, full rubber band.** The deciding factor is the length cap, not aesthetics.
`maxFireLineLength` is 15000 ft against a 120000 ft map, so students hit it constantly; under B or C
the endpoint silently lands somewhere they did not click with no indication why, whereas under A the
line visibly refuses to grow and the rule teaches itself. The performance objection was measured and
rejected: `requestAnimationFrame` deltas were mean 16.68 ms / p95 16.8 ms both while armed-and-idle and
during 200 pointer moves that each recolored all 38400 cells, with no dropped frames. `setFireLineMarker`
already does the erase / move / clamp / redraw, so no new model code is required.

---

### RESOLVED: How does a student abandon the interaction after placing the first end?

**Context**: The drag gesture is self-terminating: releasing the mouse always ends it. Two clicks
create a mid-state with no exit. The Fireline button cannot serve as the escape hatch because
`fireLineEnabled` disables it while `DrawFireLine` is armed (verified live). There is no global
Escape key handler anywhere in the app today, so that route is new infrastructure rather than a
one-line change. This also determines whether the odd-marker crash hazard in
`FireLineMarkersContainer.onDragEnd` becomes reachable: any option that leaves one marker on the map
with `ui.interaction === null` makes it reachable and requires a guard there.

**Options considered**:
- A) Escape key cancels, removing the first marker and disarming the tool. Conventional, but needs a
  new key handler and a decision about what else Escape should do.
- B) Re-enable the Fireline button while armed so clicking it again toggles the tool off and clears the
  first marker. Keeps everything in the bottom bar and needs no new input handling.
- C) Clicking off the terrain (sky, or outside the canvas) cancels.
- D) No cancel at all. The student must place a second end, then drag the ends where they want, or
  press Reload. Smallest change, and arguably acceptable since a fire line is not destructive until
  Start, but it is a dead end in the UI.

**Decision**: **A and B together, plus a three-layer fix for the failures above.**

Escape and the Fireline toggle are complementary rather than redundant: the same cancel action offered
to keyboard and to mouse. The collision risk in A was investigated and is manageable. The coachmarks
`document` keydown handler is attached only while a coachmark is live and calls `preventDefault()` but
not `stopPropagation()`, so a wildfire listener would co-fire (reachable, since the Hazbot button stays
enabled while the tool is armed); guarding on `e.defaultPrevented` and
`ui.interaction === Interaction.DrawFireLine` resolves it. B needs no new input handling at all: drop
one clause from `BottomBar.fireLineEnabled` and branch in `handleFireLine`.

The fix is layered, and the layers are not interchangeable:

1. **Source.** One `cancelFireLinePlacement()` that clears `fireLineMarkers` **and** erases the
   under-construction cells via `markFireLineUnderConstruction(start, end, false)` (probe-verified to
   leave zero flagged cells). Escape, the Fireline toggle, the Helitack switch and Start all route
   through it. This is what prevents the phantom fire line; the crash is a side effect of fixing it.
2. **Backstop.** The partner-marker guard in `fire-line-marker.tsx` `onDragEnd`. With layer 1 in place
   this should be unreachable, which is exactly its role.
3. **Disarm on Start.** `handleStart` clears `ui.interaction`, closing the last route into the bad
   state and removing the existing oddity where a run resumes with a live placement cursor.

Scope note: Escape is wired for `DrawFireLine` only. Extending it to cancel Spark and Helitack would be
a consistency improvement but changes two tools this story does not cover, so it is listed as a
follow-up rather than done here.

---

### RESOLVED: What happens when the second click is too close to the first?

**Context**: `MIN_DIST` (1500 ft) exists today only to tell a real drag apart from an accidental click,
and it is what makes a plain click a no-op right now. Under two-click placement that job disappears,
but the underlying problem does not: two clicks in nearly the same place would create a degenerate fire
line one or two cells long. If `MIN_DIST` is kept as a rejection rule it now has a very different
user-visible meaning, because the student sees a click do nothing with no explanation.

**Options considered**:
- A) Keep the 1500 ft minimum. A too-close second click is ignored and the tool stays armed awaiting a
  valid second end.
- B) Drop the minimum. Any second click places the end, even a very short line. Simplest and most
  predictable, and a short fire line is a legitimate, if ineffective, student choice.
- C) Keep the minimum but treat a too-close second click as a cancel, clearing the first end.

**Decision**: **A, keep the 1500 ft minimum, and change the test from a square to a Euclidean radius.**

The deciding evidence is that a degenerate fire line is not harmless. A probe confirmed that two clicks
at the same point build one real `isFireLine` cell **and** set `lastFireLineTimestamp`, which makes
`canAddFireLineMarker` false for `fireLineDelay` = 1440, a full model day. Under the current drag
gesture a double-click is harmless because `MIN_DIST` rejects it and leaves the tool armed. Under
two-click placement a double-click *is* a complete fire line at a single point, so dropping the guard
(option B) would convert the commonest stray mouse action into a full-day tool lockout with no
explanation. Option C punishes the same slip by discarding the endpoint the student did place
deliberately, which is worse than doing nothing.

The rider: the guard today is `abs(dx) < 1500 && abs(dy) < 1500`, a square, so a 1980 ft diagonal is
rejected while a shorter 1600 ft axis-aligned line is accepted, whereas `limitFireLineLength` at the
other end of the same constraint uses Euclidean `dist()`. Since this code is being touched anyway,
make the minimum Euclidean so both ends of the range agree on what length means. The threshold stays
1500 ft (3 cells at the 500 ft `cellSize`; the cap is 15000 ft, or 30 cells).

Known gap, accepted: the ignored click is silent. The rubber-band preview gives partial cover, since
the student can see the line is tiny before committing, but there is no explicit "too short" signal.
Left as-is rather than inventing a visual treatment; raise with Michael if one is wanted.

---

### RESOLVED: Should the first click emit a log event?

**Context**: The analysis engine consumes the `Readings` event log, and `FireLineAdded` currently fires
once per completed fire line. Splitting placement into two steps creates a point in time that the log
cannot currently see: a student who places one end and hesitates, or abandons. Whether that is
pedagogically interesting is a question for the research side rather than the code.

**Options considered**:
- A) No new event. `FireLineAdded` on completion only, exactly as today. No ruleset is affected.
- B) Add a first-endpoint event, and a cancel event if cancel exists, so hesitation is visible to the
  Hazbot rulesets.

**Decision**: **B, add `FireLineFirstEndPlaced` and `FireLineCanceled`.**

*This decision reverses an earlier "A, no new event" call. The original reasoning was wrong in two
ways and is recorded here rather than deleted.*

The investigation behind A was sound as far as it went: no ruleset consumes `FireLineAdded`.
`translate.ts` has no case for it, so it falls through to `{ kind: "no-op" }`, and fire line detection
is entirely snapshot-based via `factor-variables.ts:200` and `sim-props.ts:211`, both testing
`(reading.fireLineMarkers?.length ?? 0) >= 2` against the `SimulationStarted` reading. The *conclusion*
drawn from it did not follow:

1. **"Nothing consumes it" proves too much.** `FireLineButtonClicked` is already an unconsumed intent
   event with no case in `translate.ts`. The codebase's convention is to log student intent regardless
   of ruleset consumption, so A applied a standard to new events that the existing ones do not meet.
2. **The reversibility asymmetry was backwards.** Noise is trivially filtered at analysis time; a
   semester of sessions with no record of hesitation is unrecoverable. For research software under
   AP-80 (Behavior-based Help Overlays), that is the wrong risk to accept.
3. **The Q2 cancel decision opened a hole that A then declined to fill.** A silent cancel leaves
   `FireLineButtonClicked` with no `FireLineAdded` after it, ambiguous across four different outcomes:
   cancelled deliberately, switched to Helitack, pressed Start, or armed and never clicked.

Two-click also makes "placed one end and stopped" a state that could not exist under the drag gesture,
so this is instrumenting a genuinely new behavior, not speculative logging.

Verified free to add: there is no event-name registry or allowlist (`log(name, data)` takes a free-form
string), `log-events.test.tsx` asserts specific events against a mocked `log` rather than an exhaustive
list, and `translate.ts`'s `default: no-op` means no ruleset is affected. Naming follows the repo's
PascalCase convention, with American spelling ("Canceled", one L).

Together these give an analyzable funnel: `FireLineButtonClicked` -> `FireLineFirstEndPlaced` ->
`FireLineAdded`, with `FireLineCanceled` as the labeled exit. `FireLineFirstEndPlaced` was chosen over
`FireLineStarted` because the latter sits too close in meaning to `FireLineButtonClicked` ("armed the
tool" vs "placed the first end").

Still worth raising with Trudi as a note: whether abandonment is pedagogically interesting enough to
warrant a ruleset reading these events. The events being present does not commit anyone to using them.

---

### RESOLVED: Is there a Zeplin artboard or other design guidance for this interaction?

**Context**: The Zeplin MCP server is available, but no Zeplin URL was supplied with this story and the
Jira ticket has no attachments. The existing cursor art (`src/assets/interactions/fire-line-cursor.png`,
hotspot 32 64) and the marker art already exist and appear sufficient, so this may genuinely be a
behavior-only change with no new visual spec. Worth confirming before implementation rather than after,
particularly if the preview line above gets any new treatment.

**Options considered**:
- A) No design assets needed. Reuse the existing cursor and marker art as-is.
- B) There is a Zeplin screen for this interaction; supply the URL and it will be fetched into this spec.

**Decision**: **A, no new design assets; reuse the existing highlight art for the armed state.**

Verified in Zeplin rather than assumed: all 80 screens of the Portal / LARA project were listed and the
wildfire artboards are WM-8, WM-14, WM-23, WM-24, WM-25, WM-26, the Hazbot coach mark overlay and two
"Updated Wildfire" screens. **There is no WM-29 artboard** and nothing covering map placement
interactions. The art this story needs already exists and is already wired: `fire-line-cursor.png`
(hotspot 32 64), the `Fireline Marker` group on WM-24, and the marker / highlight PNGs under
`src/assets/interactions/`.

The gap this story does create is a consequence of the Q2 toggle. WM-24 defines exactly three Fireline
button states (`Fireline ICON`, `Fireline Highlight`, `Fireline ICON Disabled`) and `IconButton`
matches: default (highlight opacity 0), hover (0.5), pressed (1), disabled (grayscale + 0.35). There is
**no persistent selected / armed state**. Today "armed" is signaled by disabling the button; once it is
re-enabled to act as the cancel toggle, an armed button looks identical to an idle one and nothing
suggests that clicking it again cancels.

Resolution: give the armed button a persistent `.selected` class holding `iconButtonHighlightSvg` at
opacity 1, which is precisely the treatment the CSS already applies on `:active`. It reuses
`FireLineHighlightIcon`, which already ships and is already passed to the button, so it needs no new
assets. Flag it to Michael for confirmation but do not block on it: if he wants something different it
is a CSS change against a class that will already exist.

Deliberately not decided here: whether Spark and Helitack should get the same selected state for
consistency. They have the same armed-with-no-indication behavior, but changing them is outside this
story.

## Self-Review

### Senior Engineer

#### RESOLVED: SE1 — Requirement 12 directly contradicts the Out of Scope list
Out of Scope says "`applyFireLineMarkers` / Start behavior" is excluded, while requirement 12 changes
Start behavior by clearing `ui.interaction`. One of the two has to give. Since requirement 12 was
adopted deliberately as layer 3 of the Q2 fix, the Out of Scope entry is the stale one, but leaving
both in place means an implementer can cite the spec to justify either choice.

**Resolution**: Out of Scope narrowed to `applyFireLineMarkers` and the fire spread model, with
requirement 12 named as the single deliberate exception to "Start behavior is otherwise unchanged".

---

#### RESOLVED: SE2 — Requirement 10 states an invariant with no enforcement point
"Every departure from `DrawFireLine` with an incomplete line routes through the cancel path" is stated
as a rule but not as a mechanism. `ui.interaction` is a plain observable written from **10 sites across
6 files** (`bottom-bar.tsx` x5, `use-draw-fire-line-interaction.tsx`, `use-helitack-interaction.ts`,
`use-place-spark-interaction.tsx`, `use-dragging-over-plane-interaction.ts` x2) with no setter to funnel
through. Requiring each call site to remember to cancel is exactly the kind of rule that holds at merge
and rots later. Note `use-dragging-over-plane-interaction.ts:53` sets `ui.interaction = null` from a
*hover-out* handler, a writer nobody would think to audit. A MobX `reaction` on `ui.interaction` that
fires the cancel whenever it transitions away from `DrawFireLine` with an incomplete line would make
the invariant structural rather than conventional.

**Resolution**: requirement 10 stays behavioral; the mechanism is recorded under Technical Notes,
"Enforcing the cancel invariant (requirement 10)", including the `reaction` precedent already in
`bottom-bar.tsx:116` and `app.tsx:59`.

---

#### RESOLVED: SE3 — The rotate-drag collision is worse for a two-click tool than the note admits
The Camera rotation note argues the collision is acceptable because Spark and Helitack already act on
pointer down while armed. That understates it. Spark and Helitack are single-click: one accidental
rotate-drag places one object and disarms the tool, so the mistake is self-limiting and obvious. Under
two-click placement, a student who rotates the camera twice while the tool is armed places *both*
endpoints and draws a complete fire line they never intended, each drag also moving the camera so the
map no longer looks the way it did. The mistake compounds instead of terminating.

**Resolution**: **finding withdrawn.** It compared against an idealized baseline rather than the
measured one. On the current build a rotate-drag with Fireline armed draws a *complete* fire line, so
two-click (one visible endpoint per drag) is an improvement, not a regression. The Camera rotation note
was corrected for accuracy instead: rotation is ungated by `cameraSettings`, and it is `ui.dragging`,
set by `startDragging`, that suppresses rotation during today's drag.

---

### QA Engineer

#### RESOLVED: QA1 — No test strategy, for a story whose two worst defects were found by manual probing
Both the crash and the phantom fire line were found by driving the running app, not by any test. The
spec notes that `interaction-handler.test.ts` exists and that Cypress does not cover fire line
placement, then stops. Requirements 10 to 13 are precisely the behaviors that will silently regress.
The spec should name what gets a regression test (the cancel invariant, the missing-partner guard, the
Euclidean minimum, the clamp on the second click) and at which level.

**Resolution**: Testing note rewritten with the four model-level cases, the two Cypress specs to
extend, and the verified fact that no existing test breaks.

---

### Product Manager

#### RESOLVED: PM1 — Half the requirements are discovered work, not what WM-29 asked for
WM-29 asks for one thing: replace click-hold-drag with two clicks. Requirements 10, 11, 12 and 14 are
all things this investigation turned up. Some are inseparable from the change (10 and 11 exist only
because two-click creates the half-placed state), but 12 changes Start for every tool and 14 adds a
button state to the design system. On a story marked **Low** priority, someone other than the
implementer should decide whether those ship here or split into follow-ups.

**Resolution**: separability checked rather than assumed. 9, 10 and 11 are inseparable. 12 is *also*
inseparable (it is the trigger that closes the Start route, not a tidy-up). Only 14 can be split. A
Scope section now records this, and the MobX ordering hazard uncovered while checking it is recorded
under the cancel-invariant Technical Note.

---

### Student

#### RESOLVED: ST1 — Requirement 9 does not say whether cancel disarms the tool or only clears the endpoint
"Both cancel the placement" is ambiguous between two materially different behaviors: (a) clear the
first endpoint but stay armed, so the next click starts a new fire line, or (b) clear the endpoint and
disarm entirely, cursor back to default. The button toggle strongly implies (b), since clicking a
toggle off should turn the tool off, while Escape could reasonably mean either. Leaving both readings
open guarantees the two affordances get implemented inconsistently.

**Resolution**: (b). Both affordances disarm completely. Requirement 9 now says so explicitly and
distinguishes cancel from the requirement 13 rejection, which stays armed. After a cancel,
`canAddFireLineMarker` is true again so the button re-enables with no extra work.

---

### Education Researcher

#### RESOLVED: ER1 — Cancelling re-logs `FireLineButtonClicked`, making tool-intent counts ambiguous
`handleFireLine` logs `FireLineButtonClicked` unconditionally. Once requirement 9 re-enables the button
as a cancel toggle, the cancel click runs the same handler and emits a second `FireLineButtonClicked`,
so "student attempted a fire line" is double-counted in LARA. Verified that the neighboring risk does
*not* occur: `simulation.stop()` is guarded by `wasRunning`, and the model is already paused by the
first click, so no spurious second `SimulationStopped` reaches `canonical-runs.ts`. The event is a
no-op in `translate.ts`, so no ruleset breaks; the cost is researcher log clarity only.

**Resolution**: `handleFireLine` branches at the top (Technical Notes, "`handleFireLine` must branch
before it logs"). Without the branch the cancel click would also *re-arm* the tool, so the branch is
required for correctness, not only for logging hygiene. The cancel path logs `FireLineCanceled` with
`reason: "toggle"` rather than nothing, following the reversal of the Q4 decision.

## Self-Review (second pass)

### Senior Engineer

#### RESOLVED: SE4 — "Cancel before `simulation.start()`" is too late; it must precede `buildStartReadingData()`
The cancel-invariant note says `handleStart` should call the cancel path "before `simulation.start()`".
The actual ordering in `bottom-bar.tsx` makes that insufficient:

```
295: const startData = simulation.buildStartReadingData();   // captures fireLineMarkers
297: configSnapshot.fireLineMarkers = startData.fireLineMarkers;
310: log("SimulationStarted", configSnapshot);
311: simulation.start();                                     // applyFireLineMarkers()
```

Cancelling anywhere between 295 and 311 satisfies the note yet still corrupts the data: the snapshot
already captured the abandoned markers at 295, so `SimulationStarted` at 310 reports a two-marker fire
line, while the cancel has emptied `fireLineMarkers` so `start()` at 311 builds nothing. The run then
has **no** fire line but the log says it had one. Worse, that snapshot is exactly what
`factor-variables.ts:200` and `sim-props.ts:211` read via `(fireLineMarkers?.length ?? 0) >= 2`, so
rulesets 45, 47 and 54 would classify the student as having used a fire line they abandoned. This is
the mirror image of the phantom fire line: phantom in the log rather than in the terrain.

**Resolution**: the ordering-hazard note now specifies cancelling at the top of the `else` branch,
before `buildStartReadingData()` at :295, and retains the MobX action/reaction timing caveat.

---

#### RESOLVED: SE5 — Requirement 16 is undefined in two reachable states
(a) **No endpoint placed yet.** Requirement 9 re-enables the Fireline button while armed, so the
student can arm the tool and immediately click the button again with zero markers placed. Requirement
16 specifies a payload containing "the discarded endpoint", which does not exist in that state.
(b) **The reaction backstop.** Requirement 10's `reaction` exists precisely to catch departure routes
that nobody anticipated, but a route nobody anticipated has no `reason` string to report, and
requirement 16 enumerates exactly four.

**Resolution**: requirement 16 now logs the event in both states. Coordinates are omitted when no
endpoint was placed (skipping the log entirely would recreate the ambiguity that justified the event),
and `"other"` is added to the enum so the backstop can report that it fired for an uncovered route.

---

### QA Engineer

#### RESOLVED: QA2 — The Testing note predates requirements 15 and 16
The test list was written when the spec had no new log events. It covers the cancel invariant, the
missing-partner guard, the clamp and the Euclidean minimum, but nothing asserts that
`FireLineFirstEndPlaced` and `FireLineCanceled` fire, carry the right payloads, or that the `reason`
field is correct per route. `log-events.test.tsx` already mocks `log` and asserts specific events, so
it is the natural home and the pattern already exists.

**Resolution**: Testing note extended with the four log-event cases, including the `"start"` route
asserted against the `SimulationStarted` payload as the regression test for the ordering hazard.
