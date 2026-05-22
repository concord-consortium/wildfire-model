# Implementation Plan: Hazbot — Source Engine Defaults from the Simulation Config

**Jira**: https://concord-consortium.atlassian.net/browse/WM-27
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **In Development**

## Implementation Plan

The plan is seven forward-only steps. Each step leaves `npm test` / `npm run
lint` / `npm run build` green so it is independently committable and
reviewable. Steps 1–2 add the new dataflow (config → resolved config → derived
defaults → engine); Steps 3–4 remove the old substrate machinery; Steps 5–7
clean up the extractor, add the observability, and update the docs.

A note on the mid-sequence states: after Step 2 the engine evaluates rule-sets
23/24 against config-derived defaults, but rule-sets 32–35 are still
load-blocked by `missing-defaults` — exactly as they are today. Step 3 removes
that failure mode, at which point 32–35 load. No step regresses a rule-set that
loads today.

---

### Add `getResolvedConfig()` to `config.ts` and route `simulation.ts` / `stores.ts` through it

**Summary**: Centralize the `Object.assign(getDefaultConfig(), preset,
getUrlConfig())` merge — and the duplicated `getUrlConfig().preset ||
getDefaultConfig().preset` preset-name resolution — into one shared helper
(Requirement 1, RESOLVED OQ3). This is a pure refactor with no behaviour
change; it exists so Step 2's wildfire bridge has a single, correct way to
obtain the resolved config.

**Files affected**:
- `src/config.ts` — add `getResolvedConfig()`.
- `src/models/simulation.ts` — `load()` routes through `getResolvedConfig()`; `presetConfig` parameter becomes optional.
- `src/models/stores.ts` — construct `SimulationModel` with no argument; drop the duplicated preset-name resolution and its now-unused imports.
- `src/presets.ts` — make the `ISimulationConfig` import explicitly `import type` (defensive: keeps the new `config.ts → presets.ts` import one-directional at runtime).

**Estimated diff size**: ~55 lines

**`src/config.ts`** — append after `getUrlConfig()`:

```ts
import presets from "./presets";

// Resolves the full simulation config the model actually loads: the shallow
// merge Object.assign(getDefaultConfig(), preset, getUrlConfig()) — base
// defaults, overlaid with the selected preset, overlaid with URL-param
// overrides. The preset is resolved from the URL as
// presets[getUrlConfig().preset || getDefaultConfig().preset].
//
// `explicitPreset`, when supplied, substitutes ONLY the preset slot of the
// merge (callers that inject a config — e.g. the SimulationModel constructions
// in simulation.test.ts). The base and URL layers are always applied; there is
// no "compose two arbitrary partials" mode. The merge is intentionally shallow:
// each top-level key (including the `zones` tuple) is taken wholesale from the
// highest-priority source that defines it.
export const getResolvedConfig: (explicitPreset?: Partial<ISimulationConfig>) => IUrlConfig =
  (explicitPreset) => {
    const urlConfig = getUrlConfig();
    const preset = explicitPreset
      ?? presets[urlConfig.preset || getDefaultConfig().preset];
    return Object.assign(getDefaultConfig(), preset, urlConfig);
  };
```

> **Runtime-cycle note.** `config.ts` already has no value imports from
> `presets.ts`; `presets.ts` imports only the *type* `ISimulationConfig` from
> `config.ts`. Adding `import presets from "./presets"` to `config.ts` makes
> `config → presets` the single runtime edge; the reverse stays type-only and
> is erased. Switching `presets.ts` to `import type { ISimulationConfig }`
> makes that erasure explicit and prevents a future non-type import there from
> silently introducing a real cycle.

**`src/models/simulation.ts`** — change the import and `load()`:

```ts
// before
import { getDefaultConfig, ISimulationConfig, getUrlConfig } from "../config";
...
constructor(presetConfig: Partial<ISimulationConfig>) {
...
@action.bound public load(presetConfig: Partial<ISimulationConfig>) {
  this.restart();
  // Configuration are joined together. Default values can be replaced by preset, and preset values can be replaced
  // by URL parameters.
  this.config = Object.assign(getDefaultConfig(), presetConfig, getUrlConfig());
  this.setInputParamsFromConfig();
  this.populateCellsData();
}
```

```ts
// after
import { ISimulationConfig, getResolvedConfig } from "../config";
...
constructor(presetConfig?: Partial<ISimulationConfig>) {
...
@action.bound public load(presetConfig?: Partial<ISimulationConfig>) {
  this.restart();
  // Default values, overlaid with the preset, overlaid with URL params — see
  // getResolvedConfig(). `presetConfig` is retained only so tests can inject a
  // config; when omitted the helper resolves the preset from the URL.
  this.config = getResolvedConfig(presetConfig);
  this.setInputParamsFromConfig();
  this.populateCellsData();
}
```

`getDefaultConfig` / `getUrlConfig` are no longer referenced in
`simulation.ts`; drop them from the import (verify with `npm run lint`).
`reload()` does not call `load()` — it re-runs `setInputParamsFromConfig()` /
`populateCellsData()` against the existing `this.config` — so it is unaffected.

**`src/models/stores.ts`** — `load()` now resolves the preset itself:

```ts
// before
import presets from "../presets";
import { getDefaultConfig, getUrlConfig } from "../config";
...
const simulation = new SimulationModel(presets[getUrlConfig().preset || getDefaultConfig().preset]);
```

```ts
// after  (presets / getDefaultConfig / getUrlConfig imports removed)
const simulation = new SimulationModel();
```

`DroughtLevel` / `TerrainType` / `Vegetation` are still imported (window
globals). The `sim.load({...})` console-usage comment block stays accurate.

**Tests**:
- `src/config.test.ts` — **new**: `getResolvedConfig()` is net-new, behaviour-rich
  code (Requirement 1) and gets its own coverage:
  - the no-argument call resolves the preset from the URL `preset` param and
    merges base ◁ preset ◁ URL;
  - an explicit preset partial substitutes the preset slot of the merge;
  - URL params still override an explicit preset partial (the explicit-preset
    form is `Object.assign(getDefaultConfig(), explicitPreset, getUrlConfig())`);
  - a preset's `zones` replaces the base `zones` wholesale — shallow merge, no
    per-zone deep merge;
  - an unrecognized URL `preset` name falls back to the base config (the
    `presets[...]` lookup is `undefined`, which `Object.assign` skips).

  Drive the URL cases with the same `window.location` mock pattern
  `engine-singleton.test.ts` uses.
- `src/models/simulation.test.ts` constructs `new SimulationModel({…})` with
  explicit partial configs — that path is preserved by the optional
  `presetConfig` parameter, so the suite needs no change. Run it to confirm.

---

### Derive `WildfireDefaults` from the resolved config and feed it through a new `EngineOpts.defaults` channel

**Summary**: Add the config → `WildfireDefaults` derivation (Requirements 2–5),
a generic engine-level `EngineOpts.defaults` input (RESOLVED OQ1), and wire the
wildfire bridge to derive defaults at construction. The render/match evaluation
path switches from `ruleSet.defaults` to the engine-level value. After this
step the engine evaluates against config-derived defaults; `RuleSet.defaults`
still exists but is no longer read on the evaluation path (it is removed in
Step 4).

**Files affected**:
- `src/hazbot/wildfire/derive-defaults.ts` — **new**: config → `WildfireDefaults`.
- `src/hazbot/wildfire/derive-defaults.test.ts` — **new**: derivation coverage.
- `src/hazbot/engine/engine.ts` — add `EngineOpts.defaults` + `Engine.defaults`.
- `src/hazbot/wildfire/engine-singleton.ts` — derive defaults, pass via `EngineOpts.defaults`.
- `src/hazbot/engine/evaluator.ts` — `computeMatchedCategoryForEngine()` reads `engine.defaults`.
- `src/hazbot/engine/react/use-analysis-engine.ts` — reads `engine.defaults`.
- `src/hazbot/rule-sets/test-helpers.ts` — `makeWildfireEngine()` accepts defaults; `matchAgainst()` reads `engine.defaults`.
- `src/hazbot/rule-sets/23.test.ts`, `24.test.ts` — pass the baseline defaults to `makeWildfireEngine()`.
- `src/hazbot/wildfire/engine-singleton.test.ts` — **new coverage**: `getAnalysisEngine()` wires config-derived defaults onto `engine.defaults`.

**Estimated diff size**: ~190 lines

**New file `src/hazbot/wildfire/derive-defaults.ts`**:

```ts
import { ISimulationConfig } from "../../config";
import {
  terrainLabels, vegetationLabels, droughtLabels,
  TerrainType, Vegetation, DroughtLevel,
} from "../../types";
import { WildfireDefaults } from "./types";

// Derives the engine's change-detection defaults from a resolved simulation
// config (preset + URL params) — per WM-27 Requirements 2–4.
//
// One zone default is emitted per populated entry of the config.zones tuple,
// in tuple order, independent of zonesCount (Requirement 3). Enum values are
// converted to the same string labels the SimulationStarted payload uses
// (terrainLabels / vegetationLabels / droughtLabels — bottom-bar.tsx) so the
// set* factor-variable comparisons are like-for-like.
//
// No defensive validation, by design (see requirements.md Technical Notes).
// The `as` casts are required because `ZoneOptions` (the config zone shape in
// src/models/zone.ts) types these fields loosely: `terrainType?` / `vegetation?`
// are optional and `droughtLevel?` is `number`, not `DroughtLevel`. A resolved
// config's zones are always fully populated at runtime — getDefaultConfig() and
// every preset in src/presets.ts set all three fields, and both are
// TypeScript-checked — so the casts assert a guarantee the `ZoneOptions` type is
// too loose to express. They add no runtime check; a malformed hand-crafted
// `?zones=` URL param is a pre-existing loud failure of the simulation itself.
export function deriveWildfireDefaults(config: ISimulationConfig): WildfireDefaults {
  const zones = config.zones
    .filter((z): z is NonNullable<typeof z> => z !== undefined)
    .map((z) => ({
      terrainType: terrainLabels[z.terrainType as TerrainType],
      vegetation: vegetationLabels[z.vegetation as Vegetation],
      droughtLevel: droughtLabels[z.droughtLevel as DroughtLevel],
    }));
  return {
    zones,
    wind: { speed: config.windSpeed, direction: config.windDirection },
  };
}
```

**New file `src/hazbot/wildfire/derive-defaults.test.ts`** — exercises a 2-zone
config, a 3-zone config, the enum→label conversion, and the per-zone count rule
(Requirement 3 + the QA Self-Review coverage item), plus one case that derives
straight from a **real fixed-terrain preset** (`presets.mountainTwoZoneFixedTerrain`).
That last case does *not* exercise a distinct derivation branch —
`deriveWildfireDefaults` reads only `config.zones` / `windSpeed` /
`windDirection` and never inspects `elevation` or any fixed-terrain marker — it
is a **preset-data regression guard**: it pins that a real fixed-terrain
preset's zone tuple still derives the expected labels (the fixed-terrain presets
back rule-sets 25 / 32 / 34, so their zone data drifting is a live risk; see
QA5). The inputs are built **directly** as `ISimulationConfig` objects (via
`getDefaultConfig()` plus a spread — of either the zone/wind fields under test
or a preset partial) rather than routed through `getResolvedConfig()` —
`deriveWildfireDefaults` and `getResolvedConfig` are independent units and are
covered by independent tests (`getResolvedConfig` is covered by
`src/config.test.ts`, added in Step 1). Sketch:

```ts
import { getDefaultConfig } from "../../config";
import presets from "../../presets";
import { TerrainType, Vegetation, DroughtLevel } from "../../types";
import { deriveWildfireDefaults } from "./derive-defaults";

const cfg = (over: Partial<ReturnType<typeof getDefaultConfig>>) =>
  ({ ...getDefaultConfig(), ...over });

it("derives one label-string default per populated zone — 2-zone config", () => {
  const d = deriveWildfireDefaults(cfg({
    zones: [
      { terrainType: TerrainType.Plains, vegetation: Vegetation.Shrub, droughtLevel: DroughtLevel.MildDrought },
      { terrainType: TerrainType.Plains, vegetation: Vegetation.Shrub, droughtLevel: DroughtLevel.MildDrought },
    ],
    windSpeed: 0, windDirection: 0,
  }));
  expect(d.zones).toEqual([
    { terrainType: "Plains", vegetation: "Shrub", droughtLevel: "Mild Drought" },
    { terrainType: "Plains", vegetation: "Shrub", droughtLevel: "Mild Drought" },
  ]);
  expect(d.wind).toEqual({ speed: 0, direction: 0 });
});

it("derives three zones for a 3-zone config", () => { /* three populated zones */ });
it("emits one default per populated zones-tuple entry, skipping an undefined 3rd slot", () => { /* … */ });

// Preset-data regression guard (QA5) — not a distinct derivation branch.
// Derives straight from a real fixed-terrain preset; `cfg()` spreads the preset
// partial onto the base config (no getResolvedConfig()), so deriveWildfireDefaults
// and getResolvedConfig stay independently covered.
it("derives the expected labels from the mountainTwoZoneFixedTerrain preset", () => {
  const d = deriveWildfireDefaults(cfg(presets.mountainTwoZoneFixedTerrain));
  expect(d.zones).toEqual([
    { terrainType: "Mountains", vegetation: "Shrub", droughtLevel: "Mild Drought" },
    { terrainType: "Mountains", vegetation: "Shrub", droughtLevel: "Mild Drought" },
  ]);
});
```

**`src/hazbot/engine/engine.ts`** — add the generic defaults channel:

```ts
// in EngineOpts<TReading, TDefaults>:
  // Engine-level change-detection defaults, supplied by the consumer at
  // construction (per WM-27 — defaults are a construction input, not RuleSet-baked).
  defaults?: TDefaults;

// as an Engine field, alongside `ruleSet`:
  defaults: TDefaults | undefined = undefined;

// in the constructor body (unconditional — placeholders included):
  this.defaults = opts.defaults;
```

**`src/hazbot/wildfire/engine-singleton.ts`** — derive and pass defaults:

```ts
// new imports
import { getResolvedConfig } from "../../config";
import { deriveWildfireDefaults } from "./derive-defaults";

// inside getAnalysisEngine(), once, before constructing the engine:
const defaults = deriveWildfireDefaults(getResolvedConfig());

// pass `defaults` into BOTH the main `new Engine({...})` opts and the
// EngineConstructionError-catch placeholder `new Engine({...})` opts.
```

`getResolvedConfig()` is called with no argument here: the bridge wants the
URL-resolved config, exactly what the running `SimulationModel` loads.

**`src/hazbot/engine/evaluator.ts`** — `computeMatchedCategoryForEngine()`:

```ts
// before
const defaults = engine.ruleSet.defaults as TD | undefined;
// after
const defaults = engine.defaults;
```

**`src/hazbot/engine/react/use-analysis-engine.ts`** — both reads of
`engine.ruleSet?.defaults as TD | undefined` become `engine.defaults`
(`computeView`'s `factorVariableValues` loop and the `simPropValues` block).

**`src/hazbot/rule-sets/test-helpers.ts`** — `makeWildfireEngine()` takes the
defaults the engine should evaluate against; `matchAgainst()` reads
`engine.defaults`. The `defaults` parameter is intentionally **optional**: it
mirrors the optional `EngineOpts.defaults`, and rule-set 25 references no
defaults-bearing factor variable, so a required parameter would force a
meaningless argument in `25.test.ts`. Caution: a `set*`-using rule-set built
without `defaults` evaluates against `undefined` — every `set*` factor variable
throws and is caught to its `false` fallback, silently misclassifying — so a
caller testing such a rule-set (23, 24, 32–35) must pass `defaults`.

```ts
export function makeWildfireEngine(
  ruleSet: RuleSet<WildfireDefaults>,
  defaults?: WildfireDefaults,
): Engine<WildfireReading, WildfireDefaults> {
  const opts: EngineOpts<WildfireReading, WildfireDefaults> = {
    ruleSet, requestedRuleSetId: ruleSet.id,
    factorVariables, simProps, temporalVariables, translate,
    runStartTriggers: ["SimulationStarted"],
    defaults,
  };
  return new Engine<WildfireReading, WildfireDefaults>(opts);
}

export function matchAgainst(
  ruleSet: RuleSet<WildfireDefaults>,
  engine: Engine<WildfireReading, WildfireDefaults>,
  readings: WildfireReading[],
): number | null {
  return computeMatchedCategoryFloor(
    ruleSet, engine.parsedExpressions,
    (slice) => makeRenderCtx(
      slice, engine.defaults, engine.factorVariables, engine.simProps,
      engine.implsWithIncompleteDefaults,
    ),
    readings,
  );
}
```

> The `implsWithIncompleteDefaults` argument above is unchanged from today —
> `makeRenderCtx` still has that (optional) parameter in Step 2. Step 3 drops the
> parameter from `makeRenderCtx` and removes this argument along with it (and the
> matching argument in `computeMatchedCategoryForEngine` / `use-analysis-engine`).

**`src/hazbot/rule-sets/23.test.ts` / `24.test.ts`** — these already define a
`defaultZones` fixture (Plains/Shrub/Mild ×2). Pass it through:

```ts
const e = makeWildfireEngine(ruleSet23, { zones: defaultZones, wind: { speed: 0, direction: 0 } });
```

Their passing confirms the config-derived defaults reproduce the baseline the
fixtures encode (Requirement 9). No test pins config-derived defaults to the
deleted hand-extracted `defaults` objects (QA Self-Review "won't fix" item).

**`src/hazbot/wildfire/engine-singleton.test.ts`** — **new coverage** for the
bridge's defaults wiring (Self-Review item QA4). `derive-defaults.test.ts`
covers the derivation in isolation and 23/24's suites cover the
`EngineOpts.defaults → Engine.defaults → matchAgainst` channel, but nothing
exercises `engine-singleton.ts` actually calling
`deriveWildfireDefaults(getResolvedConfig())` and threading the result through
`EngineOpts.defaults`. Add a test that, with a known-preset URL
(`?hazbotRules=23&preset=plainsTwoZone`, driven by the same `window.location`
mock the file already uses, and `_resetAnalysisEngineForTests()` between cases),
`getAnalysisEngine()`'s engine carries `engine.defaults` deep-equal to an
**explicit `WildfireDefaults` literal** for that preset — Plains/Shrub/Mild ×2
zones + wind `{ speed: 0, direction: 0 }` for `plainsTwoZone`. Using the literal
(not `deriveWildfireDefaults(getResolvedConfig())`) as the expected value makes
the test catch a wrong derivation as well as broken wiring; the generic
enum→label logic stays covered by `derive-defaults.test.ts`.

---

### Remove the `missing-defaults` failure mode and the defaults-validation substrate

**Summary**: Delete the load-time defaults-path validation and its supporting
machinery (Requirement 7, RESOLVED OQ1 option A). Once defaults are always
config-derived they are always complete, so `requiredDefaults`,
`validateDefaultsPath`, `collectFromImpl`, `implsWithIncompleteDefaults`, the
`missing-defaults` reason, and the render-path incomplete-defaults guard have no
remaining job. After this step rule-sets 32–35 load with no defaults-attributable
load-blocking error (Requirement 8).

**Files affected**:
- `src/hazbot/engine/validate-defaults.ts` — **deleted**.
- `src/hazbot/engine/validate-defaults.test.ts` — **deleted**.
- `src/hazbot/engine/types.ts` — remove `requiredDefaults` from `FactorVariableImpl` / `SimPropImpl`; remove `missing-defaults` from the `load-failure` reason union.
- `src/hazbot/engine/engine.ts` — remove `validateDefaultsPath` import, `collectFromImpl()`, `implsWithIncompleteDefaults`, the `collectFromImpl` calls in `runLoadTimeValidation()`.
- `src/hazbot/engine/safely-evaluate-impl.ts` — remove the three-branch incomplete-defaults guard and `implsWithIncompleteDefaults` from `EngineLite` / the render wrappers.
- `src/hazbot/engine/evaluator.ts` — `makeRenderCtx()` drops the `implsWithIncompleteDefaults` parameter.
- `src/hazbot/engine/react/use-analysis-engine.ts` — drop `engine.implsWithIncompleteDefaults` arguments.
- `src/hazbot/engine/error-rendering.ts` — remove the `missing-defaults` case.
- `src/hazbot/wildfire/factor-variables.ts` — remove the `requiredDefaults` arrays from the six `set*` impls.
- `src/hazbot/rule-sets/test-helpers.ts` — drop the `implsWithIncompleteDefaults` argument from the `matchAgainst` `makeRenderCtx` call.
- Tests: `engine.test.ts`, `safely-evaluate-impl.test.ts`, `error-rendering.test.ts`, `consume.test.ts`, `factor-variables.test.ts`, `sidebar.test.tsx` — drop/adjust `missing-defaults` / `requiredDefaults` / incomplete-defaults cases.

**Estimated diff size**: ~360 lines (predominantly deletions + test churn)

**`src/hazbot/engine/types.ts`**:

```ts
// FactorVariableImpl / SimPropImpl: delete the `requiredDefaults?: string[];` line.
// load-failure reason union — before:
| { kind: "load-failure"; reason: "missing-rule-set" | "missing-defaults" | "missing-impl"; … }
// after (the load-failure VARIANT stays — only the `missing-defaults` reason is removed):
| { kind: "load-failure"; reason: "missing-rule-set" | "missing-impl"; … }
```

**`src/hazbot/engine/engine.ts`**:
- Delete `import { validateDefaultsPath } from "./validate-defaults";`.
- Delete the `implsWithIncompleteDefaults` field declaration and its doc comment.
- Delete the `collectFromImpl()` method entirely.
- In `runLoadTimeValidation()`, the reference-driven walk currently calls
  `this.collectFromImpl(name, impl)` for each referenced factor-variable and
  sim-prop after the missing-impl check. Remove those two calls — the
  `missing-impl` checks above them stay. The walk's only remaining job is
  `missing-impl` detection + stub-warning collection.
- Update the stale comments. The asymmetric-construction-error block (~line 141)
  lists `missing-defaults` as a `this.errors` variant; the
  `runLoadTimeValidation()` walk comment (~line 211) reads "Reference-driven
  walk: missing-impl + missing-defaults + ambient-key collection." Both must
  lose the `missing-defaults` reference. Grep `engine.ts` comments for
  `missing-defaults` / `requiredDefaults` / `collectFromImpl` to catch any
  other stragglers.

**`src/hazbot/engine/safely-evaluate-impl.ts`**: the render wrappers lose the
`requiredDefaults` / `implsWithIncompleteDefaults` reasoning. They keep a
`defaults: TD | undefined` parameter (the substrate signature still allows
`undefined`) and simply call `compute` / `evaluate` inside the existing
try/catch — a throw still yields the per-impl-kind fallback. `EngineLite` drops
its `implsWithIncompleteDefaults?` field. Example:

```ts
// evaluateFactorVarForRender — after:
export function evaluateFactorVarForRender<V, TR extends BaseReading, TD>(
  fvar: NamedFactorVar<V, TR, TD>,
  readings: TR[],
  defaults: TD | undefined,
): { value: V; witnesses: TR[] } {
  try {
    return fvar.impl.compute(readings, defaults as TD);
  } catch {
    return { value: fvar.impl.defaultValue, witnesses: [] };
  }
}
```

`evaluateSimPropForRender` is simplified symmetrically. The `FactorVarWrap` /
`SimPropWrap` type aliases are unchanged (they already take `defaults: TD |
undefined`).

**`src/hazbot/engine/evaluator.ts`**: `makeRenderCtx()` drops its trailing
`implsWithIncompleteDefaults?` parameter; the two wrap closures call
`evaluateFactorVarForRender(fvar, rs, ds)` / `evaluateSimPropForRender(sprop, r,
ds)` without it. `computeMatchedCategoryForEngine()` (same file) also drops the
now-removed `engine.implsWithIncompleteDefaults` argument from its
`makeRenderCtx` call — both that field and the parameter are gone after this
step.

**`src/hazbot/engine/react/use-analysis-engine.ts`**: the three
`engine.implsWithIncompleteDefaults` arguments (in `computeView`'s
`factorVariableValues` loop, the `simPropValues` block, and the `makeRenderCtx`
call) are removed.

**`src/hazbot/engine/error-rendering.ts`**: delete the `case
"missing-defaults":` block from the `load-failure` switch. The `default` arm of
that inner switch stays.

**`src/hazbot/wildfire/factor-variables.ts`**: delete the `requiredDefaults: […]`
line from `setDroughtLevel`, `setVegetation`, `setTerrainType`, `setWind`,
`setAnyZoneVar`, `setAnyVar`. The `compute` bodies are unchanged — they still
receive `defaults` and read `defaults.zones` / `defaults.wind`.

**Tests**:
- `validate-defaults.test.ts` — deleted with the module.
- `engine.test.ts` — remove cases asserting `missing-defaults` is produced /
  `implsWithIncompleteDefaults` is populated. A case that today asserts a
  `defaults: {}` rule-set is inactive should be removed or repurposed; after
  this step such a rule-set loads.
- **New positive coverage for Requirement 8**, in a **bridge-level** test (a
  wildfire-level test — e.g. alongside `engine-singleton.test.ts` — **not**
  `engine.test.ts`, which is the generic-substrate suite and must not import the
  wildfire `ruleSets`; see Self-Review QA8): for each of rule-sets 32, 33, 34, 35,
  the engine constructed via `makeWildfireEngine(ruleSets["NN"])` (or
  `getAnalysisEngine()`) is `isActive === true` and `engine.errors` contains no
  `load-failure` entry. This replaces the removed negative assertions and gives
  Requirement 8 ("the engine loads every existing rule-set … with no
  load-blocking error attributable to defaults") direct named coverage — it also
  catches a regression where some other load-failure path silently re-blocks
  32–35.
- `safely-evaluate-impl.test.ts` — remove the three-branch-guard cases (branches
  1/2). The throw→fallback behaviour stays tested.
- `error-rendering.test.ts` — remove the `missing-defaults` rendering case.
- `consume.test.ts` — adjust any engine setup that depended on
  `requiredDefaults` / incomplete-defaults.
- `factor-variables.test.ts` — drop assertions on `impl.requiredDefaults`; the
  `compute`-against-`defaults` cases stay (they pass `defaults` directly).
- `sidebar.test.tsx` — adjust if it constructs an engine expecting
  `missing-defaults`.

---

### Remove `RuleSet.defaults` and `DeepPartial`; surgically strip `defaults` from the seven rule-set modules

**Summary**: Remove the last of the substrate's static-defaults surface
(Requirement 6) and strip the now-dead `defaults` field from the committed
generated rule-set modules (Requirement 11, RESOLVED OQ2).

**Files affected**:
- `src/hazbot/engine/types.ts` — remove `RuleSet.defaults`; remove `DeepPartial`.
- `src/hazbot/rule-sets/23.ts`–`35.ts` (7 files) — surgically delete the `defaults` field.
- Tests: `replay-fixture.test.ts` / `replay-determinism.test.ts` / `rule-sets/*.test.ts` — only if a fixture or assertion still references `ruleSet.defaults`.

**Estimated diff size**: ~110 lines

**`src/hazbot/engine/types.ts`**:

```ts
// remove the DeepPartial helper (only user was RuleSet.defaults):
export type DeepPartial<T> = …;   // DELETE

// RuleSet — before:
export interface RuleSet<TDefaults = unknown> {
  id: string;
  categories: Category[];
  factorVariables: FactorVariableDef[];
  defaults: DeepPartial<TDefaults>;   // DELETE this line
}
// after (TDefaults is now an unused phantom parameter — kept per Open Question
// I1 / Requirement 11; this repo's ESLint flags it, so suppress the one warning):
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface RuleSet<TDefaults = unknown> {
  id: string;
  categories: Category[];
  factorVariables: FactorVariableDef[];
}
```

> **`RuleSet`'s type parameter is intentionally retained** (see implementation
> Open Question I1). After `defaults` is removed `TDefaults` is unused inside
> `RuleSet`, but Requirement 11 forbids any edit to the seven rule-set modules
> beyond deleting the `defaults` field — so their `RuleSet<WildfireDefaults>`
> annotations (and the `import { WildfireDefaults }` those annotations keep
> live) must stay valid. Keeping `RuleSet<TDefaults = unknown>` as a
> phantom-parameter generic is the only option consistent with that. The
> evaluator's `RuleSet<TD>` references and `rule-sets/index.ts` are likewise
> left untouched.

**`src/hazbot/rule-sets/23.ts`–`35.ts`** — direct surgical edit, **not**
regeneration. For each module delete exactly the `defaults: { … },` field (the
trailing block before the closing `};`). Every other line stays byte-identical
to what is committed — the per-module diff is exactly that field's deletion.
For `23.ts` / `24.ts` the field is a multi-line populated object; for `25.ts` /
`32.ts`–`35.ts` it is the single line `defaults: {},`. The
`import { WildfireDefaults }` and the `RuleSet<WildfireDefaults>` annotation are
**kept** (they remain valid against the phantom-parameter `RuleSet`).

After this step `git diff --stat` for each rule-set module should show only
deletions, and the only changed lines are the `defaults` field.

**Tests**:
- `src/hazbot/engine/replay-determinism.test.ts` — its `makeOpts()` helper
  builds a synthetic `RuleSet<TD>` literal that includes `defaults: {}`
  ([replay-determinism.test.ts:27](../../src/hazbot/engine/replay-determinism.test.ts#L27)).
  Once `RuleSet.defaults` is removed that property is an excess-property TS
  error — delete the `defaults: {}` line.
- `src/hazbot/wildfire/replay-fixture.test.ts` is **unaffected** — it constructs
  `new Engine` with `ruleSets["25"]` (a rule-set with no defaults-bearing factor
  variable), passes no `defaults` in its opts, and never reads `.defaults`.
- Beyond those, `npm test` should already be green from Step 3. Search the test
  tree for any remaining `ruleSet.defaults` / `.defaults` reference (Step 2
  removed the `test-helpers.ts` one); fix any stragglers in fixture builders.

---

### Retire the sheet-based defaults extraction from `extract-impl.js`

**Summary**: Stop the generator from extracting and emitting `defaults`
(Requirement 10). Independent of the substrate change — pure script cleanup.

**Files affected**:
- `scripts/extract-impl.js` — remove the defaults-extraction + emission logic.
- `scripts/extract-impl.test.js` — remove the defaults-extraction test cases.

**Estimated diff size**: ~130 lines (mostly deletions)

**`scripts/extract-impl.js`** — remove:
- The `FACTOR_VAR_TO_FIELD` map.
- `mergeDefaults()`, `parseWindDefaults()`, `parsePerZoneDefault()`.
- In `parseTab()`: the `const defaults = { zones: [], wind: undefined }`
  initializer, the `mergeDefaults(defaults, def.details, def.name)` call inside
  the factor-variable loop, the `finalDefaults` assembly block, and `defaults`
  from the returned object. `parseTab()` now returns
  `{ id, categories, factorVariables }`.
- `emitDefaults()`.
- In `emitTabModule()`: the `  defaults: ${emitDefaults(parsed.defaults)},\n`
  line. The `import { WildfireDefaults }` line and the `RuleSet<WildfireDefaults>`
  annotation **stay** (consistent with Step 4's retained phantom generic, so a
  future clean regenerate still type-checks).
- The `TBD (activity revision)` handling — i.e. the `/\bTBD\b/i` guard — lived
  only inside `mergeDefaults`, so it is removed with that function.

`emitIndex()` is unchanged (it never emitted `defaults`).

**`scripts/extract-impl.test.js`** — remove every assertion about extracted
`defaults` (per-zone parsing, wind parsing, `TBD` → empty, the `defaults: {}`
fallback). Keep — and, where they currently also assert on `defaults`, trim to —
the category / factor-variable / index-emission cases. Add or keep one assertion
that the emitted module source contains **no** `defaults:` field.

> This step does **not** regenerate the rule-set modules. Step 4 already stripped
> their `defaults` field by hand; per RESOLVED OQ2 the committed modules stay
> otherwise byte-identical to their older-spreadsheet revision until WM-18.

---

### Requirement 13 — observability: requested-preset in the activation payload and the dev sidebar

**Summary**: Surface the URL-requested preset name and whether it is recognized,
so the loud→silent failure trade this story makes is mitigated (Requirement 13).
One shared helper computes the preset diagnostic; the activation log payload and
the dev sidebar both consume it.

**Files affected**:
- `src/hazbot/wildfire/engine-singleton.ts` — add `getRequestedPresetInfo()` and `buildPresetDiagnostics()`; extend `buildAnalysisEngineActivatedPayload()`.
- `src/hazbot/wildfire/index.ts` — export `getRequestedPresetInfo` + `buildPresetDiagnostics` + the `RequestedPresetInfo` type.
- `src/log.ts` — pass the preset info into `buildAnalysisEngineActivatedPayload()`.
- `src/hazbot/engine/sidebar/sidebar.tsx` — add a generic `diagnostics` slot to `SidebarProps` + render it, with a visually-hidden status text equivalent.
- `src/hazbot/engine/sidebar/sidebar.css` — add a `hazbot-sidebar-visually-hidden` utility class (reuses `hazbot-sidebar-leaf-true/false` for the visible styling).
- `src/hazbot/engine/sidebar/index.ts` — export the new `SidebarDiagnostic` type.
- `src/components/app.tsx` — pass `buildPresetDiagnostics(getRequestedPresetInfo())` to `<Sidebar>`.
- `src/components/app.test.tsx` — extend the `jest.mock("../hazbot/wildfire", …)` factory with `getRequestedPresetInfo` (the factory replaces the whole barrel; `app.tsx` now calls the new export).
- `src/log.test.ts` — extend the `jest.doMock("./hazbot/wildfire", …)` factory with `getRequestedPresetInfo` for the same reason.
- Tests: `engine-singleton.test.ts`, `sidebar.test.tsx`, `app.test.tsx`, `log.test.ts`.

**Estimated diff size**: ~200 lines

**`src/hazbot/wildfire/engine-singleton.ts`**:

```ts
import presets from "../../presets";
import type { SidebarDiagnostic } from "../engine/sidebar";

export interface RequestedPresetInfo {
  preset: string;       // the verbatim URL `preset` value
  recognized: boolean;  // matched a key in src/presets.ts (false → silent base-config fallback)
}

// Returns the requested-preset diagnostic when the activity URL provides a
// `preset` value; undefined when it does not (nothing to validate). Per WM-27
// Requirement 13. `recognized: false` means the name fell back to the base config.
export function getRequestedPresetInfo(): RequestedPresetInfo | undefined {
  // `IUrlConfig.preset` is declared `string`, but getUrlConfig() departs from
  // that in two ways: (a) it only assigns the key when the URL actually carries
  // it — so `preset` is runtime-optional — and (b) it parseFloat-coerces any
  // all-digit value, so `?preset=23` arrives as a *number* (the same coercion
  // that makes ISimulationConfig type `hazbotRules` as `string | number`). Read
  // it wide as `string | number | undefined` so the absent-param `=== undefined`
  // check type-checks AND a numeric value is not mis-typed as a string; then
  // String()-normalize so an all-digit preset name still records/compares as a
  // string. The String() call is load-bearing — do not drop it as redundant.
  const urlPreset = getUrlConfig().preset as string | number | undefined;
  if (urlPreset === undefined) return undefined;
  const name = String(urlPreset);
  // Own-property check, NOT `presets[name] !== undefined`: `presets` is a plain
  // object, so a bare bracket lookup also resolves inherited Object.prototype
  // members — `?preset=constructor` / `toString` / `hasOwnProperty` would each
  // be wrongly reported as a recognized preset. See Self-Review SE10.
  const recognized = Object.prototype.hasOwnProperty.call(presets, name);
  return { preset: name, recognized };
}

// extended payload builder — preset fields appear only when a URL preset is present:
export function buildAnalysisEngineActivatedPayload(
  ruleSetId: string,
  presetInfo?: RequestedPresetInfo,
): {
  engineVersion: string; appRulesVersion: string | number; ruleSetId: string;
  preset?: string; presetRecognized?: boolean;
} {
  return {
    engineVersion: ENGINE_VERSION,
    appRulesVersion: APP_RULES_VERSION,
    ruleSetId,
    ...(presetInfo ? { preset: presetInfo.preset, presetRecognized: presetInfo.recognized } : {}),
  };
}

// Maps the requested-preset diagnostic onto the sidebar's generic `diagnostics`
// slot. Pure (takes the RequestedPresetInfo, reads no globals) so the
// match/no-match mapping and the screen-reader `(unrecognized preset)` text cue
// (WCAG1/WCAG2) are unit-testable without rendering app.tsx — see Self-Review
// QA6. Returns undefined when there is no requested preset, so the sidebar's
// `diagnostics` slot stays empty and the section renders nothing.
export function buildPresetDiagnostics(
  presetInfo: RequestedPresetInfo | undefined,
): SidebarDiagnostic[] | undefined {
  if (!presetInfo) return undefined;
  return [{
    label: "Requested preset",
    value: presetInfo.recognized
      ? presetInfo.preset
      : `${presetInfo.preset} (unrecognized preset)`,
    status: presetInfo.recognized ? "match" : "no-match",
  }];
}
```

`getUrlConfig().preset` is `undefined` when the URL carries no `preset` param;
`getResolvedConfig().preset` would instead read `"default"` from the base
config, which is why the raw `getUrlConfig()` value is used here (Requirement 13
records the *requested* preset verbatim, including an unrecognized name).

**`src/hazbot/wildfire/index.ts`** — add to the barrel:

```ts
export {
  getAnalysisEngine, buildAnalysisEngineActivatedPayload, getRequestedPresetInfo, buildPresetDiagnostics,
} from "./engine-singleton";
export type { RequestedPresetInfo } from "./engine-singleton";
```

**`src/log.ts`** — feed the preset info into the once-per-page-load emission:

```ts
import { buildAnalysisEngineActivatedPayload, getAnalysisEngine, getRequestedPresetInfo } from "./hazbot/wildfire";
…
externalLog(
  "AnalysisEngineActivated",
  buildAnalysisEngineActivatedPayload(engine.ruleSet.id, getRequestedPresetInfo()),
);
```

This payload already routes through `externalLog`, so the recognized-preset
boolean reaches LARA + the log-monitor — the unrecognized-preset case is
machine-detectable in logs (Requirement 13, *Log payload*).

> **Limitation (Self-Review SE11).** The preset reaches the log only inside the
> `AnalysisEngineActivated` emission, which `log.ts` gates on `engine?.isActive
> && engine.ruleSet`. An activity whose engine never activates — no `hazbotRules`,
> or a typo'd/unknown `hazbotRules` (→ `missing-rule-set` → inactive) — emits no
> `AnalysisEngineActivated` event, so a `?preset=badname` mis-binding there is
> logged nowhere. The dev sidebar still surfaces it (its diagnostics section is
> ungated on `engine.ruleSet` — see SE8); the log path structurally cannot. Low
> severity — that scenario already has the Hazbot broken for a larger reason.

**`src/hazbot/engine/sidebar/sidebar.tsx`** — a generic, host-agnostic
diagnostics slot (no `preset` vocabulary in the substrate — see Open Question
I2):

```ts
// A host-supplied diagnostic line. `status` drives the substrate's existing
// match/no-match leaf styling; omit it for a neutral line.
export interface SidebarDiagnostic {
  label: string;
  value: string;
  status?: "match" | "no-match";
}

export interface SidebarProps {
  title: string;
  diagnostics?: SidebarDiagnostic[];
}
```

Render the diagnostics in their own section directly under the header. Unlike
the five sibling panels (`CategoriesPanel`, `FactorVariablesPanel`,
`TemporalVariablesPanel`, `SimPropsPanel`, `ReadingsPanel`), the diagnostics
section is **intentionally not gated on `engine.ruleSet`** — a
`?hazbotSidebar=true&preset=…` URL with absent or invalid `hazbotRules` builds a
rule-set-less engine, and surfacing a requested-preset mis-binding is still
useful (arguably most useful) there. The section is gated only on `diagnostics`
being present and non-empty; do not "correct" it to match the
`{engine.ruleSet && …}` pattern of the other panels. The
status maps to the existing double-encoded leaf classes — `match` →
`hazbot-sidebar-leaf-true` (green + underline), `no-match` →
`hazbot-sidebar-leaf-false` (red + line-through). The `label` is plain text
preceding the value, so the field is intelligible without relying on colour or
decoration.

The colour/decoration that `status` drives is **not announced by screen
readers**, so — whenever `status` is set — the substrate also emits a
**visually-hidden text equivalent** naming the state (`"(match)"` /
`"(no match)"`). This makes the WCAG guarantee live where the styling lives:
*any* host that supplies a `status` gets a screen-reader equivalent, with no
reliance on the host also encoding the state into `value` (WM-27 WCAG
Self-Review item WCAG1). The wildfire host's own `(unrecognized preset)` cue in
`value` remains the human-facing, sighted wording; the substrate suffix is the
machine-readable backstop.

```tsx
{/* Intentionally NOT gated on engine.ruleSet (unlike the panels below) — a
    requested-preset mis-binding is worth surfacing even with no rule-set. */}
{diagnostics && diagnostics.length > 0 && (
  <div className="hazbot-sidebar-section">
    <div className="hazbot-sidebar-section-title">Diagnostics</div>
    {/* The status→class mapping is hoisted to a `valueClass` const rather than
        an inline multiline `className={…}` — the inline form trips this repo's
        `react/jsx-closing-tag-location` lint rule. */}
    {diagnostics.map((d, i) => {
      const valueClass = d.status === "match" ? "hazbot-sidebar-leaf-true"
        : d.status === "no-match" ? "hazbot-sidebar-leaf-false"
          : undefined;
      return (
        // `${d.label}-${i}` — `label` is host-supplied free text with no
        // uniqueness contract; composite key matches sidebar.tsx's existing
        // convention for non-unique lists (ErrorRow / ReadingRow).
        <div key={`${d.label}-${i}`} className="hazbot-sidebar-entry">
          <strong>{d.label}:</strong>{" "}
          <span className={valueClass}>{d.value}</span>
          {d.status && (
            <span className="hazbot-sidebar-visually-hidden">
              {d.status === "match" ? " (match)" : " (no match)"}
            </span>
          )}
        </div>
      );
    })}
  </div>
)}
```

**`src/hazbot/engine/sidebar/sidebar.css`** — add a visually-hidden utility
class (the sidebar has none today); this is the one new class Step 6
introduces:

```css
.hazbot-sidebar-visually-hidden {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

**`src/components/app.tsx`** — the host obtains the diagnostic from the wildfire
bridge's `buildPresetDiagnostics()` helper (a pure function, unit-tested
independently — see Self-Review QA6) rather than assembling it inline, and
computes it **inside the existing sidebar-mount branch** so the `getUrlConfig()`
scan it entails is not paid on every render when no sidebar mounts (Self-Review
SE12). The text cue `(unrecognized preset)` the helper embeds in `value` is what
announces the no-match state to screen readers regardless of styling (WCAG
Self-Review item):

```tsx
import { getRequestedPresetInfo, buildPresetDiagnostics } from "../hazbot/wildfire";
…
{/* `diagnostics` is computed here, inside the existing sidebar-mount branch —
    NOT as a top-level `const` in the component body — so the getUrlConfig()
    scan runs only when the sidebar mounts, not on every render for production
    users with ?hazbotSidebar unset. See Self-Review SE12. */}
{showHazbotSidebar && engine && (
  <AnalysisEngineProvider engine={engine} appRulesVersion={APP_RULES_VERSION}>
    <Sidebar title="Hazbot" diagnostics={buildPresetDiagnostics(getRequestedPresetInfo())} />
  </AnalysisEngineProvider>
)}
```

When the URL provides no `preset`, `getRequestedPresetInfo()` returns
`undefined`, `buildPresetDiagnostics(undefined)` returns `undefined`, and the
sidebar renders nothing — Requirement 13's third *Dev sidebar* branch.

> **Cue legibility (Self-Review WCAG2).** Because the `(unrecognized preset)`
> cue lives inside `value`, it renders inside the `hazbot-sidebar-leaf-false`
> span and inherits its `line-through` — the explanatory text is struck through
> along with the name. This is an accepted minor cosmetic tradeoff on a
> developer/researcher-only surface: WCAG 1.4.1 (Use of Color) still holds —
> colour, the underline-vs-line-through decoration, the literal cue text, and
> the substrate's visually-hidden `(no match)` equivalent are all present — so
> un-decorating the cue is not worth a requirements.md change or new substrate
> API.

**`src/hazbot/engine/sidebar/index.ts`** — also export the new type:

```ts
export { Sidebar } from "./sidebar";
export type { SidebarProps, SidebarDiagnostic } from "./sidebar";
```

**Tests** — new coverage for Requirement 13's net-new code (the QA Self-Review
coverage items), plus the affected-test mock updates that adding a new
`hazbot/wildfire` barrel export forces:
- `engine-singleton.test.ts` — `getRequestedPresetInfo()` returns `{ preset,
  recognized: true }` for a known preset, `{ preset, recognized: false }` for an
  unknown one, and `undefined` when the URL has no `preset`;
  `buildAnalysisEngineActivatedPayload()` carries `preset` / `presetRecognized`
  **only** when given preset info, and the existing 3-field shape otherwise.
  `buildPresetDiagnostics()` is a pure function and gets direct coverage (QA6):
  a recognized `RequestedPresetInfo` → one diagnostic with `status: "match"` and
  the bare preset name as `value`; an unrecognized one → `status: "no-match"`
  and a `value` ending ` (unrecognized preset)`; `undefined` → `undefined`. This
  pins the WCAG screen-reader cue and the match/no-match mapping that `app.tsx`
  would otherwise carry untested.
- `sidebar.test.tsx` — the `diagnostics` slot renders a recognized preset with
  the `hazbot-sidebar-leaf-true` treatment, an unrecognized preset with
  `hazbot-sidebar-leaf-false` **and** the `(unrecognized preset)` text cue, and
  renders nothing when `diagnostics` is `undefined`. Additionally — independent
  of any host-supplied `value` text — a `status`-bearing diagnostic exposes the
  substrate's visually-hidden state equivalent (`(match)` / `(no match)`), so a
  no-match diagnostic conveys its state to a screen reader even if a host omits
  a cue from `value` (WCAG Self-Review item WCAG1).
- `app.test.tsx` — **affected, not net-new.** It mocks the whole
  `hazbot/wildfire` barrel with a `jest.mock(…)` factory
  (`getAnalysisEngine` / `APP_RULES_VERSION` / `buildAnalysisEngineActivatedPayload`).
  A factory mock replaces the entire module, so once `app.tsx` (and, transitively,
  `log.ts`) calls the new `getRequestedPresetInfo` / `buildPresetDiagnostics`
  exports they resolve to `undefined` and throw. Add **both** to the factory
  (e.g. `jest.fn()` each, `buildPresetDiagnostics` defaulting to `undefined` → no
  diagnostics) so the existing suite still passes; no behavioural assertion
  change is required — `buildPresetDiagnostics`'s logic is covered directly in
  `engine-singleton.test.ts` (QA6).
- `log.test.ts` — **affected, not net-new.** Same root cause: its
  `jest.doMock("./hazbot/wildfire", …)` factory must also gain
  `getRequestedPresetInfo`, since Step 6's `log.ts` change calls it — without it
  the existing `log.test.ts` cases throw, so this is **required**. The factory's
  hand-written `buildAnalysisEngineActivatedPayload` stub (a plain arrow that
  ignores its arguments and is not a `jest.fn()`) means a payload-*shape*
  assertion here would be both meaningless — the stub drops the new `presetInfo`
  argument regardless of behaviour — and redundant: the payload shape is owned by
  the `engine-singleton.test.ts` bullet above. If `log.test.ts` adds a new
  assertion at all, scope it to the one net-new `log.ts` behaviour — that `log()`
  calls `buildAnalysisEngineActivatedPayload` with `getRequestedPresetInfo()`'s
  result — which requires the stub to be a `jest.fn()` so the call is assertable
  (`toHaveBeenCalledWith(ruleSetId, presetInfo)`).

---

### Update the docs that reference the removed defaults concept

**Summary**: Bring the Hazbot docs in line with the post-WM-27 substrate, and
record the intentional surgical-strip divergence so a future regenerate does not
silently reintroduce content drift (Requirement 12 + the Technical Notes
*Docs referencing the removed concept* list).

**Files affected**:
- `src/hazbot/TBD.md`
- `src/hazbot/engine/README.md`
- `docs/hazbot-update-workflow.md`

**Estimated diff size**: ~90 lines

**`src/hazbot/TBD.md`**: the section *"1. Rule-sets blocked on missing defaults"*
(the blocked-32–35 table, the `missing-defaults` description) is obsolete —
remove it or rewrite it as "resolved by WM-27: defaults are config-derived." Drop
`validate-defaults.ts` from the file-tree listing. The *"Per-reading defaults
override"* future-idea bullet (`RuleSet.defaults` is "a single object") should be
removed or reframed — config-derived defaults already vary per preset/URL.

**`src/hazbot/engine/README.md`**: the public-API line listing
`SimPropImpl` / `RuleSet.defaults` — drop the `RuleSet.defaults` reference.

**`docs/hazbot-update-workflow.md`**:
- Remove the *`missing-defaults` error* troubleshooting section and the
  *"Defaults filled for previously-blocked tabs (32–35)"* section.
- Remove the `mergeDefaults` / `parsePerZoneDefault` / `parseWindDefaults`
  troubleshooting references and the `requiredDefaults` mention.
- Update the intro sentence ("Use it when filling in TBD defaults for tabs
  32–35 …") — that workflow no longer exists.
- **Add the Requirement 12 note**: a short subsection stating that after WM-27
  the committed `src/hazbot/rule-sets/*.ts` modules are intentionally **not** a
  clean regenerate — the surgical strip (RESOLVED OQ2) removed only the
  `defaults` field and left all other content at its older-spreadsheet revision;
  regenerating before WM-18 lands will reintroduce unrelated `details`/wording
  drift, and WM-18 owns reconciling the modules with a clean regenerate.

**Quality gates (Requirement 14)**: after this final step run `npm test`,
`npm run lint`, and `npm run build` — all three pass. The validation playbook
generator (`scripts/generate-hazbot-validation-playbook.js`) is unaffected
(it does not read `defaults`), but regenerating the playbooks is not part of
this story.

## Open Questions

<!-- Implementation-focused questions only. Requirements questions go in requirements.md. -->

### RESOLVED: I1 — Keep `RuleSet` as a phantom-parameter generic, or make it non-generic?

**Context**: Removing `RuleSet.defaults` (Step 4) leaves `RuleSet<TDefaults>`
with an unused type parameter. The seven rule-set modules annotate
`RuleSet<WildfireDefaults>` and `rule-sets/index.ts` types
`Record<string, RuleSet<WildfireDefaults>>`. Requirement 11 forbids any edit to
the rule-set modules beyond deleting the `defaults` field — so their
`RuleSet<WildfireDefaults>` annotations (and the `import { WildfireDefaults }`
that keeps those annotations live) must stay valid.

**Options considered**:
- A) **Keep `RuleSet<TDefaults = unknown>` generic** with `TDefaults` now unused
  inside the interface. Zero edits to the rule-set modules / `index.ts` /
  evaluator beyond what's already planned. Cost: a phantom generic parameter
  (a mild code smell). TypeScript does not flag it, but this repo's ESLint
  `@typescript-eslint/no-unused-vars` rule does — an inline
  `// eslint-disable-next-line @typescript-eslint/no-unused-vars` on the
  `RuleSet` interface declaration suppresses the one warning. This is what the
  plan above assumes.
- B) **Make `RuleSet` non-generic.** Cleaner type, but `RuleSet<WildfireDefaults>`
  becomes invalid everywhere — the seven modules, `index.ts`, the evaluator's
  `RuleSet<TD>` references — and each module's `import { WildfireDefaults }`
  goes unused (lint error). The module edits exceed Requirement 11's
  "byte-identical except the defaults field" constraint, so this option
  effectively requires amending Requirement 11.

**Decision**: **A — keep `RuleSet<TDefaults = unknown>` generic** with `TDefaults`
now unused inside the interface. Requirement 11 mandates a mechanically-verifiable
"deletions only, `defaults` field only" diff for the seven rule-set modules;
option B would break each module's `RuleSet<WildfireDefaults>` annotation and
its `import { WildfireDefaults }`, forcing edits beyond that field and requiring
Requirement 11 to be amended. The phantom parameter is a small, temporary cost
— TypeScript does not flag it; this repo's ESLint does, suppressed with a
documented inline `eslint-disable-next-line @typescript-eslint/no-unused-vars`
on the `RuleSet` declaration — WM-18 re-extracts and reconciles these modules
and is the natural point to revisit `RuleSet`'s shape. Keeping the
generic also means the generator keeps emitting `RuleSet<WildfireDefaults>`, so
a future clean regenerate still type-checks. The plan (Step 4) already assumes A.

### RESOLVED: I2 — How should the substrate sidebar receive the requested-preset display?

**Context**: The `Sidebar` component lives in the generic `hazbot/engine`
substrate (`<Sidebar title="Hazbot" />`, mounted in `app.tsx`). Requirement 13
needs it to display a wildfire-specific requested-preset value with match/no-match
styling. The substrate is documented as host-agnostic, so it should not gain a
`preset` concept directly.

**Options considered**:
- A) **Generic typed `diagnostics` slot** — `SidebarProps.diagnostics?:
  SidebarDiagnostic[]`, where `SidebarDiagnostic = { label, value, status? }`.
  The substrate owns the styling (reusing `hazbot-sidebar-leaf-true/false`); the
  wildfire host (`app.tsx`) builds the entry from `getRequestedPresetInfo()`.
  No `preset` vocabulary enters the substrate. This is what the plan above
  assumes.
- B) **`ReactNode` slot** — `SidebarProps.headerExtra?: React.ReactNode`. The
  host renders the whole row, including styling. Maximally generic, but the host
  must reach into substrate CSS class names (`hazbot-sidebar-leaf-*`) to match
  the convention, coupling the host to substrate styling.
- C) **Wildfire-specific prop** — `SidebarProps.requestedPreset?: { name; recognized }`.
  Simplest wiring, but puts a wildfire concept into the generic substrate.

**Decision**: **A — generic typed `diagnostics` slot** (`SidebarProps.diagnostics?:
SidebarDiagnostic[]`, `SidebarDiagnostic = { label, value, status? }`). It is the
only option that preserves both properties the spec requires: the substrate stays
genuinely host-agnostic (`diagnostics` carries no `preset` vocabulary — option C
would), and the match/no-match styling convention stays owned by the substrate
(option B would force the host to hard-code `hazbot-sidebar-leaf-*` CSS class
names, coupling the host to the substrate stylesheet). A also lands the WCAG
Self-Review items cleanly — the substrate renders `label` as plain text and maps
`status` to the existing double-encoded classes, while the host supplies the
`(unrecognized preset)` text cue inside `value` — and gives any future substrate
consumer (or future wildfire diagnostic) the same slot. The plan (Step 6) already
assumes A.

### RESOLVED: I3 — Step granularity for the substrate removal: keep Steps 3 and 4 separate, or merge?

**Context**: RESOLVED OQ1 (option A) treats the substrate cleanup as one logical
decision. The plan splits it into Step 3 (remove the `missing-defaults` failure
mode + `requiredDefaults` + validation machinery) and Step 4 (remove
`RuleSet.defaults` + `DeepPartial` + strip the seven modules). Both are green
and independently reviewable; Step 3 is the larger (~360 lines, mostly deletions
+ test churn), Step 4 ~110.

**Options considered**:
- A) **Keep Steps 3 and 4 separate** (as planned). Each commit is a coherent
  sub-removal; Step 4 in particular is a clean, almost-mechanical diff that
  reviews quickly on its own. Mid-state after Step 3: `RuleSet.defaults` still
  typed/present but unread.
- B) **Merge into one step.** Matches OQ1's "one decision" framing; one
  ~470-line commit, near the ~500-line ceiling and deletion-heavy.

**Decision**: **A — keep Steps 3 and 4 separate.** RESOLVED OQ1's "one decision"
framing is about the design, not the commit count; the spec's step-sizing
guidance is about reviewable units. The decisive factor is Requirement 11:
keeping the surgical seven-module strip as its own commit makes its
"exactly the `defaults` field, nothing else" guarantee trivially auditable
(`git diff --stat` shows deletions only) — merged into Step 3's ~360-line
churn that property would be much harder to confirm. The odd intermediate
state (after Step 3, `RuleSet.defaults` is typed/present but unread) is cheap:
it is green, and Step 4 removes it immediately. The plan already assumes A.

## Self-Review

### Senior Engineer

#### RESOLVED: SE1 — Step 2's `matchAgainst` code block shows the post-Step-3 `makeRenderCtx` call
The Step 2 `matchAgainst` rewrite calls `makeRenderCtx(slice, engine.defaults,
engine.factorVariables, engine.simProps)` — four arguments, omitting
`implsWithIncompleteDefaults`. But `makeRenderCtx` does not lose that parameter
until Step 3, and the prose note immediately below the block says to "keep the
argument in the Step 2 commit." The parallel Step 2 change to
`computeMatchedCategoryForEngine` also keeps it. So the code block is internally
inconsistent with its own note and with the sibling change. (It compiles either
way — the parameter is optional — but a reader implementing Step 2 verbatim
gets a commit that disagrees with the narrative.) Reconcile: either show the
Step-2-accurate call with `engine.implsWithIncompleteDefaults`, or state plainly
that the parameter is optional so dropping it early is harmless, and drop the
contradictory note.

**Resolution:** The Step 2 `matchAgainst` code block now passes
`engine.implsWithIncompleteDefaults` as the fifth `makeRenderCtx` argument — the
genuine Step 2 state — and the note below it states plainly that Step 3 drops
that parameter from `makeRenderCtx` and removes the argument here (and in
`computeMatchedCategoryForEngine` / `use-analysis-engine`). Step 2 is now
internally consistent.

#### RESOLVED: SE2 — Step 2 leaves `makeWildfireEngine`'s `defaults` parameter optional without stating why
`makeWildfireEngine(ruleSet, defaults?)` is given an optional `defaults`. An
engine built without it evaluates a `set*`-using rule-set against `undefined`
defaults — every `set*` factor variable throws and is caught to its `false`
fallback, silently misclassifying. The current callers are safe (23/24 are
updated to pass defaults; 25 references no defaults-bearing factor variable;
there are no 32–35 test files), but the plan does not say *why* optional is the
right call. State the rationale explicitly (rule-set 25 legitimately needs no
defaults, so a required parameter would force a meaningless argument there), or
make `defaults` required and have 25's test pass an empty `{ zones: [] }`.

**Resolution:** Kept `defaults` optional; Step 2's `test-helpers.ts` bullet now
states the rationale — it mirrors the optional `EngineOpts.defaults`, and
rule-set 25 references no defaults-bearing factor variable so a required
parameter would force a meaningless argument in `25.test.ts` — plus a caution
that a `set*`-using rule-set built without `defaults` silently misclassifies, so
callers testing 23 / 24 / 32–35 must pass it.

---

### QA Engineer

#### RESOLVED: QA1 — `replay-fixture.test.ts` engine construction is not assigned to a step
The Technical Notes list `replay-fixture.test.ts` as affected, but the plan
mentions it only parenthetically in Step 4 ("only if a fixture or assertion
still references `ruleSet.defaults`"). If that test constructs its engine via
`makeWildfireEngine` or `new Engine(...)`, it is affected by Step 2's
`EngineOpts.defaults` change — and because `makeWildfireEngine`'s `defaults` is
optional, it would compile but run against `undefined` defaults and silently
misclassify any `set*`-using rule-set. The plan should pin down how
`replay-fixture.test.ts` (and `replay-determinism.test.ts`) builds its engine
and name the step that wires defaults into it.

**Resolution:** Both files were inspected. `replay-fixture.test.ts` constructs
`new Engine` with `ruleSets["25"]` (no defaults-bearing factor variable), passes
no `defaults` in its opts, and never reads `.defaults` — it is genuinely
unaffected through all steps. `replay-determinism.test.ts` builds a synthetic
`RuleSet<TD>` literal with `defaults: {}` at line 27, which becomes an
excess-property error once Step 4 removes `RuleSet.defaults`. Step 4's "Tests"
bullet now names `replay-determinism.test.ts:27`'s `defaults: {}` removal
concretely and records that `replay-fixture.test.ts` is unaffected.

#### RESOLVED: QA2 — Step 1's `getResolvedConfig()` is net-new behavior-rich code with no named test
Step 1 adds `getResolvedConfig()`, whose contract (Requirement 1) is
substantial: URL-resolved preset merge, explicit-preset substitution of the
preset slot only, URL params still overriding an explicit preset, and shallow
wholesale replacement of the `zones` tuple. The plan names tests for the Step 2
derivation but none for `getResolvedConfig()` itself; the derivation test even
calls `getResolvedConfig(presets.X)`, coupling two units. Add a dedicated test
(e.g. `src/config.test.ts`) covering the default URL-resolved merge, explicit-
preset substitution, URL-override precedence over an explicit preset, and shallow
`zones` replacement — and test `deriveWildfireDefaults` against direct config
objects so the two units are covered independently.

**Resolution:** Step 1 now adds a new `src/config.test.ts` covering
`getResolvedConfig()` — the no-argument URL-resolved merge, explicit-preset
substitution, URL-override precedence over an explicit preset, shallow wholesale
`zones` replacement, and the unrecognized-preset base-config fallback. Step 2's
`derive-defaults.test.ts` sketch was rewritten to build its input configs
directly (`getDefaultConfig()` + spread) instead of routing through
`getResolvedConfig()`, so `deriveWildfireDefaults` and `getResolvedConfig` are
covered as independent units.

#### RESOLVED: QA3 — Requirement 8 (rule-sets 32–35 load) gets no positive test assertion
Step 3 removes the test cases that asserted 32–35 fail with `missing-defaults`,
but names no replacement that 32–35 now *load* cleanly. Requirement 8 is a
distinct claim from classification correctness (which the requirements.md QA
review deliberately left uncovered for 32–35). A cheap, direct check — for each
of 32–35, the constructed engine is `isActive` with no `load-failure` error —
would give Requirement 8 named coverage. Add it to Step 3 (in `engine.test.ts`
or a bridge-level test).

**Resolution:** Step 3's "Tests" list now adds positive coverage for
Requirement 8 — for each of rule-sets 32, 33, 34, 35 the constructed engine is
`isActive === true` with no `load-failure` error — replacing the removed
negative `missing-defaults` assertions and guarding against any other
load-failure path silently re-blocking 32–35.

---

### WCAG Accessibility Expert

#### RESOLVED: WCAG1 — the substrate `SidebarDiagnostic.status` styling has no enforced text equivalent
I2's option A adds a generic `SidebarDiagnostic = { label, value, status? }` to
the substrate. The substrate maps `status` to `hazbot-sidebar-leaf-true/false`
(colour + underline/line-through) — neither of which a screen reader announces.
The requirements.md WCAG resolution closed exactly this gap by mandating a
*text* cue; in the plan that cue (`(unrecognized preset)`) is appended by the
wildfire host in `app.tsx`, inside `value`. So the preset use case is covered —
but the substrate `status` contract itself carries no requirement that the host
include a text equivalent. A future host (or a careless wildfire change) could
set `status: "no-match"` with a bare `value`, reproducing the styling-without-
text-equivalent gap one substrate layer down. Either have the substrate
guarantee a text equivalent for `no-match` (e.g. a visually-hidden suffix or an
`aria-label` on the status span), so the guarantee lives where the styling
lives, or document `SidebarDiagnostic.status` as requiring the host to encode
the state in `value` text and note the WM-27 wildfire diagnostic satisfies that.

**Resolution:** Fixed in the substrate (the doc-only contract route was
rejected — an unenforced "hosts must encode the state" convention is the same
failure mode). Step 6's `sidebar.tsx` now emits, whenever `SidebarDiagnostic.status`
is set, a **visually-hidden** text equivalent naming the state (`(match)` /
`(no match)`); `sidebar.css` gains a `hazbot-sidebar-visually-hidden` utility
class (Step 6's "Files affected" note is corrected — it is the one new class
the step adds). The guarantee now lives where the styling lives: any host
supplying `status` gets a screen-reader equivalent regardless of its `value`
text. The wildfire host's `(unrecognized preset)` cue stays as the sighted-user
wording. `sidebar.test.tsx` gains an assertion that the no-match diagnostic
exposes that visually-hidden equivalent independent of host-supplied `value`.

---

<!-- Second self-review round — implementation spec verified against the
     current codebase (config.ts, zone.ts, engine.ts, evaluator.ts,
     safely-evaluate-impl.ts, factor-variables.ts, sidebar.tsx, app.tsx, …). -->

### Senior Engineer

#### RESOLVED: SE3 — `deriveWildfireDefaults` (Step 2) does not type-check; the "no validation by design" rationale rests on a false premise about `ZoneOptions`
Step 2's new `src/hazbot/wildfire/derive-defaults.ts` maps each resolved-config
zone to label strings:
```ts
terrainType: terrainLabels[z.terrainType],
vegetation: vegetationLabels[z.vegetation],
droughtLevel: droughtLabels[z.droughtLevel],
```
where `z` is an element of `config.zones` — i.e. a `ZoneOptions`
([src/models/zone.ts](../../src/models/zone.ts)). `ZoneOptions` does **not**
type these fields as non-optional enums:
```ts
export interface ZoneOptions {
  vegetation?: Vegetation;
  terrainType?: TerrainType;
  droughtLevel?: number;   // optional — and `number`, not `DroughtLevel`
}
```
Under the project's `strict` tsconfig (`strictNullChecks`, `noImplicitAny` both
on):
- `terrainLabels[z.terrainType]` / `vegetationLabels[z.vegetation]` —
  `z.terrainType` is `TerrainType | undefined`; indexing `Record<TerrainType,
  string>` with a possibly-`undefined` key is **TS2538** ("Type 'undefined'
  cannot be used as an index type").
- `droughtLabels[z.droughtLevel]` — `z.droughtLevel` is `number | undefined`;
  `Record<DroughtLevel, string>` carries no general numeric index signature, so
  indexing it with a plain `number` is **TS7053**, plus TS2538 for the
  `undefined`.

So the `derive-defaults.ts` code block does not compile, and Step 2 does not
leave `npm run build` green as written. The non-optional, properly-enum-typed
fields belong to the `Zone` *class*, not the `ZoneOptions` config interface —
`bottom-bar.tsx` indexes these same label maps without error precisely because
it reads `Zone` instances (`simulation.zones`), not config `ZoneOptions`.

This also invalidates the rationale stated both in the `derive-defaults.ts`
inline comment and in requirements.md's Technical Note *"Derivation does no
validation, by design"*: both assert "`ZoneOptions` types these fields as their
enums, so a type-correct config cannot produce an `undefined` label." That
premise is false.

**Suggested resolution:** the derivation must reconcile the `ZoneOptions`
typing — either a documented non-null assertion plus an `as DroughtLevel` cast
(preserves the "no runtime validation" stance, but the spec must show the casts
and correct the premise) or genuine `undefined`-handling. The Step 2 code
block, its inline comment, and the requirements.md Technical Note all need
updating to match `ZoneOptions`'s actual types.

**Resolution:** Option A — casts, no runtime checks. Step 2's `derive-defaults.ts`
code block now casts each field when indexing the label maps
(`terrainLabels[z.terrainType as TerrainType]`, etc.) and imports `TerrainType`
/ `Vegetation` / `DroughtLevel` for the casts; its inline comment was rewritten
to state that the casts assert a runtime guarantee `ZoneOptions`'s loose typing
cannot express (a resolved config's zones are always fully populated) rather
than adding a runtime check. requirements.md's Technical Note *"Derivation does
no validation, by design"* was corrected the same way — it no longer claims
`ZoneOptions` types these fields as their enums, and now explains the casts.
The "no defensive validation" substrate stance is preserved.

---

#### RESOLVED: SE4 — `getRequestedPresetInfo()` (Step 6) does not type-check: `getUrlConfig().preset` is typed `string`
Step 6's `getRequestedPresetInfo()` opens with:
```ts
const urlPreset = getUrlConfig().preset;
if (urlPreset === undefined) return undefined;
```
`getUrlConfig()` is declared `() => IUrlConfig`, and `IUrlConfig` declares
`preset: string` (non-optional). So `urlPreset` is statically `string`, and
`urlPreset === undefined` is a **TS2367** error ("This comparison appears to be
unintentional because the types 'string' and 'undefined' have no overlap"). At
runtime `getUrlConfig()` assigns `preset` only when the URL carries the param,
so the value genuinely is `undefined` when absent — the `IUrlConfig` type is
simply looser than reality — but the code block as written will not compile.

(`getResolvedConfig()` sidesteps this because it uses a truthy `||`, not
`=== undefined`; only `getRequestedPresetInfo`, which must distinguish "param
absent" from "param present", hits it.)

**Suggested resolution:** read the value at a type that admits `undefined` —
e.g. `const urlPreset = getUrlConfig().preset as string | undefined;` — and
note in the spec that `getUrlConfig()`'s declared `preset: string` is
runtime-optional. The implementation.md code block should show the cast.

**Resolution:** Step 6's `getRequestedPresetInfo()` code block now reads
`const urlPreset = getUrlConfig().preset as string | undefined;`, with an inline
comment recording that `IUrlConfig` declares `preset: string` though
`getUrlConfig()` only assigns the key when the URL carries it — so the value is
runtime-optional and the cast is what lets the absent-param `=== undefined`
check type-check. Code-block correction only; no design change.

**Superseded by SE7:** the `as string | undefined` cast above was widened to
`as string | number | undefined` — `getUrlConfig()` also `parseFloat`-coerces
all-digit values, so `?preset=23` is a runtime `number`. See SE7 for the final
code block and comment.

---

#### RESOLVED: SE5 — Step 3's evaluator.ts plan omits the `computeMatchedCategoryForEngine` call-site edit
Step 3 removes `Engine.implsWithIncompleteDefaults` and drops the
`implsWithIncompleteDefaults?` parameter from `makeRenderCtx()`. Step 3's
`evaluator.ts` entry describes `makeRenderCtx`'s definition and "the two wrap
closures" — but `evaluator.ts` also contains `computeMatchedCategoryForEngine()`,
whose `makeRenderCtx` call passes `engine.implsWithIncompleteDefaults` as the
fifth argument ([evaluator.ts:313-315](../../src/hazbot/engine/evaluator.ts#L313-L315)).
After Step 3 that argument is doubly invalid (the field is gone *and* the
parameter is gone). The Step 2 `matchAgainst` note mentions this in passing
("…and the matching argument in `computeMatchedCategoryForEngine` /
`use-analysis-engine`"), but Step 3's own file-by-file plan — the authoritative
guide for that commit — does not name it. `tsc` would catch the omission, so it
is not a correctness risk; but Step 3's evaluator.ts entry should explicitly
include removing the `engine.implsWithIncompleteDefaults` argument from the
`computeMatchedCategoryForEngine` `makeRenderCtx` call.

**Resolution:** Step 3's `evaluator.ts` detailed paragraph now states that
`computeMatchedCategoryForEngine()` (same file) also drops the now-removed
`engine.implsWithIncompleteDefaults` argument from its `makeRenderCtx` call.
The file-by-file plan for Step 3 is now complete for `evaluator.ts`.

---

#### RESOLVED: SE6 — Step 3 leaves a stale `missing-defaults` comment in `runLoadTimeValidation()`
Step 3 says to "Update the asymmetric-construction-error comment block (line
~141)" of `engine.ts`. Removing the `collectFromImpl` calls also makes the
comment at [engine.ts:211](../../src/hazbot/engine/engine.ts#L211) stale:
`// Reference-driven walk: missing-impl + missing-defaults + ambient-key
collection.` After Step 3 the walk does only `missing-impl` detection +
stub-warning collection — as Step 3's own prose says. Lint/build will not flag
a stale comment, so Step 3 stays green, but the comment should be corrected
alongside the line-~141 one. A grep for `missing-defaults` / `requiredDefaults`
/ `collectFromImpl` across `engine.ts` comments would catch any other
stragglers.

**Resolution:** Step 3's `engine.ts` instruction was reworded from "update the
line-~141 comment" to "update the stale comments" — naming both the
asymmetric-construction-error block (~line 141) and the `runLoadTimeValidation()`
walk comment (~line 211), and directing a grep of `engine.ts` comments for
`missing-defaults` / `requiredDefaults` / `collectFromImpl` to catch any others.

---

### QA Engineer

#### RESOLVED: QA4 — No coverage that the wildfire bridge wires config-derived defaults into the constructed engine
Step 2 unit-tests the derivation in isolation (`derive-defaults.test.ts`) and
exercises the `EngineOpts.defaults → Engine.defaults → matchAgainst` channel via
the updated `23.test.ts` / `24.test.ts`. But the one production integration
point — `engine-singleton.ts` calling `deriveWildfireDefaults(getResolvedConfig())`
and threading the result through `EngineOpts.defaults` — has no named test.
`getAnalysisEngine()` could silently stop deriving or passing defaults (a
dropped argument, a wrong call) and every existing test would still pass: the
derivation test builds its own config, and `23/24.test.ts` build their engine
via `makeWildfireEngine`, not via `getAnalysisEngine()`. This is net-new wiring,
and the spec's own standard (QA2, QA3, the Requirement 13 coverage items) is
that net-new code gets named coverage. Recommend Step 2's "Tests" call for an
`engine-singleton.test.ts` assertion that `getAnalysisEngine()`'s engine carries
`defaults` equal to `deriveWildfireDefaults(getResolvedConfig())` for a known
preset URL.

**Resolution:** Step 2 now adds named coverage in `engine-singleton.test.ts`:
with a `?hazbotRules=23&preset=plainsTwoZone` URL, `getAnalysisEngine()`'s
engine must carry `engine.defaults` deep-equal to an **explicit
`WildfireDefaults` literal** for `plainsTwoZone` (Plains/Shrub/Mild ×2 + wind
0/0). The literal expectation (rather than re-deriving via
`deriveWildfireDefaults(getResolvedConfig())`) means the test catches a wrong
derivation as well as broken wiring; `derive-defaults.test.ts` still owns the
generic enum→label coverage. `engine-singleton.test.ts` was added to Step 2's
"Files affected" list.

---

### WCAG Accessibility Expert

#### RESOLVED: WCAG2 — the `(unrecognized preset)` text cue inherits `line-through`, reducing legibility of the explanation
Step 6 has the wildfire host place the text cue inside `value`
(`"badname (unrecognized preset)"`), and the substrate renders the whole `value`
inside the `hazbot-sidebar-leaf-false` span, which applies
`text-decoration: line-through`. So the explanatory phrase "(unrecognized
preset)" is itself struck through. Striking the *name* to signal "invalid" is
reasonable; striking the *explanation of why* is mildly counter-legible —
line-through conventionally reads as deleted/void. This is a polish point, not a
1.4.1 (Use of Color) failure, since colour, decoration, and literal text are all
present. Consider rendering the cue outside the decorated span — e.g.
`<span class="…leaf-false">{name}</span><span> (unrecognized preset)</span>` —
so the explanation stays undecorated. Low severity; a developer/researcher-only
surface.

**Resolution:** Accepted and documented (not fixed). A note was added to Step
6's `app.tsx` subsection recording that the cue inherits the
`hazbot-sidebar-leaf-false` `line-through`, that this is an accepted minor
cosmetic tradeoff on a dev/researcher-only surface, and that WCAG 1.4.1 still
holds (colour + decoration + literal text + the substrate's visually-hidden
`(no match)` are all present). Un-decorating the cue would need either a
requirements.md Req 13 change (move the cue into the `label`) or a new substrate
`SidebarDiagnostic` field — disproportionate for a low-severity cosmetic.

---

### Release / Build Engineer

#### RESOLVED: RB1 — Step 6's "Files affected" list omits `src/hazbot/engine/sidebar/index.ts`
Step 6's body includes a subsection editing
`src/hazbot/engine/sidebar/index.ts` to add `SidebarDiagnostic` to the type
export, so `app.tsx` can `import type { SidebarDiagnostic }` from the sidebar
barrel. That file is a non-test source file changed by the commit, yet it does
not appear in Step 6's "Files affected" list — the list a reviewer scans against
the actual diff. (Confirmed: `sidebar/index.ts` today exports only `Sidebar`
and `type SidebarProps`.) Add `src/hazbot/engine/sidebar/index.ts` to Step 6's
"Files affected" list.

**Resolution:** `src/hazbot/engine/sidebar/index.ts` was added to Step 6's
"Files affected" list ("export the new `SidebarDiagnostic` type"). The body
subsection that edits it was already present; the manifest now matches.

---

<!-- Third self-review round — implementation spec re-verified against the
     current codebase (config.ts, engine.ts, engine-singleton.ts, evaluator.ts,
     safely-evaluate-impl.ts, sidebar.tsx, use-analysis-engine.ts, app.tsx,
     log.ts, error-rendering.ts, factor-variables.ts, presets.ts, stores.ts,
     test-helpers.ts). The WCAG and Release/Build perspectives were re-reviewed
     and found clean; no new findings from those roles this round. -->

### Senior Engineer

#### RESOLVED: SE7 — Step 6's `getRequestedPresetInfo()` cast `as string | undefined` is unsound; `getUrlConfig()` numeric-coerces all-digit param values
Step 6's `getRequestedPresetInfo()` reads
`const urlPreset = getUrlConfig().preset as string | undefined;` — the cast SE4
added so the `urlPreset === undefined` absent-param check type-checks. But
`getUrlConfig()` ([config.ts:199-226](../../src/config.ts#L199-L226)) does more
than leave a key unset: for any param whose value is all-digits it runs
`parseFloat` (`else if (urlValue !== null && !isNaN(urlValue)) { urlConfig[key]
= parseFloat(urlValue); }`). So a URL `?preset=23` yields
`getUrlConfig().preset === 23` — a **number** at runtime — even though
`IUrlConfig` declares `preset: string`. (`ISimulationConfig` types `hazbotRules`
as `string | number` for exactly this reason — see the
[config.ts:91](../../src/config.ts#L91) comment "the URL parser auto-converts
numeric strings".)

Consequences for the Step 6 code block:
- The cast `as string | undefined` is unsound — the runtime value can be
  `number`. It should be `as string | number | undefined`.
- The block's `const name = String(urlPreset);` is doing real work —
  normalizing a possibly-numeric value to a string — but the spec's inline
  comment explains only the optionality (`getUrlConfig()` "only assigns a key
  when the URL actually carries it"), not the numeric coercion. A maintainer who
  trusts the `as string` cast could delete the "redundant" `String()` and
  reintroduce a bug (a numeric `preset` flowing into the
  `RequestedPresetInfo.preset` string field, type-unchecked because the cast
  lies).
- `?preset=23` is a plausible *real* mis-binding — an author confusing
  `preset=` with `hazbotRules=23` — which is precisely the case Requirement 13
  exists to surface; the spec should be explicit that the path handles it.

This extends SE4: SE4 corrected the `=== undefined` comparison, but the
corrected cast still under-types the same value. Suggested resolution: change
the cast to `as string | number | undefined`, keep `String(urlPreset)` as the
explicit normalizer, and rewrite the inline comment to cite the numeric
coercion (the `hazbotRules: string | number` precedent) alongside the
optionality.

**Resolution:** Step 6's `getRequestedPresetInfo()` code block now reads
`const urlPreset = getUrlConfig().preset as string | number | undefined;`, and
its inline comment was rewritten to record both `getUrlConfig()` departures from
the declared `preset: string` type — runtime-optionality *and* the all-digit
`parseFloat` coercion (citing the `hazbotRules: string | number` precedent) —
and to flag `String(urlPreset)` as load-bearing rather than redundant. Code-block
correction only; no design change. This supersedes SE4's narrower
`as string | undefined` cast (SE4's resolution gained a superseding note).

---

#### RESOLVED: SE8 — Step 6's diagnostics section is intentionally ungated on `engine.ruleSet`, diverging from every sibling panel, but the spec does not say so
`sidebar.tsx` establishes a strong, repeated pattern: every panel below the
header — `CategoriesPanel`, `FactorVariablesPanel`, `TemporalVariablesPanel`,
`SimPropsPanel`, `ReadingsPanel` — is wrapped in `{engine.ruleSet && (...)}`
([sidebar.tsx:41-79](../../src/hazbot/engine/sidebar/sidebar.tsx#L41-L79)).
Step 6's diagnostics section is gated only on
`{diagnostics && diagnostics.length > 0 && (...)}` — deliberately independent of
`engine.ruleSet`.

That independence is correct and required: a `?hazbotSidebar=true&preset=badname`
URL with no (or an invalid) `hazbotRules` constructs a ruleSet-less engine, and
surfacing the requested-preset mis-binding is still useful there — arguably most
useful there. But Step 6's prose ("Render the diagnostics in their own section
directly under the header") never states the ungating is intentional. An
implementer or PR reviewer pattern-matching against the five sibling panels
could "correct" the diagnostics block to `{engine.ruleSet && diagnostics &&
...}`, silently regressing the missing-ruleset case. Add a one-line note (in
Step 6 prose and/or as a code comment in the snippet) that the diagnostics
section is intentionally independent of `engine.ruleSet`, with the reason.

**Resolution:** Both done. Step 6's prose now states the diagnostics section is
**intentionally not gated on `engine.ruleSet`** — naming the five sibling panels
it diverges from, giving the reason (the `?hazbotSidebar=true&preset=…` with
absent/invalid `hazbotRules` case), and explicitly warning not to "correct" it
to the `{engine.ruleSet && …}` pattern. The Step 6 `sidebar.tsx` JSX snippet
also gained a short comment above the `{diagnostics && …}` guard recording the
same intent, so it survives into the implementation. No code-logic change — the
`{diagnostics && diagnostics.length > 0 && …}` guard is unchanged.

---

#### RESOLVED: SE9 — Step 6's substrate diagnostics render keys list items by `d.label`, which carries no uniqueness contract
Step 6's `sidebar.tsx` diagnostics map uses `key={d.label}`. `SidebarDiagnostic`
is deliberately a generic, host-agnostic substrate type (I2 option A — chosen so
"any future substrate consumer" can supply diagnostics), and `label` is
host-supplied free text with no stated uniqueness guarantee. The wildfire host
supplies exactly one diagnostic ("Requested preset") today, so there is no live
collision — but for a type explicitly designed for open-ended reuse, two
diagnostics sharing a `label` would produce a React duplicate-key warning. Use a
collision-proof key — the array index, or `${d.label}-${i}` — consistent with
how `sidebar.tsx` already keys non-unique lists (`ErrorRow`'s
`key={`${e.kind}-${e.at}-${i}`}`, `ReadingRow`'s composite key). Low severity;
substrate-robustness only.

**Resolution:** Step 6's `sidebar.tsx` diagnostics snippet now maps with
`diagnostics.map((d, i) => …)` and keys each entry `` key={`${d.label}-${i}`} ``,
with a code comment noting `label` carries no uniqueness contract and that the
composite key matches the file's existing `ErrorRow` / `ReadingRow` convention.
Substrate-robustness fix; no behaviour change for the single wildfire
diagnostic.

---

### QA Engineer

#### RESOLVED: QA5 — Step 2's `derive-defaults.test.ts` "fixed-terrain config" case exercises no code path the 2-zone/3-zone cases don't
Step 2's `derive-defaults.test.ts` sketch calls for a "fixed-terrain config"
case (`it("derives defaults for a fixed-terrain config", ...)`), and the
requirements.md Technical Notes *Affected tests* bullet lists "a fixed-terrain
preset" as one of three derivation cases to exercise. But `deriveWildfireDefaults`
reads only `config.zones`, `config.windSpeed`, and `config.windDirection` — it
never inspects `elevation`, `droughtIndexLocked`, or any other field that
distinguishes a fixed-terrain config. Per the QA2 resolution,
`derive-defaults.test.ts` builds its inputs *directly* (`getDefaultConfig()` +
spread), not via `getResolvedConfig()` — so a "fixed-terrain config" built
directly is, in the fields the derivation reads, identical to a normal 2-zone
config. The test guards nothing the 2-zone case doesn't.

This is a coverage-bookkeeping inaccuracy, not a behaviour risk. Resolution
options: (a) re-scope the case to derive from a *real* fixed-terrain preset
(e.g. `presets.mountainTwoZoneFixedTerrain`) so it pins that preset's actual
zone data — giving it independent value as a preset-data regression guard — and
reword the requirements.md bullet to say so; or (b) drop the "fixed-terrain"
case as redundant and reword the requirements.md bullet to list only the cases
that exercise distinct logic (zone count, enum→label conversion, undefined-slot
skipping). Either way, the requirements.md Technical Notes wording — which
presents "a fixed-terrain preset" as a distinct derivation case — should be
reconciled.

**Resolution:** Option (a). Step 2's `derive-defaults.test.ts` sketch now
replaces the hand-built "fixed-terrain config" case with one that derives
straight from the real `presets.mountainTwoZoneFixedTerrain` preset (`cfg()`
spreads the preset partial onto the base config — still no `getResolvedConfig()`,
so `deriveWildfireDefaults` / `getResolvedConfig` stay independently covered per
QA2) and pins its Mountains/Shrub/Mild ×2 labels. The sketch and Step 2 prose
now state explicitly that this case is a **preset-data regression guard**, not a
distinct derivation branch — the derivation reads only zone/wind fields and
never inspects `elevation`. requirements.md's Technical Notes *Affected tests*
bullet was reworded to match: it lists a 2-zone config, a 3-zone config, the
enum→label conversion, and the per-zone count rule as the derivation-logic
cases, and the fixed-terrain preset separately as the preset-data guard (noting
those presets back rule-sets 25 / 32 / 34).

---

<!-- Fourth self-review round — implementation spec re-verified against the
     current codebase (config.ts, engine-singleton.ts, log.ts, app.tsx,
     app.test.tsx, log.test.ts, sidebar.tsx, sidebar.css, factor-variables.ts,
     evaluator.ts, use-analysis-engine.ts, the rule-set modules 23–35, and
     scripts/extract-hazbot-sheets.js). Roles: Senior Engineer, QA Engineer,
     WCAG Accessibility Expert, Release/Build Engineer. WCAG and Release/Build
     were re-reviewed and produced no new findings independent of QA6 below. -->

### QA Engineer

#### RESOLVED: QA6 — Step 6's `app.tsx` builds the `SidebarDiagnostic` (incl. the WCAG-load-bearing `(unrecognized preset)` cue) with no named test coverage
Step 6's `app.tsx` change constructs the `diagnostics: SidebarDiagnostic[]`
array from `getRequestedPresetInfo()`:
```tsx
value: presetInfo.recognized
  ? presetInfo.preset
  : `${presetInfo.preset} (unrecognized preset)`,
status: presetInfo.recognized ? "match" : "no-match",
```
This is net-new code: the `recognized → "match" | "no-match"` mapping, the
`label`, and the `(unrecognized preset)` string — which the WCAG self-review
(requirements.md WCAG item; implementation WCAG1/WCAG2) made the **load-bearing
screen-reader text equivalent** for the no-match state. It has no named test.
`sidebar.test.tsx` covers the substrate `Sidebar` *given* a `diagnostics` array;
`app.test.tsx` mocks `Sidebar` wholesale (`Sidebar: () => <div
data-testid="hazbot-sidebar-mock" />`) and Step 6 adds `getRequestedPresetInfo`
to its mock factory defaulting to `undefined` — so `app.test.tsx` exercises
neither the `getRequestedPresetInfo → SidebarDiagnostic` mapping nor the cue. If
`app.tsx` builds the wrong `status`, drops the `(unrecognized preset)` cue, or
mislabels the field, every test still passes. The spec's own standard
(QA2/QA3/QA4, the Requirement 13 coverage items) is that net-new code gets named
coverage; this is the one net-new piece that does not — and a regression in the
cue is an accessibility regression that ships green.

**Suggested resolution:** either (a) extract the `RequestedPresetInfo →
SidebarDiagnostic` construction into a small pure helper in the wildfire bridge
(next to `getRequestedPresetInfo`) and unit-test it — recognized → `match` +
bare value; unrecognized → `no-match` + `(unrecognized preset)` value;
`undefined` → `undefined` — leaving `app.tsx` a thin call site; or (b) have
`app.test.tsx` give its `getRequestedPresetInfo` mock real return values and
assert the (mocked) `Sidebar` receives the expected `diagnostics` prop. (a) is
cleaner — it makes the WCAG cue a tested pure function rather than an inline
literal in an `observer` component.

**Resolution:** Option (a). The `RequestedPresetInfo → SidebarDiagnostic[]`
construction is extracted into a pure `buildPresetDiagnostics()` helper in the
wildfire bridge (`engine-singleton.ts`, beside `getRequestedPresetInfo`),
exported from the `hazbot/wildfire` barrel. `app.tsx` is reduced to
`buildPresetDiagnostics(getRequestedPresetInfo())` and no longer assembles the
diagnostic — or the `(unrecognized preset)` cue — inline. Step 6's
`engine-singleton.test.ts` bullet now calls for direct coverage of
`buildPresetDiagnostics()` (recognized → `match` + bare value; unrecognized →
`no-match` + `(unrecognized preset)` value; `undefined` → `undefined`), so the
WCAG screen-reader cue and the match/no-match mapping are pinned by a unit test.
Step 6's "Files affected", the `engine-singleton.ts` / `app.tsx` code blocks, the
barrel export, the estimated diff size (~190 → ~200), and the `app.test.tsx`
mock-factory bullet (now mocks `buildPresetDiagnostics` too) were updated to
match. The cue stays host-side — `buildPresetDiagnostics` lives in the wildfire
bridge, not the substrate — so WCAG1/WCAG2 are unaffected.

#### RESOLVED: QA7 — Step 6's `log.test.ts` "payload assertion worthwhile if practical" is impractical against the existing `buildAnalysisEngineActivatedPayload` mock stub, and redundant with `engine-singleton.test.ts`
Step 6's `log.test.ts` bullet says a `log` assertion that the emitted
`AnalysisEngineActivated` payload "carries the preset fields is worthwhile if
practical, but extending the mock factory is **required** regardless." The
"required" half (add `getRequestedPresetInfo` to the factory) is correct. The
"worthwhile if practical" payload assertion is not practical as the suite
stands: `log.test.ts`'s `jest.doMock("./hazbot/wildfire", …)` factory stubs
`buildAnalysisEngineActivatedPayload` as a plain arrow `(ruleSetId) => ({
engineVersion: "0.0.1", appRulesVersion: 1, ruleSetId })` — it ignores a second
argument and is not a `jest.fn()`. Step 6 changes `log.ts` to call
`buildAnalysisEngineActivatedPayload(engine.ruleSet.id,
getRequestedPresetInfo())`; the stub silently drops the 2nd arg, so the emitted
payload never carries `preset`/`presetRecognized` regardless of behaviour, and
the stub records no calls to assert against. The genuinely net-new `log.ts`
behaviour is that it now *passes* `getRequestedPresetInfo()` into the builder —
to test that, the stub must become a `jest.fn(...)` (so
`toHaveBeenCalledWith(id, presetInfo)` is assertable) or `log.test.ts` must use
the real builder. Separately, the payload *shape* ("`preset`/`presetRecognized`
only when given preset info") is already owned by the `engine-singleton.test.ts`
bullet, so a `log.test.ts` payload-shape assertion is redundant.

**Suggested resolution:** drop the "payload carries the preset fields … worthwhile
if practical" suggestion. If `log.test.ts` adds a new assertion, scope it to
"`log()` calls `buildAnalysisEngineActivatedPayload` with
`getRequestedPresetInfo()`'s result" and state the factory's
`buildAnalysisEngineActivatedPayload` stub must be a `jest.fn()` for that to be
assertable. Keep the "extend the factory with `getRequestedPresetInfo`"
instruction — that part is required and correctly stated.

**Resolution:** Done. Step 6's `log.test.ts` Tests bullet now (a) keeps the
**required** "factory must gain `getRequestedPresetInfo`" instruction, (b) drops
the vague "payload carries the preset fields … worthwhile if practical"
suggestion — recording that the hand-written `buildAnalysisEngineActivatedPayload`
stub makes a payload-shape assertion meaningless, and that the shape is already
owned by the `engine-singleton.test.ts` bullet — and (c) replaces it with a
scoped suggestion: if `log.test.ts` asserts anything new, it should assert the
one net-new `log.ts` behaviour (that `log()` calls
`buildAnalysisEngineActivatedPayload` with `getRequestedPresetInfo()`'s result),
which requires the stub to be a `jest.fn()`.

#### RESOLVED: QA8 — Step 3's Requirement-8 positive coverage offers `engine.test.ts` as a home, coupling the generic-substrate suite to wildfire rule-sets 32–35
Step 3's "New positive coverage for Requirement 8" bullet says "(in
`engine.test.ts` **or** a bridge-level test against `ruleSets`): for each of
rule-sets 32, 33, 34, 35, the constructed engine is `isActive === true`…".
`engine.test.ts` is the generic-substrate suite. The `hazbot/engine` layer is
documented — and this spec repeatedly stresses (RESOLVED OQ1, I2, the Technical
Notes *Substrate genericity*) — as host-agnostic with `hazbot/wildfire` as its
sole consumer; `engine.test.ts` exercises the substrate with synthetic
rule-sets/impls. Importing `ruleSets["32"]` (a wildfire artifact, carrying the
wildfire `set*` factor variables) into `engine.test.ts` inverts that layering
and makes the substrate suite depend on the bridge. Small, but the spec is
otherwise fastidious about substrate/bridge separation, so offering
`engine.test.ts` as a home here contradicts that principle and would set a
precedent.

**Suggested resolution:** drop the `engine.test.ts` option for the Requirement-8
positive coverage; name the bridge-level home (a wildfire-level test, e.g.
alongside `engine-singleton.test.ts`, constructing via `makeWildfireEngine(
ruleSets["NN"])` or `getAnalysisEngine()` per rule-set). Step 3's *other*
`engine.test.ts` edits — removing the now-obsolete `missing-defaults`
**substrate** cases — are correctly placed in `engine.test.ts` and unaffected.

**Resolution:** Done. Step 3's "New positive coverage for Requirement 8" bullet
now specifies a **bridge-level** test (a wildfire-level test, e.g. alongside
`engine-singleton.test.ts`, constructing via `makeWildfireEngine(ruleSets["NN"])`
or `getAnalysisEngine()`) and explicitly excludes `engine.test.ts` as the
substrate suite that must not import the wildfire `ruleSets`. Step 3's other
`engine.test.ts` edits — removing the obsolete `missing-defaults` substrate
cases — were left in place; they correctly belong there.

---

### Senior Engineer

#### RESOLVED: SE10 — Step 6's `getRequestedPresetInfo()` derives `recognized` from `presets[name] !== undefined`, which matches inherited `Object.prototype` members
Step 6's `getRequestedPresetInfo()` ends:
```ts
return { preset: name, recognized: presets[name] !== undefined };
```
`presets` is the default-exported plain object from `src/presets.ts`, so
`presets[name]` resolves inherited `Object.prototype` members: for `name` ∈
{`constructor`, `toString`, `hasOwnProperty`, `valueOf`, `isPrototypeOf`, …} the
lookup is a function, `!== undefined` is `true`, and `recognized` is reported
`true` for a preset name that matches no actual preset. A URL `?preset=constructor`
would then render in the dev sidebar green/underlined with **no**
`(unrecognized preset)` cue and log `presetRecognized: true` — the exact opposite
of what Requirement 13 exists to surface. (`getResolvedConfig()`'s `presets[…]`
lookup shares the pattern, but there a function-valued result flows into
`Object.assign(getDefaultConfig(), <fn>, urlConfig)` and contributes no
own-enumerable keys, so it degrades to ~base config harmlessly — and that lookup
mirrors the pre-existing `stores.ts` expression. Only `getRequestedPresetInfo`'s
boolean is *visibly* wrong, and it is net-new WM-27 code.) Low frequency — it
needs a preset literally named after an `Object.prototype` member — but the spec
presents `presets[name] !== undefined` as the definition of "recognized."

**Suggested resolution:** in Step 6's `getRequestedPresetInfo()` code block,
compute `recognized` with an own-property check —
`Object.prototype.hasOwnProperty.call(presets, name)` (or
`Object.keys(presets).includes(name)`) — instead of `presets[name] !== undefined`.

**Resolution:** Done. Step 6's `getRequestedPresetInfo()` code block now computes
`recognized` via `Object.prototype.hasOwnProperty.call(presets, name)`, with a
code comment explaining why a bare `presets[name] !== undefined` lookup is wrong
(it resolves inherited `Object.prototype` members). Scoped to
`getRequestedPresetInfo` — `getResolvedConfig()`'s `presets[…]` lookup is left
as-is, since a function-valued result there degrades harmlessly to the base
config and that lookup mirrors the pre-existing `stores.ts` expression.

#### RESOLVED: SE11 — Step 6's `AnalysisEngineActivated` preset payload only emits when the engine activates; a mis-bound preset on an inactive/rule-set-less engine is logged nowhere
Step 6 routes the requested-preset diagnostic into the `AnalysisEngineActivated`
log payload via `log.ts`. That emission is gated (`log.ts`) on `engine?.isActive
&& !analysisEngineActivatedEmitted && engine.ruleSet` — the payload is sent only
when the engine activates with a rule-set. Requirement 13's *Log payload*
sub-bullet states the preset value "is added verbatim to the
`AnalysisEngineActivated` log payload" without noting that **no
`AnalysisEngineActivated` event is emitted at all** when the engine does not
activate (no `hazbotRules`; or a typo'd/unknown `hazbotRules` → `missing-rule-set`
→ inactive). So a `?preset=badname` mis-binding on an activity whose engine never
activates is logged nowhere. The parallel *Dev sidebar* path was deliberately
re-engineered (SE8) to surface the diagnostic even with no rule-set; the log path
structurally cannot, and the spec does not say so. Severity is low — the
realistic scenario (typo'd `hazbotRules` *and* a `preset`) is one where the
Hazbot is already broken for a larger reason — but the spec is otherwise careful
to record observability limitations (Requirement 13's closing paragraph notes the
URL-override blind spot), and this asymmetry is currently unstated.

**Suggested resolution:** add a short sentence to Requirement 13's *Log payload*
sub-bullet (and/or Step 6's `log.ts` prose) recording the limitation: the preset
reaches the log only when the engine activates; an unrecognized preset on a
non-activating engine is visible in the dev sidebar (ungated, per SE8) but not in
logs. No code change — a documentation-completeness fix.

**Resolution:** Done (documentation only). A *Limitation (Self-Review SE11)*
note was added to Step 6's `log.ts` prose, and a matching caveat sentence to
requirements.md Requirement 13's *Log payload* sub-bullet: the
`AnalysisEngineActivated` event — and therefore the preset payload — is emitted
only when the engine activates; an activity whose engine never activates (no
`hazbotRules`, or a typo'd `hazbotRules`) logs no such event, so a mis-bound
preset there is caught by the dev sidebar (diagnostics ungated on the rule-set,
per SE8) but not by logs. No code change.

#### RESOLVED: SE12 — Step 6's `app.tsx` calls `getRequestedPresetInfo()` (a full `getUrlConfig()` scan) on every render of the main app component, including for production users with `hazbotSidebar` off
Step 6's `app.tsx` snippet places `const presetInfo = getRequestedPresetInfo();`
(and the `diagnostics` construction) at the top level of the `AppComponent` body
— unconditionally, on every render. `AppComponent` is the main app component and
an `observer`, so it re-renders frequently (every MobX tick while a simulation
runs). `getRequestedPresetInfo()` calls `getUrlConfig()`, which rebuilds
`getDefaultConfig()` and runs a `new RegExp` + `.exec` for every config key
(~55). The cost is paid for every user, including production users with
`hazbotSidebar` off who get no sidebar. (`app.tsx` already calls `getUrlConfig()`
once per render at line 44; this adds a second full scan.) Severity is low —
`app.tsx` already tolerates one `getUrlConfig()` per render and the absolute cost
is small — but it is trivially avoidable, and the diagnostic is only consumed
when the sidebar mounts.

**Suggested resolution:** in Step 6's `app.tsx` snippet, compute
`presetInfo`/`diagnostics` only when the sidebar will mount — inside the
`showHazbotSidebar &&` branch, or guarded by `hazbotSidebar`. A code-block tweak;
no requirements change.

**Resolution:** Done. Step 6's `app.tsx` code block now computes
`buildPresetDiagnostics(getRequestedPresetInfo())` inline on the `<Sidebar>`
prop, inside the existing `{showHazbotSidebar && engine && …}` mount branch,
rather than via a top-level `const diagnostics = …` in the component body — so
the `getUrlConfig()` scan it entails runs only when the sidebar actually mounts,
not on every render for production users with `?hazbotSidebar` unset. A code-block
tweak with a comment recording the intent; no requirements change.
