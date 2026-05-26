# Implementation Plan: Bottom-Bar Controls State Machine

**Jira**: https://concord-consortium.atlassian.net/browse/WM-24
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **Ready for Implementation**

## Implementation Plan

The plan ships in seven commits, each independently reviewable and (almost
all) green on CI in isolation. The exception is the bottom-bar rewrite
(step 5), which must land together with its test rewrite — see step 5's
Summary for the ordering rationale.

The steps build bottom-up from the model layer (steps 1-3) → wizard (step
4) → component (step 5) → CSS (step 6) → browser-level integration test
(step 7). Each step references the requirement numbers from
[requirements.md](requirements.md) it implements.

### Add `setupChanged` observable to `SimulationModel`

**Summary**: Foundational state-tracking observable. Set by the wizard's
Create handler in step 4. Reset to `false` by `reload()` (not by `restart()`,
so customizations survive Restart). Lands before any consumer so the
observable exists when the wizard and bottom-bar pick it up. Implements the
`setupChanged` data definition from Requirement 2 and the lifecycle rules
from the non-functional / scope requirements ("`restart()` does NOT reset
`setupChanged`" / "`reload()` DOES reset `setupChanged` to false").

**Files affected**:
- [src/models/simulation.ts](../../src/models/simulation.ts) — new
  `@observable setupChanged` + `@action.bound setSetupChanged`; `reload()`
  resets it
- [src/models/simulation.test.ts](../../src/models/simulation.test.ts) —
  lifecycle tests

**Estimated diff size**: ~50 lines

**Changes**:

In [src/models/simulation.ts](../../src/models/simulation.ts), add the
observable near the existing observables block (around line 53-58):

```ts
@observable public setupChanged = false;
```

Add an action setter near the existing `@action.bound` setters (around line
538):

```ts
// Symmetric setter. `applyAndClose` (terrain-panel.tsx) passes `true` to
// record a user customization. `reload()` writes the field directly as
// part of a larger reset that also clears sparks/engine/cells, so it
// bypasses the setter. Tests that need to reset the flag *without* the
// full reload (e.g. the stale-snapshot canary in Step 4 case (h), which
// must keep `simulation.zones` live to exercise the snapshot-refresh
// path) call this setter with `false` to stay inside an `@action.bound`.
@action.bound public setSetupChanged(value: boolean) {
  this.setupChanged = value;
}
```

Modify `reload()` at
[simulation.ts:268-273](../../src/models/simulation.ts#L268-L273) to reset
the flag. The existing body calls `this.restart()` first; since
`setupChanged` survives `restart()` by design, the reset must happen
**after** that call (or independently, since `restart()` doesn't touch it):

```ts
@action.bound public reload() {
  this.restart();
  this.setupChanged = false;
  // Reset user-controlled properties too.
  this.setInputParamsFromConfig();
  this.populateCellsData();
}
```

`restart()` at
[simulation.ts:242-266](../../src/models/simulation.ts#L242-L266) is **not**
changed — it must preserve `setupChanged` per Requirement 6 and the explicit
"`restart()` does NOT reset `setupChanged`" non-functional requirement.

In [src/models/simulation.test.ts](../../src/models/simulation.test.ts), add
two new tests at the end of the top-level `describe("SimulationModel", ...)`
block. They reuse the existing minimal-config pattern (e.g. the test at
[simulation.test.ts:151-167](../../src/models/simulation.test.ts#L151-L167)
shows the shape):

```ts
it("restart() preserves setupChanged", async () => {
  const sim = new SimulationModel({
    modelWidth: 100000,
    modelHeight: 100000,
    gridWidth: 5,
    sparks: [[50000, 50000]],
    zoneIndex: [[0]],
    elevation: [[0]],
    unburntIslands: [[1]],
    unburntIslandProbability: 1,
    riverData: null,
  });
  await sim.dataReadyPromise;
  sim.setSetupChanged(true);
  sim.restart();
  expect(sim.setupChanged).toBe(true);
});

it("reload() resets setupChanged to false", async () => {
  const sim = new SimulationModel({
    modelWidth: 100000,
    modelHeight: 100000,
    gridWidth: 5,
    sparks: [[50000, 50000]],
    zoneIndex: [[0]],
    elevation: [[0]],
    unburntIslands: [[1]],
    unburntIslandProbability: 1,
    riverData: null,
  });
  await sim.dataReadyPromise;
  sim.setSetupChanged(true);
  sim.reload();
  await sim.dataReadyPromise;
  expect(sim.setupChanged).toBe(false);
});
```

---

### Add `simulationEnded` computed to `SimulationModel`

**Summary**: The discriminator that separates user-Stop (Paused) from
fire-finished-naturally (Ended). Building block for the per-button computeds
in step 3. The reactivity contract — `simulationRunning` carries the edge,
`engine?.fireDidStop` is a discriminator read only — is locked in by a
reactivity-level test in this step (option A from Requirement
"simulationEnded reactivity contract"). Implements the `simulationEnded`
computed from Technical Notes and its value + reactivity tests from the
non-functional requirements.

**Files affected**:
- [src/models/simulation.ts](../../src/models/simulation.ts) — new
  `@computed get simulationEnded`
- [src/models/engine/fire-engine.ts](../../src/models/engine/fire-engine.ts)
  — one-line documentation comment on the `fireDidStop` field (line 95)
  pointing future direct-readers at `simulation.simulationEnded` for
  reactivity. No behavior change
- [src/models/simulation.test.ts](../../src/models/simulation.test.ts) —
  five-state value truth table + one reactivity test

**Estimated diff size**: ~95 lines

**Changes**:

In [src/models/simulation.ts](../../src/models/simulation.ts), add the
computed near the existing `@computed get` cluster (after `canUseHelitack`
at line 127):

```ts
// True when simulationStarted && !simulationRunning && engine.fireDidStop.
// Reactivity contract: simulationRunning carries the edge — engine?.fireDidStop
// is a discriminator read only. The supported tick() path flips both
// (simulation.ts:315-317), so the computed re-evaluates when expected. Future
// refactorers: do not rely on fireDidStop driving reactivity directly.
@computed public get simulationEnded() {
  return this.simulationStarted && !this.simulationRunning && !!this.engine?.fireDidStop;
}
```

In [src/models/engine/fire-engine.ts](../../src/models/engine/fire-engine.ts),
add a one-line comment above the `fireDidStop` field declaration at line
95 so future direct-readers find the reactivity contract at the field
itself (the comment in `simulation.ts` only helps readers already inside
`simulation.ts`). `app.tsx:61-64` already reads `fireDidStop` directly,
but does so safely inside a MobX `reaction` whose dependency function
*also* reads `simulationRunning` — that pairing is what makes the read
reactive. A future consumer that drops the `simulationRunning` companion
read would silently lose reactivity:

```ts
// Read via `simulation.simulationEnded` for reactivity. Direct reads on
// this field do not participate in MobX observation — see the
// reactivity-contract comment on `simulation.simulationEnded` in
// simulation.ts. The one existing direct-reader (app.tsx:61-64) pairs
// this read with a `simulationRunning` read inside a MobX `reaction`
// dependency function; that pairing is load-bearing for reactivity.
public fireDidStop = false;
```

In [src/models/simulation.test.ts](../../src/models/simulation.test.ts), add
a new `describe("simulationEnded", ...)` block at the end of the top-level
`describe("SimulationModel", ...)`:

```ts
describe("simulationEnded", () => {
  const createSim = () => new SimulationModel({
    modelWidth: 100000,
    modelHeight: 100000,
    gridWidth: 5,
    sparks: [[50000, 50000]],
    zoneIndex: [[0]],
    elevation: [[0]],
    unburntIslands: [[1]],
    unburntIslandProbability: 1,
    riverData: null,
  });

  it("is false pre-start (simulationStarted=false)", async () => {
    const sim = createSim();
    await sim.dataReadyPromise;
    expect(sim.simulationEnded).toBe(false);
  });

  it("is false while Running", async () => {
    const sim = createSim();
    await sim.dataReadyPromise;
    sim.start();
    try {
      expect(sim.simulationStarted).toBe(true);
      expect(sim.simulationRunning).toBe(true);
      expect(sim.simulationEnded).toBe(false);
    } finally {
      // start() schedules a real rAF loop (simulation.ts:235). Tests #3-5
      // below call tick() which flips simulationRunning=false and lets
      // the loop self-terminate; this test asserts mid-Running and would
      // otherwise leave the rAF loop scheduling itself across tests.
      // Stop the sim to flip simulationRunning=false so the next rAF
      // callback no-ops. Any new test added here that calls start()
      // without an organic stop/tick path should do the same.
      sim.stop();
    }
  });

  it("is false in user-Pause sub-state (Stop pressed, engine not finished)", async () => {
    const sim = createSim();
    await sim.dataReadyPromise;
    sim.start();
    sim.stop();
    // engine kept around, fireDidStop is still false
    expect(sim.simulationStarted).toBe(true);
    expect(sim.simulationRunning).toBe(false);
    expect(sim.engine?.fireDidStop).toBe(false);
    expect(sim.simulationEnded).toBe(false);
  });

  it("is true when fire finishes naturally (fireDidStop flips inside tick)", async () => {
    const sim = createSim();
    await sim.dataReadyPromise;
    sim.start();
    // Drive the supported tick() path that flips both simulationRunning=false
    // and engine.fireDidStop=true. The real FireEngine.updateFire() unconditionally
    // resets fireDidStop=true at line 162 then flips it back to false for any
    // burning cell (line 167) — so a manually-set fireDidStop is overwritten
    // before tick()'s post-updateFire check reads it. Stub updateFire to a no-op
    // that preserves the manual flip; tick() then sees fireDidStop===true and
    // flips simulationRunning=false (simulation.ts:315-316), producing the
    // simulationEnded=true edge.
    (sim.engine as any).updateFire = function () { this.fireDidStop = true; };
    sim.tick(1);
    expect(sim.simulationEnded).toBe(true);
  });

  it("is false after Restart (engine nulled, simulationStarted=false)", async () => {
    const sim = createSim();
    await sim.dataReadyPromise;
    sim.start();
    // Same updateFire stub as above — preserves the manual fireDidStop flip
    // through tick(), since the real updateFire would otherwise overwrite it.
    (sim.engine as any).updateFire = function () { this.fireDidStop = true; };
    sim.tick(1);
    expect(sim.simulationEnded).toBe(true);
    sim.restart();
    expect(sim.engine).toBeNull();
    expect(sim.simulationStarted).toBe(false);
    expect(sim.simulationEnded).toBe(false);
  });

  it("reactivity contract: observers re-fire when simulationEnded flips on natural fire completion", async () => {
    const { reaction } = await import("mobx");
    const sim = createSim();
    await sim.dataReadyPromise;
    // Timing-sensitive: do NOT insert awaits between `sim.start()` and the
    // `updateFire` stub three lines down. start() schedules a real rAF
    // callback (simulation.ts:235). In jsdom rAF is async, so the callback
    // can't fire before this synchronous block completes — but an await
    // would yield to the rAF callback, which could call the *real*
    // updateFire and flip simulationEnded *before* the reaction is set up.
    // If you need an await here, swap start() for a manual engine +
    // observable setup that doesn't schedule rAF.
    sim.start();

    const seen: boolean[] = [];
    const dispose = reaction(
      () => sim.simulationEnded,
      (value) => { seen.push(value); }
    );

    // Drive the supported tick() path: stub updateFire so the manual
    // fireDidStop flip survives (real updateFire resets fireDidStop at
    // fire-engine.ts:162 and recomputes it from cell state), then call
    // tick() to flip simulationRunning=false. The reaction must observe
    // the resulting simulationEnded=true.
    (sim.engine as any).updateFire = function () { this.fireDidStop = true; };
    sim.tick(1);

    expect(seen).toContain(true);
    dispose();
  });
});
```

The reactivity test is the regression guard for the "Reactivity contract"
comment in the implementation: a future change that flipped `fireDidStop`
without also flipping `simulationRunning` would leave the value-only tests
passing but break this one (the `reaction` would not fire).

---

### Add per-button `@computed` properties on `SimulationModel`

**Summary**: The four pure-simulation predicates that drive button state in
the bottom bar: `setupEnabled`, `startEnabled`, `reloadEnabled`,
`restartEnabled`. These compose the existing observables (`simulationStarted`,
`simulationRunning`, `setupChanged`, `sparks.length`) with the new
`simulationEnded` computed from step 2. The three cross-store predicates
(`sparkEnabled`, `fireLineEnabled`, `helitackEnabled`) live on the
`BottomBar` component, not here — they need to read `ui.interaction` which
is on a different store. Step 5 wires those up.

Implements Technical Notes' "New `@computed` properties" — the
SimulationModel half — plus the `reloadEnabled` edge-case tests from the
non-functional requirements.

**Files affected**:
- [src/models/simulation.ts](../../src/models/simulation.ts) — four new
  `@computed` getters
- [src/models/simulation.test.ts](../../src/models/simulation.test.ts) —
  `reloadEnabled` edge cases

**Estimated diff size**: ~120 lines

**Changes**:

In [src/models/simulation.ts](../../src/models/simulation.ts), add the four
computeds after `simulationEnded` from step 2. Lifecycle mapping (using the
seven-state matrix from the requirements):

- `setupEnabled`: states 1, 2, 3, 6, 7 (anywhere `simulationStarted === false`).
- `startEnabled`: states 3, 4, 6, 7-if-spark-placed. False in 1, 2, 5.
  Reads as: `ready && !simulationEnded` (where `ready` already means
  `dataReady && sparks.length > 0`). Note: in Running/Paused the button
  shows Stop and is enabled — handled by reading `ready && !simulationEnded`
  (true throughout Running/Paused), with the label flipping based on
  `simulationRunning` as today.
- `reloadEnabled`: `setupChanged || sparks.length > 0`. (Independent of
  `simulationStarted`.)
- `restartEnabled`: `simulationStarted` (true in states 4, 5; false in 1,
  2, 3, 6, 7).

```ts
@computed public get setupEnabled() {
  return !this.simulationStarted;
}

@computed public get startEnabled() {
  return this.ready && !this.simulationEnded;
}

@computed public get reloadEnabled() {
  return this.setupChanged || this.sparks.length > 0;
}

@computed public get restartEnabled() {
  return this.simulationStarted;
}
```

Note on `startEnabled` vs. the existing `simulation.ready`: the current
bottom-bar uses `disabled={!simulation.ready}` for Start. The new
`startEnabled` is `ready && !simulationEnded` — it tightens the rule by
also disabling Start in the Ended state (Requirement 5). In states 1, 2
(no spark yet), `ready` is false so `startEnabled` is also false, matching
the spec. In states 3, 6 (spark placed, sim not yet run), `ready` is true
and `simulationEnded` is false → `startEnabled` true. In state 4 (Running
or Paused), `ready` stays true and `simulationEnded` is false →
`startEnabled` true (the label/icon flip to Stop while
`simulationRunning === true`, handled in the component). In state 5
(Ended), `simulationEnded` is true → `startEnabled` false, matching the
spec.

In [src/models/simulation.test.ts](../../src/models/simulation.test.ts), add
a new `describe("reloadEnabled", ...)` block at the end of the top-level
describe. The three edge cases from the non-functional requirements
("`setupChanged=true, sparks=0`" etc.):

```ts
describe("reloadEnabled", () => {
  const createSim = () => new SimulationModel({
    modelWidth: 100000,
    modelHeight: 100000,
    gridWidth: 5,
    sparks: [],  // start with no sparks
    zoneIndex: [[0]],
    elevation: [[0]],
    unburntIslands: [[1]],
    unburntIslandProbability: 1,
    riverData: null,
  });

  it("is false when setupChanged=false and no sparks (Default)", async () => {
    const sim = createSim();
    await sim.dataReadyPromise;
    expect(sim.setupChanged).toBe(false);
    expect(sim.sparks.length).toBe(0);
    expect(sim.reloadEnabled).toBe(false);
  });

  it("is true when setupChanged=true and no sparks", async () => {
    const sim = createSim();
    await sim.dataReadyPromise;
    sim.setSetupChanged(true);
    expect(sim.sparks.length).toBe(0);
    expect(sim.reloadEnabled).toBe(true);
  });

  it("is true when setupChanged=false and at least one spark", async () => {
    const sim = createSim();
    await sim.dataReadyPromise;
    sim.addSpark(50000, 50000);
    expect(sim.setupChanged).toBe(false);
    expect(sim.sparks.length).toBeGreaterThan(0);
    expect(sim.reloadEnabled).toBe(true);
  });
});
```

Direct unit tests for `setupEnabled` / `startEnabled` / `restartEnabled`
are not added here — they are exercised transitively by the seven-state
bottom-bar matrix in step 5. Per the non-functional requirement: "direct
unit coverage here is optional unless a predicate has a non-trivial gate
(e.g. `reloadEnabled`'s OR of `setupChanged` and `sparks.length > 0`)".

---

### Wire `setupChanged` from the setup wizard

**Summary**: The load-bearing piece for the Reload-on-customization
behavior. Capture a snapshot of the simulation's tracked fields when the
wizard opens (via `useRef`, not `useState` — the snapshot doesn't drive
visible UI). On Create, diff the local wizard state against that snapshot
**before** the existing `simulation.*` mutators run — computing the diff
post-mutate would always see an empty diff. If the diff is non-empty for
any of `zonesCount`, per-zone `terrainType` / `vegetation` / `droughtLevel`,
`windSpeed`, or `windDirection`, call `simulation.setSetupChanged(true)`.

Implements Requirement 2 (definition of "Setup changed"), Technical Notes'
`setupChanged` bullet ("Diff timing" + "Snapshot storage" clauses), and the
eight `terrain-panel.test.tsx` test cases (a)-(h) from the non-functional
requirements.

**Files affected**:
- [src/components/setup-snapshot.ts](../../src/components/setup-snapshot.ts)
  — **new file**. Exports `ISetupSnapshot`, `captureSimulationSnapshot`,
  and `setupSnapshotDiffers`. Extracted out of `terrain-panel.tsx` so
  the diff helper is importable by `setup-snapshot.test.ts` for the
  wind-direction unit-test coverage promised by RESOLVED "Wind /
  zonesCount test ergonomics"
- [src/components/setup-snapshot.test.ts](../../src/components/setup-snapshot.test.ts)
  — **new file**. Synthetic-snapshot unit tests covering each tracked
  field (drought / vegetation / terrainType per-zone, windSpeed,
  `windDirection`, zonesCount) plus a baseline "identical snapshots
  return false" test. See RESOLVED "Wind / zonesCount test ergonomics"
  for the direction-test sketch
- [src/components/terrain-panel.tsx](../../src/components/terrain-panel.tsx)
  — import the helpers from `./setup-snapshot`; open-time snapshot via
  `useRef`; diff-on-Create in `applyAndClose`; add
  `data-testid="terrain-panel-close"` to the X-close `<div>` at
  [terrain-panel.tsx:195](../../src/components/terrain-panel.tsx#L195)
- [src/components/wind-circular-control.tsx](../../src/components/wind-circular-control.tsx)
  — wrap the speed `<Slider>` at
  [wind-circular-control.tsx:76-91](../../src/components/wind-circular-control.tsx#L76-L91)
  in a `data-testid="wind-speed-slider"` div (matching the drought-slider
  pattern). Direction is **not** wired for DOM-driven tests — see RESOLVED
  "Wind / zonesCount test ergonomics" Open Question for why (no `<input>`
  on the custom `<WindDial>` SVG) and the unit-test fallback that covers
  direction via the extracted `setupSnapshotDiffers` helper
- [src/components/terrain-panel.test.tsx](../../src/components/terrain-panel.test.tsx)
  — eight new test cases (a)-(h). Case (g) drives the zones-count
  RadioGroup via `container.querySelector('input[type="radio"][value="3"]')`
  — no `zones-count-selector.tsx` change needed (see RESOLVED "Wind /
  zonesCount test ergonomics")

**Estimated diff size**: ~290 lines

**Changes**:

Create [src/components/setup-snapshot.ts](../../src/components/setup-snapshot.ts)
with the snapshot type and helpers. Extraction rationale lives in
RESOLVED "Wind / zonesCount test ergonomics" — direction needs unit
coverage that imports the helper, so it must be exportable from a
separate module rather than living as a private const in
`terrain-panel.tsx`:

```ts
import { Zone } from "../models/zone";

export interface ISetupSnapshot {
  zonesCount: number;
  zones: Array<{ terrainType: number; vegetation: number; droughtLevel: number }>;
  windSpeed: number;
  windDirection: number;
}

export const captureSimulationSnapshot = (simulation: { zones: Zone[]; wind: { speed: number; direction: number } }): ISetupSnapshot => ({
  zonesCount: simulation.zones.length,
  zones: simulation.zones.map(z => ({
    terrainType: z.terrainType,
    vegetation: z.vegetation,
    droughtLevel: z.droughtLevel,
  })),
  windSpeed: simulation.wind.speed,
  windDirection: simulation.wind.direction,
});

export const setupSnapshotDiffers = (
  snapshot: ISetupSnapshot,
  current: { zonesCount: number; zones: Zone[]; windSpeed: number; windDirection: number }
): boolean => {
  if (snapshot.zonesCount !== current.zonesCount) return true;
  if (snapshot.windSpeed !== current.windSpeed) return true;
  if (snapshot.windDirection !== current.windDirection) return true;
  if (snapshot.zones.length !== current.zones.length) return true;
  for (let i = 0; i < snapshot.zones.length; i++) {
    const s = snapshot.zones[i];
    const c = current.zones[i];
    if (s.terrainType !== c.terrainType) return true;
    if (s.vegetation !== c.vegetation) return true;
    if (s.droughtLevel !== c.droughtLevel) return true;
  }
  return false;
};
```

In [src/components/terrain-panel.tsx](../../src/components/terrain-panel.tsx),
first add `useRef` to the React imports at line 2 and import the
extracted helpers:

```ts
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ISetupSnapshot, captureSimulationSnapshot, setupSnapshotDiffers } from "./setup-snapshot";
```

Inside the component (after the existing `useState` block at line 36-40),
add the `useRef` for the snapshot:

```ts
const openSnapshotRef = useRef<ISetupSnapshot | null>(null);
```

Add a new `useEffect` with **opposite polarity** from the existing
close-time reset effect at [terrain-panel.tsx:58-68](../../src/components/terrain-panel.tsx#L58-L68).
Place it next to the existing effect:

```ts
useEffect(() => {
  // Capture snapshot when the wizard opens. Polarity opposite the
  // close-time reset effect below — that one fires when ui.showTerrainUI
  // flips to false; this one fires when it flips to true.
  // Assumes a real open transition (prior render: false → current render:
  // true). A pathological synchronous close-and-reopen inside one render
  // cycle would batch to final=true with prior=true, so the dep array
  // wouldn't see a change and the snapshot would not refresh. Not reachable
  // via the current UI (Setup-button click toggles, doesn't double-toggle
  // synchronously), so this is documented rather than guarded.
  // React 18 strict-mode dev double-invocation is harmless: both runs
  // capture the same snapshot.
  //
  // Observable reads inside captureSimulationSnapshot are intentionally
  // untracked — useEffect callbacks run outside MobX-React's observer
  // tracking scope (which only tracks reads during render), so this
  // snapshot is a genuine point-in-time capture that won't re-trigger on
  // later simulation.zones / simulation.wind mutations. Combined with
  // useRef (no render on write), there's no render → effect → snapshot →
  // render loop to worry about.
  //
  // Reactivity dependency: this effect's re-run on `ui.showTerrainUI`
  // change relies on `TerrainPanel` being wrapped in `observer`
  // (terrain-panel.tsx, the `observer(...)` HOC at the export). The
  // dep-array read of an observable only triggers a re-render — and
  // thus a dep-array re-evaluation by React — because of `observer`.
  // A future refactor that unwraps `observer` (e.g., migration to
  // hooks-based MobX integration via `useObserver()` or `<Observer>`)
  // must replace this useEffect with a MobX `reaction`/`autorun`, or
  // case (h) — snapshot refresh on re-open — silently breaks.
  if (ui.showTerrainUI) {
    openSnapshotRef.current = captureSimulationSnapshot(simulation);
  }
}, [simulation, ui.showTerrainUI]);
```

Rewrite `applyAndClose` at
[terrain-panel.tsx:75-81](../../src/components/terrain-panel.tsx#L75-L81)
to diff before mutating:

```ts
const applyAndClose = () => {
  ui.showTerrainUI = !ui.showTerrainUI;
  // Diff the open-time snapshot against the local wizard state BEFORE
  // calling the simulation.* mutators. Computing the diff after the
  // mutators run would always see an empty diff because the simulation
  // would now match the local wizard state.
  const snapshot = openSnapshotRef.current;
  if (snapshot) {
    const changed = setupSnapshotDiffers(snapshot, {
      zonesCount,
      zones,
      windSpeed,
      windDirection,
    });
    if (changed) {
      simulation.setSetupChanged(true);
    }
  }
  simulation.setWindSpeed(windSpeed);
  simulation.setWindDirection(windDirection);
  simulation.updateZones(zones);
  log("TerrainPanelSettingsSaved");
};
```

Note: `setSetupChanged(true)` is called **only** from `applyAndClose`. Do
not wire it into any of the per-field handlers (`handleDroughtChange`,
`handleVegetationChange`, `handleTerrainTypeChange`,
`handleZonesCountChange`, `setWindSpeed` setter, `setWindDirection` setter)
— those mutate local React state only, and the diff happens at Create time.
Wiring per-field would break test cases (c) revert-back and (d) cancel-via-X.

In [src/components/terrain-panel.test.tsx](../../src/components/terrain-panel.test.tsx),
add a new top-level `describe("setupChanged", ...)` block. All eight
cases below are required — implementers must not skip any:

| Case | Scenario | Body location |
|---|---|---|
| (a) | Create with no changes → `setupChanged` stays false | inline below |
| (b) | Change drought, Create → `setupChanged` becomes true (diff-before-mutate canary) | inline below |
| (c) | Change drought, change back, Create → stays false (empty diff) | inline below |
| (d) | Change drought, close via X → stays false (no side effect on cancel) | inline below |
| (e) | Start from `setupChanged=true`, Create with no changes → stays true | inline below |
| (f) | Change wind speed, Create → becomes true | RESOLVED "Wind / zonesCount test ergonomics" Open Question — canonical body lives there to keep wind-direction unit-test and wind-speed DOM-test in one place |
| (g) | Change zones count, Create → becomes true | RESOLVED "Wind / zonesCount test ergonomics" Open Question — canonical body lives there alongside the RadioGroup-driving rationale |
| (h) | Snapshot refreshes on re-open (stale-snapshot canary) | inline below |

Cases (a)-(e) and (h):

```ts
import userEvent from "@testing-library/user-event";
// Also extend the existing @testing-library/react import at the top of
// terrain-panel.test.tsx to include `fireEvent`:
//   import { act, fireEvent, render, screen } from "@testing-library/react";

describe("setupChanged", () => {
  let stores = createStores();
  beforeEach(() => {
    stores = createStores();
    stores.simulation.zones = defaultTwoZones.map(opt => new Zone(opt));
    stores.simulation.config.zonesCount = 2;
    stores.ui.showTerrainUI = true;
  });

  // Helper: walk to the wind panel (panel 2) where the Create button lives.
  const goToCreatePanel = async () => {
    // The wizard renders Next twice (zones-count panel → zone-edit panel → wind panel)
    // unless config.zonesCount is set, in which case it starts on panel 1.
    // beforeEach sets zonesCount=2 so we start on panel 1 (zone-edit). One Next press → panel 2 (wind).
    const nextButtons = screen.getAllByRole("button", { name: /next/i });
    await userEvent.click(nextButtons[nextButtons.length - 1]);
  };

  const clickCreate = async () => {
    await userEvent.click(screen.getByRole("button", { name: /create/i }));
  };

  it("(a) Create with no field changes — setupChanged stays false", async () => {
    render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    await goToCreatePanel();
    await clickCreate();
    expect(stores.simulation.setupChanged).toBe(false);
  });

  it("(b) change drought, Create — setupChanged becomes true [diff-before-mutate canary]", async () => {
    render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    // Change drought on zone 0 via the slider.
    const droughtSlider = screen.getByTestId("drought-slider").querySelector("input")!;
    // Drought is 2 (Medium) in defaultTwoZones[0]; bump to 3 (Severe) via fireEvent
    // because MUI sliders don't respond to userEvent.type reliably.
    act(() => {
      fireEvent.change(droughtSlider, { target: { value: "3" } });
    });
    await goToCreatePanel();
    await clickCreate();
    expect(stores.simulation.setupChanged).toBe(true);
    // Note: this test is the canary for the diff-before-mutate ordering.
    // A broken post-mutate implementation would produce setupChanged=false
    // here because the diff would see the simulation already updated to
    // drought=3 and compare it against the wizard-local state also at 3.
  });

  it("(c) change drought, change back, Create — setupChanged stays false (empty diff)", async () => {
    render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    const droughtSlider = screen.getByTestId("drought-slider").querySelector("input")!;
    act(() => {
      fireEvent.change(droughtSlider, { target: { value: "3" } });
    });
    act(() => {
      fireEvent.change(droughtSlider, { target: { value: "2" } });
    });
    await goToCreatePanel();
    await clickCreate();
    expect(stores.simulation.setupChanged).toBe(false);
  });

  it("(d) change drought, close via X — setupChanged stays false (no side effect on cancel)", async () => {
    render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    const droughtSlider = screen.getByTestId("drought-slider").querySelector("input")!;
    act(() => {
      fireEvent.change(droughtSlider, { target: { value: "3" } });
    });
    // X close is a <div> with onClick. The newly-added data-testid in step 4
    // gives a stable handle — getByText("X") would be brittle to any other
    // "X" character in the rendered DOM.
    await userEvent.click(screen.getByTestId("terrain-panel-close"));
    expect(stores.simulation.setupChanged).toBe(false);
  });

  it("(e) start from setupChanged=true, Create with no changes — setupChanged stays true", async () => {
    // Seed setupChanged=true to simulate a prior Create-with-changes.
    stores.simulation.setSetupChanged(true);
    // beforeEach already sets ui.showTerrainUI=true. render(...) below
    // mounts the component, and the new snapshot-capture useEffect fires
    // once on mount (React always runs effects after the first commit,
    // regardless of whether the dep array's values "changed" — there's
    // nothing to compare against on mount). The effect observes
    // ui.showTerrainUI===true and captures the current simulation.zones
    // as the baseline. No store-side toggling is needed before render.
    render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    await goToCreatePanel();
    await clickCreate();
    expect(stores.simulation.setupChanged).toBe(true);
  });

  // Cases (f) and (g) drive WindCircularControl and ZonesCountSelector
  // via newly-added data-testid attributes — see RESOLVED "Wind /
  // zonesCount test ergonomics" Open Question for the concrete bodies.
  // (Repeating those here would duplicate content; the Open Question
  // RESOLVED block is canonical.)

  it("(h) snapshot refreshes on re-open: change drought, Create, reset, reopen, no change, Create — setupChanged stays false [canary for stale-snapshot bug]", async () => {
    render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    // First Create: change drought 2 → 3.
    const droughtSlider1 = screen.getByTestId("drought-slider").querySelector("input")!;
    act(() => {
      fireEvent.change(droughtSlider1, { target: { value: "3" } });
    });
    await goToCreatePanel();
    await clickCreate();
    expect(stores.simulation.setupChanged).toBe(true);
    expect(stores.simulation.zones[0].droughtLevel).toBe(3);

    // Reset the flag via the documented test reset path (see
    // setSetupChanged's contract comment in simulation.ts). We can't use
    // reload() — it would wipe simulation.zones back to the preset
    // defaults, and we specifically want to keep the post-first-Create
    // state (drought=3) live so the re-opened wizard's snapshot
    // captures the new baseline.
    stores.simulation.setSetupChanged(false);

    // Re-open the wizard. applyAndClose flipped showTerrainUI to false at
    // the end of the first Create's flow; flipping it back to true here
    // re-fires the snapshot-capture effect (deps: [simulation, ui.showTerrainUI]).
    act(() => { stores.ui.showTerrainUI = true; });

    // No field change. Walk to Create panel and Create.
    await goToCreatePanel();
    await clickCreate();
    // If the snapshot refreshed on re-open: snapshot=3, live wizard=3,
    // diff is empty, setSetupChanged NOT called, flag stays false. ✓
    // If the snapshot is stale at drought=2: snapshot=2, live wizard=3,
    // diff is non-empty, setSetupChanged(true), flag flips to true. ✗
    // The assertion catches the stale-snapshot bug loudly.
    expect(stores.simulation.setupChanged).toBe(false);
  });
});
```

---

### Rewire `bottom-bar.tsx` to the state machine + rewrite tests + fix log-events fixture

**Summary**: The component-side work. Replaces the existing button-state
class getters with new versions that compose the simulation predicates
from step 3 with the `ui.interaction` guard. Adds `disabled` props to the
Reload / Restart MUI Buttons. Resets `ui.interaction = null` in
`handleReload` / `handleRestart`. Rewrites `bottom-bar.test.tsx` to cover
all seven lifecycle states from the requirements section plus the explicit
edge-case tests. Patches the one breaking test in `log-events.test.tsx`.

Implements Requirements 1-7 at the component layer plus the
`bottom-bar.test.tsx` rewrite and the `log-events.test.tsx` fixture note
from "Files likely to change". Ships as one commit because the existing
`bottom-bar.test.tsx` assertions ("Restart restarts simulation",
"Reload resets simulation and resets view") click Reload/Restart in
**Default**, where the new rules disable them — `userEvent.click`
respects the `disabled` attribute and would no-op, breaking the spy
assertions. Splitting source from tests would leave the suite red
between commits.

Implements Requirements 1-7, "New `@computed` properties" — the BottomBar
half, and the seven-state matrix plus all explicit edge-case tests from the
non-functional requirements.

**MobX strict-mode dependency**: The `seedState` helper and several edge-case
tests write directly to MobX observables outside an `@action` (e.g.
`stores.simulation.simulationStarted = true`). This is legal today because
[setupTests.ts:5](../../src/setupTests.ts#L5) configures
`enforceActions: "never"`. If a future change tightens this to `"observed"`
or `"always"`, every direct-write in this test file (and the Cypress
state-5 forced-end hook in step 7) will need to be wrapped in
`runInAction(...)`. Flagged so the tightening change knows to update these
call sites in the same commit.

**Files affected**:
- [src/components/bottom-bar.tsx](../../src/components/bottom-bar.tsx) —
  state-machine rewire
- [src/components/bottom-bar.test.tsx](../../src/components/bottom-bar.test.tsx)
  — full rewrite (seven-state matrix + edge cases)
- [src/components/log-events.test.tsx](../../src/components/log-events.test.tsx)
  — one-line fixture patch (test 2) **plus** deletion of test 6 (now
  vacuous under the new `restartEnabled` rule). See the
  log-events.test.tsx subsection in **Changes** below for both.

**Estimated diff size**: ~400 lines (most of the diff is the test rewrite).

**Changes**:

In [src/components/bottom-bar.tsx](../../src/components/bottom-bar.tsx),
rewrite the three component-class getters at
[bottom-bar.tsx:62-77](../../src/components/bottom-bar.tsx#L62-L77) to
compose simulation predicates with the `ui.interaction` guard. Note the
sense flip: the existing getters return *disabled*, the new ones return
*enabled* (negated where read in JSX):

```ts
get sparkEnabled() {
  const { simulation, ui } = this.stores;
  return !simulation.simulationStarted
    && simulation.canAddSpark
    && ui.interaction !== Interaction.PlaceSpark;
}

get fireLineEnabled() {
  const { simulation, ui } = this.stores;
  // canAddFireLineMarker already gates on config.fireLineAvailable + cooldown
  // + 2-marker capacity (see simulation.ts:109-117).
  return simulation.simulationStarted
    && !simulation.simulationEnded
    && simulation.canAddFireLineMarker
    && ui.interaction !== Interaction.DrawFireLine;
}

get helitackEnabled() {
  const { simulation, ui } = this.stores;
  // canUseHelitack already gates on config.helitackAvailable + cooldown
  // (see simulation.ts:119-127).
  return simulation.simulationStarted
    && !simulation.simulationEnded
    && simulation.canUseHelitack
    && ui.interaction !== Interaction.Helitack;
}
```

In `render()` at line 91-189, replace the existing button `disabled`
props:

- Setup button (lines 102-109): `disabled={!simulation.setupEnabled}`
  (replaces `disabled={uiDisabled}`; the `uiDisabled` local at line 93 is
  removed).
- Spark button (lines 113-120): `disabled={!this.sparkEnabled}` (replaces
  `disabled={this.sparkBtnDisabled}`).
- Reload button (lines 123-130): add `disabled={!simulation.reloadEnabled}`.
- Restart button (lines 131-138): add `disabled={!simulation.restartEnabled}`.
- Start/Stop button (lines 141-149): `disabled={!simulation.startEnabled}`
  (replaces `disabled={!simulation.ready}`).
- Fire Line button (lines 153-160): `disabled={!this.fireLineEnabled}`.
- Helitack button (lines 163-170): `disabled={!this.helitackEnabled}`.

Reset `ui.interaction = null` in `handleReload` and `handleRestart` (no
`simulation.ts` change in this step — the `setupChanged` reset on
`reload()` lives in step 1; here we only mutate `ui.interaction` from
the component handlers). Two single-line additions, placed after the
`chartStore.reset()` call so the reset is the last side-effect before
the model reset call. The order of the `ui.interaction = null` /
`simulation.restart()` / `simulation.reload()` writes does not affect
the user-visible final state. The handler is not wrapped in `@action`,
so the `ui.interaction` write and the `restart()`/`reload()` internal
writes are not part of a single MobX transaction — observers of
`ui.interaction` may notify separately from observers of the model
reset. The renders that result both reflect the consistent post-reset
state (the writes happen synchronously, back-to-back, before React
commits any of them), so there is no user-visible intermediate flash.
The chosen order ("clear UI state alongside chart state, then run the
model reset") is purely for readability. If a future change makes the
single-transaction property load-bearing — e.g. a derived computed
that reads both `ui.interaction` and a `simulation` observable and
would briefly produce a nonsensical value — wrap the handler body in
`runInAction` or convert the handler to `@action.bound`.

```ts
public handleRestart = () => {
  const { simulation, ui } = this.stores;
  if (simulation.simulationStarted) {
    simulation.simulationEndedLogged = true;
    log("SimulationEnded", {
      reason: "SimulationRestarted",
      outcome: simulation.getOutcomeData(this.stores.chartStore)
    });
  }
  this.stores.chartStore.reset();
  ui.interaction = null;
  simulation.restart();
  log("SimulationRestarted");
};

public handleReload = () => {
  const { simulation, ui } = this.stores;
  if (simulation.simulationStarted) {
    simulation.simulationEndedLogged = true;
    log("SimulationEnded", {
      reason: "SimulationReloaded",
      outcome: simulation.getOutcomeData(this.stores.chartStore)
    });
  }
  this.stores.chartStore.reset();
  ui.interaction = null;
  simulation.reload();
  log("SimulationReloaded");
};
```

In [src/components/log-events.test.tsx](../../src/components/log-events.test.tsx),
two tests need attention under the new rules.

**Test 2 — fixture patch.** "fires with reason 'SimulationReloaded'
before reload" at
[log-events.test.tsx:57-76](../../src/components/log-events.test.tsx#L57-L76)
breaks under `reloadEnabled = setupChanged || sparks.length > 0` — its
existing fixture only sets `simulationStarted = true`, which under the
new rules leaves `reloadEnabled === false` and `userEvent.click` no-ops
against the disabled button. Add one line before the click:

```ts
// Existing line 59 — simulationStarted alone leaves reloadEnabled=false.
// Add a spark so reloadEnabled flips to true and the click actually fires
// the handler (mirroring the test-4 fixture pattern at line 102).
stores.simulation.sparks.push(new Vector2(50000, 50000));
stores.simulation.simulationStarted = true;
```

(Imports: `Vector2` is already imported at line 8.)

**Test 6 — delete.** "does NOT fire SimulationEnded on restart when
simulation was never started" at
[log-events.test.tsx:142-156](../../src/components/log-events.test.tsx#L142-L156)
becomes structurally vacuous under the new rules. With
`restartEnabled = simulationStarted = false` in Default state,
`userEvent.click` on the Restart button is a no-op (the button is
disabled), `handleRestart` never runs, and both assertions
(`endedCalls.length === 0` and `simulationEndedLogged === false`)
trivially hold. The test no longer exercises the
`if (simulation.simulationStarted)` guard at
[bottom-bar.tsx:256](../../src/components/bottom-bar.tsx#L256) — it
asserts the *absence* of an effect from a handler that doesn't run.

Delete the test. Coverage of "Restart is disabled in Default" lives in
the seven-state matrix's state-1 test in
[bottom-bar.test.tsx](../../src/components/bottom-bar.test.tsx)
(`expectButtonState("restart-button", false)`), which subsumes the
log-events coverage at the matrix level. The handler-internal guard at
bottom-bar.tsx:256 stays as defensive code — relevant if `handleRestart`
is ever called programmatically rather than via UI click — but doesn't
need a dedicated test now that the UI can't trigger the
unreachable-via-click branch.

Other tests in the file are unaffected (audited):
- Test 1 (Restart at lines 27-55) — sets `simulationStarted=true`, which
  is sufficient for `restartEnabled=true` under the new rules. ✓
- Test 3 (TopBar reload at lines 78-96) — uses a different button outside
  the bottom-bar state machine. ✓
- Test 4 (Stop at lines 98-128) — already sets a spark + `simulationRunning`. ✓
- Test 5 ("sets simulationEndedLogged guard on restart" at lines 130-140) —
  sets `simulationStarted=true`. ✓
- Tests 7-10 (natural-end reaction tests, SimulationStarted tests) —
  unaffected by the button-state rules.

In [src/components/bottom-bar.test.tsx](../../src/components/bottom-bar.test.tsx),
fully rewrite to cover the seven-state matrix plus the explicit edge-case
tests. Structure:

```ts
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createStores } from "../models/stores";
import { Provider } from "mobx-react";
import { BottomBar } from "./bottom-bar";
import { Vector2 } from "three";
import { act } from "react-dom/test-utils";
import { Interaction } from "../models/ui";
import type { FireEngine } from "../models/engine/fire-engine";

// Minimal FireEngine stand-in for tests that only need the bottom-bar to
// read engine state, not run a simulation. Centralized so the ~12 inline
// `{ fireDidStop, burnedCellsInZone }` literals below don't need touching
// independently when a default changes.
//
// What the typing buys: the `Pick<FireEngine, ...>` return shape types
// `overrides` against real FireEngine field names — so a rename or
// removal of `fireDidStop` / `burnedCellsInZone` upstream breaks
// `MockEngineFields` and every override-bearing call here at compile
// time. It also keeps the helper's *default values* matched to the
// real field types (e.g. `burnedCellsInZone: {}` must remain assignable
// to FireEngine's actual type for that key).
//
// What the typing does NOT buy: any protection against `BottomBar`
// reading a *new* FireEngine field at runtime. After
// `(simulation as any).engine = mockEngine()`, `simulation.engine` is
// still typed `FireEngine`, so a new BottomBar read like
// `simulation.engine?.someNewField` type-checks fine and returns
// `undefined` at runtime in these tests — TS sees the cast, not the
// missing key. If/when BottomBar grows new engine reads, the right
// move is to (a) add the new field to MockEngineFields and the
// default literal here (so the read returns something sane), or
// (b) replace the helper with a full FireEngine fake / interface
// stub if the protection is worth the maintenance cost.
type MockEngineFields = Pick<FireEngine, "fireDidStop" | "burnedCellsInZone">;
const mockEngine = (overrides?: Partial<MockEngineFields>): MockEngineFields => ({
  fireDidStop: false,
  burnedCellsInZone: {},
  ...overrides,
});

// Helper: set the simulation into a target lifecycle state via direct observable
// assignment. Avoids the engine + cells round-trip — none of these tests need
// the engine to actually tick.
//
// NOTE: Direct-write seeding skips two things the real `simulation.start()`
// does: (1) the `simulationEndedLogged = false` reset (simulation.ts:222)
// and (2) the FireEngine construction (simulation.ts:226-228). Tests that
// chain transitions from a seeded state-4/5 — e.g., state-5 → click Restart,
// where the production path would have `simulationEndedLogged` already
// flipped true by app.tsx's natural-end reaction — should either set the
// flag manually or call `simulation.start()` directly to exercise the real
// reset path. No test in this suite currently chains that way, but the trap
// is latent.
const seedState = (stores: ReturnType<typeof createStores>, state: 1 | 2 | 3 | 4 | 5 | 6) => {
  const { simulation, ui } = stores;
  // Defensive sanity guard: every state-machine assertion below depends on
  // canAddSpark = remainingSparks > 0 = zonesCount - sparks.length > 0.
  // `seedState` adds at most 1 spark for states 3/4/5/6, so we need at
  // least 2 zones for the spark-button-enabled assertions to hold. The
  // default preset currently ships with 3 zones (Mountains / Foothills /
  // Plains); this guard tolerates either 2 or 3, but fails loudly if a
  // future `getDefaultConfig()` shift drops below 2.
  expect(simulation.zonesCount).toBeGreaterThanOrEqual(2);
  simulation.dataReady = true;
  switch (state) {
    case 1: // Default
      break;
    case 2: // SetupChanged
      simulation.setSetupChanged(true);
      break;
    case 3: // SparkPlaced
      simulation.sparks.push(new Vector2(50000, 50000));
      break;
    case 4: // Running
      simulation.sparks.push(new Vector2(50000, 50000));
      simulation.simulationStarted = true;
      simulation.simulationRunning = true;
      (simulation as any).engine = mockEngine();
      break;
    case 5: // Ended (fire finished naturally)
      simulation.sparks.push(new Vector2(50000, 50000));
      simulation.simulationStarted = true;
      simulation.simulationRunning = false;
      (simulation as any).engine = mockEngine({ fireDidStop: true });
      break;
    case 6: // Restarted (post-Restart from a state with sparks)
      simulation.sparks.push(new Vector2(50000, 50000));
      // simulationStarted stays false; engine is null
      break;
    // State 7 (AfterReload) intentionally omitted — see comment at the end
    // of the BottomBar state machine describe block.
  }
  return ui;
};

const expectButtonState = (testid: string, enabled: boolean) => {
  const btn = screen.getByTestId(testid);
  if (enabled) expect(btn).not.toBeDisabled();
  else expect(btn).toBeDisabled();
};

describe("BottomBar state machine (Requirements 1-7)", () => {
  let stores = createStores();
  beforeEach(() => {
    stores = createStores();
  });

  // ─────────────────────────────────────────────────────────────────────
  // State 1: Default
  // Enabled: Setup, Spark. Disabled: Reload, Restart, Start, Fire Line, Helitack.
  it("state 1 (Default): Setup + Spark enabled; Reload/Restart/Start/Fire Line/Helitack disabled", () => {
    seedState(stores, 1);
    render(<Provider stores={stores}><BottomBar /></Provider>);
    expectButtonState("terrain-button", true);
    expectButtonState("spark-button", true);
    expectButtonState("reload-button", false);
    expectButtonState("restart-button", false);
    expectButtonState("start-button", false);
    expectButtonState("fireline-button", false);
    expectButtonState("helitack-button", false);
  });

  // State 2: SetupChanged — Reload enabled, rest same as Default
  it("state 2 (SetupChanged): Reload enabled; otherwise same as Default", () => {
    seedState(stores, 2);
    render(<Provider stores={stores}><BottomBar /></Provider>);
    expectButtonState("terrain-button", true);
    expectButtonState("spark-button", true);
    expectButtonState("reload-button", true);
    expectButtonState("restart-button", false);
    expectButtonState("start-button", false);
    expectButtonState("fireline-button", false);
    expectButtonState("helitack-button", false);
  });

  // State 3: SparkPlaced — Start enabled, Reload enabled, rest like Default
  it("state 3 (SparkPlaced): Start + Reload enabled", () => {
    seedState(stores, 3);
    render(<Provider stores={stores}><BottomBar /></Provider>);
    expectButtonState("terrain-button", true);
    expectButtonState("spark-button", true);
    expectButtonState("reload-button", true);
    expectButtonState("restart-button", false);
    expectButtonState("start-button", true);
    expectButtonState("fireline-button", false);
    expectButtonState("helitack-button", false);
  });

  // State 4: Running — Restart, Start/Stop, Fire Line, Helitack enabled; Setup, Spark disabled
  it("state 4 (Running): Setup/Spark disabled; Restart/Start/Fire Line/Helitack enabled; Reload enabled; label is 'Stop'", () => {
    seedState(stores, 4);
    render(<Provider stores={stores}><BottomBar /></Provider>);
    expectButtonState("terrain-button", false);
    expectButtonState("spark-button", false);
    expectButtonState("reload-button", true);
    expectButtonState("restart-button", true);
    expectButtonState("start-button", true);
    expectButtonState("fireline-button", true);
    expectButtonState("helitack-button", true);
    // Requirement 4: label is "Stop" while simulationRunning === true.
    // Regression guard for the ternary at bottom-bar.tsx:148.
    expect(screen.getByTestId("start-button")).toHaveTextContent("Stop");
  });

  // State 5: Ended — Start, Fire Line, Helitack disabled; Restart, Reload enabled
  it("state 5 (Ended): Start/Fire Line/Helitack disabled; Restart/Reload enabled; Setup/Spark disabled", () => {
    seedState(stores, 5);
    render(<Provider stores={stores}><BottomBar /></Provider>);
    expectButtonState("terrain-button", false);
    expectButtonState("spark-button", false);
    expectButtonState("reload-button", true);
    expectButtonState("restart-button", true);
    expectButtonState("start-button", false);
    expectButtonState("fireline-button", false);
    expectButtonState("helitack-button", false);
  });

  // State 6: Restarted — Setup, Spark, Start, Reload enabled; Restart disabled
  it("state 6 (Restarted): Setup/Spark/Start/Reload enabled; Restart disabled; Fire Line/Helitack disabled", () => {
    seedState(stores, 6);
    render(<Provider stores={stores}><BottomBar /></Provider>);
    expectButtonState("terrain-button", true);
    expectButtonState("spark-button", true);
    expectButtonState("reload-button", true);
    expectButtonState("restart-button", false);
    expectButtonState("start-button", true);
    expectButtonState("fireline-button", false);
    expectButtonState("helitack-button", false);
  });

  // State 7 (AfterReload) is intentionally omitted from this matrix. The
  // state-7 button matrix is identical to state 1 (Default) for curriculum
  // presets with empty `config.sparks`, so a `seedState(7)` that no-ops to
  // Default-equivalent state would duplicate the state-1 test without
  // actually exercising `reload()`. Real "AfterReload" coverage lives in
  // the `BottomBar edge cases` → "Paused vs. Ended" describe block: both
  // `Paused → Reload → Default-state rules` and `Running → Reload → ...
  // engine torn down` click the actual Reload button and assert
  // Default-equivalent post-state. Those tests carry the state-7 contract.
  //
  // For dev presets with preplaced sparks (`basic`, `basicWithWind`,
  // `slope45deg`, `basicWithSlopeAndWind`) AfterReload lands in
  // SparkPlaced-shape per requirements.md "Preset caveat" — also not
  // covered here, since the matrix uses the createStores() default config.
});

// ───────────────────────────────────────────────────────────────────────
// Explicit edge-case tests from the non-functional requirements
describe("BottomBar edge cases", () => {
  let stores = createStores();
  beforeEach(() => {
    stores = createStores();
    stores.simulation.dataReady = true;
  });

  describe("Paused vs. Ended", () => {
    it("Start → Stop (Paused) → Start label remains 'Start' and is enabled", () => {
      stores.simulation.sparks.push(new Vector2(50000, 50000));
      stores.simulation.simulationStarted = true;
      stores.simulation.simulationRunning = false; // Stop pressed
      (stores.simulation as any).engine = mockEngine();
      render(<Provider stores={stores}><BottomBar /></Provider>);
      const start = screen.getByTestId("start-button");
      expect(start).not.toBeDisabled();
      expect(start).toHaveTextContent("Start");
      expectButtonState("restart-button", true);
      expectButtonState("terrain-button", false);
      expectButtonState("spark-button", false);
    });

    it("Start → fire finishes (Ended) → Start label is 'Start' and disabled", () => {
      stores.simulation.sparks.push(new Vector2(50000, 50000));
      stores.simulation.simulationStarted = true;
      stores.simulation.simulationRunning = false;
      (stores.simulation as any).engine = mockEngine({ fireDidStop: true });
      render(<Provider stores={stores}><BottomBar /></Provider>);
      const start = screen.getByTestId("start-button");
      expect(start).toBeDisabled();
      expect(start).toHaveTextContent("Start");
      expectButtonState("restart-button", true);
      expectButtonState("fireline-button", false);
      expectButtonState("helitack-button", false);
    });

    it("Paused → Restart → Restarted-state rules", async () => {
      stores.simulation.sparks.push(new Vector2(50000, 50000));
      stores.simulation.simulationStarted = true;
      stores.simulation.simulationRunning = false;
      (stores.simulation as any).engine = mockEngine();
      render(<Provider stores={stores}><BottomBar /></Provider>);
      await userEvent.click(screen.getByTestId("restart-button"));
      expect(stores.simulation.simulationStarted).toBe(false);
      expect(stores.simulation.engine).toBeNull();
      expect(stores.simulation.sparks.length).toBe(1); // preserved
      expectButtonState("terrain-button", true);
      expectButtonState("spark-button", true);
      expectButtonState("restart-button", false);
      expectButtonState("start-button", true);
    });

    it("Paused → Reload → Default-state rules", async () => {
      // Sanity guard: this test asserts `sparks.length === 0` after reload,
      // which assumes the default config ships with no preplaced sparks.
      // Curriculum presets are empty; dev presets (`basic`, `basicWithWind`,
      // ...) are not. See requirements.md "Preset caveat". If this guard
      // fires, the default-config shape changed and the assertion below
      // needs to be rewritten in terms of `config.sparks.length` rather
      // than a hard-coded `0`. Same pattern as the state-7 matrix guard.
      expect(stores.simulation.config.sparks).toEqual([]);
      stores.simulation.sparks.push(new Vector2(50000, 50000));
      stores.simulation.simulationStarted = true;
      stores.simulation.simulationRunning = false;
      (stores.simulation as any).engine = mockEngine();
      render(<Provider stores={stores}><BottomBar /></Provider>);
      await userEvent.click(screen.getByTestId("reload-button"));
      expect(stores.simulation.setupChanged).toBe(false);
      expect(stores.simulation.sparks.length).toBe(0); // empty config.sparks
      expectButtonState("restart-button", false);
      expectButtonState("reload-button", false);
    });

    it("Running → Reload → Default-state rules, engine torn down", async () => {
      // Sanity guard: see Paused → Reload above for rationale. Same
      // assumption (empty default `config.sparks`) backs the
      // `sparks.length === 0` assertion below.
      expect(stores.simulation.config.sparks).toEqual([]);
      stores.simulation.sparks.push(new Vector2(50000, 50000));
      stores.simulation.simulationStarted = true;
      stores.simulation.simulationRunning = true;
      (stores.simulation as any).engine = mockEngine();
      render(<Provider stores={stores}><BottomBar /></Provider>);
      await userEvent.click(screen.getByTestId("reload-button"));
      expect(stores.simulation.engine).toBeNull();
      expect(stores.simulation.simulationStarted).toBe(false);
      expect(stores.simulation.sparks.length).toBe(0);
      expect(stores.simulation.setupChanged).toBe(false);
      expectButtonState("reload-button", false);
    });
  });

  describe("authoring gate", () => {
    it("Fire Line disabled in Running when fireLineAvailable=false", () => {
      stores.simulation.config.fireLineAvailable = false;
      stores.simulation.sparks.push(new Vector2(50000, 50000));
      stores.simulation.simulationStarted = true;
      stores.simulation.simulationRunning = true;
      (stores.simulation as any).engine = mockEngine();
      render(<Provider stores={stores}><BottomBar /></Provider>);
      expectButtonState("fireline-button", false);
    });

    it("Helitack disabled in Running when helitackAvailable=false", () => {
      stores.simulation.config.helitackAvailable = false;
      stores.simulation.sparks.push(new Vector2(50000, 50000));
      stores.simulation.simulationStarted = true;
      stores.simulation.simulationRunning = true;
      (stores.simulation as any).engine = mockEngine();
      render(<Provider stores={stores}><BottomBar /></Provider>);
      expectButtonState("helitack-button", false);
    });
  });

  describe("ui.interaction reset", () => {
    it("Reload-during-PlaceSpark: returns to Default with Spark enabled", async () => {
      stores.simulation.setSetupChanged(true); // so Reload is enabled
      stores.ui.interaction = Interaction.PlaceSpark;
      render(<Provider stores={stores}><BottomBar /></Provider>);
      await userEvent.click(screen.getByTestId("reload-button"));
      expect(stores.ui.interaction).toBeNull();
      expectButtonState("spark-button", true);
    });

    it("Restart-during-DrawFireLine: ui.interaction cleared post-Restart", async () => {
      stores.simulation.sparks.push(new Vector2(50000, 50000));
      stores.simulation.simulationStarted = true;
      stores.simulation.simulationRunning = true;
      (stores.simulation as any).engine = mockEngine();
      stores.ui.interaction = Interaction.DrawFireLine;
      render(<Provider stores={stores}><BottomBar /></Provider>);
      await userEvent.click(screen.getByTestId("restart-button"));
      expect(stores.ui.interaction).toBeNull();
    });
  });

  describe("drag-to-move spark survives Restart", () => {
    it("setSpark(idx, x, y) mutates sparks[idx] after Restart", async () => {
      stores.simulation.sparks.push(new Vector2(50000, 50000));
      stores.simulation.simulationStarted = true;
      stores.simulation.simulationRunning = true;
      (stores.simulation as any).engine = mockEngine();
      render(<Provider stores={stores}><BottomBar /></Provider>);
      await userEvent.click(screen.getByTestId("restart-button"));
      expect(stores.simulation.sparks.length).toBe(1);
      stores.simulation.setSpark(0, 60000, 60000);
      expect(stores.simulation.sparks[0].x).toBe(60000);
      expect(stores.simulation.sparks[0].y).toBe(60000);
    });
  });

  describe("handler spies (preserves the existing 'restarts simulation' / 'resets simulation' coverage)", () => {
    // These tests are *handler-wiring* checks: they prove the click reaches
    // the handler which then calls simulation.restart()/reload(). The actual
    // state-transition behavior (engine nulled, sparks preserved on Restart,
    // sparks cleared on Reload, setupChanged reset, etc.) is covered by the
    // Paused→Restart, Paused→Reload, and Running→Reload tests above. Don't
    // weaken these to mockImplementation() — the spy currently still
    // forwards to the real method, which lets a maintainer add downstream
    // assertions here without re-wiring.

    it("Restart click calls simulation.restart() (when enabled)", async () => {
      // Seed Running so Restart is enabled
      stores.simulation.sparks.push(new Vector2(50000, 50000));
      stores.simulation.simulationStarted = true;
      stores.simulation.simulationRunning = true;
      (stores.simulation as any).engine = mockEngine();
      jest.spyOn(stores.simulation, "restart");
      render(<Provider stores={stores}><BottomBar /></Provider>);
      await userEvent.click(screen.getByTestId("restart-button"));
      expect(stores.simulation.restart).toHaveBeenCalled();
    });

    it("Reload click calls simulation.reload() (when enabled)", async () => {
      // Seed SetupChanged so Reload is enabled
      stores.simulation.setSetupChanged(true);
      jest.spyOn(stores.simulation, "reload");
      render(<Provider stores={stores}><BottomBar /></Provider>);
      await userEvent.click(screen.getByTestId("reload-button"));
      expect(stores.simulation.reload).toHaveBeenCalled();
    });
  });
});
```

Tests that remain from the existing file unchanged (or near-unchanged):
- "renders basic components" (button count — still 7)
- "terrain button toggles the display of the terrain dialog"
- "fireline button enables the user to place a fireline" (existence)
- "helitack button enables the user to select a zone for helitack" (existence)
- "controls are disabled when running" → now subsumed by state-4 test
  above; the old test can be deleted in this rewrite.

The old "start button is disabled until model is ready" test is also
subsumed by the state-1 / state-3 transition tests. The new state-3 test
asserts Start enabled after a spark is placed; the new state-1 test
asserts Start disabled with no sparks.

---

### Update IconButton + Reload/Restart disabled styling (Zeplin opacity 0.35)

**Summary**: The cosmetic CSS pass. Updates the IconButton disabled rule
from `opacity: 0.5` on the whole button to `opacity: 0.35` on the
text/icon content only (background stays at full opacity per the Zeplin
spec). Adds an equivalent rule for the Reload / Restart `<Button>`s in
`bottom-bar.scss` so they share the same disabled look. Independent of
the functional changes; can ship before or after the state-machine rewire
(but lands last in the sequence so reviewers can see the disabled state
on real, lifecycle-driven buttons).

Implements the "Visual specs" section of Technical Notes and the RESOLVED
"Visual specifications for disabled / enabled / hover states" + "Reload and
Restart button styling when disabled" questions.

**Files affected**:
- [src/components/icon-button.scss](../../src/components/icon-button.scss)
  — replace whole-button opacity with content opacity
- [src/components/bottom-bar.scss](../../src/components/bottom-bar.scss) —
  add disabled rule for `.playbackButton` matching IconButton

**Estimated diff size**: ~40 lines

**Changes**:

In [src/components/icon-button.scss](../../src/components/icon-button.scss),
replace the `.disabled` rule at line 34-37. We target the inner span
instead of the button root: the IconButton JSX wraps its visible content
in an explicit `<span>` at
[icon-button.tsx:23-27](../../src/components/icon-button.tsx#L23-L27),
and the Reload / Restart / Start MUI `<Button>`s in
[bottom-bar.tsx:129,137,148](../../src/components/bottom-bar.tsx#L129)
similarly wrap their content in `<span>` directly in JSX. So `> span`
matches the visible-content wrapper across all four button shapes. (MUI
v5 itself does *not* add a content wrapper — v4's `.MuiButton-label`
span was removed — so the JSX-level spans are the only thing `> span`
can target.)

```scss
&.disabled {
  // Selector keys off the project's `.disabled` className, NOT the HTML
  // `disabled` attribute. The className is added by icon-button.tsx:17:
  // `className={`${css.iconButton} ${disabled ? css.disabled : ""}`}`.
  // If that conditional is ever removed in favor of MUI's `disabled` prop
  // alone (which sets the HTML attribute and the `.Mui-disabled` class),
  // migrate this selector to `&:disabled` or `&.Mui-disabled` in the
  // same commit — otherwise the visual fade silently disappears.
  // Neither Jest (no CSS compute) nor the Cypress state-machine spec
  // (asserts `.should("be.disabled")` on the HTML attribute, not opacity)
  // would catch the regression.
  //
  // `> span` targets the explicit content wrapper rendered by
  // icon-button.tsx:23-27. This is MUI-version-coupled: today (MUI v5
  // with `disableRipple={true}`) MUI injects no other span child, so
  // `> span` matches our content wrapper. A future MUI upgrade that
  // re-introduces a wrapper span (the v4→v5 migration removed
  // `.MuiButton-label`; a hypothetical v6 could reintroduce something
  // similar outside the `disableRipple` gate) would shift `> span` to
  // match the MUI wrapper instead. Reviewer of any MUI major-version
  // upgrade should verify the selector target in DevTools — or migrate
  // to an explicit content class on the JSX span (e.g.
  // `className={css.iconButtonContent}`) and re-scope this rule.
  //
  // Match Zeplin spec: text + icon at 0.35 opacity, background at full
  // opacity. Replaces the previous `opacity: 0.5 !important; filter:
  // grayscale(1)` whole-button rule.
  // !important retained defensively against future MUI upgrades that
  // might add opacity-related rules to .Mui-disabled (none in MUI v5
  // today, but the original rule used !important and dropping it
  // creates an upgrade-risk surface for no real benefit).
  > span {
    opacity: 0.35 !important;
  }
  filter: grayscale(1);
}
```

The `grayscale(1)` filter is preserved — it applies to the whole button,
but since the only visible content sits inside the span (which is also
faded), the visual effect matches the Zeplin spec.

In [src/components/bottom-bar.scss](../../src/components/bottom-bar.scss),
add a disabled rule for `.playbackButton` (used by Reload, Restart, and
Start/Stop). Place it next to the existing `.playbackButton` rule at line
134:

```scss
.playbackButton {
  // ... existing rules ...

  &:disabled {
    // Match Zeplin spec: text + icon at 0.35 opacity, background at full
    // opacity. Targets the inner span (the JSX explicitly wraps content
    // in <span><Icon/> Label</span> at bottom-bar.tsx:129,137,148).
    //
    // `> span` is MUI-version-coupled: in MUI v5 with `disableRipple={true}`
    // no other span child is injected. A future MUI major-version upgrade
    // that re-introduces a wrapper span (precedent: v4→v5 removed
    // `.MuiButton-label`) would shift `> span` to match the MUI wrapper.
    // Reviewer of any MUI major upgrade should verify the target in
    // DevTools — or migrate to an explicit class on the JSX span and
    // re-scope this rule.
    > span {
      opacity: 0.35;
    }
    filter: grayscale(1);
    // Prevent the MUI default hover effect from re-amplifying contrast.
    &:hover svg, &:active svg {
      box-shadow: none;
    }
    // No explicit :focus styling. Native <button disabled> removes the
    // element from the tab order, so keyboard users can't Tab to a
    // disabled .playbackButton. Programmatic focus (e.g. dialog-close
    // focus restoration) landing on a disabled button is a theoretical
    // edge case that would already be a UX bug — explicitly out of
    // scope per requirements.md "Focus re-targeting when a focused
    // button becomes disabled mid-action".
  }
}
```

The `:disabled` pseudo-class fires when the underlying `<button disabled>`
attribute is set, which MUI emits when the React `disabled` prop is true.
No `!important` needed because the disabled rule is more specific than
the existing `.playbackButton svg` rule and only applies when the button
is actually disabled.

After this step, perform the sighted-user check from Technical Notes'
Accessibility note: open the running app, navigate through each lifecycle
state, and visually confirm the disabled icons remain perceptible. The
check must specifically account for the **`grayscale(1) + opacity: 0.35`
compounding**: grayscale collapses the icon's chromatic signal to
luminance, then 0.35 opacity fades that luminance against the
near-white background. The compound effect lands closer to "barely
present" than a 0.35 opacity check on color icons alone. Run the check
in (a) standard rendering, and (b) at least one low-vision simulation
(Chrome DevTools → More tools → Rendering → "Emulate vision deficiencies"
set to "Blurred vision" or "Achromatopsia" approximates an age-related
contrast loss). If either rendering looks insufficient,
**flag the designer (Michael Tirenin) before merging** rather than
silently raising the opacity (per the Technical Notes Accessibility
escalation rule).

Include a screenshot of one disabled-state lifecycle (e.g. state 1
Default, with Reload / Restart / Start disabled) in the implementation
PR description for designer sign-off — ideally both the standard and a
low-vision simulation rendering.

---

### Add `bottom-bar-state-machine.cy.ts` — browser-level seven-state coverage

**Summary**: Browser-level regression guard for the lifecycle state
machine. Covers each of the seven states by driving the real bottom-bar
in a running app, asserting the HTML `disabled` attribute on every
button per the Zeplin matrix. Catches full-page reactivity wiring
breaks, `@observer`-decoration regressions, and build-tooling failures
that the React-Testing-Library tests in step 5 can't. **Does not cover
visual styling regressions** (opacity, grayscale) — that's the job of
the step-6 unit tests, which assert the `.Mui-disabled` rules directly.
A future Zeplin-driven visual-regression pass (computed-style assertions
or screenshot diff) would close that gap end-to-end; deliberately out of
scope here to keep the spec a state-machine regression guard rather than
a styling test. Lives in a dedicated file so it can be extended or
deleted independently of `smoke.cy.ts`.

Implements the choice C resolution of the "Cypress smoke step" Open
Question.

**Files affected**:
- [cypress/e2e/bottom-bar-state-machine.cy.ts](../../cypress/e2e/bottom-bar-state-machine.cy.ts)
  — new file

No changes to
[cypress/support/elements/BottomBar.js](../../cypress/support/elements/BottomBar.js):
all seven button selectors (`getTerrainSetupButton`, `getSparkButton`,
`getReloadButton`, `getRestartButton`, `getStartButton`,
`getFireLineButton`, `getHelitackButton`) are already present. The new
spec doesn't import the helper class anyway — see the inline-selector
choice locked in by the file-outline comment below.

**Estimated diff size**: ~300 lines (mostly the new spec file).

**Test layout**:

Each `it` block follows the pattern: visit URL with appropriate query
params → drive any necessary user actions to reach the state → assert
every button's enabled/disabled visual state per the Zeplin matrix.
Lifecycle states map to:

| State | How to reach | Browser-level setup |
|---|---|---|
| 1 Default | `cy.visit("/")` — fresh load of a curriculum preset | none |
| 2 SetupChanged | Default → open Setup wizard → change drought → Create | UI clicks |
| 3 SparkPlaced | Default → click Spark → click canvas (or use `window.test.placeSparkInZone`) | UI click + `window.test.*` |
| 4 Running | SparkPlaced → click Start | UI click |
| 5 Ended | Running → wait for fire to finish OR force via `cy.window().then(win => { win.sim.engine.fireDidStop = true; win.sim.simulationRunning = false; })` (order matters — see note below) | force via `window.sim` for determinism — see note below |
| 6 Restarted | Running → click Restart | UI click |
| 7 AfterReload | SetupChanged or Running → click Reload | UI click; for curriculum preset returns to Default-equivalent |

**State 5 (Ended) determinism**: A "real" Ended state requires the
simulation engine to run to fire-extinction. That can take 10+ real
seconds depending on preset and is non-deterministic. For Cypress, drive
the Ended state by mutating `window.sim` (already exposed in
[stores.ts](../../src/models/stores.ts) — see the
`Playwright MCP testing` section of [CLAUDE.md](../../CLAUDE.md) for
the `window.sim` and `window.test` debug hooks):

```ts
cy.window().then(win => {
  // Force into Ended state without waiting for the engine to actually finish.
  // Order matters: set fireDidStop (non-observable) BEFORE flipping
  // simulationRunning (observable). The simulationEnded computed only
  // re-evaluates on the simulationRunning edge — if we flipped it first,
  // the computed would lock in false because fireDidStop was still false
  // at re-eval time.
  if (win.sim.engine) {
    win.sim.engine.fireDidStop = true;
  }
  win.sim.simulationRunning = false;
});
```

This is the same shortcut the Jest tests use (seeding observables
directly). The browser-level value-add is that the React render path,
CSS, and full reactivity pipeline are exercised end-to-end.

**File outline** (concrete code below — implementable as-is, modulo any
test-id renames discovered while wiring up):

```ts
// cypress/e2e/bottom-bar-state-machine.cy.ts

// No BottomBar helper-class import — this spec uses inline
// `cy.get("[data-testid='...']")` selectors for clarity, so each `it`
// block reads top-to-bottom without cross-referencing the helper file.
// If a future ticket consolidates Cypress tests on the BottomBar helper
// class style (matching smoke.cy.ts), swap the inline selectors here for
// `bottomBar.getReloadButton()` etc.

// Type augmentations for the `window.sim` and `window.test.*` debug hooks
// exposed by src/models/stores.ts (see CLAUDE.md "Playwright MCP testing"
// section). Cypress's AUTWindow type doesn't know about these app-specific
// properties, so without this declaration `win.sim.simulationRunning` and
// `win.test.placeSparkInZone(0)` below would error under editor + tsc
// (`tsc -p cypress/tsconfig.json --noEmit`).
//
// `sim` is declared as a local structural `SimLike` interface — NOT as
// `import("../../src/models/simulation").SimulationModel`. Importing the
// real type would pull `simulation.ts` (which uses MobX `@observable` /
// `@action` decorators) into the Cypress TS program, and
// `cypress/tsconfig.json` does not enable `experimentalDecorators` —
// `tsc -p cypress/tsconfig.json --noEmit` would then fail with TS1219,
// exactly the failure this declaration is trying to prevent.
//
// SimLike covers only the fields this spec reads. If a future Cypress
// spec needs richer SimulationModel access, the right fix is to enable
// `experimentalDecorators` in cypress/tsconfig.json and switch to the
// real type — do not grow this interface organically.
//
// Kept inline rather than in cypress/support/index.d.ts because this is
// currently the only Cypress file that touches these hooks — a future
// ticket can lift the declaration into a shared types file when a second
// consumer appears.
interface SimLike {
  simulationRunning: boolean;
  engine?: { fireDidStop: boolean };
}

declare global {
  interface Window {
    sim: SimLike;
    test: {
      placeSparkInZone(zoneIdx: number): void;
      placeFireLineInZone(zoneIdx: number): void;
      placeHelitackInZone(zoneIdx: number): void;
      zoneBounds(zoneIdx: number): {
        minX: number; maxX: number; minY: number; maxY: number;
        centerX: number; centerY: number;
      };
    };
  }
}
export {}; // makes `declare global` work in a file with no other exports

const URL = "/?preset=plainsTwoZone&hazbotRules=24";

const expectButtonStates = (states: {
  setup: boolean; spark: boolean; reload: boolean; restart: boolean;
  startStop: boolean; fireLine: boolean; helitack: boolean;
}) => {
  cy.get("[data-testid='terrain-button']").should(states.setup ? "not.be.disabled" : "be.disabled");
  cy.get("[data-testid='spark-button']").should(states.spark ? "not.be.disabled" : "be.disabled");
  cy.get("[data-testid='reload-button']").should(states.reload ? "not.be.disabled" : "be.disabled");
  cy.get("[data-testid='restart-button']").should(states.restart ? "not.be.disabled" : "be.disabled");
  cy.get("[data-testid='start-button']").should(states.startStop ? "not.be.disabled" : "be.disabled");
  cy.get("[data-testid='fireline-button']").should(states.fireLine ? "not.be.disabled" : "be.disabled");
  cy.get("[data-testid='helitack-button']").should(states.helitack ? "not.be.disabled" : "be.disabled");
};

describe("Bottom-bar state machine (WM-24)", () => {
  beforeEach(() => {
    cy.visit(URL);
    // Wait for dataReady before asserting button states — the engine
    // doesn't mount until cells are loaded.
    cy.window().its("sim.dataReady").should("eq", true);
  });

  it("state 1 (Default): Setup + Spark enabled; rest disabled", () => {
    expectButtonStates({
      setup: true, spark: true,
      reload: false, restart: false, startStop: false,
      fireLine: false, helitack: false,
    });
  });

  it("state 2 (SetupChanged): Reload enabled; otherwise Default", () => {
    // Open Setup, change drought on zone 0, click Create.
    cy.get("[data-testid='terrain-button']").click();
    cy.get("[data-testid='terrain-header']").should("be.visible");
    // Wizard starts at panel 1 (zone-edit) for plainsTwoZone (zonesCount=2 in config).
    // Bump drought slider one step.
    cy.get("[data-testid='drought-slider'] input")
      .invoke("val", "3")
      .trigger("change");
    // Walk to wind panel, click Create.
    cy.contains("button", /next/i).click();
    cy.contains("button", /create/i).click();
    expectButtonStates({
      setup: true, spark: true,
      reload: true, restart: false, startStop: false,
      fireLine: false, helitack: false,
    });
  });

  it("state 3 (SparkPlaced): Start + Reload enabled", () => {
    cy.window().then(win => { win.test.placeSparkInZone(0); });
    expectButtonStates({
      setup: true, spark: true,
      reload: true, restart: false, startStop: true,
      fireLine: false, helitack: false,
    });
  });

  it("state 4 (Running): Setup/Spark disabled; Restart/Start/Fire Line/Helitack enabled", () => {
    cy.window().then(win => { win.test.placeSparkInZone(0); });
    cy.get("[data-testid='start-button']").click();
    cy.window().its("sim.simulationRunning").should("eq", true);
    expectButtonStates({
      setup: false, spark: false,
      reload: true, restart: true, startStop: true,
      fireLine: true, helitack: true,
    });
  });

  it("state 5 (Ended): Start/Fire Line/Helitack disabled; Restart/Reload enabled", () => {
    cy.window().then(win => { win.test.placeSparkInZone(0); });
    cy.get("[data-testid='start-button']").click();
    cy.window().then(win => {
      // Order matters: set fireDidStop (non-observable) BEFORE flipping
      // simulationRunning (observable). The simulationEnded computed only
      // re-evaluates on the simulationRunning edge — if we flipped it first,
      // the computed would lock in false because fireDidStop was still false
      // at re-eval time.
      if (win.sim.engine) win.sim.engine.fireDidStop = true;
      win.sim.simulationRunning = false;
    });
    expectButtonStates({
      setup: false, spark: false,
      reload: true, restart: true, startStop: false,
      fireLine: false, helitack: false,
    });
  });

  it("state 6 (Restarted): Setup/Spark/Start/Reload enabled; Restart disabled; Fire Line/Helitack disabled", () => {
    cy.window().then(win => { win.test.placeSparkInZone(0); });
    cy.get("[data-testid='start-button']").click();
    cy.get("[data-testid='restart-button']").click();
    cy.window().its("sim.simulationStarted").should("eq", false);
    expectButtonStates({
      setup: true, spark: true,
      reload: true, restart: false, startStop: true,
      fireLine: false, helitack: false,
    });
  });

  it("state 7 (AfterReload from SetupChanged): identical to Default for plainsTwoZone", () => {
    // Reach SetupChanged
    cy.get("[data-testid='terrain-button']").click();
    cy.get("[data-testid='drought-slider'] input")
      .invoke("val", "3")
      .trigger("change");
    cy.contains("button", /next/i).click();
    cy.contains("button", /create/i).click();
    // Now Reload
    cy.get("[data-testid='reload-button']").click();
    cy.window().its("sim.dataReady").should("eq", true);
    // setupChanged must be reset by reload() — without this assertion,
    // a bug that skipped the `this.setupChanged = false` line in reload()
    // could still pass the button-state matrix below for the curriculum
    // preset (sparks.length=0 hides the setupChanged contribution to
    // reloadEnabled). The assertion directly tests the spec invariant.
    cy.window().its("sim.setupChanged").should("eq", false);
    expectButtonStates({
      setup: true, spark: true,
      reload: false, restart: false, startStop: false,
      fireLine: false, helitack: false,
    });
  });
});
```

**No `cypress/support/elements/BottomBar.js` changes needed**:

Audit of
[cypress/support/elements/BottomBar.js](../../cypress/support/elements/BottomBar.js)
confirms all seven button selectors are already present (used by
`smoke.cy.ts`): `getTerrainSetupButton`, `getSparkButton`,
`getReloadButton`, `getRestartButton`, `getStartButton`,
`getFireLineButton`, `getHelitackButton`. The new state-machine spec
above is intentionally written with inline `cy.get("[data-testid='...']")`
calls — see the file-outline comment locking that choice in.

**Determinism considerations**:

- **Animation frames / `dataReady`**: The `beforeEach` waits on
  `sim.dataReady === true` before any assertion. Without this, the
  preset's `populateCellsData()` promise may still be in flight and
  cell-dependent computeds (e.g. `canAddSpark` depends on `sparks.length`
  which is fine, but `canAddFireLineMarker` depends on cells via
  `cellAt`) may not be stable.
- **Restart click in Default** (the silent-no-op problem from the
  Cypress audit table in requirements.md): the new state-6 test
  explicitly clicks Restart from a real Running state (not Default), so
  the line-110 vestigial-click pattern in `smoke.cy.ts` does not recur
  here.
- **State 5 forced-end**: the `win.sim.engine.fireDidStop = true; win.sim.simulationRunning = false;`
  mutation bypasses MobX `@action` boundaries, but since the read path
  (`@computed simulationEnded`) re-evaluates on the next observation
  pull, this is safe for the assertion-only test. The assignment order
  is load-bearing: `fireDidStop` is non-observable, so it must be set
  *before* the observable `simulationRunning` edge that drives the
  computed re-evaluation — otherwise the computed reads `fireDidStop`
  as still `false` and locks the UI in Paused state. If a future change
  makes MobX strict-mode-only or wraps observable writes, the test will
  need to use the existing `simulation.stop()` + engine-mutation
  combination instead — flag for any future MobX upgrade.

After this step, run `npx cypress run --spec
"cypress/e2e/bottom-bar-state-machine.cy.ts"` and verify all seven
states pass green. Include the run log in the implementation PR
description.

---

## Open Questions

### RESOLVED: Wind / zonesCount test ergonomics for terrain-panel test cases (f) and (g)

**Context**: Test cases (f) "change wind, Create → setupChanged true" and
(g) "change zonesCount, Create → setupChanged true" are listed in the
requirements as load-bearing tests but the existing
[terrain-panel.test.tsx](../../src/components/terrain-panel.test.tsx) suite
doesn't establish a pattern for driving `WindCircularControl` or
`ZonesCountSelector` interactively. The drought-slider pattern uses
`fireEvent.change` on the input inside `getByTestId("drought-slider")`,
which works because `DroughtSelector` wraps an MUI `<Slider>` (real
internal `<input>`) in a test-id'd container.

The wind control and zones-count selector are asymmetric:
- **Wind speed** is an MUI `<Slider>` at
  [wind-circular-control.tsx:76-91](../../src/components/wind-circular-control.tsx#L76-L91) —
  same shape as drought, easily wrappable in a test-id'd div.
- **Wind direction** is a custom `<WindDial>` SVG at
  [wind-circular-control.tsx:65-69](../../src/components/wind-circular-control.tsx#L65-L69) —
  no `<input>` to attach a test-id to. `fireEvent.change` has nothing to
  target. Driving it from a Jest test would require either reverse-engineering
  the dial's click/drag handlers, or invoking its `onChange` prop directly
  via component-tree spelunking — both brittle and not in the spirit of the
  drought-slider integration pattern.
- **ZonesCount** is an MUI `<RadioGroup>` of `<Radio>` controls at
  [zones-count-selector.tsx:13-36](../../src/components/zones-count-selector.tsx#L13-L36) —
  each `<Radio>` renders an internal `<input type="radio">` discoverable
  via the input's `value` attribute (no extra test-id needed) or via an
  added test-id on each `FormControlLabel`'s control.

**Decision**: **A' (refined) — pivot case (f) to wind *speed* + add a
unit test on the extracted diff helper for direction.** Specifically:

- **Case (f) integration test** drives the **wind speed** Slider (the
  speed half of the wind control) using the drought-slider pattern. Wrap
  the `<Slider>` in a `data-testid="wind-speed-slider"` div in
  `wind-circular-control.tsx`, then `getByTestId("wind-speed-slider").querySelector("input")`
  → `fireEvent.change`.
- **Direction coverage** moves out of the wizard-driven test and into a
  unit test on the extracted `setupSnapshotDiffers` helper. Extract the
  helper from `terrain-panel.tsx` into its own module (e.g.
  `setup-snapshot.ts`), then add a `setup-snapshot.test.ts` with
  synthetic-snapshot cases covering each tracked field — including
  `windDirection`, which is otherwise untested at the unit level. This
  guards against "the diff function silently drops field X" for every
  tracked field, including the ones with non-Slider UI controls.
- **Case (g) integration test** drives the **zonesCount** RadioGroup by
  targeting one of the `<input type="radio">` elements that MUI renders
  inside each `<Radio>`. Either (i) query by value: `container.querySelector('input[value="3"]')`,
  or (ii) add `data-testid` attributes to the `<FormControlLabel>` controls
  in `zones-count-selector.tsx` (e.g. `data-testid="zones-count-radio-3"`).
  Option (i) is preferred — no component change needed; the RadioGroup
  already has a `data-testid="zones-count-selector"` wrapper. Then
  `fireEvent.click(radioInput)` flips the underlying input's `checked`
  state, which MUI translates into the `onChange` callback firing.

Why the pivot for direction (vs. inserting an `<input type="hidden">`
inside `WindDial` to make it test-driveable): adding a hidden form input
purely for test scaffolding pollutes the component for non-test reasons,
and the unit test on `setupSnapshotDiffers` provides equivalent coverage
of "the diff function considers windDirection" without DOM gymnastics.
The drought-slider test (b) already provides the wiring proof that
`applyAndClose` calls the helper at all, so "applyAndClose correctly
wires the helper" generalizes to direction via the unit test.

**Impact on step 4**:

1. **`wind-circular-control.tsx`**: wrap the `<Slider>` at
   [wind-circular-control.tsx:76-91](../../src/components/wind-circular-control.tsx#L76-L91)
   in a `<div data-testid="wind-speed-slider">…</div>` wrapper. No
   `<WindDial>` change. One-line markup addition.

2. **`zones-count-selector.tsx`**: no change needed; the existing
   `data-testid="zones-count-selector"` wrapper plus MUI's internal radio
   inputs are sufficient for case (g).

3. **Extract `setupSnapshotDiffers`**: move the helper from
   `terrain-panel.tsx` into a new file
   `src/components/setup-snapshot.ts` (or similar). Re-import in
   `terrain-panel.tsx`. Adds one file, removes the helper definition
   from the component file.

4. **New file `setup-snapshot.test.ts`**: synthetic-snapshot unit tests
   covering each tracked field independently: drought (per-zone),
   vegetation (per-zone), terrainType (per-zone), windSpeed,
   `windDirection`, zonesCount. Each test constructs a `snapshot` and a
   `current` that differ only in the field under test, asserts
   `setupSnapshotDiffers(snapshot, current) === true`. Plus a baseline
   "identical snapshots return false" test.

5. **Cases (f) and (g) in `terrain-panel.test.tsx`** use the speed-slider
   and radio-input patterns:

```ts
it("(f) change wind speed, Create — setupChanged becomes true", async () => {
  render(
    <Provider stores={stores}>
      <TerrainPanel />
    </Provider>
  );
  await goToCreatePanel();
  // Wind speed slider lives on the final panel — drive it like drought.
  const speedSlider = screen.getByTestId("wind-speed-slider").querySelector("input")!;
  // Default speed depends on config; bump by a clear delta. The Slider
  // is bounded 0-30 with windScaleFactor applied — we drive the raw
  // scaled value, which the onChange handler scales back via
  // windScaleFactor before forwarding to onSpeedChange. Any non-zero
  // delta is sufficient to flip setupChanged.
  act(() => {
    fireEvent.change(speedSlider, { target: { value: "15" } });
  });
  await clickCreate();
  expect(stores.simulation.setupChanged).toBe(true);
  // Direction coverage lives in setup-snapshot.test.ts — see the
  // extracted helper's unit tests. Direction has no `<input>` in
  // WindDial (custom SVG), so wizard-driven testing isn't viable
  // without component scaffolding for test-only purposes.
});

it("(g) change zonesCount (2 → 3), Create — setupChanged becomes true", async () => {
  // Require config.zonesCount === undefined so the wizard starts on the
  // zones-count panel.
  stores.simulation.config.zonesCount = undefined as any;
  const { container } = render(
    <Provider stores={stores}>
      <TerrainPanel />
    </Provider>
  );
  // Wizard now starts at panel 0 (zones-count).
  // ZonesCountSelector renders MUI <Radio>s with value="2" and value="3";
  // each wraps an <input type="radio"> queryable by value attribute.
  // eslint-disable-next-line testing-library/no-node-access
  const threeZonesInput = container.querySelector('input[type="radio"][value="3"]') as HTMLInputElement;
  expect(threeZonesInput).not.toBeNull();
  act(() => {
    fireEvent.click(threeZonesInput);
  });
  // Walk through Next twice (panel 0 → 1 → 2) before clicking Create.
  const nextButtons = () => screen.getAllByRole("button", { name: /next/i });
  await userEvent.click(nextButtons()[nextButtons().length - 1]);
  await userEvent.click(nextButtons()[nextButtons().length - 1]);
  await clickCreate();
  expect(stores.simulation.setupChanged).toBe(true);
});
```

And a sketch of the direction unit test that lives in `setup-snapshot.test.ts`:

```ts
it("setupSnapshotDiffers returns true when windDirection changes", () => {
  const snapshot: ISetupSnapshot = {
    zonesCount: 2,
    zones: [
      { terrainType: 0, vegetation: 1, droughtLevel: 2 },
      { terrainType: 1, vegetation: 1, droughtLevel: 1 },
    ],
    windSpeed: 5,
    windDirection: 0,
  };
  expect(setupSnapshotDiffers(snapshot, {
    zonesCount: 2,
    zones: snapshot.zones.map(z => new Zone(z as any)),
    windSpeed: 5,
    windDirection: 45,  // only diff
  })).toBe(true);
});
```

(Plus parallel tests for each other tracked field — drought, vegetation,
terrainType per zone, windSpeed, zonesCount — and a baseline-equal test
that asserts `false`.)

---

### RESOLVED: Reload/Restart disabled styling — scoped CSS vs. convert to IconButton

**Context**: The Reload and Restart buttons currently use MUI `<Button>`
with custom styling via `.playbackButton` in
[bottom-bar.scss](../../src/components/bottom-bar.scss). They do not use
the `IconButton` wrapper component
([icon-button.tsx](../../src/components/icon-button.tsx)) used by Setup,
Spark, Fire Line, and Helitack. The two render structurally differently:
IconButton lays out a 45px-tall icon above a text label (vertical), while
the Reload / Restart playback buttons render `<span><Icon/> Text</span>`
inline (horizontal).

The spec (RESOLVED "Reload and Restart button styling when disabled")
leaves this as a Phase 2 choice: either keep them as `<Button>` and add a
scoped disabled rule in `bottom-bar.scss`, or convert them to use
`IconButton` so they inherit the new opacity rule from
`icon-button.scss`. The disabled appearance ends up identical either way.

**Decision**: **A — keep as `<Button>` and add a scoped
`.playbackButton:disabled` rule in `bottom-bar.scss`.** This is what step
6 currently drafts: a 4-line SCSS addition that keeps Reload/Restart's
existing horizontal layout unchanged and reuses the `opacity: 0.35` +
`filter: grayscale(1)` pattern from the IconButton rule. Converting to
IconButton (B) would force a visual redesign (vertical layout) that is
explicitly Out of Scope per "Visual redesign of the buttons themselves".
Extracting a shared mixin (C) is reasonable but adds SCSS plumbing for
marginal factoring benefit — the rule appears in only two places.

---

### RESOLVED: Step 5 size and split — should it be one commit or two?

**Context**: Step 5 (bottom-bar rewire + test rewrite + log-events
fixture) is estimated at ~400 lines and contains three changes that could
theoretically be separated: (1) the source-side state-machine rewire in
`bottom-bar.tsx`; (2) the full `bottom-bar.test.tsx` rewrite; (3) the
one-line `log-events.test.tsx` fixture patch. Splitting would let
reviewers approve the source change separately, but the existing
`bottom-bar.test.tsx` has assertions that would fail under the new rules
(clicking Restart / Reload in Default → `userEvent.click` no-ops against
`<button disabled>`, breaking the spy assertions). So splitting source
from tests would leave the suite red between commits.

**Decision**: **A — single commit, as drafted.** The only path that keeps
CI green between commits. The ~400-line total is mostly the new test
suite (the source rewire itself is ~80 lines), and the test suite is the
load-bearing regression guard for the whole feature — splitting it from
the source change would leave reviewers with either failing tests or
untested source for one commit. The bundled commit lets a reviewer scan
"rule X in requirements → assertion X in tests → predicate X in source"
linearly. Splits B and C both leave the suite red between commits, and D
(feature-flag) is overkill for an internal UI state machine.

---

### RESOLVED: Should the implementation include a small Cypress smoke step for the new disabled-state transitions?

**Context**: The RESOLVED "Should existing Cypress and Hazbot-ruleset
tests be updated…" decision says Cypress rewrites are out of scope for
this ticket; Jest coverage is sufficient. But adding a single thin
Cypress flow that asserts "Reload is disabled in Default, enabled after
placing a spark" would catch CSS regressions, build-tooling regressions,
and reactivity regressions that Jest can't.

**Decision**: **C — add a dedicated `bottom-bar-state-machine.cy.ts`
covering the full seven-state matrix at the browser level.**

**Scope note**: This expands scope vs. the RESOLVED "Should existing
Cypress and Hazbot-ruleset tests be updated…" block in
[requirements.md](requirements.md), which said Cypress rewrites are out
of scope. That block remains accurate for **existing** Cypress files
(`smoke.cy.ts` is left untouched). The new file is a *net addition*,
not a rewrite — a separate spec dedicated to the lifecycle state
machine. The follow-up note in the requirements RESOLVED block ("Adding
new Cypress coverage specifically for the new disabled-state transitions
is a follow-up ticket if desired") explicitly contemplated this work as
a follow-up; the implementation spec chooses to absorb it into this
ticket rather than spin a separate ticket. See **step 7** below for the
concrete plan.

A (out of scope) was the cheaper default. B (one `it` in `smoke.cy.ts`)
was rejected because mixing state-machine coverage into the smoke flow
muddles `smoke.cy.ts`'s purpose. C gives the browser-level regression
guard (CSS, reactivity, build) with a clear single-purpose file
reviewers can extend or delete.

---

## Self-Review (2026-05-26)

Roles: Senior Engineer, QA Engineer, MobX/React Reactivity Reviewer, WCAG
Accessibility Expert, Technical Writer. Findings are grounded in a read of
[src/models/simulation.ts](../../src/models/simulation.ts),
[src/components/bottom-bar.tsx](../../src/components/bottom-bar.tsx),
[src/components/icon-button.tsx](../../src/components/icon-button.tsx),
[src/components/icon-button.scss](../../src/components/icon-button.scss),
[src/components/bottom-bar.scss](../../src/components/bottom-bar.scss),
[src/components/terrain-panel.tsx](../../src/components/terrain-panel.tsx),
[src/models/engine/fire-engine.ts](../../src/models/engine/fire-engine.ts),
and [src/setupTests.ts](../../src/setupTests.ts).

### Senior Engineer

#### RESOLVED: Step 2 `simulationEnded` value + reactivity tests will fail — `updateFire` resets `fireDidStop` on every tick

The `simulationEnded` tests in step 2 originally used this pattern:

```ts
sim.start();
(sim.engine as any).fireDidStop = true;
sim.tick(1);
expect(sim.simulationEnded).toBe(true);
```

But [fire-engine.ts:162-168](../../src/models/engine/fire-engine.ts#L162-L168) shows
`updateFire` unconditionally resets `fireDidStop = true` at the top of every call,
then iterates cells and flips it to `false` if any are `isBurningOrWillBurn`. The
manually-set `fireDidStop = true` is overwritten by `updateFire` based on actual
cell state. With a fresh spark at (50000, 50000) on the 5x5 grid in the test
config, cells around the spark are burning at `time=1`, so `updateFire` would
land `fireDidStop = false` and `simulationRunning` would *not* flip — making
`simulationEnded === false`. The "is true when fire finishes naturally" value test
and the "reactivity contract" `reaction` test both depend on this pattern and
would have failed as written.

**Resolution**: Replaced the `(sim.engine as any).fireDidStop = true` pattern in
all three affected tests with a `updateFire` stub:

```ts
(sim.engine as any).updateFire = function () { this.fireDidStop = true; };
sim.tick(1);
```

The stub preserves the manual flip through `tick()`'s `updateFire` call, so the
post-`updateFire` check at [simulation.ts:315-316](../../src/models/simulation.ts#L315-L316)
sees `fireDidStop === true` and flips `simulationRunning = false`. Comments in
each affected test explain why the stub is needed so a future maintainer doesn't
"simplify" back to the broken pattern.

---

#### RESOLVED: Step 6 dropped `!important` from the IconButton disabled rule

The existing rule at [icon-button.scss:34-37](../../src/components/icon-button.scss#L34-L37)
is `&.disabled { opacity: 0.5 !important; filter: grayscale(1); }`. The
`!important` was likely necessary to override MUI v4's `.MuiButton-label`
rules (since removed in MUI v5). Step 6 originally rewrote this with no
`!important` on the new `> span { opacity: 0.35 }` rule.

**Risk**: an MUI v5 release that adds opacity-related rules to `.Mui-disabled`
would silently flatten the fade, since `> span { opacity: 0.35 }` wouldn't
compete with rules on the button itself.

**Resolution**: Kept `!important` on the new `> span { opacity: 0.35 !important }`
rule defensively. Comment added inline explaining the upgrade-risk rationale
so a future maintainer doesn't strip it as cargo-cult. This is a one-character
defensive guard against an MUI minor; the bottom-bar.scss
`.playbackButton:disabled` rule (separate selector) keeps its own
specificity-based reasoning per the original draft.

---

#### RESOLVED: Step 6 rationale referenced `MuiButton-label`, removed in MUI v5

Step 6 originally said: "The MUI Button always renders its content inside a
child `<span class='MuiButton-label'>` (or in the case of our IconButton
wrapper, the inner `<span>` at icon-button.tsx:23-27)." MUI v5 (which this
project uses — `import Button from "@mui/material/Button"` at
[bottom-bar.tsx:8](../../src/components/bottom-bar.tsx#L8)) *removed* the
`MuiButton-label` wrapper as part of the v4→v5 migration.

**Resolution**: Rewrote the rationale paragraph to source the `<span>`
existence claim from the actual JSX in
[icon-button.tsx:23-27](../../src/components/icon-button.tsx#L23-L27) and
[bottom-bar.tsx:129,137,148](../../src/components/bottom-bar.tsx#L129), and
explicitly noted that MUI v5 does not add its own content wrapper. The
`> span` selector reasoning is unchanged; only the historical justification
was corrected.

---

#### RESOLVED (no change needed): `handleReload` / `handleRestart` click tests with partial-object engine

The state-4 / state-5 click tests in step 5 seed the engine as
`{ fireDidStop: false, burnedCellsInZone: {} }` cast to `any`. Initial
concern: clicking Reload / Restart in those states triggers
`getOutcomeData(chartStore)`, which might throw on the partial fake.

**Resolution (verified by source read)**: [getOutcomeData](../../src/models/simulation.ts#L367-L424)
tolerates the partial fake by construction:
1. `engine?.burnedCellsInZone[zoneIdx] || 0` — optional chain + falsy
   fallback handles missing fields.
2. `this.totalCellCountByZone[zoneIdx]` defaults to `{}` (empty Record);
   the ternary at line 372 short-circuits to `0` before `getZoneBurnPercentage`
   runs, side-stepping the `burnedCells / undefined → NaN` branch.
3. `this.cells.length > 0` is false in tests, skipping all `cellAt()` /
   `cell.fireState` reads inside the towns map.
4. `chartStore.rawBurnData[zoneIdx]` defaults to `undefined` or `[]` in a
   fresh chartStore; the `if (rawData && rawData.length >= 2)` guard
   handles either case.

So no change is needed. Logged here so a future reader looking at the
partial-engine pattern doesn't re-raise the same concern — and so that
if `getOutcomeData` is later refactored to add unguarded engine reads,
this RESOLVED block surfaces the load-bearing contract.

---

#### RESOLVED: `ui.interaction = null` placement rationale tightened

Step 5 originally explained the `ui.interaction = null` placement as "Order
doesn't matter functionally; this placement keeps the diff small and reads
as 'clear UI state alongside chart state.'" That left a future maintainer
without grounding for why the order is safe to keep — or shuffle.

**Resolution**: Rewrote the placement comment to source the safety claim
from MobX action-batching semantics: both `restart()` and `reload()` are
`@action.bound`, so their internal writes batch with the surrounding
synchronous handler block, and MobX flushes observers (plus React renders)
once at end. The chosen order is for readability, not for any sequencing
guarantee.

---

### QA Engineer

#### RESOLVED: State-4 test in step 5 omitted the Start/Stop "Stop" label assertion

The seven-state matrix row for state 4 (Running) calls out that the
Start/Stop button label is **"Stop"** when `simulationRunning === true`. The
state-4 test originally asserted `expectButtonState("start-button", true)`
(enabled) but never asserted the label. Requirement 4 explicitly enumerates
the label-flip behavior, and the Paused-vs-Ended test pair already asserts
the "Start" label in those sub-states. Without the symmetric "Stop" assertion
in state 4, a regression that broke the
`simulation.simulationRunning ? <span>...Stop</span> : <span>...Start</span>`
ternary at [bottom-bar.tsx:148](../../src/components/bottom-bar.tsx#L148)
would slip past.

**Resolution**: Added `expect(screen.getByTestId("start-button")).toHaveTextContent("Stop");`
to the state-4 test with a regression-guard comment pointing at the ternary
line.

---

#### RESOLVED: Handler-spy tests in step 5 — clarifying comment added

The pre-rewrite tests ("restarts simulation", "resets simulation and resets
view") presumably asserted real state changes. The rewrite replaces these
with `expect(stores.simulation.restart).toHaveBeenCalled()` — `jest.spyOn`
forwards by default so the transition still happens, but the assertion is
just "spy was called". Aggregate state-transition coverage is preserved
elsewhere (Paused→Restart, Paused→Reload, Running→Reload).

**Resolution**: Added a comment to the `handler spies` describe block
explicitly marking these as handler-wiring checks and pointing to the
neighboring state-transition tests. The comment also warns against
weakening to `mockImplementation(() => {})`, since that would break the
forwarding behavior that lets the spy assertions stay as drafted while
state-transitions remain covered.

---

#### RESOLVED: Test case (d) `getByText("X")` brittleness

Step 4's test case (d) originally ended with
`await userEvent.click(screen.getByText("X"))`. The X close button in
[terrain-panel.tsx:195](../../src/components/terrain-panel.tsx#L195) is a
plain `<div>` with `onClick={handleClose}` and no test-id. `getByText("X")`
is brittle to any other "X" character in the rendered DOM.

**Resolution**: Added `data-testid="terrain-panel-close"` to the close
`<div>` in step 4's "Files affected" list, and rewrote test case (d) to use
`getByTestId("terrain-panel-close")`. The work folds into the same step
that already adds test-ids for wind / zonesCount inputs.

---

#### RESOLVED: `seedState` default-`zonesCount` assumption now has a sanity guard

The `seedState` helper doesn't seed `zones` — it relies on `createStores()`
running through `setInputParamsFromConfig` with the default config. The
default preset (`presets.default`) currently ships with 3 zones
(Mountains / Foothills / Plains) and `getDefaultConfig().zonesCount` is
undefined, so `simulation.zonesCount` resolves to `zones.length === 3`.
Tests reading `canAddSpark` → `remainingSparks` → `zonesCount - sparks.length`
would silently shift if a future `getDefaultConfig()` or `presets.default`
change moved the zones count below 2 (since `seedState` adds 1 spark for
states 3/4/5/6, and spark-button-enabled assertions need at least one
remaining spark).

**Resolution**: Added
`expect(simulation.zonesCount).toBeGreaterThanOrEqual(2)` at the top of
`seedState`, with a comment explaining the dependency. The matrix
assertions are robust to either 2 or 3 zones (in both cases `1 spark < N
zones`, so `canAddSpark` stays true). A future config shift that drops
below 2 zones fails loudly at the right place rather than producing
confusing button-state mismatches downstream. Pinning a specific preset
(option (b)) was considered but rejected — it pulls preset machinery into
a unit-test fixture for no real test-quality gain over the one-line
semantic guard.

(Earlier draft of this note encoded the false assumption that the default
preset ships with 2 zones and used a hard-coded `toBe(2)` guard.
External review flagged the mismatch; corrected here.)

---

#### RESOLVED: Step 7 Cypress state-7 now asserts `setupChanged` reset

The state-7 Cypress test (AfterReload from SetupChanged) originally
asserted button states only. A bug skipping `this.setupChanged = false`
in `reload()` could pass the button matrix for curriculum presets, since
clearing sparks would still flip `reloadEnabled = setupChanged || sparks.length > 0`
to false visually — masking the `setupChanged` residue.

**Resolution**: Added `cy.window().its("sim.setupChanged").should("eq", false);`
between the Reload click and the button-state assertions, with a comment
explaining the masking concern. Mirrors the corresponding Jest
assertion.

---

### MobX/React Reactivity Reviewer

#### RESOLVED: MobX strict-mode dependency now documented in step 5

Verified that [setupTests.ts:5](../../src/setupTests.ts#L5) sets
`configure({ enforceActions: "never", safeDescriptors: false })`, so the
direct-write test pattern is legal. But the spec was silent on the
dependency.

**Resolution**: Added a "MobX strict-mode dependency" paragraph to step 5
that explicitly names the config setting, points at the Cypress state-5
hook as a co-dependent in step 7, and explains how a future tightening
change should update the call sites. Flagged in the spec so the dependency
isn't invisible to a future maintainer.

---

#### RESOLVED: Snapshot-capture `useEffect` edge-case documentation added

The snapshot-capture effect in step 4 fires whenever `ui.showTerrainUI`
flips to true. Three theoretical edge cases:

1. **React 18 strict mode double-invocation**: harmless (re-captures same
   value).
2. **Wizard re-opened without intermediate close**: dep array sees no
   change → no re-fire → correct outcome.
3. **Pathological synchronous close-and-reopen within one render cycle**:
   dep would compare final=true to prior=true → no re-fire → snapshot
   would be stale. Not reachable via current UI flow (the Setup button
   toggles `ui.showTerrainUI`, not double-toggles synchronously).

**Resolution**: Expanded the comment on the snapshot-capture effect in
step 4's code block to explicitly document the `false → true` transition
assumption and call out the strict-mode double-fire as harmless. Case (3)
is documented rather than guarded — the UI doesn't produce it, and
guarding would add complexity for an unreachable path.

---

### WCAG Accessibility Expert

#### RESOLVED: Step 6 sighted-user check now accounts for `grayscale(1)` + `opacity: 0.35` compounding

Step 6 preserves `filter: grayscale(1)` *and* adds `opacity: 0.35` on the
inner span. The two compound: grayscale collapses chromatic signal to
luminance, then 0.35 opacity fades that luminance against a near-white
background. For users with cataracts or age-related contrast loss, the
disabled icon could land effectively invisible. The original Technical
Notes a11y note flagged 0.35 alone but didn't address the compounding.

**Resolution**: Extended the Step 6 sighted-user-check instructions to
explicitly call out the `grayscale(1) + opacity: 0.35` compounding and
require running the check in both standard rendering and at least one
low-vision simulation (Chrome DevTools' "Emulate vision deficiencies"
panel — "Blurred vision" or "Achromatopsia"). The designer escalation
path (flag Michael Tirenin before merging) is unchanged. PR screenshot
guidance updated to recommend including a low-vision rendering alongside
the standard one.

---

#### RESOLVED: `.playbackButton:disabled` focus styling rationale documented

The proposed `.playbackButton:disabled` rule originally addressed `:hover` /
`:active` but not `:focus`. Native `<button disabled>` removes the element
from the tab order, so keyboard users can't focus it via Tab. Programmatic
focus (e.g. dialog-close focus restoration) landing on a disabled button is
theoretical and would be a UX bug already.

**Resolution**: Added an inline SCSS comment to the `.playbackButton:disabled`
block in step 6 explaining the no-`:focus`-rule choice and pointing at the
requirements.md "Focus re-targeting" Out of Scope bullet that already
covers the broader theoretical case.

---

### Technical Writer

#### RESOLVED: Step 7 "(sketch)" qualifier dropped

The Cypress file-outline intro originally read "**File outline** (sketch —
concrete code at Phase 2 commit time):" followed by ~120 lines of complete
typed Cypress code (imports, helper, seven `it` blocks). Hedging in prose
while shipping the full code mid-step muddied the mandate-vs-suggestion
distinction.

**Resolution**: Replaced the qualifier with "(concrete code below —
implementable as-is, modulo any test-id renames discovered while wiring
up)". The hedge that remains is honest (test-ids `wind-direction-input`,
`zones-count-input-3`, `terrain-panel-close` may need renaming when step 4
actually attaches them) without contradicting the completeness of the
Cypress code itself.

---

#### RESOLVED: Step 5 single-commit rationale trimmed in the intro

The Implementation Plan intro originally said: "Each step … green on CI in
isolation. The exception is the bottom-bar rewrite (step 5), which must
land together with its test rewrite because the existing tests assert
'Restart and Reload always enabled' — see step 5's Summary for the ordering
rationale." Step 5's Summary re-explained the same point.

**Resolution**: Trimmed the intro to "must land together with its test
rewrite — see step 5's Summary for the ordering rationale." The detailed
explanation lives in one place (the Summary) instead of two.

---

#### RESOLVED: Step 5's `handleReload`/`handleRestart` prose now disambiguates from step 1's `simulation.ts` changes

Step 5's "Files affected" list correctly omits `simulation.ts`, but the
prose immediately following discussed `handleReload`/`handleRestart` in a
way that could read like a cross-file touch.

**Resolution**: Added a parenthetical "(no `simulation.ts` change in this
step — the `setupChanged` reset on `reload()` lives in step 1; here we
only mutate `ui.interaction` from the component handlers)" to the
relevant paragraph in step 5. Closes the disambiguation gap without
restructuring the step.

---

#### RESOLVED: State 7 test now sanity-guards the empty-`config.sparks` assumption

The state-7 Jest test asserted Default-equivalent button matrix but didn't
pin the preset, relying on `createStores()`'s default config having
`config.sparks === []`. Requirements.md's "Preset caveat" says dev presets
(`basic`, `basicWithWind`, ...) ship with preplaced sparks and AfterReload
lands in SparkPlaced-shape under those.

**Resolution**: Added `expect(stores.simulation.config.sparks).toEqual([]);`
sanity guard at the top of the state-7 test body, with a comment naming the
assumption and pointing at the requirements.md preset caveat. Same pattern
as the `zonesCount >= 2` guard added in `seedState`: surface a future
default-config shift loudly at the right place. Pinning a preset
explicitly (option (a)) was considered but rejected for the same
unit-test-fixture reason given in `seedState`.

---

## Self-Review (fourth pass, 2026-05-26)

Roles: Senior Engineer, QA Engineer, MobX/React Reactivity Reviewer, WCAG
Accessibility Expert, Technical Writer. Fresh-eyes pass against the current
spec text, grounded in a re-read of
[src/components/bottom-bar.tsx](../../src/components/bottom-bar.tsx),
[src/components/terrain-panel.tsx](../../src/components/terrain-panel.tsx),
[src/components/wind-circular-control.tsx](../../src/components/wind-circular-control.tsx),
[src/components/zones-count-selector.tsx](../../src/components/zones-count-selector.tsx),
[src/components/icon-button.tsx](../../src/components/icon-button.tsx),
[src/components/icon-button.scss](../../src/components/icon-button.scss),
[src/components/bottom-bar.scss](../../src/components/bottom-bar.scss),
[src/components/log-events.test.tsx](../../src/components/log-events.test.tsx),
[cypress/support/elements/BottomBar.js](../../cypress/support/elements/BottomBar.js),
and [cypress/e2e/smoke.cy.ts](../../cypress/e2e/smoke.cy.ts). Scope: surface
**new** issues not already RESOLVED in passes 1-3.

### Senior Engineer

#### RESOLVED: Step 4 test case (f) targets wind *direction*, but `WindDial` has no `<input>` to drive with `fireEvent.change`

[wind-circular-control.tsx:65-69](../../src/components/wind-circular-control.tsx#L65-L69)
renders `<WindDial>` for direction — a custom interactive SVG. There is no
`<input>` element for wind direction anywhere in the component, so the
spec's proposed `data-testid="wind-direction-input"` on direction cannot
hang off a real input and `fireEvent.change` (the drought-slider pattern)
won't work. Wind *speed*, by contrast, is a real MUI `<Slider>` at
[wind-circular-control.tsx:76-91](../../src/components/wind-circular-control.tsx#L76-L91)
with an internal `<input>`, drivable with the existing slider pattern
(wrap the slider in a `data-testid="wind-speed-slider"` div, then
`getByTestId(...).querySelector("input")` → `fireEvent.change`).

**Resolution**: Pivoted case (f) from wind direction to wind **speed**
(the integration path that actually works with the drought-slider
pattern). Wind direction coverage moves to a unit test on the extracted
`setupSnapshotDiffers` helper — synthetic snapshots cover direction
without needing to drive WindDial through the DOM. Updated the RESOLVED
"Wind / zonesCount test ergonomics" block above with the new case (f)
body, the helper-extraction plan, and the direction unit-test sketch.
Also tightened the case (g) approach to use MUI's auto-rendered radio
inputs (queryable by `value` attribute) instead of inventing test-ids.
Updated step 4's "Files affected" entry for `wind-circular-control.tsx`
to specify the speed wrapper. Mirrored in
[requirements.md](../../specs/WM-24-model-controls-states/requirements.md)'s
non-functional bullet (f).

---

#### RESOLVED: Step 2 reactivity test relies on undocumented jsdom `requestAnimationFrame` async semantics between `sim.start()` and the `updateFire` stub

The reactivity test in step 2 calls `sim.start()`, sets up a `reaction`,
then stubs `updateFire` and calls `sim.tick(1)`:

```ts
sim.start();                                                            // (1) schedules rAF
const dispose = reaction(() => sim.simulationEnded, (v) => seen.push(v)); // (2) subscribe
(sim.engine as any).updateFire = function () { this.fireDidStop = true; }; // (3) stub
sim.tick(1);                                                            // (4) drive
```

`sim.start()` at
[simulation.ts:235](../../src/models/simulation.ts#L235) calls
`requestAnimationFrame(this.rafCallback)`. In jsdom's default rAF
polyfill, rAF is async (typically via `setTimeout(fn, 16)`), so the
scheduled callback won't fire before the synchronous code reaches (4).
This works today. But the test is brittle to two future changes:

1. **An `await` between (1) and (3)** (e.g., a Phase 2 reviewer who adds
   `await new Promise(r => setTimeout(r, 0))` after `sim.start()` to "let
   things settle") would let the *real* `updateFire` run via rAF first. On
   a 5x5 grid with a fresh spark at (50000, 50000), no cells are burning
   yet, so `updateFire` would set `fireDidStop = true` and `tick()` would
   flip `simulationRunning = false` *before* the reaction is set up —
   silently degrading the test (the reaction would observe a stable
   `simulationEnded === false` and never fire with `true`).
2. **A jsdom polyfill change** (or test runner config switch to a
   synchronous-rAF shim) would have the same effect.

**Resolution**: Added an inline multi-line comment to the step-2
reactivity test directly above `sim.start()`, naming the rAF/jsdom
ordering dependency and warning future maintainers (a) not to insert
awaits between `start()` and the `updateFire` stub, and (b) what would
silently break if the test environment ever has synchronous rAF (the
reaction would be set up *after* the only transition it observes, and
the `expect(seen).toContain(true)` assertion would fail loudly). Also
named the escape hatch: replace `start()` with a manual engine +
observable setup that doesn't schedule rAF if an await is unavoidable.
The drive-via-`tick()` design is unchanged; the comment makes the
implicit timing assumption explicit. The value tests in step 2 are
unaffected — they would fail loudly (not silently degrade) on the same
mis-ordering.

---

### QA Engineer

#### RESOLVED: `log-events.test.tsx` test 6 ("does NOT fire SimulationEnded on restart when simulation was never started") becomes vacuous under the new rules — spec only patched test 2

Step 5's "log-events.test.tsx fixture patch" addresses only test 2
("fires with reason 'SimulationReloaded' before reload" at
[log-events.test.tsx:57-76](../../src/components/log-events.test.tsx#L57-L76)).
But test 6 at
[log-events.test.tsx:142-156](../../src/components/log-events.test.tsx#L142-L156)
has the same shape problem in reverse:

```ts
it("does NOT fire SimulationEnded on restart when simulation was never started", async () => {
  jest.spyOn(stores.simulation, "restart");
  render(<Provider stores={stores}><BottomBar /></Provider>);
  await userEvent.click(screen.getByTestId("restart-button"));

  const endedCalls = mockLog.mock.calls.filter(
    (call: unknown[]) => call[0] === "SimulationEnded"
  );
  expect(endedCalls).toHaveLength(0);
  expect(stores.simulation.simulationEndedLogged).toBe(false);
});
```

Under the new rules, Default state has `restartEnabled = simulationStarted
= false`, so the Restart button is disabled. `userEvent.click` is a no-op
against `<button disabled>`. Both assertions trivially hold:

- `endedCalls.length === 0` — true because the handler never ran.
- `simulationEndedLogged === false` — true because the observable
  initializes to `false` at
  [simulation.ts:64](../../src/models/simulation.ts#L64), and the handler
  that would set it never executed.

The test's *intent* was to verify the `if (simulation.simulationStarted)`
guard at
[bottom-bar.tsx:256](../../src/components/bottom-bar.tsx#L256) — that
`handleRestart` does **not** log `SimulationEnded` when there was no run.
After this ticket, that branch is no longer reachable via UI click (the
button is disabled, the click never fires the handler). The test still
passes but stops exercising the guard.

**Resolution**: Option (a). Deleted test 6 in the spec's log-events.test.tsx
guidance. The seven-state matrix's state-1 test in `bottom-bar.test.tsx`
asserts `expectButtonState("restart-button", false)` in Default, which
subsumes the empty-`SimulationEnded` coverage at the matrix level. The
handler-internal guard at
[bottom-bar.tsx:256](../../src/components/bottom-bar.tsx#L256) stays as
defensive code (covers programmatic `handleRestart` calls), but doesn't
need a dedicated test now that the UI can't trigger the
unreachable-via-click branch. Updated step 5's "Files affected" line for
`log-events.test.tsx` to mention both the test-2 patch and the test-6
deletion. Audited the remaining tests in the file (1, 3, 4, 5, 7-10) and
confirmed none need additional changes under the new rules.

---

#### RESOLVED: Test case (e)'s `act` toggling rationale misleads — `useEffect` fires on mount, not on dependency-flip-before-mount

Test case (e) in step 4 currently includes this preamble:

```ts
// Seed setupChanged=true to simulate a prior Create-with-changes.
stores.simulation.setSetupChanged(true);
// Re-open the wizard so the snapshot is freshly captured (snapshot effect
// runs when showTerrainUI flips to true; in beforeEach it was already true,
// so toggle off then on to fire the effect).
act(() => { stores.ui.showTerrainUI = false; });
act(() => { stores.ui.showTerrainUI = true; });
render(...);
```

The comment is incorrect on a load-bearing detail: the snapshot effect
fires on **component mount** (when `render(...)` runs), not when the
dependency value transitions in the store. Store mutations before
`render(...)` only affect the *initial value* the effect observes. So:

- The `act` toggles run with no component mounted — they update store
  state but don't trigger any effect.
- `render(...)` mounts the component; React runs the new
  snapshot-capture `useEffect` once after the initial commit, observing
  `ui.showTerrainUI === true` (the final value after the toggles).
- The snapshot is captured against `simulation.zones` at that moment.

Removing the two `act` lines and just calling `render(...)` directly
produces identical behavior. The toggles are redundant.

This matters because a Phase 2 reviewer reading the test will form a
mental model that "the snapshot effect only fires on flip transitions" —
which would let them omit the on-mount capture and break case (a) (Create
with no changes from an already-open wizard).

**Resolution**: Dropped the two `act` toggles in case (e) entirely (the
simplest correction) and rewrote the surrounding comment to explicitly
name the on-mount-effect semantics: "*beforeEach* already sets
`showTerrainUI=true`; `render(...)` mounts the component and the new
snapshot-capture `useEffect` fires once on mount, regardless of whether
the dep array's values 'changed' — there's nothing to compare against
on mount. No store-side toggling is needed before `render`." A future
Phase 2 reviewer reading the test now has the correct mental model
(React effects run on first commit) reinforced inline.

---

### MobX/React Reactivity Reviewer

#### RESOLVED: Step 6 IconButton SCSS rule depends on the JSX-level `.disabled` class, not the HTML `disabled` attribute — a future refactor consolidating to MUI's prop alone would silently break the visual

[icon-button.tsx:17](../../src/components/icon-button.tsx#L17) renders the
project's `.disabled` class conditionally:

```tsx
className={`${css.iconButton} ${disabled ? css.disabled : ""}`}
```

…**in addition to** passing `disabled={disabled}` to the MUI `<Button>`
(which sets the native HTML `disabled` attribute and MUI's `.Mui-disabled`
class). Step 6's rule selects on `&.disabled` (the project class), not
`&:disabled` (the pseudo-class on the underlying button) or `.Mui-disabled`
(MUI's class):

```scss
&.disabled {
  > span { opacity: 0.35 !important; }
  filter: grayscale(1);
}
```

If a future refactor simplifies the className conditional — e.g., relying
solely on MUI's `disabled` prop and dropping the project's class
addition — the SCSS rule no-ops. The disabled icon would render at full
opacity. No Jest test catches this (jsdom doesn't compute CSS); only the
Cypress state-machine spec (step 7) asserts `.should("be.disabled")`
which is about the HTML attribute, not the rendered opacity.

**Resolution**: Added a multi-line SCSS comment to the new `.iconButton.disabled`
rule in step 6, naming the JSX-level className dependency, the migration
target if that conditional is ever dropped (`&:disabled` or
`&.Mui-disabled`), and the test-blind-spot rationale (Jest doesn't
compute CSS; Cypress asserts the HTML attribute via `.should("be.disabled")`,
not opacity). Pure documentation; no code-shape change. Stronger
"belt-and-suspenders" option (`&:disabled, &.disabled` compound selector)
was considered but rejected — the redundancy would invite future
maintainers to wonder which one is authoritative.

---

### WCAG Accessibility Expert

#### RESOLVED: Step 6 `> span` selector is MUI-version-coupled — a future MUI re-introduction of an inner content wrapper would silently target the wrong element

Step 6's rationale (after the third-pass MUI v5 correction) sources the
`<span>` existence from JSX:
[icon-button.tsx:23-27](../../src/components/icon-button.tsx#L23-L27) and
[bottom-bar.tsx:129,137,148](../../src/components/bottom-bar.tsx#L129).
MUI v5 with `disableRipple={true}` omits the `MuiTouchRipple-root` wrapper
span, so `> span` matches only the JSX-level content span. Correct today.

But: the `disableRipple={true}` prop is what guarantees no MUI-injected
wrapper appears as the first `<span>` child. If a future MUI upgrade
re-introduces a structural wrapper span (e.g., MUI v6 adds back a label
span for layout reasons, or a future Button variant adds an icon wrapper
that lives outside `disableRipple`'s gate), `> span` would match that
wrapper instead of the content. Disabled buttons would either render at
full opacity (if MUI's wrapper has no opacity inheritance issue) or fade
the wrong element.

The MUI-v4 → v5 migration that removed `.MuiButton-label` (already
captured in the third-pass Senior Engineer RESOLVED block) is a precedent
for this kind of churn.

**Resolution**: Option 1. Added a MUI-version-coupling note to both new
SCSS rule comment blocks — the `.iconButton.disabled` rule in
`icon-button.scss` (compounding with the `.disabled` className caveat
just added in the previous RESOLVED) and the `.playbackButton:disabled`
rule in `bottom-bar.scss`. Each comment names the v4→v5 `.MuiButton-label`
removal as precedent and instructs a future MUI major-upgrade reviewer
to verify the `> span` target via DevTools (or migrate to an explicit
content className and re-scope). Option 2 (durable structural fix —
add `css.iconButtonContent` className to four JSX spans, swap SCSS
selectors) was considered but rejected: the cost is ~4 JSX edits + 2
SCSS edits to insulate against a hypothetical MUI v6 wrapper that hasn't
shipped and may never ship, and the next major MUI upgrade would be
reviewed holistically anyway. The comment-only fix integrates cleanly
with the just-added `.disabled` className note from the previous
RESOLVED block, keeping the SCSS rule surface minimal.

---

### Technical Writer

#### RESOLVED: Step 7 Cypress file outline imports `BottomBar` but never uses it — dead code in the canonical spec body

Step 7's file outline opens with:

```ts
// cypress/e2e/bottom-bar-state-machine.cy.ts

import { BottomBar } from "../support/elements/BottomBar";

const URL = "/?preset=plainsTwoZone&hazbotRules=24";
```

…then proceeds to use inline `cy.get("[data-testid='terrain-button']")`,
`cy.get("[data-testid='reload-button']")`, etc. throughout every `it`
block. The imported `BottomBar` class is never instantiated or
referenced. The spec also says the existing
[cypress/support/elements/BottomBar.js](../../cypress/support/elements/BottomBar.js)
"already exposes selectors used by `smoke.cy.ts`" and that the new file
"is written with inline `cy.get(...)` calls for clarity — optionally
refactor to use the BottomBar helpers if they exist or are added in this
step." So the import line contradicts the inline-`cy.get` choice.

**Resolution**: Option (a). Removed the `import { BottomBar }` line from
step 7's file outline and replaced it with a comment naming the inline-
selector choice and pointing at a future-ticket migration path if the
team ever consolidates on the helper-class style (matching
`smoke.cy.ts`). The body of step 7 already uses inline `cy.get(...)`
throughout, so this is the smaller doc edit and keeps each `it` block
self-contained for reviewers walking state-by-state.

---

#### RESOLVED: Step 7 "Files affected" hedges that `getReloadButton` / `getRestartButton` "may need to be added" — they already exist

Step 7's "Files affected" list says:

> - [cypress/support/elements/BottomBar.js](../../cypress/support/elements/BottomBar.js)
>   — extend with selectors for Reload's disabled / enabled assertions if
>   not already present (likely an additive `getReloadButton`,
>   `getRestartButton` if missing)

Audit of the actual file shows all seven selectors already exist:
`getTerrainSetupButton`, `getSparkButton`, `getReloadButton`,
`getRestartButton`, `getStartButton`, `getFireLineButton`,
`getHelitackButton` (see
[cypress/support/elements/BottomBar.js](../../cypress/support/elements/BottomBar.js)).
The "if missing" hedge is stale: nothing is missing.

**Resolution**: Removed
[cypress/support/elements/BottomBar.js](../../cypress/support/elements/BottomBar.js)
from step 7's "Files affected" bullet list and replaced the "Extension
hooks for BottomBar.js" subsection further down in step 7 with a "No
BottomBar.js changes needed" subsection that enumerates the seven
already-present selectors and points back at the inline-selector choice
from Issue 7. Both edits compose: the file isn't imported (Issue 7) and
nothing in it needs to change (Issue 8).

---

## Self-Review (fifth pass, 2026-05-26)

Roles: Senior Engineer, QA Engineer, MobX/React Reactivity Reviewer.

### Senior Engineer

#### RESOLVED: Step 4 body inlines `setupSnapshotDiffers` / `captureSimulationSnapshot`, but the RESOLVED "Wind / zonesCount test ergonomics" Open Question says to extract them into `setup-snapshot.ts`

Step 4's canonical body (lines 461-495) defined `ISetupSnapshot`,
`captureSimulationSnapshot`, and `setupSnapshotDiffers` as top-level
consts in `terrain-panel.tsx` with no `export`. Step 4's "Files
affected" list (lines 428-444) named `terrain-panel.tsx`,
`wind-circular-control.tsx`, `zones-count-selector.tsx`, and
`terrain-panel.test.tsx` — but *not* `setup-snapshot.ts` or
`setup-snapshot.test.ts`.

Meanwhile, the RESOLVED "Wind / zonesCount test ergonomics" block at
[implementation.md:1650-1812](./implementation.md#L1650-L1812)
specified: "Extract `setupSnapshotDiffers`: move the helper from
`terrain-panel.tsx` into a new file `src/components/setup-snapshot.ts`
(or similar). Re-import in `terrain-panel.tsx`." It also sketches a
`setup-snapshot.test.ts` direction-coverage unit test that imports
`setupSnapshotDiffers` and `ISetupSnapshot`.

Without that extraction (and without `export` on the inlined helpers),
the wind-direction unit-test promise from RESOLVED "Wind / zonesCount
test ergonomics" could not be implemented as-described. Implementers
following Step 4's body verbatim would have shipped un-exported,
in-file helpers — leaving the direction coverage gap that the
RESOLVED block exists to close.

**Why it mattered**: Without the extraction, wind direction was the
*only* tracked field in `setupSnapshotDiffers` with no direct test
coverage (case (f) covers wind speed via the slider; cases (a)-(e),
(g) cover drought / zones / no-op paths; direction is excluded by
design from the wizard-driven path per the same RESOLVED block).

**Resolution**: Updated Step 4's "Files affected" list to add
`src/components/setup-snapshot.ts` (new file, exporting
`ISetupSnapshot`, `captureSimulationSnapshot`, `setupSnapshotDiffers`)
and `src/components/setup-snapshot.test.ts` (new file, synthetic-snapshot
unit tests covering each tracked field including `windDirection`).
Replaced the inlined helper definitions in Step 4's body with an
`import` from `./setup-snapshot` and a pointer to the RESOLVED block
for the extraction rationale. Bumped Step 4's estimated diff size
from ~270 to ~290 lines to account for the new module and tests.
Step 4 is now internally consistent with RESOLVED "Wind / zonesCount
test ergonomics" and unblocks the direction-coverage unit test.

---

#### RESOLVED: `setSetupChanged` setter is asymmetric — accepts a boolean, but `reload()` writes the field directly

Step 1 defines:

```ts
@action.bound public setSetupChanged(value: boolean) {
  this.setupChanged = value;
}
```

…and Step 1's revised `reload()` body writes the field directly:

```ts
@action.bound public reload() {
  this.restart();
  this.setupChanged = false;  // direct write, bypasses the setter
  this.setInputParamsFromConfig();
  this.populateCellsData();
}
```

Three call sites today: `applyAndClose` (Step 4) passes `true`;
`reload()` writes the field directly (bypassing the setter as part of a
larger reset); Step 4's case (h) test passes `false` to reset the flag
without going through `reload()` (which would wipe `simulation.zones`
and break the canary). The setter accepts both values; `reload()`'s
direct write is an internal optimization, not an API constraint.

**Why it mattered**: Two small things, neither blocking:

1. **API smell**: a setter that mixes "called by production with `true`"
   and "called by tests with `false`" without anything else passing
   `false` reads as slightly under-justified at first glance. An
   alternative shape (`markSetupChanged()` with no argument plus a
   separate `clearSetupChanged()` for tests) would be more self-documenting
   — but at the cost of two methods where one suffices today, and the
   case (h) test still needs *some* path to reset the flag mid-test.
2. **Test surface**: Step 1's `reload()` test asserts
   `expect(sim.setupChanged).toBe(false)` after `reload()`, which
   passes whether the setter or the direct write was used. A future
   refactor that consolidated on the setter (or made the field
   private) would not be caught by the existing tests.

**Resolution**: Option A (smallest diff) — kept the setter's signature
and updated the comment above `setSetupChanged` in Step 1 to document
all three call sites (production `true`, internal `reload()` direct
write, test `false` reset). Reasoning: option B (split into
`markSetupChanged()` / `clearSetupChanged()`) is more self-documenting
but doubles the method count for what is, today, a clean symmetric
setter with three well-understood callers. If a future "Cancel
customizations" or similar feature lands and needs `false` from
production code, that ticket can revisit the shape — for now the
contract comment captures intent and the case (h) test comment points
back to it.

---

### QA Engineer

#### RESOLVED: `seedState` bypasses `start()`'s `simulationEndedLogged = false` reset — latent risk for tests that chain transitions in one `it`

Step 5's `seedState` helper (implementation.md lines 910-949) writes
`simulation.simulationStarted = true` directly for states 4 and 5. The
real `simulation.start()` at
[simulation.ts:218-236](../../src/models/simulation.ts#L218-L236) does
more than that — specifically, it sets `this.simulationEndedLogged =
false` at line 222. This flag gates the `SimulationEnded` log emission
in the natural-completion path
([app.tsx:56-74](../../src/components/app.tsx#L56-L74)) and is also
toggled by `handleRestart` / `handleReload` in `bottom-bar.tsx`.

Today the new test suite is safe: every `beforeEach` does `stores =
createStores()`, so `simulationEndedLogged` defaults to `false` on
construction (simulation.ts:64). No test in the new suite starts from
a state where `simulationEndedLogged === true` and then chains into
another transition.

**Why it matters**: The trap is **latent**. A future maintainer who
adds a state-5 → state-6 (Ended → Restarted) test via `seedState(5)` →
`userEvent.click(restart-button)` will not trigger the
`handleRestart`'s `simulationEndedLogged = true` guard the way the
production code does — because `seedState(5)` doesn't represent the
in-between state where `simulationEndedLogged` was already flipped by
the natural-end reaction in `app.tsx`. The test would pass for the
wrong reason (or fail mysteriously if Bottom-bar's handler-internal
behavior shifts).

**Resolution**: Added a multi-line `// NOTE` block above `seedState`
in Step 5's body calling out the divergence and the escape hatch
(either set `simulationEndedLogged` manually or call
`simulation.start()` directly to exercise the real reset path). No
production-code change needed — pure documentation. The trap is
bounded today by `createStores()` resetting on each `it`, but the
comment cost is one block and saves a future maintainer from a
confusing failure mode.

---

#### RESOLVED: `(simulation as any).engine = {...}` ad-hoc mock pattern is duplicated across ~12 test cases and brittle to `FireEngine` surface changes

Step 5's tests use a stock pattern (repeated 12 times across the
state-machine matrix, edge-case tests, and handler-spy tests),
ad-hoc-casting `simulation.engine` to a 2-field object literal:
`fireDidStop` plus `burnedCellsInZone`.

The `as any` cast hides the gap: `FireEngine` could grow new fields
(`wind`, `cells`, etc.) that get read during render. The current cast
won't catch that — the read just returns `undefined`, and depending
on the consumer the test may pass or throw at random.

`burnedCellsInZone` is included because `simulation.getOutcomeData` /
chart code reads it; if a future change has `BottomBar` read another
engine field, every one of these mocks needs updating.

**Why it mattered**: Test maintenance cost scales with FireEngine's
surface area and the number of mock sites. Twelve occurrences in
Step 5's body alone, plus one in Step 7. A typed central helper
eliminates the inline-literal drift and locks the *override values*
to real FireEngine field names — so an upstream rename of
`fireDidStop` / `burnedCellsInZone` breaks compilation here, not
just at runtime.

**Resolution**: Extracted `mockEngine(overrides?: Partial<MockEngineFields>):
MockEngineFields` as a typed helper near `seedState` /
`expectButtonState` at the top of `bottom-bar.test.tsx`, where
`MockEngineFields = Pick<FireEngine, "fireDidStop" | "burnedCellsInZone">`.
Defaults match the previous inline shape (`fireDidStop: false`,
`burnedCellsInZone: {}`); overrides spread on top. The
`import type { FireEngine } from "../models/engine/fire-engine";` was added
to the test file's import block. All 12 inline occurrences in Step
5's body were rewritten to call `mockEngine()` (default) or
`mockEngine({ fireDidStop: true })` (state-5 / Ended).

**Scope of the typing**: The `Pick<>` shape types the *helper's own
contents* (defaults and overrides), so the centralized literal stays
in sync with FireEngine's actual field types. It does **not** type
the consumer side: `(simulation as any).engine = mockEngine()` erases
back to `FireEngine`, so a future `BottomBar` read of a new engine
field would type-check against `FireEngine` (where the field exists)
and return `undefined` at runtime (where the mock has no such key).
That gap is documented in the helper's own comment block in Step 5,
along with the two ways out if the protection becomes needed (add
the field to `MockEngineFields` + default, or swap the helper for
a full interface stub).

Step 7 (Cypress) was left alone: its single `win.sim.engine.fireDidStop =
true` mutation is a different shape (mutates an existing engine
rather than replacing it) and doesn't benefit from the helper.

---

### MobX/React Reactivity Reviewer

#### RESOLVED: `simulationEnded`'s reactivity contract is documented in Step 2's source comment only — a future consumer reading `engine?.fireDidStop` directly silently bypasses it

Step 2's `simulationEnded` comment (lines 150-154) is excellent for a
maintainer reading `simulation.ts`. But the contract — *"do not read
`engine?.fireDidStop` directly; read `simulationEnded` instead"* —
isn't enforced anywhere. Today only the four per-button computeds in
Step 3 read `simulationEnded`. If a future component, computed, or
Hazbot ruleset reads `engine?.fireDidStop` directly (for example, a
chart that distinguishes "the model is done" from "the user paused"),
the consumer gets the value-correct snapshot but no MobX reactivity —
breaking re-renders on natural fire completion without breaking any
existing test.

The reactivity reaction-test in Step 2 only protects
`simulationEnded` itself. A new consumer with its own
`engine?.fireDidStop` read would silently regress without that test
catching anything.

**Why it mattered**: Reactivity contracts that live in comments rot
the fastest. The codebase already has one direct-reader: `app.tsx:61-64`
reads `simulation.engine?.fireDidStop` inside a MobX `reaction` whose
dependency function *also* reads `simulationRunning` — that pairing
is what makes the read reactive. A future consumer that copies the
pattern from `app.tsx` without copying the `simulationRunning`
companion read would silently lose reactivity.

**Resolution**: Option A — add a one-line documentation comment to
`FireEngine.fireDidStop`'s field declaration at
[fire-engine.ts:95](../../src/models/engine/fire-engine.ts#L95)
pointing future direct-readers at `simulation.simulationEnded` for
reactivity, and explicitly calling out the `app.tsx` pattern so
future readers understand *why* that pairing works. Step 2's "Files
affected" list now names `fire-engine.ts`, and Step 2's "Changes"
section has a new sub-block with the comment text. Estimated diff
size bumped from ~90 to ~95 lines.

Option B (private `fireDidStop`) was rejected as scope creep —
making fields private requires touching where they're written too,
and `FireEngine.updateFire` self-writes `fireDidStop`. Worth a
follow-up ticket if the team wants the contract enforced rather
than documented, but not bundled here.

Option C (comment in `bottom-bar.tsx`) was rejected because it only
helps consumers landing near bottom-bar — a new chart, Hazbot
ruleset, or unrelated component wouldn't see it. Option A puts the
warning on the field itself, visible to any future consumer
regardless of where they're reading from.

---

#### RESOLVED: Step 4's snapshot-on-open `useEffect` reads `simulation.zones` / `simulation.wind.*` inside the callback — clarify these reads do NOT participate in `observer` tracking

Step 4's snapshot effect (lines 510-526):

```ts
useEffect(() => {
  if (ui.showTerrainUI) {
    openSnapshotRef.current = captureSimulationSnapshot(simulation);
  }
}, [simulation, ui.showTerrainUI]);
```

`captureSimulationSnapshot(simulation)` reads `simulation.zones[*].terrainType`,
`simulation.zones[*].vegetation`, `simulation.zones[*].droughtLevel`,
`simulation.wind.speed`, `simulation.wind.direction`,
`simulation.zones.length`. Each is an observable. The reads happen
inside the `useEffect` callback, not inside `render()`.

MobX-React's `observer` HOC tracks observable reads that happen
during `render()`. `useEffect` callbacks fire *after* `render()`
commits, outside the tracking scope. So `captureSimulationSnapshot`'s
reads are **untracked** — this is the intended behavior (we don't
want the wizard to re-render every time `simulation.wind.speed`
changes from a non-wizard source, e.g. `changeWindIfNecessary` at
[simulation.ts:325-345](../../src/models/simulation.ts#L325-L345)
firing mid-run while the wizard happens to be open).

**Why it mattered**: A reviewer unfamiliar with MobX-React's
observer-vs-effect-scope distinction might worry that calling
`captureSimulationSnapshot` inside the effect creates a render→effect
→snapshot→render cycle. It doesn't (the snapshot write goes to a
`useRef`, which doesn't trigger renders, AND the reads aren't
tracked). But the spec didn't say this anywhere.

**Resolution**: Added a one-paragraph note to Step 4's snapshot-effect
comment block calling out that observable reads inside
`captureSimulationSnapshot` are intentionally untracked (`useEffect`
callbacks run outside MobX-React's observer-tracking scope), so the
snapshot is genuinely a point-in-time capture and does not re-trigger
on later `simulation.zones` / `simulation.wind` mutations. Combined
with the `useRef` (no render on write), there's no render → effect →
snapshot → render loop to worry about. Pure documentation — no code
change. Saves a future reviewer five minutes of "wait, is this going
to loop?" reasoning.

---

## Self-Review (sixth pass, 2026-05-26)

Roles: Senior Engineer, QA Engineer, MobX/React Reactivity Reviewer,
Phase-2 Implementer (fresh-eyes), Technical Writer. This pass is grounded
in a re-read of the **current** source files
([src/components/bottom-bar.tsx](../../src/components/bottom-bar.tsx),
[src/models/simulation.ts](../../src/models/simulation.ts),
[src/components/terrain-panel.tsx](../../src/components/terrain-panel.tsx),
[src/components/bottom-bar.test.tsx](../../src/components/bottom-bar.test.tsx),
[src/components/terrain-panel.test.tsx](../../src/components/terrain-panel.test.tsx),
[src/components/log-events.test.tsx](../../src/components/log-events.test.tsx),
[src/components/icon-button.tsx](../../src/components/icon-button.tsx),
[src/components/icon-button.scss](../../src/components/icon-button.scss))
to verify spec claims against actual file state. Scope: surface **new**
issues not already RESOLVED in passes 1-5. Findings deliberately
prioritize substantive concerns over cosmetic ones.

### Senior Engineer

#### RESOLVED: State 7 (AfterReload) Jest test is structurally identical to State 1 (Default) — never actually exercises a Reload click

Step 5's `seedState(7)` body is just `break;`:

```ts
case 7: // AfterReload — same as Default for curriculum-empty-config.sparks presets
  break;
```

…and the state-7 `it` block then renders against fresh `createStores()` state and asserts the same button matrix as state 1. The only differentiating signal is the `expect(stores.simulation.config.sparks).toEqual([])` sanity guard added in pass 4. **No Reload is clicked.** Nothing flips through the `reload()` codepath that the state-7 row of the matrix is supposed to validate. The test as drafted is a duplicate of the state-1 test with one extra assertion.

The Reload click *is* exercised by the Paused → Reload and Running → Reload tests in the `BottomBar edge cases` describe block, which already assert Default-equivalent button state after Reload. So coverage of "reload returns to Default" exists — just not in the state-7 matrix slot.

**Why it matters**: A Phase-2 reviewer walking the seven-state matrix expects each `it` block to exercise its named state via a real transition. The state-7 block teaches the wrong mental model ("AfterReload is just a relabel of Default; no transition needed"). And if a regression breaks `reload()` such that it leaves the model in a non-Default state, the state-7 matrix test would still pass green (because it never calls Reload). The Paused → Reload and Running → Reload tests would catch it, but the matrix slot wouldn't.

Two options:
- (a) Delete the state-7 matrix test entirely. The Paused → Reload and Running → Reload edge-case tests already cover the "AfterReload === Default" claim with a real click. The state-7 slot in the matrix is intentionally redundant per the pass-2 resolution ("AfterReload is identical to Default … so the corresponding assertions can be reused") — making the redundancy literal (delete) is more honest than performing the assertions twice via a no-op `seedState`.
- (b) Rewrite the state-7 `it` block to *actually* perform a Reload first — e.g., `seedState(stores, 2); render(...); await userEvent.click(getByTestId("reload-button"));` then assert the Default-equivalent matrix. This adds genuine state-7 coverage at the matrix level.

(a) shrinks the suite, (b) makes the matrix complete. Either resolves the redundancy.

**Resolution**: Option (a). Deleted the state-7 `it` block from the
`BottomBar state machine` describe in step 5's body, dropped `7` from
`seedState`'s state-parameter union (now `1 | 2 | 3 | 4 | 5 | 6`),
removed the `case 7: break;` no-op branch, and replaced the state-7
slot in the matrix with a comment explaining that AfterReload coverage
lives in the `Paused → Reload` and `Running → Reload` edge tests
(which click the real button and assert Default-equivalent post-state).
Both the curriculum-preset case (empty `config.sparks`) and the dev-preset
case (preplaced sparks → SparkPlaced-shape) are noted in the new comment
so a future reviewer doesn't re-add the matrix slot.

---

#### RESOLVED: Step 2's reactivity-test "silent degradation" warning may overstate the risk

The pass-4 RESOLVED block added a multi-line warning comment to the `simulationEnded` reactivity test:

> Timing-sensitive sequence — do NOT insert any `await`s between this `sim.start()` and the `updateFire` stub four lines down. … In jsdom, rAF is async (typically polyfilled via setTimeout(fn, 16)), so the scheduled callback can't fire before this synchronous block completes. … If you ever need to await something here, replace start() with a manual engine + observable setup that doesn't schedule rAF.

The comment claims that *if* rAF fired synchronously and *if* an `await` slipped between `start()` and the stub, then "the real updateFire would run via rAF first: with no burning cells in the 5x5 fixture grid, fire-engine.ts:162-168 would set fireDidStop=true, simulation.ts:315-316 would flip simulationRunning=false, and the reaction below would be set up *after* the only transition it's meant to observe."

But the test fixture places a spark at (50000, 50000) on a 100000×100000 model with `gridWidth=5`. The spark *does* fall in a cell, the `FireEngine` constructor ignites that cell, and `updateFire` at [fire-engine.ts:162-168](../../src/models/engine/fire-engine.ts#L162-L168) would see a burning cell and set `fireDidStop = false`. Without verifying against the actual engine, the comment's "no burning cells" premise looks shaky.

**Why it matters**: An 8+ line warning comment in a test deserves to be load-bearing. If the warned-against scenario doesn't actually produce silent degradation, the comment is cargo-cult noise that future maintainers will be reluctant to touch (defensive comments calcify). If the scenario IS load-bearing, the spec should cite the specific engine path that produces `fireDidStop=true` despite a burning spark — not a hand-wave at "no burning cells".

Options:
- (a) Trim the comment to a one-liner: "Do not insert awaits between `start()` and the stub — rAF-vs-sync ordering is load-bearing." Drops the unverified "silent degradation" details.
- (b) Verify the actual engine behavior with a spark in cell (12, 12) on a 5x5 grid (gridWidth=5, so cells run 0-4 — spark at 50000 on a 100000 model = grid x=2, y=2 with cellSize=20000). Cell (2,2) on a 5x5 grid IS burning post-construction, so `updateFire` would NOT set `fireDidStop=true`. Rewrite the comment to reflect the actual sync-rAF behavior (which appears benign).
- (c) Keep as-is for defensive overcaution.

Recommend (a) — the comment's core warning ("don't await between start and stub") is correct as a hygiene rule even if the failure mode the comment imagines is wrong. Trimming preserves the rule and drops the speculation.

**Resolution**: Option (a). Trimmed the inline comment on `sim.start()` in
step 2's reactivity test from 14 lines to 7. Kept the hygiene rule
("don't await between `start()` and the stub"), the rAF mechanism (jsdom
async, await would yield to the callback), and the escape hatch (swap
`start()` for a manual setup). Dropped the unverified "no burning cells
in 5x5 fixture grid" mechanism and the speculative "test would pass
with `seen` empty" claim, since the actual fixture places a spark at
(50000, 50000) which falls in cell (2,2) — likely a burning cell at
construction time, which would defeat the warned-against mechanism.
Trimmer comment is the same defensive guard without the false-specific
reasoning that would invite future maintainers to either distrust the
rule or preserve wrong reasoning as cargo-cult.

---

### QA Engineer

#### RESOLVED: Missing test — snapshot refresh on wizard re-open after a Create

The `terrain-panel.test.tsx` enumeration covers seven cases (a)-(g), all of which exercise the wizard on its *first* open. None test the load-bearing "snapshot refreshes when the wizard closes and reopens" path that the whole `setupChanged` semantics depend on.

Concrete scenario the existing tests miss:
1. Open wizard, change drought 2 → 3, Create. (`setupChanged === true`, `simulation.zones[0].droughtLevel === 3`, snapshot was 2.)
2. Open wizard again. The snapshot-capture effect should re-fire with `simulation.zones[0].droughtLevel === 3` (the live, post-Create value) as the new baseline.
3. No field change. Create.
4. Expect: `setupChanged` stays true (case e covers this assertion).
5. **Untested**: that the second open actually captured a *new* snapshot. If the snapshot-capture effect were broken (e.g., a Phase-2 implementer accidentally guards it with `if (openSnapshotRef.current === null)`), then on the second open the snapshot stays at drought=2. Now the diff at step 3 compares snapshot=2 vs live wizard state=3 → non-empty → `setSetupChanged(true)` would fire (no-op since already true). The test passes regardless.

The hole is asymmetric: a broken-stale-snapshot would NOT be caught by case (e) under the proposed test design.

A test that would catch it:

```ts
it("(h) snapshot refreshes on re-open: change drought, Create, reopen, change drought back, Create — setupChanged stays true because diff is non-empty against the post-Create snapshot", async () => {
  render(<Provider stores={stores}><TerrainPanel /></Provider>);
  // First Create: change drought 2 → 3
  const droughtSlider = screen.getByTestId("drought-slider").querySelector("input")!;
  act(() => { fireEvent.change(droughtSlider, { target: { value: "3" } }); });
  await goToCreatePanel();
  await clickCreate();
  expect(stores.simulation.setupChanged).toBe(true);
  expect(stores.simulation.zones[0].droughtLevel).toBe(3);

  // Re-open: ui.showTerrainUI flips false (Create closes it) then true again
  act(() => { stores.ui.showTerrainUI = true; });

  // Change drought back to 2 (matches PRESET default but NOT the new snapshot which captured 3)
  const droughtSlider2 = screen.getByTestId("drought-slider").querySelector("input")!;
  act(() => { fireEvent.change(droughtSlider2, { target: { value: "2" } }); });
  await goToCreatePanel();
  await clickCreate();
  // Diff: snapshot=3 vs local wizard=2 → non-empty → setSetupChanged(true) called.
  // (setupChanged was already true; this asserts it stays true.)
  expect(stores.simulation.setupChanged).toBe(true);
  expect(stores.simulation.zones[0].droughtLevel).toBe(2);
});
```

If the snapshot effect doesn't re-fire on re-open, the second Create's diff would compare snapshot=2 (stale, from first open) vs local wizard=2 (after the back-to-2 change) → empty diff → no `setSetupChanged` call → `setupChanged` stays at its current value (true from the first Create). The test would pass either way. **Bad test for the stated purpose.**

A better test design: assert the snapshot ref value directly (if exposed for testing) or instrument the diff function to record what it compared against. Simplest: deliberately bypass `applyAndClose` and verify by direct effect-trigger inspection. None of these are great.

The pragmatic option is to add a test that exercises the load-bearing transition and *strengthens* a related assertion:

```ts
it("(h) snapshot refreshes on re-open: change drought, Create, reopen, no change, Create — setupChanged should NOT be set by the second Create (snapshot matches live)", async () => {
  render(<Provider stores={stores}><TerrainPanel /></Provider>);
  // First Create: change drought 2 → 3
  const droughtSlider = screen.getByTestId("drought-slider").querySelector("input")!;
  act(() => { fireEvent.change(droughtSlider, { target: { value: "3" } }); });
  await goToCreatePanel();
  await clickCreate();
  expect(stores.simulation.setupChanged).toBe(true);

  // Re-set setupChanged to false to detect whether the second Create flips it
  stores.simulation.setSetupChanged(false);  // Or simulation.reload() then re-open
  act(() => { stores.ui.showTerrainUI = true; });
  await goToCreatePanel();
  await clickCreate();
  // If the snapshot refreshed on re-open, it now equals drought=3, matches live drought=3, diff is empty, setSetupChanged NOT called.
  // If snapshot is stale at drought=2, diff is non-empty, setSetupChanged(true) is called, test FAILS.
  expect(stores.simulation.setupChanged).toBe(false);
});
```

This test fails loudly if the snapshot doesn't refresh on re-open. Worth adding as case (h).

**Why it matters**: The seven-case enumeration is the spec's testing contract for the load-bearing diff helper. The omission isn't a passive gap — it's a gap that would let a broken implementation pass green. Pass 4 added cases (f) and (g) for wind/zones field coverage; this is the symmetric gap for the snapshot-refresh path.

**Resolution**: Added test case (h) to both the requirements.md
non-functional test enumeration ("(h) Snapshot refreshes on re-open …
canary test for snapshot-refresh on re-open") and the implementation.md
step 4 test body (concrete Jest code that performs the first
Create, manually resets the flag to make the second Create's effect
observable, reopens the wizard, performs a no-change Create, and asserts
`setupChanged` stays false). Mirrors the pass-4 pattern of adding
parallel canary tests for load-bearing diff-helper paths. Without
this test, a Phase-2 implementation that captured the snapshot once
on first mount (e.g., with a `if (openSnapshotRef.current === null)`
guard) would pass cases (a)-(g) but produce subtly broken setupChanged
semantics in the second-open path.

---

### MobX/React Reactivity Reviewer

#### RESOLVED: Snapshot-capture effect's dep-array MobX-observable pattern requires `observer` wrapping — silent context dependency

Step 4's snapshot effect:

```tsx
useEffect(() => {
  if (ui.showTerrainUI) {
    openSnapshotRef.current = captureSimulationSnapshot(simulation);
  }
}, [simulation, ui.showTerrainUI]);
```

The dep `ui.showTerrainUI` is a MobX observable. For React to re-run the effect when the observable flips, the component must re-render when the observable changes. **That re-render only happens because `TerrainPanel` is wrapped in `observer`** ([terrain-panel.tsx:31](../../src/components/terrain-panel.tsx#L31): `export const TerrainPanel: React.FC<IProps> = observer(function WrappedComponent() {`).

If a future refactor unwraps `observer` (e.g., switches to a hooks-based MobX integration via `useObserver()` or `<Observer>`), the dep-array read of `ui.showTerrainUI` would not register as a tracked dependency. The component wouldn't re-render on the flip. The effect wouldn't re-run. The snapshot wouldn't refresh.

The spec's pass-5 comment block on this effect documents that *reads inside the effect callback* are untracked. It doesn't document that *reads in the dep array* require `observer` to be reactive. That's the actually-load-bearing constraint.

**Why it matters**: A Phase-2 implementer reading the effect comment learns "useEffect reads are untracked — good". They don't learn "the dep-array's reactivity comes from observer, removing observer silently breaks this." If a future refactor consolidates on hooks-based MobX patterns (a common modernization path), this effect would silently regress.

Recommend: add one line to the existing comment block: "This effect's re-run on `ui.showTerrainUI` change depends on `TerrainPanel` being wrapped in `observer` (see [terrain-panel.tsx:31](../../src/components/terrain-panel.tsx#L31)). The dep-array read of an observable only triggers a re-render — and thus a dep-array re-evaluation — because of the `observer` HOC. A refactor that unwraps `observer` must replace this effect with a MobX `reaction` or `autorun`."

**Resolution**: Added a multi-line "Reactivity dependency" paragraph to
the existing snapshot-effect comment block in step 4, naming the
`observer` HOC dependency, the migration trap if a future refactor
unwraps `observer`, and the canary test that would catch the regression
(case (h), added in this same review pass). Compounds with the existing
"useEffect reads are untracked" paragraph: together they cover both
adjacent reactivity questions (in-callback reads vs. dep-array reads)
explicitly, so a future reader doesn't conflate them.

---

### Phase-2 Implementer (fresh-eyes)

#### RESOLVED: Status field stale ("In Development") after three review passes

The metadata field at [implementation.md:5](./implementation.md#L5) reads `**Status**: **In Development**`. The requirements.md sibling was bumped to "Ready for Implementation" in pass 3 with the rationale: "The spec has completed four self-review passes … External review is an optional next step … but the spec stands ready for Phase 2 implementation work to begin now."

Implementation.md has now completed three self-review passes plus this sixth (counting joint with requirements). It's structurally ready for Phase 2 work. Reader picking it up sees "In Development" and may pause to ask whether the spec is settled.

Recommend: bump to "Ready for Implementation" matching the requirements.md sibling. (Or to "Ready for Review" if the next step is external review.) If left at "In Development", add a one-line note explaining why ("deliberately retained until the implementation PR lands").

**Resolution**: Bumped the Status field at the top of implementation.md
from "In Development" to "Ready for Implementation", matching the
requirements.md sibling bumped in pass 3. The spec has completed three
self-review passes plus this sixth (joint-numbered with requirements.md
review history) and is structurally ready for Phase 2 work. If external
review surfaces material changes, the status can step back temporarily
before re-advancing — same convention requirements.md uses.

---

### Technical Writer

#### RESOLVED (skipped): Self-Review pass numbering inconsistent with this file's own history

The three Self-Review sections in implementation.md are labeled:
- `## Self-Review (2026-05-26)` (line ~1993, this file's first pass)
- `## Self-Review (fourth pass, 2026-05-26)` (line ~2356, this file's second pass)
- `## Self-Review (fifth pass, 2026-05-26)` (line ~2701, this file's third pass)

The "fourth" and "fifth" numbering borrows from joint counting with requirements.md (which has its own initial Self-Review + "re-run" + "third pass" + "fourth pass"). A reader picking up just implementation.md sees pass labels jumping from "(2026-05-26)" to "fourth pass" with no second or third pass in between, and concludes either:
- (a) Two passes are missing from this file
- (b) The numbering refers to some external sequence they need to track down

Both are friction. Pass 3 of requirements.md explicitly resolved-as-skipped a similar inconsistency ("State names rendered inconsistently throughout the doc"); the precedent is "cosmetic, not worth normalizing". But pass-numbering is meta-documentation that affects how readers navigate the review history, not a substantive content choice.

Options:
- (a) Re-label this file's passes as "first pass", "second pass", "third pass" — internally consistent, breaks cross-references from requirements.md if any exist (none located).
- (b) Add a one-line header note at the top of each pass: "(joint-numbered with requirements.md's review history)". Preserves the joint count, makes the convention explicit.
- (c) Skip as cosmetic, matching the pass-3 requirements.md precedent.

Pass-numbering meta is lower-stakes than state-name inconsistency, so the (c) precedent is reasonable. Flagging for an explicit decision rather than silent inheritance of the pattern.

**Resolution**: Option (c), skipped. Following the pass-3 requirements.md
precedent for cosmetic inconsistencies ("State names rendered
inconsistently throughout the doc — Resolved (skipped)"). Pass labels
are meta-documentation; re-labeling three section headers (option a) or
adding three "joint-numbered" header notes (option b) both add spec
noise for a clarity gain that affects skim navigation, not what readers
actually do with the spec. The joint-numbering convention is consistent
across passes once a reader notices it; the friction is one-time.
Explicit triage recorded here so a future maintainer doesn't re-raise.

---

#### RESOLVED: Cross-reference link inside the file uses repo-root-relative path instead of within-file anchor

[implementation.md:2718](specs/WM-24-model-controls-states/implementation.md#L2718) (in the pass-5 RESOLVED about extracting `setup-snapshot.ts`) contains:

```markdown
[implementation.md:1650-1812](specs/WM-24-model-controls-states/implementation.md#L1650-L1812)
```

The link target is a repo-root-relative path (`specs/WM-24-model-controls-states/implementation.md#L1650-L1812`), but this link lives *inside that very file*. Standard markdown renderers (GitHub, VSCode preview, most local markdown viewers) interpret the link relative to the current file's directory — so the link resolves to `specs/WM-24-model-controls-states/specs/WM-24-model-controls-states/implementation.md`, which doesn't exist.

Should be either:
- (a) `[implementation.md:1650-1812](#L1650-L1812)` — within-file anchor (works in GitHub if the file is rendered with line anchors enabled, doesn't work in plain markdown viewers).
- (b) `[implementation.md:1650-1812](./implementation.md#L1650-L1812)` — same-directory relative.
- (c) `[lines 1650-1812 above](#self-review-2026-05-26)` — link to a section header anchor, more portable across viewers.

(b) is the minimal fix. The link as-written is dead in every markdown viewer.

**Resolution**: Option (b). Fixed the pass-5 link at the original site
([implementation.md:2754](./implementation.md#L2754)) from
`(specs/WM-24-model-controls-states/implementation.md#L1650-L1812)` to
`(./implementation.md#L1650-L1812)`. Also fixed the same bug I introduced
in Issue 5's own text (the `[implementation.md:5](...)` reference used
the same broken repo-root path). The two quoted-as-illustration uses
inside this RESOLVED block's body are left as-is — they document what
the bug looked like, so they need to render verbatim.

---

## External Review (2026-05-26)

Reviewer feedback applied from a Senior Engineer / QA Engineer pass on
this implementation spec.

### RESOLVED: Cypress forced-end ordering breaks `simulationEnded` (QA Engineer)

The state-5 Cypress shortcut at the original site set
`simulationRunning = false` *before* `engine.fireDidStop = true`. Because
`fireDidStop` is non-observable and the `simulationEnded` computed only
re-evaluates on the `simulationRunning` edge, the computed would lock in
`false`: when `simulationRunning` flipped, the computed re-evaluated
while `fireDidStop` was still `false` and memoized the result; the
subsequent `fireDidStop = true` triggered no observation. The state-5
assertions (`startStop: false`, `fireLine: false`, `helitack: false`)
would therefore fail or flake — UI stays in Paused.

The reactivity contract this violates is documented in this same spec
([implementation.md:132-133](./implementation.md#L132-L133)) and in the
one-line comment on the `fireDidStop` field added in step 1 of the plan.
The unit tests in the same spec (`updateFire` stub pattern at
[implementation.md:245-247](./implementation.md#L245-L247),
[implementation.md:256-258](./implementation.md#L256-L258),
[implementation.md:290-291](./implementation.md#L290-L291)) get the
order right — they set `fireDidStop=true` first via the stub, then let
`tick()` flip `simulationRunning=false`. The Cypress shortcut was the
outlier.

**Resolution**: Reversed the assignment order in three places that
documented or exercised the forced-end pattern:

1. The Cypress test body for state 5 ([implementation.md:1691-1699](./implementation.md#L1691-L1699))
   — `fireDidStop = true` now precedes `simulationRunning = false`, with
   an inline comment explaining the load-bearing order.
2. The state-table example for state 5 ([implementation.md:1579](./implementation.md#L1579))
   — same swap.
3. The narrative example block at [implementation.md:1592-1604](./implementation.md#L1592-L1604)
   — same swap, with the same explanatory comment as the test body.
4. The discussion note at [implementation.md:1774-1786](./implementation.md#L1774-L1786)
   — updated the example snippet in the text and added a sentence noting
   that the order is load-bearing for the documented reactivity contract.

I also verified the three Jest-level instances at
[implementation.md:1198-1228](./implementation.md#L1198-L1228) that set
`simulationRunning = false` *without* setting `fireDidStop`: those are
intentional Paused-state setups (`mockEngine()` without
`fireDidStop:true`) and are correct as-written. The Ended-state Jest
test at [implementation.md:1212-1214](./implementation.md#L1212-L1214)
sets both fields synchronously before `render()`, so there is no
observer in place to memoize a stale value — also correct as-written.

---

### RESOLVED: Step 4 test count stale — said "seven (a)-(g)" after case (h) was added (QA Engineer)

Step 4's prose still described "seven `terrain-panel.test.tsx` test cases
(a)-(g)" in three places, even though a sixth-pass self-review had
already added case (h) (snapshot-refresh canary) further down in the
same step. The main test code block inlined cases (a)-(e) and (h), but
deferred (f) and (g) to the RESOLVED "Wind / zonesCount test
ergonomics" Open Question. An implementer copying the Step 4 block
verbatim could omit (f) and (g) and not notice (h) was required —
each "(a)-(g)" phrase made the count look closed at seven.

**Resolution**: Three changes in step 4:

1. The summary's "seven … test cases (a)-(g)" became "eight … test
   cases (a)-(h)".
2. The Files-affected bullet's "seven new test cases (a)-(g)" became
   "eight new test cases (a)-(h)".
3. The intro line before the code block ("The seven cases (a)-(g) from
   the requirements:") was replaced with an explicit 8-row checklist
   that names every required case and maps each to where its body
   lives. Cases (a)-(e) and (h) point to "inline below"; cases (f) and
   (g) point to the RESOLVED "Wind / zonesCount test ergonomics" Open
   Question with a short note on why the canonical body lives there
   (drought-pattern parity and the wind-direction unit-test rationale).
   The checklist makes "all eight required" visible at a glance even
   if line numbers drift in the future.

Cases (f) and (g) deliberately stay in the RESOLVED Open Question
block rather than duplicating into Step 4: the wind-speed-slider and
zones-count-RadioGroup patterns are materially different from the
drought slider, and duplicating them would risk silent drift between
the two sites. The checklist preserves visibility without duplication.

Two `(a)-(g)` mentions remain in the Self-Review (sixth pass)
RESOLVED block for case (h) (at
[implementation.md:3196](./implementation.md#L3196) and
[implementation.md:3276](./implementation.md#L3276)) — those are
correct historical context describing the spec's state *before* case
(h) was added, and rewording them would distort the decision log.

---

### RESOLVED: `mockEngine` helper return type was `Partial<FireEngine>` — wouldn't catch newly-consumed fields (Senior Engineer)

The Step 5 test helper at
[implementation.md:1015](./implementation.md#L1015) was originally
typed `mockEngine(overrides?: Partial<FireEngine>): Partial<FireEngine>`
with a comment claiming that centralizing the fake would "catch future
`FireEngine` surface growth (new fields read during BottomBar
render)". The claim was wrong: `Partial<T>` makes every field
optional, so a field newly read by `BottomBar` at render time would
not produce a TS error at the helper return-type level. The comment
oversold what TypeScript guarantees, leaving a maintenance trap: a
future contributor relying on the documented drift protection could
add a `BottomBar` engine read and ship a test suite that runtime-fails
on a missing helper field.

**Resolution**: Replaced the return type with a narrow `Pick`:

```ts
type MockEngineFields = Pick<FireEngine, "fireDidStop" | "burnedCellsInZone">;
const mockEngine = (overrides?: Partial<MockEngineFields>): MockEngineFields => ({
  fireDidStop: false,
  burnedCellsInZone: {},
  ...overrides,
});
```

An upstream rename or removal of `fireDidStop` / `burnedCellsInZone`
now breaks compilation here (the `Pick<>` references the real field
names). Tests that read the helper return value directly (e.g. via a
local `const mock = mockEngine()`) also get type-checked against
`MockEngineFields`. The original comment claimed broader coverage than
that — see the second-pass External Review below for the corrective
rewrite — but the *type shape* is correct as written here.

What the typing does NOT buy: any protection against `BottomBar`
reading a *new* engine field at runtime. After
`(simulation as any).engine = mockEngine()`, `simulation.engine` is
still typed `FireEngine`, so a new `simulation.engine?.someNewField`
read in `BottomBar` type-checks fine and returns `undefined` at
runtime. The cast suppresses the type check at the assignment site;
the consumer read still type-checks against `FireEngine`, not against
the mock's narrower shape. If/when `BottomBar` grows new engine reads,
the right move is to (a) add the new field to `MockEngineFields` and
the default literal (so the read returns something sane), or (b) swap
the helper for a full `FireEngine` fake / interface stub if the
runtime safety is worth the maintenance cost. The helper's own
comment block in Step 5 documents both halves.

The `overrides` parameter stays `Partial<MockEngineFields>` because
existing test sites only override one field at a time, which is the
expected ergonomics.

---

### RESOLVED: Cypress `.cy.ts` snippet accessed untyped `win.sim` / `win.test` (Senior Engineer)

Step 7's new `bottom-bar-state-machine.cy.ts` outline accesses
`win.test.placeSparkInZone(0)` and `win.sim.simulationRunning` directly
(at multiple sites under the
[implementation.md:1647-1812](./implementation.md#L1647-L1812)
range), but Cypress's `AUTWindow` type doesn't know about those
app-specific properties — they're attached by
[stores.ts](../../src/models/stores.ts) at runtime. Editor TS checking
and any future `tsc -p cypress/tsconfig.json --noEmit` would report
property-does-not-exist errors on every access.

**Resolution**: Added an inline type augmentation at the top of the
new spec file (before the `URL` constant), augmenting `Window` with
the two debug-hook properties:

```ts
declare global {
  interface Window {
    sim: import("../../src/models/simulation").SimulationModel;
    test: {
      placeSparkInZone(zoneIdx: number): void;
      placeFireLineInZone(zoneIdx: number): void;
      placeHelitackInZone(zoneIdx: number): void;
      zoneBounds(zoneIdx: number): {
        minX: number; maxX: number; minY: number; maxY: number;
        centerX: number; centerY: number;
      };
    };
  }
}
export {}; // makes `declare global` work in a file with no other exports
```

The reviewer offered two options: per-call `(win as any).sim` casts
(zero declarations, two extra chars per call site) or a module-level
augmentation. Picked the augmentation because the spec body has ~7
accesses and is a regression guard that will likely grow, so cleaner
call sites pay back the ~12-line declaration cost. The `import(...)`
type-only import keeps the runtime untouched and resolves correctly
from `cypress/e2e/` (`../../src/models/simulation` → repo root →
`src/models/simulation.ts`, which exports `SimulationModel`).

Kept the declaration inline in the spec file rather than lifting it
into `cypress/support/index.d.ts` because this is currently the only
Cypress file that touches `window.sim` / `window.test` — a future
ticket can promote the augmentation to a shared types file when a
second consumer appears. A short comment in the augmentation block
documents this choice so a later contributor doesn't duplicate the
declaration into a shared file out of confusion.

**Second-pass update (2026-05-26)**: The
`import("../../src/models/simulation").SimulationModel` approach
picked here was revised in the second-pass external review (see
"RESOLVED: Cypress type augmentation pulled decorated MobX source
into TS check" below). The spec body now uses a local structural
`SimLike` interface instead. This entry is preserved for the
decision log; the spec body reflects the second-pass decision.

---

## External Review (second pass, 2026-05-26)

Follow-up review on the post-first-pass spec.

### RESOLVED: `setSetupChanged(false)` contradicted the spec's own API contract

The Step 1 setter comment said *"External callers should always pass
true"*, and the Step 12 RESOLVED block on setter asymmetry said
*"in practice no one ever passes false"*. But Step 4's case (h) test
(stale-snapshot canary) called `stores.simulation.setSetupChanged(false)`
to reset the flag mid-test without going through `reload()` (which would
have wiped `simulation.zones` and defeated the canary). The spec was
itself the first caller of the pattern it said no one would use.

**Resolution**: Reworded both the Step 1 setter comment and the Step 12
RESOLVED block to drop the "always pass true" framing. The setter is
documented as symmetric with three call sites: `applyAndClose` passes
`true` (production), `reload()` writes the field directly as part of a
larger reset (internal optimization), and the case (h) test passes
`false` to stay inside an `@action.bound` while keeping zones live.
Case (h)'s inline comment now points back to the setter contract
comment in `simulation.ts` so the cross-reference is explicit.

Kept the setter shape (Option A from the original RESOLVED block) —
the asymmetry warning rationale just needed to reflect the actual call
sites. If a future "Cancel customizations" feature needs a `false`
write from production code, that ticket can revisit the shape.

---

### RESOLVED: `mockEngine` comment overclaimed TypeScript protection

The post-first-pass `mockEngine` helper used `Pick<FireEngine, ...>`
as its return type and the comment said this would *"catch a newly
consumed FireEngine field"*. Half-true: `Pick<>` catches an upstream
rename or removal of `fireDidStop` / `burnedCellsInZone` (the picked
fields), and it catches a test that reads a missing field directly off
the helper return value. But it does **not** catch the case the
comment most strongly implied: `BottomBar` reading a *new* engine
field at runtime. After `(simulation as any).engine = mockEngine()`,
`simulation.engine` is still typed `FireEngine`, so a new
`simulation.engine?.someNewField` read in `BottomBar` type-checks
fine and returns `undefined` at runtime.

**Resolution**: Rewrote the helper comment in Step 5 and the matching
RESOLVED block in the first External Review section to honestly
describe both halves: what the `Pick<>` shape buys (override/default
typing, upstream-rename detection, centralized literal) and what it
does not (any protection against `BottomBar` reading a new engine
field). The new comment also names the two escape hatches if that
protection ever becomes needed (add the field to `MockEngineFields`
+ default, or swap the helper for a full interface stub).

Did not change the helper's shape — the centralization and
override-typing benefits are real, and the documentation gap was the
actual problem.

---

### RESOLVED: New `simulationEnded` test "is false while Running" leaked a rAF loop

The first of the new `simulationEnded` tests in Step 2 called
`sim.start()` and then asserted mid-Running, without stopping the sim.
`start()` schedules a real `requestAnimationFrame` loop
([simulation.ts:235](../../src/models/simulation.ts#L235)) that
re-schedules itself as long as `simulationRunning === true`. The test
never flipped that flag, so the rAF loop continued scheduling itself
across subsequent tests — a Jest flake/noise risk that would grow as
more tests were added to this `describe` block.

Tests #2-5 in the same block are safe: test #2 calls `sim.stop()`
which flips `simulationRunning=false` and lets the loop self-terminate;
tests #3-5 call `sim.tick(1)` which (per the spec's own comment on
`tick()`) flips `simulationRunning=false` via the
`simulation.ts:315-316` natural-end path, with the same result. Only
test #1 had no organic stop path.

**Resolution**: Wrapped test #1's body in `try/finally` and called
`sim.stop()` in the `finally` block. Picked this over the reviewer's
alternative suggestion (direct observable seeding) because test #1's
whole point is to verify the real `start()` codepath produces
`simulationEnded === false` — replacing `start()` with direct
observable writes would degrade it to a value-only assertion that no
longer exercises the start path. The `finally` ensures the cleanup
runs even if an assertion throws.

Added an inline comment in the `finally` block naming the leak and
the pattern, so any future test added to this `describe` block that
calls `start()` without an organic stop/tick path knows to follow
the same shape.

---

### RESOLVED: Step 4 `setupChanged` test snippet missing `fireEvent` import (High)

The Step 4 test snippet at `implementation.md:656-704` and the case
(f) snippet at `implementation.md:1960-1977` call
`fireEvent.change(droughtSlider, ...)` and
`fireEvent.change(speedSlider, ...)`, but the shown import block
only adds `userEvent`. The existing
[terrain-panel.test.tsx:2](../../src/components/terrain-panel.test.tsx#L2)
imports `{ act, render, screen }` from `@testing-library/react` —
no `fireEvent`. An implementer following the spec verbatim would
hit `ReferenceError: fireEvent is not defined` on first test run.

**Resolution**: Added a comment beneath the `userEvent` import line
in the Step 4 snippet directing the implementer to also extend the
existing `@testing-library/react` import line in
`terrain-panel.test.tsx` to include `fireEvent` alongside
`act, render, screen`. Kept the guidance as a comment rather than
rewriting the snippet to show a full duplicate import block, because
the existing test file already has the RTL import — the
implementation move is "extend the existing line," not "add a new
import."

---

### RESOLVED: Cypress type augmentation pulled decorated MobX source into TS check (Medium)

The first-pass RESOLVED entry "Cypress `.cy.ts` snippet accessed
untyped `win.sim` / `win.test`" added
`interface Window { sim: import("../../src/models/simulation").SimulationModel; ... }`
to the new Cypress spec. But
[cypress/tsconfig.json](../../cypress/tsconfig.json) does not enable
`experimentalDecorators`, and
[simulation.ts](../../src/models/simulation.ts) uses `@observable`
/ `@action` / `@computed` throughout. `tsc -p cypress/tsconfig.json
--noEmit` (the very check the augmentation was added to protect)
would then fail with TS1219 on the imported decorated source —
exactly the build-tooling failure the augmentation was meant to
prevent.

**Resolution**: Replaced the type-only import with a local
structural interface `SimLike` declared inline above
`declare global`. `SimLike` covers only the two `win.sim.*` fields
this spec actually reads — `simulationRunning: boolean` (used at
multiple sites) and `engine?: { fireDidStop: boolean }` (used at
the State 5 forced-end site at
[implementation.md#L1647-L1812](./implementation.md#L1647-L1812),
optional because the existing code guards with
`if (win.sim.engine)`). Updated the augmentation block's comment to
document both the TS1219 risk and the "if a future Cypress spec
needs richer SimulationModel access, enable
`experimentalDecorators` in cypress/tsconfig.json — don't grow this
interface" guidance. Added a corrective pointer in the first-pass
RESOLVED entry so the decision log isn't misleading.

Considered (rejected): enabling `experimentalDecorators` in
`cypress/tsconfig.json`. Rejected because (a) it expands the scope
of this ticket into Cypress build config that's shared across the
whole test suite, and (b) the only access pattern this spec needs
is two read-only fields, which a structural interface covers
cleanly. The "structural interface now, real type later if a
second consumer appears" pattern mirrors the earlier "inline
augmentation now, lift to `cypress/support/index.d.ts` later"
decision documented in the first-pass entry.

---

### RESOLVED: MobX batching rationale overstated single-flush guarantee (Low)

The Step 5/6 commentary at `implementation.md:923-929` claimed that
the three writes in `handleRestart` / `handleReload`
(`ui.interaction = null` + `simulation.restart()` /
`simulation.reload()`) flush as a single MobX transaction because
"the surrounding handler runs synchronously — MobX flushes all
observers...once at the end of the synchronous block." That's
wrong: only `restart()` and `reload()` are `@action.bound`. The
handlers themselves are not actions, so the `ui.interaction = null`
write is its own MobX transaction separate from the model-reset
transactions. Observers of `ui.interaction` may notify between the
two.

**Resolution**: Softened the comment to honestly describe the
timing. The new text acknowledges that the writes are in separate
transactions but argues — correctly — that they're synchronous and
back-to-back, so React commits the consistent post-reset state
without an intermediate user-visible render. Added a forward-looking
note: if a future change makes the single-transaction property
load-bearing (e.g. a derived computed that reads both
`ui.interaction` and a `simulation` observable and would briefly
produce a nonsensical value), wrap the handler body in
`runInAction` or convert the handler to `@action.bound`.

Did not wrap the handlers in `@action` as part of this change
because the reviewer noted that "final state likely remains fine,"
and no consumer relies on the single-transaction property today.
Adding the action wrapper would be defensive work without a
justifying use case.

---

### RESOLVED: Step 7 (Cypress smoke) overclaimed CSS regression coverage (Low)

The new `bottom-bar-state-machine.cy.ts` step Summary at
`implementation.md:1586-1590` said the spec catches "CSS
regressions, full-page reactivity wiring breaks, and build-tooling
regressions." But the actual assertions in `expectButtonStates`
(lines 1702-1708) only check `.should("be.disabled")` /
`.should("not.be.disabled")` — the HTML `disabled` attribute. Step
6's `opacity: 0.35` + `filter: grayscale(1)` styling regressions
would not be caught.

**Resolution**: Narrowed the Summary. Removed "CSS regressions"
from the claim list and added an explicit "**Does not cover visual
styling regressions**" carve-out, pointing the reader to the Step 6
unit tests as the place where the `.Mui-disabled` rules are
actually asserted. Added a forward-looking note that a
Zeplin-driven visual-regression pass (computed-style assertions or
screenshot diff) would close that end-to-end gap, with the
rationale that it's deliberately out of scope to keep this spec
focused on the lifecycle state machine rather than expanding into a
styling test.

---
