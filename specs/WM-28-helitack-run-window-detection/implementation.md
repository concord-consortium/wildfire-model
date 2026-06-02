# Implementation Plan: Hazbot Helitack Run-Window Detection

**Jira**: https://concord-consortium.atlassian.net/browse/WM-28
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **In Development**

## Mechanism Decision

The requirements deferred one decision to this spec (requirements.md, Background
bullet 4 and Out of Scope): the engine-substrate mechanism for attaching an
in-run helitack to its run. Two candidates were named.

**Chosen: add a translate `modifier` result kind.** `translate()` already maps
each event to `{ kind: "trigger" }` (push a reading) or `{ kind: "no-op" }`
(`translate.ts:7-9`, `engine.ts:15-17`). We add a third arm,
`{ kind: "modifier"; apply }`, that mutates the engine's *current last reading*
in place without pushing a new one. The wildfire bridge maps `Helitack` to a
modifier that records the drop on the active run-start reading, and the three
no-op run terminators to a modifier that closes that run's window.

**Rejected: rework the overlap guard.** The temporal-variable path
(a `helitackUsed` temporal variable reducing to `true` on `Helitack`) is blocked
by the `trigger-state-change-overlap` construction guard
(`engine.ts:321-353`): `usedHelitack`'s sheet `logEvents` include `Helitack`, so
any temporal variable accepting `Helitack` trips the guard (pre-impl
verification, Check 1 — requirements.md Pre-Implementation Verification). Reworking
that guard to special-case helitack would weaken a load-bearing invariant
(a state-change event must not double as a factor-variable trigger) for *every*
rule set, to buy a path that is strictly harder than the modifier:

- **Cross-run non-stickiness is automatic with the modifier.** The temporal-variable
  path keeps a global `temporalValue` that stays `true` after the first helitack;
  it relies on filtering `eventName === "Helitack"` to keep the next run's R5a seed
  (value `true`, eventName `"SimulationStarted"`) from leaking the flag forward
  (Check 2-D). The modifier writes a per-reading field that is set only by a direct
  in-run append — no global value, no seed, nothing to filter (verified: a
  modifier-style append leaves the next run-start reading untouched).
- **Surgical surface.** One new substrate result kind + one `consume` case; the
  rest is wildfire-bridge code reading a reading field, mirroring the
  `Fireline` / `usedFireline` precedent (`sim-props.ts:201`,
  `factor-variables.ts:183`) one-for-one.
- **In-place last-reading mutation is already a substrate idiom** — Phase 2 of
  `consume` appends to `lastReading.temporalHistory` the same way
  (`engine.ts:417-421`).

### Helitack state representation

The drop is recorded as a dedicated boolean field `helitack?: boolean` on
`WildfireReading`, read directly by the `Helitack` sim-prop — mirroring how
`Fireline` reads `reading.fireLineMarkers` (`sim-props.ts:201-204`). A second
field `runWindowClosed?: boolean` is set by the no-op terminators to close the
run window (see the no-op-terminator handling below). This is preferred over a
`temporalHistory` entry (the `GraphOpen` idiom, `sim-props.ts:85-90`): a
`temporalHistory` entry is the temporal-variable mechanism's idiom and would
re-introduce the seed/eventName-filter subtlety the modifier avoids.

### No-op-terminator window close

R1's run-end set has five members; only `SimulationEnded` / `SimulationStopped`
push a reading, while `SimulationRestarted` / `SimulationReloaded` /
`TopBarReloadButtonClicked` are translate no-ops (requirements.md Technical
Notes; `translate.ts:44-48`). Pre-impl verification (Check 2-C / Check 3) showed:
(a) at the substrate level a helitack after a *no-op* terminator would leak onto
the prior run-start reading, but (b) in the live UI a no-op terminator is always
preceded by a reading-pushing `SimulationEnded`, so the leak is not UI-reachable.
R7 still mandates a unit test that pins the exclusion. The modifier closes the
window directly: each of the three no-op terminators returns a modifier that sets
`runWindowClosed = true` on the active run-start reading, and the `Helitack`
modifier appends only when the last reading is an *open* run-start reading
(`triggeredBy === "SimulationStarted" && !runWindowClosed`). For reading-pushing
terminators the last reading is already a terminating reading, so the same guard
excludes a post-terminator helitack without needing the flag.

## Implementation Plan

### Add the `modifier` translate result kind to the engine substrate

**Summary**: Extend the engine's `translate` contract with a third result kind,
`{ kind: "modifier"; apply }`, that mutates the current last reading in place and
pushes no new reading. Substrate-only; no wildfire knowledge. This is the
foundation every later step builds on.

**Files affected**:
- `src/hazbot/engine/engine.ts` — widen `EngineOpts.translate` return type; add a
  `case "modifier"` to the `consume` translate-result switch.
- `src/hazbot/engine/engine.test.ts` — substrate tests for the new kind.

**Estimated diff size**: ~45 lines

`EngineOpts.translate` (`engine.ts:15-17`) gains a third arm:

```ts
translate: (event: ConsumedEvent, sessionId: string) =>
  | { kind: "trigger"; reading: TReading }
  | { kind: "no-op" }
  | { kind: "modifier"; apply: (lastReading: TReading | undefined) => boolean };
```

The `consume` switch (`engine.ts:427-452`) gains a `modifier` case, slotted
before `no-op`. It reuses the `lastReading` const already computed for Phase 2
(`engine.ts:417`) — readings are unchanged between that line and the switch — and
lets the callback decide whether it mutated:

```ts
case "modifier": {
  // The callback mutates lastReading in place (e.g. records an in-run helitack
  // on the active run-start reading) and returns whether it changed anything,
  // so the single-notify-iff-mutated contract (R19) is preserved. No reading is
  // pushed: a modifier annotates the active run, it does not start/end one.
  if (result.apply(lastReading)) mutated = true;
  break;
}
```

The existing `default` exhaustiveness guard (`never`) continues to catch
unhandled kinds.

**Reactivity note**: in-place mutation of `lastReading` is safe here, not a
shallow-comparison hazard. Downstream observation rides on the
`subscribe`/`getSnapshot` contract, where `getSnapshot` returns the integer
`snapshotVersion` (`src/hazbot/engine/engine.ts`), which `tickAndNotify` bumps on
every mutated `consume()` — including this modifier path. The sole consumer,
`useSyncExternalStore` in `src/hazbot/engine/react/use-analysis-engine.ts`, keys
its memo cache on that integer and recomputes the view from the live readings; no
code compares individual reading object identity (`prevReading !== currentReading`).
So the in-place `lastReading.helitack = true` is picked up via the version bump,
which is also why R19 mutates in place rather than cloning the reading.

**Tests** (`engine.test.ts`, new `describe("Engine — modifier translate result")`):
- a `modifier` whose `apply` mutates `lastReading` and returns `true` → the
  mutation is visible on `e.readings[last]` and exactly one notify fires;
- a `modifier` whose `apply` returns `false` → no notify (mutated stays false);
- a `modifier` dispatched when `e.readings` is empty → `apply` receives
  `undefined`, no throw;
- a `modifier` pushes no new reading (length unchanged).

---

### Add wildfire reading fields and the translate modifiers

**Summary**: Add the `helitack` / `runWindowClosed` reading fields and wire
`translate()` to emit modifiers for the `Helitack` event and the three no-op
terminators. After this step the engine *sees* in-run helitacks on the reading,
but no impl reads them yet.

**Files affected**:
- `src/hazbot/wildfire/types.ts` — add two optional fields to `WildfireReading`.
- `src/hazbot/wildfire/translate.ts` — extend `TranslateResult`; add the
  `Helitack` and no-op-terminator modifier cases.
- `src/hazbot/wildfire/translate.test.ts` — cover the new cases **and split the
  existing combined no-op assertion** (`translate.test.ts:76-81`, the
  `maps SimulationRestarted / SimulationReloaded / TopBarReloadButtonClicked /
  AnalysisEngineActivated to no-op` test). Once the three terminators return a
  `modifier`, that bundled assertion is a **hard failure** — the three terminators
  move to modifier assertions; only `AnalysisEngineActivated` stays in the no-op
  assertion. This is *this* step's responsibility (it lands before the
  stub-removal step), so the commit stays green. **Verified empirically (prototype
  + suite run, 2026-06-03): without this split the full prototype fails 6 tests,
  not the stub-removal step's isolated 5 — the 6th is exactly this assertion
  (`Expected "no-op", Received "modifier"`).**

**Estimated diff size**: ~70 lines

`WildfireReading` (`types.ts:6-24`) gains:

```ts
  // Set true by the Helitack translate modifier when a helitack is dropped during
  // this run (only on SimulationStarted readings whose window is still open). Read
  // by the Helitack sim-prop and usedHelitack factor variable. Mirrors how Fireline
  // reads fireLineMarkers — tool *use*, not effectiveness (requirements.md R1).
  helitack?: boolean;
  // Set true by the no-op run terminators (Restart / Reload / TopBarReload) to
  // close this run's helitack window, so a between-runs helitack after a no-op
  // terminator is not attributed to the prior run (requirements.md R2, Technical
  // Notes "Not all run terminators currently produce readings").
  runWindowClosed?: boolean;
```

`translate.ts` `TranslateResult` (`translate.ts:7-9`) gains the modifier arm
(same shape as the substrate type, with `WildfireReading`). A shared helper keeps
the two run-window predicates in one place:

```ts
// A helitack / terminator only acts on an *open* run-start reading — i.e. a
// SimulationStarted reading whose window has not been closed by a terminator.
const isOpenRunStart = (r: WildfireReading | undefined): r is WildfireReading =>
  r?.triggeredBy === "SimulationStarted" && !r.runWindowClosed;
```

New cases (the three terminators move out of the no-op group):

```ts
case "Helitack":
  return { kind: "modifier", apply: (lastReading) => {
    if (!isOpenRunStart(lastReading)) return false;  // pre-run / between-runs → ignore
    lastReading.helitack = true;
    return true;
  }};
case "SimulationRestarted":
case "SimulationReloaded":
case "TopBarReloadButtonClicked":
  return { kind: "modifier", apply: (lastReading) => {
    if (!isOpenRunStart(lastReading)) return false;  // window already closed by a reading-pushing terminator
    lastReading.runWindowClosed = true;
    return true;
  }};
```

`ChartTabShown` / `ChartTabHidden` / `AnalysisEngineActivated` / `default`
remain no-ops.

**Tests** (`translate.test.ts`):
- `Helitack` returns a modifier; `apply` on an open run-start reading sets
  `helitack = true` and returns `true`;
- `apply` on a terminating reading (`triggeredBy: "SimulationEnded"`) returns
  `false` and does not set `helitack`;
- `apply` on `undefined` (no readings) returns `false`;
- `apply` on a run-start reading already flagged `runWindowClosed` returns
  `false`;
- each no-op terminator returns a modifier that flips `runWindowClosed` on an
  open run-start reading and no-ops on a terminating / closed / undefined reading;
- `ChartTab*` / `AnalysisEngineActivated` still return `no-op` — but the existing
  `translate.test.ts:76-81` assertion bundles `AnalysisEngineActivated` *with* the
  three terminators, so it must be **split** (terminators → `modifier`,
  `AnalysisEngineActivated` → `no-op`), not merely extended.

---

### Implement the `Helitack` sim-prop and `usedHelitack` factor variable; remove the stubs

**Summary**: Replace the `Helitack` sim-prop stub and the `usedHelitack` factor
variable stub with real impls that read the `helitack` reading field, and drop
the now-empty stub module. After this step tabs 45/47/54 classify helitack
behavior; R5's `stub-warning`s disappear.

**Files affected**:
- `src/hazbot/wildfire/sim-props.ts` — replace the `Helitack` stub.
- `src/hazbot/wildfire/factor-variables.ts` — add the real `usedHelitack`; drop
  the stub import.
- `src/hazbot/wildfire/factor-variable-stubs.ts` — **delete** (only contained
  `usedHelitack`).
- `src/hazbot/wildfire/sim-props.test.ts`, `factor-variables.test.ts` — co-located
  coverage. The existing `Helitack (stub)` / `usedHelitack (stub)` describe blocks
  assert `isStub === true` (`sim-props.test.ts:411`, `factor-variables.test.ts:161`);
  these are **replaced** by the new behavioral assertions below, not added beside
  them (an `isStub` assertion inverts to `undefined` once the flag is gone).
- `src/hazbot/rule-sets/index.test.ts` — the R5 load gate pins `expectedStubWarnings`
  (`:25-37`) and asserts each rule set emits *exactly* those (`:78-84`). Remove
  `Helitack` / `usedHelitack` from the `45` / `47` / `54` entries (→ `[]`) and fix
  the `:21-24` comment ("four stub-warning entries in total" → the stubs are now
  implemented). **Verified (spike, 2026-06-03): stripping only the two `isStub`
  flags turns this suite red — 5 failures (the two `isStub` assertions plus the
  45/47/54 stub-warning assertions); the rest of the 122-test set stays green.**

**Estimated diff size**: ~70 lines (+ test)

`Helitack` sim-prop (replaces `sim-props.ts:273-282`) — per-run, bound by `WITH`
to each `SimulationStarted` witness (requirements.md R3):

```ts
// Per the sheet (tabs 45/47/54): this run dropped a helitack. The translate
// modifier records it on the run-start reading; effectiveness is not measured
// (requirements.md R1), mirroring Fireline above.
const Helitack: SimPropImpl<WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  evaluate: (reading) => reading.helitack === true,
};
```

`usedHelitack` factor variable (new, in `factor-variables.ts` next to
`usedFireline` at `:183`) — cross-run OR, mirroring `usedFireline`
(requirements.md R4):

```ts
// Per the sheet (tab 45): some run dropped a helitack. True if any
// SimulationStarted reading is flagged in-run (requirements.md R4).
const usedHelitack: FactorVariableImpl<boolean, WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  compute: (readings) => {
    const witnesses = simulationStartedReadings(readings).filter((r) => r.helitack === true);
    return { value: witnesses.length > 0, witnesses };
  },
};
```

Remove `import { usedHelitack } from "./factor-variable-stubs"` (`:3`) and the
stub-comment (`:193-194`); `usedHelitack` stays spread into the `factorVariables`
map. Delete `factor-variable-stubs.ts` (no other importer — verified). The
`Helitack` entry in the `simProps` map (`sim-props.ts:299`) is unchanged.

**Tests**:
- `sim-props.test.ts` — `Helitack` evaluates `true` on a `helitack: true` reading,
  `false` otherwise (and on a reading with the field absent);
- `factor-variables.test.ts` — `usedHelitack` is `true` iff ≥1 `SimulationStarted`
  reading carries `helitack: true`; `false` for zero such readings; witnesses are
  the flagged run-start readings only.

---

### Ruleset integration + negative-path tests (R7)

**Summary**: Two distinct test surfaces, because R6 reachability and the R2
substrate exclusions need different harnesses (verified — spike, 2026-06-03):

1. **Per-category reachability (R6) → extend the existing
   `rule-sets/{45,47,54}.test.ts`**, the WM-18 R9 home R7 points at. These use
   `matchAgainst` → `computeMatchedCategoryFloor` over *directly-constructed*
   readings, **no `consume`** (test-helpers.ts:44-48). The new `Helitack` sim-prop
   reads a plain `reading.helitack` field, so an in-run helitack is just
   `mkReading("SimulationStarted", at, { helitack: true })`. Spike confirmed this
   reaches tab 45 Cat 4 both same-run (`{ fireLineMarkers, helitack: true }`) and
   across-runs (fireline run 1, helitack run 2), and flips Cat 3 off the
   over-match — purely via constructed readings.
2. **Substrate exclusions (R2 / no-op terminators / cross-run non-stickiness) →
   a new event-driven file** (e.g. `src/hazbot/wildfire/helitack-run-window.test.ts`)
   that feeds event sequences through `engine.consume` and then reads
   `engine.readings` / `matchAgainst`. These behaviors require attribution to be
   *produced* by the translate path, so they cannot be expressed by constructing
   readings directly. This file is the authoritative guard for the
   no-op-terminator exclusion (not UI-reachable, so not in the Playwright walk —
   requirements.md R7).

**Files affected**:
- `src/hazbot/rule-sets/45.test.ts` / `47.test.ts` / `54.test.ts` — extend with
  the now-reachable helitack categories (surface 1) and **update the stale stub
  documentation**: the `STUB-GATED` / `STUB-DEGRADED` comment blocks
  (`45.test.ts:11-20`, `47.test.ts:12-20`, `54.test.ts:11-19`) and the
  `(e) stub-gated cat 4` test name + comment (`45.test.ts:68,76`) describe a gate
  that no longer exists.
- `src/hazbot/wildfire/helitack-run-window.test.ts` (new) — the event-driven
  substrate surface (surface 2), using the real `factorVariables` / `simProps` /
  `temporalVariables` / `translate` against a constructed `Engine`.

**Estimated diff size**: ~220 lines (test only)

Coverage (surface 2 unless marked **[surface 1]**):
- **Positive (R1/R3/R4)**: a `SimulationStarted → Helitack` sequence flags the
  run-start reading; `Helitack` sim-prop and `usedHelitack` read `true`.
- **R2 exclusions**:
  - pre-run helitack (before any `SimulationStarted`) → excluded;
  - between-runs helitack after a reading-pushing terminator
    (`SimulationEnded` / `SimulationStopped`) → the `Helitack` modifier
    **declines** (`apply` returns false because `lastReading` is a terminating
    reading, not an open run-start), so neither the terminating reading nor the
    prior run-start is flagged; assert the run-start witness's `helitack` stays
    unset and `usedHelitack` / `Helitack` read false;
  - between-runs helitack after **each** no-op terminator
    (`SimulationRestarted` / `SimulationReloaded` / `TopBarReloadButtonClicked`)
    with no preceding `SimulationEnded` → excluded via `runWindowClosed`
    (the explicit R7 no-op-terminator case);
- **Cross-run non-stickiness**: helitack in run A does not flag run B's
  run-start reading.
- **Per-ruleset reachability (R6)** **[surface 1]** via `matchAgainst` over
  constructed readings, in the existing `rule-sets/{45,47,54}.test.ts`:
  - tab 45 Cat 4 fires same-run (fireline + helitack in one run) **and**
    across-runs (fireline in run 1, helitack in run 2); tab 45 Cat 3 stops
    over-matching a fireline+helitack run;
  - tab 47, driving the `(Fireline OR Helitack)` arm via the **Helitack**
    disjunct — a **helitack-only run** (`{ helitack: true }`, no
    `fireLineMarkers`), distinct from the already-passing fireline coverage at
    `47.test.ts:75-78`: Cat 4 (`NOT X AND Y`, helitack-only run with no prior
    clean-baseline run) and Cat 5 (`X AND Y`, helitack-only run plus a
    clean-baseline run) each via their distinct histories; plus Cat 3's
    no-over-match shown by a helitack-only run now landing at Cat 4 instead of
    Cat 3 (verified empirically: stub → Cat 3, real `Helitack` → Cat 4);
  - tab 54, likewise via the Helitack disjunct — a **helitack-only
    severe-drought run** (`{ helitack: true }`, default vegetation + every zone
    at Severe Drought, no `fireLineMarkers`): Cat 4 (helitack arm under
    `DefaultVegetations AND SevereDroughts`; no Cat 5), plus Cat 3's
    no-over-match shown by that run landing at Cat 4 instead of Cat 3 (verified:
    stub → Cat 3, real `Helitack` → Cat 4). Reaching it requires the run carry
    Severe Drought, matching R8's tab-54 precondition.
- **Regression (R7)** **[surface 1]**: non-helitack categories (tab 45 Cat 1/2,
  tab 47/54 Cat 1/2, no-tool default arms) classify as before the stub removal —
  i.e. the existing `rule-sets/{45,47,54}.test.ts` assertions still pass.

---

### Make `placeHelitackInZone` emit the `Helitack` event (R10)

**Summary**: The Playwright walk (R8) drives helitack drops through
`window.test.placeHelitackInZone`, which currently only mutates the sim and logs
nothing, so the engine never sees the drop (requirements.md R10, pre-impl Check 4).
Emit the production `Helitack` payload after the drop.

**Files affected**:
- `src/models/stores.ts` — augment `placeHelitackInZone` (`:75-78`).
- `CLAUDE.md` — update the helper's description (paired doc; also covered in R9).

**Estimated diff size**: ~12 lines

`placeHelitackInZone` gains the production log emission, matching the pointer path
(`src/components/view-3d/use-helitack-interaction.ts:18`): normalized `{ x, y }`
plus `cell.elevation`.

```ts
placeHelitackInZone(zoneIdx: number) {
  const b = zoneBounds(zoneIdx);
  if (!b) throw new Error(`No cells found for zoneIdx=${zoneIdx}`);
  simulation.setHelitackPoint(b.centerX, b.centerY);
  const cell = simulation.cellAt(b.centerX, b.centerY);
  log("Helitack", {
    x: b.centerX / simulation.config.modelWidth,
    y: b.centerY / simulation.config.modelHeight,
    elevation: cell.elevation,
  });
},
```

(`log` imported into `stores.ts`.) The sibling `placeSparkInZone` /
`placeFireLineInZone` are intentionally unchanged — their classification reads the
`SimulationStarted` snapshot, so mutating the sim suffices (requirements.md R10,
Technical Notes).

---

### Docs + playbook regeneration (R9)

**Summary**: Update the stub-facing docs now that the impls are real, and
regenerate the per-tab playbooks.

**Files affected**:
- `docs/hazbot-validation/localhost-urls.md` — stub-effects table + validation
  status for 45/47/54. **Also fix the dead link at `localhost-urls.md:176`**: the
  "Re-run this validation pass whenever stubs in … are filled in" footer note
  carries a live markdown link `[factor-variable-stubs.ts](../../src/hazbot/wildfire/factor-variable-stubs.ts)`
  pointing at the file this PR **deletes** — drop that link (the `sim-props.ts`
  link beside it stays valid). An editor touching only the table rows (162-174)
  would miss it.
- `src/hazbot/TBD.md` §2 — mark the Helitack / usedHelitack stub entry resolved.
  The §2 entry header (`TBD.md:42`) links to the deleted `factor-variable-stubs.ts`;
  rewriting the entry as resolved removes that link. Separately, `TBD.md:297` (the
  engine-extraction migration checklist, *outside* §2) lists `factor-variable-stubs.ts`
  among bridge files needing change — drop the deleted file from that inventory
  when convenient (low priority; a future-project note, not stub-state docs).
- WM-18 spec "Not Yet Implemented" note — mark helitack done.
- (The `CLAUDE.md` `placeHelitackInZone` description is handled in the R10 step,
  with the code change it documents — not duplicated here.)
- `docs/hazbot-validation/45.md` / `47.md` / `54.md` — regenerate via
  `node scripts/generate-hazbot-validation-playbook.js`; commit any diff, or note
  explicitly that the rule-set expressions are untouched so the regen is a no-op.

**Estimated diff size**: docs only (~variable)

---

### Playwright re-validation (R8, acceptance)

**Summary**: Walk the tab 45/47/54 playbooks against a running dev server via
Playwright MCP, driving helitacks with `window.test.placeHelitackInZone` (now
engine-visible per R10). Record the durable evidence in the PR description.

**Files affected**: none (validation activity; screenshots under the gitignored
`tmp/playwright/`).

**Acceptance evidence** (per-tab summary in the PR description — the durable
record, requirements.md R8):
- tab 45: Cat 4 fires on a fireline+helitack run (exercise both same-run and
  across-runs paths); Cat 3 no longer over-matches; spot-check a non-helitack
  category (Cat 1/2);
- tab 47: Cat 4 (tool run, no clean-baseline) and Cat 5 (tool run + clean-baseline)
  via their distinct histories; Cat 3; non-helitack spot-check. `DefaultVars`
  precondition (do not disable severe drought availability gratuitously).
- tab 54: Cat 4 helitack arm under **Severe Drought** (do **not** pass
  `severeDroughtAvailable=false`); Cat 3; non-helitack spot-check.

The no-op-terminator exclusion is **not** exercised here (not UI-reachable —
covered by the R7 integration tests).

## Open Questions

<!-- Implementation-focused questions only. Requirements questions go in requirements.md. -->

### RESOLVED: Confirm the substrate mechanism — translate `modifier` result kind vs. overlap-guard rework
**Context**: requirements.md deferred this engine-mechanism choice to this spec.
The whole plan above is built on the `modifier` kind; a switch to the
overlap-guard rework would rewrite the substrate step and the bridge step. See
the **Mechanism Decision** section for the full comparison.
**Options considered**:
- A) **Translate `modifier` result kind** (planned). New substrate result kind;
  no guard change; cross-run non-stickiness automatic; surgical surface mirroring
  `Fireline`/`usedFireline`.
- B) **Rework the overlap guard** to permit a `helitackUsed` temporal variable
  accepting `Helitack` alongside the `usedHelitack` factor variable. Reuses
  temporal-variable machinery (seed + `currentTemporal` read) but weakens a
  load-bearing construction invariant for all rule sets and needs the
  eventName-filter trick for cross-run non-stickiness.

**Decision**: **A.** Confirmed empirically (spike, 2026-06-03): Option B cannot
satisfy R7's no-op-terminator exclusion *even assuming a perfect guard rework*.
A temporal variable appends to `lastReading` unconditionally (`engine.ts:421`),
and `lastReading` stays the prior run-start reading across a no-op terminator
(which pushes no reading), so a between-runs helitack leaks onto the prior run for
all reducer designs tested (sticky / reset-on-start / reset-on-all-lifecycle);
the `eventName` filter and resets do not help. Only `translate` can decline to
append based on run-window state. The `modifier` design passed the full
requirement matrix (R1 / R2 / all three no-op terminators / cross-run
non-stickiness), and adding the `modifier` kind is purely additive — the existing
436-test hazbot suite passed with it in place, leaving the overlap guard untouched
for every other rule set.

### RESOLVED: Helitack state representation on the reading — dedicated field vs. temporalHistory entry
**Context**: Given mechanism A, the in-run flag can live as a dedicated
`reading.helitack` boolean (planned, mirrors `Fireline` reading
`fireLineMarkers`) or as a `temporalHistory` entry read with the `GraphOpen`
`.some(...)` idiom.
**Options considered**:
- A) **Dedicated `helitack` field** (planned). Simplest; no seed/filter; reads
  like `Fireline`.
- B) **`temporalHistory` entry**. More consistent with the spec's Technical-Notes
  framing, but re-introduces the seed / `eventName`-filter subtlety the modifier
  was chosen to avoid.

**Decision**: **A.** Verified empirically (spike, 2026-06-03): routing helitack
through `temporalHistory` forces an *undeclared* read — a sim-prop declaring
`temporalReads: ["helitack"]` with no backing temporal variable raises a
`temporal-validation` construction error, so B cannot mirror `GraphOpen`'s
declared read (which is valid only because `chartTabOpen` is a real temporal
variable). B is functionally correct but creates phantom non-variable-backed
history entries and *still* needs a `runWindowClosed` field for control state
(a hybrid model), whereas A keeps both flags as fields, mirrors `Fireline`
exactly, and declares nothing spurious. Neither option escapes writing to the
stored reading (forced by the WITH evaluator's single-witness contract), so A
loses nothing on that axis. Reading representation: `reading.helitack?: boolean`
read as `reading.helitack === true`; `reading.runWindowClosed?: boolean` gates the
modifier's open-run-start check.

### RESOLVED: Modifier substrate API shape — closure `apply(lastReading)` vs. data-driven
**Context**: The new substrate result kind can carry a closure the engine invokes
(`apply: (lastReading) => boolean`, planned) or a data descriptor the engine
interprets (e.g. `{ field, value }`).
**Options considered**:
- A) **Closure `apply`** (planned). Keeps all helitack / run-window semantics in
  the wildfire bridge; the engine stays generic and helitack-agnostic. Returns a
  `mutated` boolean to preserve single-notify-iff-mutated.
- B) **Data-driven descriptor**. The engine applies a declared field/value. More
  declarative but pushes wildfire-specific shape into the substrate, and the
  open-run-start guard logic still has to live somewhere.

**Decision**: **A.** Verified empirically (spike, 2026-06-03): a pure data-driven
`{ field, value }` descriptor leaks on the R7 no-op-terminator case (sets
`helitack = true` on the prior run-start reading) for the same structural reason
Option B failed in OQ1 — `translate`'s signature is `(event, sessionId)` with no
access to the readings, so it cannot pre-condition the descriptor on run-window
state, and the engine must apply it unconditionally. The closure form receives
`lastReading` at apply time and excludes the same case correctly. Any descriptor
rich enough to express the open-run-start predicate would just be a closure by
another name, or would force the engine to embed wildfire run-window rules. The
closure was already exercised end-to-end in the OQ1/OQ2 spikes. Final substrate
type: `| { kind: "modifier"; apply: (lastReading: TReading | undefined) => boolean }`,
with the `consume` case `if (result.apply(lastReading)) mutated = true;` reusing
the Phase-2 `lastReading` const.

### RESOLVED: Step granularity
**Context**: The plan is 7 discrete commits (substrate kind / bridge modifiers /
impls+stub-removal / integration tests / R10 helper / docs / Playwright). Each is
well under ~500 lines.
**Options considered**:
- A) **Keep 7 steps** (planned).
- B) **Merge** the impls step with the integration-tests step, and/or R10 with
  docs — fewer, larger commits.
- C) Other split.

**Decision**: **A**, keep all 7 — each maps to a distinct concern / reviewer lens
(substrate / bridge / impls / tests / test-infra / docs / acceptance) and stays
well under ~500 lines; the two small steps (substrate kind, R10 helper) earn
isolation as a generic engine capability and a test-infra change respectively.
Cleanup applied: the `CLAUDE.md` `placeHelitackInZone` description edit now lives
solely in the R10 step (with the code it documents); the docs step keeps only
`localhost-urls.md`, `TBD.md` §2, the WM-18 note, and the playbook regen.

## Self-Review

<!-- Round 1 (implementation spec; each finding code-verified against current
source before write-up). Files re-read: engine.ts (translate type, consume
switch, lastReading commit, overlap guard), translate.ts, types.ts, sim-props.ts,
factor-variables.ts, factor-variable-stubs.ts, evaluator.ts (evaluateWith,
computeMatchedCategoryFloor), log.ts, stores.ts, use-helitack-interaction.ts, the
rule-sets test-helpers, and the existing rule-sets/{45,47,54,index}.test.ts. The
substrate mechanism (modifier kind, isOpenRunStart guard, cross-run
non-stickiness, the R10 emit) was traced end-to-end and holds; the findings below
are test-suite-coverage and citation defects, not mechanism defects. -->

### QA Engineer

#### RESOLVED: Stub removal turns the existing test suite red — three stub-pinning test files are missing from the Files-affected lists
**Resolution**: The stub-removal step's Files-affected now adds
`rule-sets/index.test.ts` (with the `expectedStubWarnings` 45/47/54 → `[]` edit and
the `:21-24` comment fix) and states the `sim-props.test.ts` / `factor-variables.test.ts`
`isStub` assertions are *replaced*, not augmented. Confirmed empirically (spike,
2026-06-03): stripping only the two `isStub` flags fails exactly these 5 tests, the
rest of the 122-test set green.

The "Implement the `Helitack` sim-prop and `usedHelitack` factor variable; remove
the stubs" step says "R5's `stub-warning`s disappear," but three existing tests
encode the stub state and will fail (not merely go stale) once the stubs are
removed:

- **`src/hazbot/rule-sets/index.test.ts:25-37`** hard-codes
  `expectedStubWarnings` as `"45": ["Helitack", "usedHelitack"]`,
  `"47": ["Helitack"]`, `"54": ["Helitack"]` and asserts *exactly* those per
  rule set (`index.test.ts:78-84`). After removal those rule sets emit **zero**
  Helitack/usedHelitack stub-warnings, so the assertion fails. This file appears
  in **no** step's "Files affected" list, and its lines 21-24 comment ("Helitack
  is referenced by 45/47/54, usedHelitack by 45 — four stub-warning entries in
  total") becomes false. **Hard suite failure if not updated.**
- **`src/hazbot/wildfire/sim-props.test.ts:411`** (`expect(simProps.Helitack.isStub).toBe(true)`)
  and **`factor-variables.test.ts:161`** (`expect(factorVariables.usedHelitack.isStub).toBe(true)`)
  invert on removal. Both files *are* listed in the stub-removal step, but only as
  "co-located coverage" for the *new* positive assertions; the step does not say
  these existing `isStub` assertions must be deleted/replaced. **Hard failures if
  only augmented.**

Suggested resolution: add `rule-sets/index.test.ts` to the stub-removal step's
Files-affected with the `expectedStubWarnings` edit (`45/47/54 → []`) and the
lines 21-24 comment fix; and state explicitly that the `sim-props.test.ts` /
`factor-variables.test.ts` `isStub` assertions are *replaced* by the new
behavioral assertions, not added alongside.

---

#### RESOLVED: R6 per-category reachability diverges from the WM-18 R9 harness in both location and method, and orphans the existing 45/47/54 test files
**Resolution**: The "Ruleset integration" step is split into two surfaces —
surface 1 (R6 reachability + regression) extends the existing
`rule-sets/{45,47,54}.test.ts` via `matchAgainst` over `{ helitack: true }`
readings and updates their stale stub docs / `stub-gated cat 4` naming; surface 2
(R2 exclusions / no-op terminators / cross-run non-stickiness) is the new
event-driven `consume`-based file. The three rule-sets files are now in
Files-affected. Confirmed empirically (spike, 2026-06-03): a constructed
`{ fireLineMarkers, helitack: true }` reading reaches tab 45 Cat 4 same-run, a
fireline-run-1 / helitack-run-2 pair reaches it across-runs, and Cat 3 stops
over-matching — all via `matchAgainst`, no `consume`.

R7 says "Per-ruleset coverage for the now-reachable categories follows the WM-18
R9 pattern" and to "retain / re-run the existing WM-18 per-category coverage for
45/47/54 as regression coverage." That pattern lives in
`src/hazbot/rule-sets/{45,47,54}.test.ts`, which evaluate categories via
`matchAgainst` → `computeMatchedCategoryFloor` over **directly-constructed
readings, without `consume`** (test-helpers.ts:44-48 is explicit: "Computes the
matched category for a sequence of pre-translated readings, without going through
consume()… it's simpler to construct readings directly"). Because the new
`Helitack` sim-prop reads a plain `reading.helitack` field, an in-run helitack is
expressible directly as `mkReading("SimulationStarted", at, { helitack: true })`.

The "Ruleset integration + negative-path tests (R7)" step instead routes **all**
R6 reachability through a *new* file (`src/hazbot/wildfire/helitack-run-window.test.ts`)
that drives "event sequences through `consume`." That conflates two needs:
- The R2 exclusions / no-op-terminator / cross-run non-stickiness genuinely
  require the event→translate→consume path (attribution must be *produced* to be
  observed), so an event-driven test file is justified for **those**.
- R6 per-category reachability does **not** need `consume` — constructing
  `{ helitack: true }` readings and calling `matchAgainst` is cleaner and matches
  the established convention.

As written, the step (a) places reachability coverage outside the `rule-sets/`
home R7 points at, and (b) leaves the existing `45/47/54.test.ts` untouched even
though their stub documentation is now false (`47.test.ts:12-20`,
`54.test.ts:11-19`, `45.test.ts:8-17`) and `45.test.ts:68` is a test literally
named `(e) stub-gated cat 4` describing a gate that no longer exists. None of the
three files is in any Files-affected list.

Suggested resolution: split the test work — put R6 reachability in the existing
`rule-sets/{45,47,54}.test.ts` via `matchAgainst` + `{ helitack: true }` readings
(updating their stale stub comments and the `stub-gated cat 4` naming there), and
scope the new event-driven file to the substrate behaviors that actually need
`consume` (R2 exclusions, the three no-op terminators, cross-run non-stickiness).
Add the three rule-sets test files to the relevant step's Files-affected.

---

### Senior / Substrate Engineer

#### RESOLVED: The integration step asserts reachability "via category evaluation … against a constructed `Engine`," but `Engine` has no category-matching method
**Resolution**: Addressed by the Finding-2 split — reachability now reads "via
`matchAgainst` → `computeMatchedCategoryFloor` over constructed readings" and the
substrate surface names `engine.consume` + `engine.readings` / `matchAgainst`
explicitly. Entrypoints verified to exist: `computeMatchedCategoryFloor`
(evaluator.ts:281), `matchAgainst` (test-helpers.ts:49).

The "Ruleset integration" step says reachability is checked "via category
evaluation" against "a constructed `Engine`." `Engine` (engine.ts) only stores
readings and runs load-time validation; category matching is a separate
evaluator entrypoint (`computeMatchedCategoryFloor` /
`computeMatchedCategoryForEngine` / `highestTrueAt`, evaluator.ts:264-314), which
the test harness reaches through `matchAgainst` (test-helpers.ts:49-59). An
implementer taking "via a constructed Engine" literally would look for a method
that does not exist. This is a phrasing/pointer defect, not a design defect.

Suggested resolution: name the actual entrypoint — reachability is asserted with
`matchAgainst` / `computeMatchedCategoryFloor` over the engine's readings (and,
for the event-driven exclusion cases, after feeding events through
`engine.consume`), not a method on `Engine`.

---

### Spec Editor

#### RESOLVED: Citation off-by-one for the factor-variables stub comment
**Resolution**: Changed `:192-193` → `:193-194` in the stub-removal step.

The stub-removal step said to remove "the stub-comment (`:192-193`)" in
`factor-variables.ts`. The stub comment is at **lines 193-194** (line 192 is
blank). Minor, but it sits one line off against the citation-precision bar the
spec's own Rounds 4-5 set for exactly this kind of pointer.

---

### Candidates investigated and dropped (code-disproved or already covered)

Recorded so a later reviewer need not re-derive them.

- **"Deleting `factor-variable-stubs.ts` may break another importer."** Dropped.
  The only code importer is `factor-variables.ts:3`; the sole other mention is a
  comment at `factor-variables.ts:193`. The spec's "(no other importer —
  verified)" is correct.
- **"Removing the stubs changes the regenerated playbooks, so the R9 'regen is a
  no-op' hedge is wrong."** Dropped. `scripts/generate-hazbot-validation-playbook.js`
  contains no `isStub`/stub reference; it renders from rule-set expressions only,
  which are untouched. Regen genuinely produces no diff.
- **"The new no-op-terminator modifiers (Restart/Reload/TopBarReload) change live
  behavior."** Dropped. In the live UI a reading-pushing `SimulationEnded`
  always precedes them (requirements.md Pre-Impl Check 3), so `isOpenRunStart`
  returns false and the modifier's `apply` returns false → no mutation, no notify
  — behavior preserved. The substrate-level window-close fires only in the
  event-driven tests, which is the intended new behavior.

---

## Self-Review — Round 2 (implementation spec; multi-role, each finding code-verified)

This round re-checked the plan's concrete claims against current source before
write-up. Files re-read: `engine.ts` (translate type 15-17, consume switch
417-452, overlap guard 321-353, latestRunStartReading 74-83), `translate.ts`,
`types.ts`, `evaluator.ts` (`evaluateWith` 132-149, `computeMatchedCategoryFloor`
281-299), `sim-props.ts` (`Fireline` 201, `Helitack` stub 278-282, map 299),
`factor-variables.ts` (`usedFireline` 183, `simulationStartedReadings` 7, stub
import 3, stub comment 193-194), `factor-variable-stubs.ts`,
`temporal-variables.ts`, `stores.ts` (`placeHelitackInZone` 75-78),
`use-helitack-interaction.ts`, `log.ts`, `45.ts` (expressions + sheet typo
`SImulationRestarted` 62, `usedHelitack` logEvents 74), and the existing
`rule-sets/{45,47,54}.test.ts` + `index.test.ts` + `test-helpers.ts` +
`sim-props.test.ts` + `factor-variables.test.ts`. The substrate mechanism, the
overlap-guard avoidance, the R10 emit, and every line citation re-confirmed; the
surviving findings are test-coverage-precision defects, not mechanism defects.

### QA Engineer

#### RESOLVED: Surface-1 reachability for tabs 47/54 doesn't pin the helitack arm to a helitack-only run — and is internally inconsistent (tab 54 says "helitack arm", tab 47 doesn't)
**Resolution**: The surface-1 coverage bullets for tabs 47 and 54 now state the
new assertions drive `(Fireline OR Helitack)` via a **helitack-only run**
(`{ helitack: true }`, no `fireLineMarkers`) — Cat 4 (and tab 47 Cat 5) reached
through the Helitack disjunct, and Cat 3's no-over-match shown by a helitack-only
run landing at Cat 4 instead of Cat 3 — distinct from the already-passing
fireline coverage. **Verified empirically (throwaway Jest with a real `Helitack`
sim-prop, 2026-06-03):** a helitack-only run reaches tab 47 Cat 4, a
helitack-only run + clean baseline reaches tab 47 Cat 5, a helitack-only
severe-drought run reaches tab 54 Cat 4, and the stub→Cat 3 / real→Cat 4 flip
holds for both tabs; the existing 45/47/54/index suites stay green (they cover
only the fireline disjunct).

**Code checked**: `47.test.ts:75-78` (existing `cat 4` / `cat 5` tests already
reach those categories via `defaultWithFireline()` — a fireline run — and pass
*today* with the `Helitack` stub dead); `54.test.ts:82-83` (existing `cat 4` via
`severeWithFireline()`); `47.ts:8-10` / `54.ts:8-9` (Cat 3 =
`... AND NOT (Fireline OR Helitack)`, Cat 4/5 arm = `... AND (Fireline OR
Helitack)`); `sim-props.ts:278-282` (the stub kills only the `Helitack` disjunct).

The stub-removal's *new* behavior for tabs 47/54 is exactly the helitack disjunct
of `(Fireline OR Helitack)`: after removal a **helitack-only run (no fireline)**
should (a) satisfy the Cat 4/Cat 5 arm and (b) stop matching Cat 3's
`NOT (Fireline OR Helitack)`. But the existing `47.test.ts` / `54.test.ts`
already reach Cat 4/5 via the *fireline* disjunct and pass with the stub in
place, so they exercise none of the unlocked path.

The implementation plan's surface-1 coverage (this file, "Ruleset integration"
step) lists "tab 47 Cat 3 / Cat 4 (`NOT X AND Y`, no prior clean-baseline run) /
Cat 5 (`X AND Y`, with a clean-baseline run) each reached via their distinct
histories" — the "distinct histories" axis is the clean-baseline-present/absent
axis (X), which is **orthogonal** to the fireline-vs-helitack disjunct. An
implementer can satisfy that bullet with fireline-only runs (literally the
existing tests) and add nothing for the helitack arm. By contrast the tab 54
bullet *does* say "Cat 4 (helitack arm under `DefaultVegetations AND
SevereDroughts`...)". So tab 47 both (1) fails to pin the helitack disjunct and
(2) reads inconsistently against tab 54.

Suggested resolution: in the surface-1 coverage, state explicitly for tabs 47
**and** 54 that the new assertions drive the `(Fireline OR Helitack)` arm via a
helitack-only run (`{ helitack: true }`, no `fireLineMarkers`) to reach Cat 4
(and tab 47 Cat 5), and that Cat 3's no-over-match is shown with a helitack-only
run that now lands at Cat 4 instead of Cat 3 — distinct from the already-passing
fireline coverage.

---

### Senior / Substrate Engineer

#### RESOLVED: Surface-2 coverage says a post-`SimulationEnded` helitack "lands on the terminating reading" — that's the rejected temporal mechanism's behavior, not the chosen modifier's
**Resolution**: The surface-2 R2 bullet now states the `Helitack` modifier
*declines* after a reading-pushing terminator (`apply` returns false because
`lastReading` is a terminating reading, not an open run-start), so neither
reading is flagged; the test asserts the run-start witness's `helitack` stays
unset and `usedHelitack` / `Helitack` read false. **Verified empirically
(throwaway event-driven Jest with the modifier mechanism temporarily wired into
`engine.consume` + `translate`, then reverted, 2026-06-03):** feeding
`SimulationStarted → SimulationEnded → Helitack` leaves both the run-start and
the terminating reading's `helitack` `undefined` (the modifier writes nothing);
the no-op-terminator window-close, cross-run non-stickiness, and pre-run
exclusion all held through `engine.consume` as well.

**Code checked**: the planned `Helitack` modifier (this file, "Add wildfire
reading fields and the translate modifiers" step): `apply: (lastReading) => { if
(!isOpenRunStart(lastReading)) return false; lastReading.helitack = true; return
true; }`; `isOpenRunStart` = `triggeredBy === "SimulationStarted" &&
!runWindowClosed`; `engine.ts:417` (`lastReading` is the terminating reading
after `SimulationEnded`/`SimulationStopped` push one via `translate.ts:42`).

The surface-2 R2 coverage bullet reads: "between-runs helitack after a
reading-pushing terminator (`SimulationEnded` / `SimulationStopped`) → **lands on
the terminating reading**, excluded from the run-start witness." Under the chosen
**modifier** mechanism that is not what happens: when `lastReading` is the
terminating reading, `isOpenRunStart` is false, `apply` returns `false`, and the
modifier writes **nothing** — neither the terminating reading nor the prior
run-start is flagged. "Lands on the terminating reading" is the *temporal-history*
mechanism's behavior (a `temporalHistory.push` targets `lastReading`
unconditionally — requirements.md Pre-Impl Check 2, which probed that rejected
substrate), carried over verbatim into a bullet describing the modifier-based
test. The operative assertion (excluded from the run-start witness) is right, but
the rationale would mislead an implementer into asserting `endedReading.helitack
=== true`, which fails under the modifier.

Suggested resolution: reword the bullet to the modifier's actual behavior — the
`Helitack` modifier *declines* (its `apply` returns false because `lastReading`
is a terminating reading, not an open run-start), so neither reading is flagged;
assert the run-start witness's `helitack` stays unset and `usedHelitack` /
`Helitack` read false.

---

### Spec Editor

#### RESOLVED: A resolved Round-1 finding cites `evaluator.ts:264-353`, past the file's 315-line end
**Resolution**: Changed `evaluator.ts:264-353` → `evaluator.ts:264-314` in the
Round-1 item's problem statement.

**Code checked**: `evaluator.ts` ends at line 315; `highestTrueAt` is 264-274,
`computeMatchedCategoryFloor` 281-299, `computeMatchedCategoryForEngine` 304-314.

In the Round-1 "RESOLVED: The integration step asserts reachability ... against a
constructed `Engine`" item, the problem-statement paragraph cites
"(`computeMatchedCategoryFloor` / `computeMatchedCategoryForEngine` /
`highestTrueAt`, evaluator.ts:264-353)". The range end `353` overshoots EOF by 38
lines (it looks borrowed from the overlap guard's `engine.ts:321-353`). The
item's *Resolution* already gives the correct pointers (`evaluator.ts:281`,
`test-helpers.ts:49`), so this is historical-narrative residue, not a live
instruction — but it trips the same citation-precision bar Rounds 4-5 of
requirements.md set for exactly this. Minor.

Suggested resolution: change `evaluator.ts:264-353` to `evaluator.ts:264-314`
(or drop the range), or leave as-is given it sits inside a resolved item's
restatement of the now-fixed problem.

---

## Self-Review — Round 3 (implementation spec; empirically verified — full mechanism prototyped against the live suite, then reverted)

Unlike Rounds 1-2 (code-read verification), this round **prototyped the entire
mechanism** in a throwaway branch state and ran the Jest suite, then reverted all
code (spec files untouched). Sequence: (1) baseline `npx jest src/hazbot` → 419
pass / 34 suites green; (2) stripped *only* the two `isStub` flags → exactly **5**
failures, confirming the stub-removal step's spike claim precisely; (3) wired the
full modifier mechanism (engine `modifier` kind + consume case, `helitack` /
`runWindowClosed` reading fields, the `Helitack` / no-op-terminator translate
cases, real `Helitack` sim-prop + `usedHelitack` factor variable) and ran a
throwaway test — **all 10 reachability + exclusion assertions passed**, including
the no-op-terminator (`SimulationRestarted`) window-close via `runWindowClosed`
that R7 says is Jest-only (not UI-reachable). One new defect surfaced.

### QA Engineer

#### RESOLVED: The translate-modifier step under-counts its red tests — an existing combined `no-op` assertion (`translate.test.ts:76-81`) becomes a hard failure not called out
**Resolution**: The "Add wildfire reading fields and the translate modifiers"
step's `translate.test.ts` Files-affected entry now requires **splitting** the
existing `translate.test.ts:76-81` assertion (the three terminators →
`modifier`; only `AnalysisEngineActivated` stays `no-op`), states this is that
step's own responsibility (it lands before the stub-removal step, so the commit
must stay green), and records that the full-PR red-test count is **6** (5
stub-pinning + 1 translate), distinct from the stub-removal step's isolated 5.
The Tests bullet for `AnalysisEngineActivated → no-op` now notes the bundled
assertion must be split, not merely extended.

**Verified empirically (prototype + `npx jest src/hazbot`, 2026-06-03)**:
stripping only the `isStub` flags fails exactly 5 tests, but the *full* prototype
fails **6** — the 6th is `translate.test.ts`'s `maps SimulationRestarted /
SimulationReloaded / TopBarReloadButtonClicked / AnalysisEngineActivated to
no-op` test (`Expected: "no-op", Received: "modifier"`), because the three
terminators now return a modifier. The spec's "5 failures" spike (stub-removal
step + Round-1 QA finding) under-counted because it stripped `isStub` only and
never exercised the translate change. This is the same "replaced, not augmented"
hazard the Round-1 QA finding caught for the `isStub` assertions, extended to the
one existing translate assertion that bundles a still-valid case
(`AnalysisEngineActivated → no-op`) with the three now-`modifier` terminators.

### Spec Editor

#### RESOLVED: The docs step leaves dead markdown links to the deleted `factor-variable-stubs.ts`
**Resolution**: The docs step's `localhost-urls.md` bullet now calls out the live
markdown link at `localhost-urls.md:176` (the "Re-run … when stubs … are filled
in" footer) pointing at the file the PR deletes, with instruction to drop it; the
`TBD.md` bullet notes both the §2 header link (`TBD.md:42`, removed by marking the
entry resolved) and the out-of-§2 migration-checklist reference (`TBD.md:297`).

**Verified (grep across `src` / `docs` / `specs`, 2026-06-03)**: the only
non-spec references to `factor-variable-stubs.ts` are `factor-variables.ts:3`
(the import the stub-removal step already drops), `factor-variables.ts:193` (the
stub comment already slated for removal), `TBD.md:42` (§2 header — covered),
`TBD.md:297` (migration checklist — now noted), and `localhost-urls.md:176` (the
footer link — now covered). `WM-18 spec:65` was checked and dropped: it is R7a's
`sawIntenseFire` history, unrelated to the "Not Yet Implemented" note R9 targets.

### Candidates investigated and disproved by the prototype (recorded so a later reviewer need not re-run them)

- **Surface-1 reachability holds.** `matchAgainst` over constructed
  `{ helitack: true }` readings reached tab 45 Cat 4 (same-run *and* across-runs),
  tab 47 Cat 4 (helitack-only run, no clean baseline) and Cat 5 (clean baseline +
  helitack run), and tab 54 Cat 4 (helitack-only severe-drought run) — all via the
  real `Helitack` sim-prop reading a plain `reading.helitack` field, no `consume`.
- **Surface-2 exclusions hold through `consume`.** In-run helitack flags the
  run-start reading; a pre-run helitack is dropped (no reading); a post-`SimulationEnded`
  helitack has its modifier decline (terminating reading is not an open run-start);
  a post-`SimulationRestarted` (no-op terminator, no reading pushed) helitack is
  excluded via `runWindowClosed`; and a run-A helitack leaves run B's reading
  unflagged (cross-run non-stickiness). Confirms OQ1's claim that only `translate`
  can decline the append based on run-window state.
- **Adding the `modifier` kind is purely additive.** Beyond the 5 stub-pinning
  tests and the 1 translate assertion above, no other suite regressed — the other
  413 tests stayed green with the full mechanism in place, the overlap guard
  untouched.
