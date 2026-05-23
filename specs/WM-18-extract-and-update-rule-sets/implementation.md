# Implementation Plan: Hazbot — Extract All Rule-Set Sheets and Add/Update Rule-Sets

**Jira**: https://concord-consortium.atlassian.net/browse/WM-18
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **In Development**

## How to read this plan

Each step below is a logically coherent, independently reviewable unit — in
nearly all cases a single commit that leaves `npm run lint && npm test &&
npm run build` green. (Two steps — the fidelity diff and
closeout — are verification work, not code commits; the playbook-walk step is
verification plus a small documentation commit, the refreshed
validation-status table in `localhost-urls.md`.) Steps build on each other
in order; there are no forward dependencies. Steps are referred to by
descriptive name, not number, so they can be split or reordered without
stale cross-references. The requirement IDs (R1–R15) trace to
[requirements.md](requirements.md#requirements); every requirement is covered
by at least one step (see [Requirements coverage](#requirements-coverage)).

**Generated artifacts.** Three steps produce machine-generated content — the
regenerated rule-set modules and `dsl-grammar.md` (the re-extract step) and the
regenerated playbooks (the playbook-regeneration step). This plan gives the
*command* and the *verification* for those, not hand-written file bodies: the
extractor is deterministic, so the module bodies are whatever the 2026-05-22
workbook produces, and fabricating them here would just be a second, unverified
extraction. Their fidelity is checked by the fidelity-diff step (R11a), not by
this spec.

**Workbook location (verified).** The source workbook is present at
`~/Downloads/Wildfire-Hazbot-Feedback-Tables-2026-05-22.xlsx` (676 KB, 13
sheets: `README`, `SIMINIT`, and rule-set tabs `23, 24, 25, 32, 33, 34, 35,
42, 45, 47, 54` — no tab `43`, confirming the stale-`43` notes in
requirements.md). All commands below take that path as `<workbook>`.

## Implementation Plan

### Commit the `dump-xlsx.js` workbook inspector

**Summary**: `scripts/dump-xlsx.js` already exists as an untracked file on the
`WM-18` branch (it was written to support this story's sheet inspection and the
fidelity-diff step's module↔sheet diff). Per requirements.md BR-3 it lands as
its own standalone dev-tooling commit, separate from the rule-set deliverable,
so the rule-set commits stay free of unrelated tooling. This is the first commit
because the extractor step's verification and the fidelity-diff step both use it.

**Files affected**:
- `scripts/dump-xlsx.js` — already written (~104 lines); `git add` + commit only.

**Estimated diff size**: ~104 lines (file already exists; commit-only step).

No code change. Confirm the file runs (`node scripts/dump-xlsx.js <workbook>`
lists the 13 sheets) and commit it on its own. The file reuses the existing
`read-excel-file` dependency — no new deps. Suggested commit message:
`chore(hazbot): add dump-xlsx.js workbook inspector for re-extract work`.

---

### Extend the extractor and its unit tests

**Summary**: Make the extractor extract all 11 rule-set tabs and drop the
feedback-mechanism `id >= 100` rows, and cover both changes in the extractor's
Jest suite. This is one commit — the extractor change and its tests together
keep `npm test` green. Covers **R1**, **R1a**, **R1b**, and the R2a
verification.

**Files affected**:
- `scripts/extract-impl.js` — empty `EXCLUDED_TABS`; add the `id >= 100` drop
  + misnumbering warning to `parseTab`.
- `scripts/extract-impl.test.js` — add cases for the `id >= 100` filter and the
  misnumbering warning; refresh the stale `43`-tab fixture comment.

**Estimated diff size**: ~70 lines.

**`scripts/extract-impl.js` — empty `EXCLUDED_TABS` (R1).** The current value
(line 6) is `["43", "45", "47", "54"]`:

```js
// before
const EXCLUDED_TABS = ["43", "45", "47", "54"];
// after
// All 11 rule-set tabs are now extracted (WM-18 R1). README / SIMINIT are
// auto-skipped — parseTab() returns null for any tab with no category block.
const EXCLUDED_TABS = [];
```

`EXCLUDED_TABS` stays exported (it is referenced by `extract-hazbot-sheets.js`'s
end-of-run log) — only its value changes.

**`scripts/extract-impl.js` — drop `id >= 100` rows in `parseTab` (R1a).** In
the category loop (currently lines 59–77), immediately after `const id =
parseInt(...)` / `if (isNaN(id)) continue;`:

```js
    const id = parseInt(String(idCell), 10);
    if (isNaN(id)) continue;

    // Per R1a / Q3: feedback-mechanism rows (README: category id >= 100) carry
    // no parseable DSL — their pseudocode cell is `-- no pseudo code --`. They
    // are dropped so a re-extract does not emit an unparseable `expression`
    // (which would fail the whole rule-set to load with a parse-error).
    const rawExpr = String(row[colIdx.expression] ?? "");
    const hasNoPseudoCodeMarker = /--\s*no pseudo code\s*--/i.test(rawExpr);
    // The id and the marker should agree; warn if not, so an authoring
    // misnumbering (a feedback row numbered < 100, or a sim-use row numbered
    // >= 100) surfaces at extraction rather than as a load crash or a silently
    // dropped category.
    if ((id >= 100) !== hasNoPseudoCodeMarker) {
      console.warn(
        `[extract] tab ${sheetName} category ${id}: category id ` +
        `(${id >= 100 ? ">= 100" : "< 100"}) and the "-- no pseudo code --" ` +
        `marker disagree — check the sheet's category numbering.`,
      );
    }
    if (id >= 100) continue;
```

The drop criterion is strictly `id >= 100` (Q3 decision A — the README's own
boundary). The `-- no pseudo code --` marker is used only to detect a
misnumbering; it never decides the drop.

**`scripts/extract-impl.js` — `defaults` field (R2a): verify, no change.**
R2a asks that a re-extract emit modules with no per-rule-set `defaults` field.
This is **already true** — `emitTabModule` (lines 161–176) emits only `id`,
`categories`, `factorVariables`, and WM-27 commit `6334af7`
(`refactor(hazbot): retire sheet-based defaults extraction from
extract-impl.js`) already removed the `defaults` emission. `extract-impl.test.js`
already asserts it (`expect(result.tabs[0].tsSource).not.toMatch(/defaults:/)`,
with the comment "The generator no longer emits a `defaults` field"). So R2a
needs **no extractor code change** — see [Open Question IQ2](#open-questions).
The re-extract step's `git diff` of the regenerated 23–35 modules is the
empirical confirmation that a re-extract is structurally clean.

**`scripts/extract-impl.test.js` — cover the changes (R1b).** Add a synthetic
sheet with a category-100 feedback-mechanism row and assert it is dropped, and
assert the misnumbering warning fires in *both* directions. Also refresh the
now-misleading `sheet: "43", // excluded` comment in `SYNTHETIC_SHEETS` — with
`EXCLUDED_TABS` empty, tab `43` is no longer *excluded*; it is *skipped* by
`parseTab` returning `null` (it has no category block). The existing
`expect(result.skippedTabs).toContain("43")` assertion still holds for that
reason, so only the comment changes.

```js
// new cases appended to extract-impl.test.js

describe("parseTab — feedback-mechanism (id >= 100) rows (R1a)", () => {
  it("drops a category row with id >= 100", () => {
    const sheet = [
      ["#", "Student Action", "Hazbot Feedback", "Visual Feedback", "Pseudocode for Rules"],
      [1, "Ran it", "Good!", "", "ranSimulation"],
      [100, "Re-clicked Hazbot", "Answer the questions!", "", "-- no pseudo code --\nfeedback mechanism"],
    ];
    const parsed = parseTab("xx", sheet);
    expect(parsed.categories).toHaveLength(1);
    expect(parsed.categories[0].id).toBe(1);
  });

  it("warns when a sim-use expression is mistakenly numbered >= 100", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    // id >= 100 but the cell carries real DSL (no -- no pseudo code -- marker).
    parseTab("xx", [
      ["#", "Student Action", "Hazbot Feedback", "Visual Feedback", "Pseudocode for Rules"],
      [100, "Ran it", "Good!", "", "ranSimulation"],
    ]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("disagree"));
    warn.mockRestore();
  });

  it("warns when a feedback row (-- no pseudo code --) is misnumbered below 100", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    // id < 100 but the cell IS a -- no pseudo code -- marker. The row is NOT
    // dropped (drop criterion is strictly id >= 100) — it is emitted as a
    // normal category; the warning is the safety net that flags the
    // misnumbering to the author.
    parseTab("xx", [
      ["#", "Student Action", "Hazbot Feedback", "Visual Feedback", "Pseudocode for Rules"],
      [99, "Re-clicked Hazbot", "Answer the questions!", "", "-- no pseudo code --\nfeedback mechanism"],
    ]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("disagree"));
    warn.mockRestore();
  });
});
```

The `defaults`-omission assertion required by R1b already lives in the
`extractFromSheets` describe block (line 47) — no new case is needed there;
R1b is satisfied by confirming that assertion still passes after this step.

---

### Add `fireLineMarkers` to the wildfire bridge reading and translator

**Summary**: `Fireline` / `usedFireline` (implemented in the new-impls step)
need fire-line marker data on the reading, and the `WildfireReading` type does
not carry it today. This step extends the bridge reading shape and the
`SimulationStarted` translator — a self-contained bridge change with no
engine-code impact (R6a substrate half). Kept as its own commit because the
reading-shape change is a distinct concern from the predicate impls that
consume it.

**Files affected**:
- `src/hazbot/wildfire/types.ts` — add `WildfireFireLineMarker`; add
  `fireLineMarkers?` to `WildfireReading`.
- `src/hazbot/wildfire/translate.ts` — copy `data.fireLineMarkers` in the
  `SimulationStarted` case.
- `src/hazbot/wildfire/translate.test.ts` — assert `fireLineMarkers` round-trips.

**Estimated diff size**: ~30 lines.

**`types.ts`** — the field name `fireLineMarkers` and the `{ x, y, elevation }`
shape are verified at the [`bottom-bar.tsx`](../../src/components/bottom-bar.tsx)
`SimulationStarted` emit site (`configSnapshot.fireLineMarkers =
simulation.fireLineMarkers.map(fl => ({ x, y, elevation }))`):

```ts
export interface WildfireReading extends BaseReading {
  zones?: WildfireZone[];
  sparks?: WildfireSpark[];
  fireLineMarkers?: WildfireFireLineMarker[];
  wind?: { speed: number; direction: number };
  outcome?: unknown;
}

// One endpoint of a fire line drawn during a run. Matches the SimulationStarted
// payload built in src/components/bottom-bar.tsx (x / y normalized to the model
// extent; elevation from the cell under the marker).
export interface WildfireFireLineMarker {
  x: number;
  y: number;
  elevation?: number;
}
```

**`translate.ts`** — add one field to the `SimulationStarted` reading:

```ts
    case "SimulationStarted": {
      const data = (event.data ?? {}) as Partial<WildfireReading>;
      const reading: WildfireReading = {
        triggeredBy: "SimulationStarted",
        sessionId,
        at: event.at,
        temporalHistory: [],
        zones: data.zones,
        sparks: data.sparks,
        fireLineMarkers: data.fireLineMarkers,
        wind: data.wind,
      };
      return { kind: "trigger", reading };
    }
```

**`translate.test.ts`** — extend the existing `SimulationStarted` case (or add a
sibling) to assert `fireLineMarkers` is carried through:

```ts
  it("carries fireLineMarkers from the SimulationStarted payload", () => {
    const result = translate(
      ev("SimulationStarted", {
        data: { fireLineMarkers: [{ x: 0.1, y: 0.2, elevation: 5 }, { x: 0.3, y: 0.2, elevation: 6 }] },
      }),
      "s",
    );
    if (result.kind !== "trigger") throw new Error("expected trigger");
    expect(result.reading.fireLineMarkers).toHaveLength(2);
  });
```

---

### Implement the 8 new factor-variable / sim-prop impls and the 2 deferred stubs

**Summary**: Add the 8 in-scope impls (R6) and the 2 deferred stubs (R7) to the
wildfire bridge, with unit tests. Adding the `Helitack` / `usedHelitack` stubs
*here* — before the re-extract step — means the regenerated tabs 45/47/54 can
reference them without a `missing-impl` load failure. The `sawIntenseFire` stub
is *not* removed in this step (the pre-extract `34.ts` still references it); its
removal is the sawIntenseFire-removal step, after the re-extract drops that
reference.

**Files affected**:
- `src/hazbot/wildfire/sim-props.ts` — add `CorrectZoneSetup`,
  `UniformZoneSettings`, `Fireline`, `DefaultVars`, `DefaultVegetations`,
  `SevereDroughts`, and the `Helitack` stub; register all in `simProps`.
- `src/hazbot/wildfire/factor-variables.ts` — add `triedAllVegetations`,
  `usedFireline`; import + register `usedHelitack`.
- `src/hazbot/wildfire/factor-variable-stubs.ts` — add the `usedHelitack` stub
  (alongside the still-present `sawIntenseFire`).
- `src/hazbot/wildfire/sim-props.test.ts` — unit tests for the 6 new sim-props
  + the `Helitack` stub.
- `src/hazbot/wildfire/factor-variables.test.ts` — unit tests for the 2 new
  factor variables + the `usedHelitack` stub.

**Estimated diff size**: ~330 lines (impls ~130, tests ~200).

**Before coding — re-confirm the sheet constants (per self-review CA-1).**
`CorrectZoneSetup` and `DefaultVars` hard-code sheet-authored constants. Before
writing them, re-confirm those constants against the *current workbook* with
`node scripts/dump-xlsx.js <workbook> 23` (CorrectZoneSetup) and the same command
for tabs `45` / `47` (DefaultVars). The values shown below are taken from the requirements.md R6
table — a secondary copy; the workbook is the source of truth, and a workbook
revision since requirements-finalization must not be silently missed. Also
re-confirm `triedAllVegetations`'s tab-34 definition with
`node scripts/dump-xlsx.js <workbook> 34` — the impl below folds the run-union
against the **full** `Vegetation` enum, so verify tab 34 has not narrowed it to
a vegetation *subset*. If it has, that subset is a sheet constant and
`triedAllVegetations` takes the R6 sheet-citing-test treatment per
requirements.md CA-3's contingency.

**New sim-props** — appended to `sim-props.ts` before the `simProps` map.
`evaluate` receives `(reading, defaults)`; `defaults` is the config-derived
`WildfireDefaults` (per WM-27). Add an import
`import { TerrainType, terrainLabels, Vegetation, vegetationLabels, DroughtLevel, droughtLabels } from "../../types";`
— used by `SevereDroughts` and `CorrectZoneSetup` so they reference the enum
labels rather than baking literal strings (per self-review CA-3 / CA-4).

```ts
// Per tab 23's sheet definition (CorrectZoneSetup, verified via dump-xlsx.js,
// tab 23): zone 1 = Foothills / Grass / No Drought; zone 2 = Foothills / Grass /
// Mild Drought or Medium Drought. The per-zone *enum choice* is the
// sheet-authored constant — this impl is NOT regenerated on re-extraction (see
// the CorrectZoneSetup Technical Note in requirements.md), so its unit test
// cites the sheet definition as the fixture source of truth (R6). The label
// *strings* are not sheet constants: each enum member is resolved through
// terrainLabels / vegetationLabels / droughtLabels (src/types.ts) — the same
// maps the SimulationStarted payload uses — so a future relabeling tracks
// automatically rather than silently desyncing (per self-review CA-4). The
// `[z1, z2] = zones` destructuring is positional: `reading.zones` is in
// `config.zones` tuple order and is never reordered at runtime, so slots 0 / 1
// are the sheet's "zone 1" / "zone 2" — see the zone-array-order Technical Note
// in requirements.md (per external-review item ER-2).
const CorrectZoneSetup: SimPropImpl<WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  evaluate: (reading) => {
    const zones = reading.zones;
    if (!zones || zones.length !== 2) return false;
    const [z1, z2] = zones;
    const zone1Ok = z1.terrainType === terrainLabels[TerrainType.Foothills] &&
      z1.vegetation === vegetationLabels[Vegetation.Grass] &&
      z1.droughtLevel === droughtLabels[DroughtLevel.NoDrought];
    const zone2Ok = z2.terrainType === terrainLabels[TerrainType.Foothills] &&
      z2.vegetation === vegetationLabels[Vegetation.Grass] &&
      (z2.droughtLevel === droughtLabels[DroughtLevel.MildDrought] ||
        z2.droughtLevel === droughtLabels[DroughtLevel.MediumDrought]);
    return zone1Ok && zone2Ok;
  },
};

// Per tab 25's sheet definition: all zones share vegetation AND droughtLevel.
// terrainType is uniform by design on this activity, so it is not checked.
const UniformZoneSettings: SimPropImpl<WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  evaluate: (reading) => {
    const zones = reading.zones;
    if (!zones || zones.length === 0) return false;
    const vegs = zones.map((z) => z.vegetation);
    const droughts = zones.map((z) => z.droughtLevel);
    // Fail closed on undefined — symmetric with the Uniform* props already here.
    if (vegs.some((v) => v === undefined) || droughts.some((d) => d === undefined)) return false;
    return new Set(vegs).size === 1 && new Set(droughts).size === 1;
  },
};

// Per the sheet (tabs 45/47/54): this run drew a fire line. A fire line needs
// two endpoints, so the SimulationStarted snapshot carries >= 2 markers.
const Fireline: SimPropImpl<WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  evaluate: (reading) => (reading.fireLineMarkers?.length ?? 0) >= 2,
};

// Per the sheet (tabs 45/47): all adjustable variables (vegetation, drought,
// wind) are at default. Wind is matched with tolerance — +/-2 magnitude,
// +/-20 degrees angle — because the wind UI is a continuous control. The
// tolerances are sheet-authored constants; this impl is NOT regenerated on
// re-extraction, so its unit test cites the sheet definition (R6).
const WIND_MAGNITUDE_TOLERANCE = 2;
const WIND_ANGLE_TOLERANCE_DEG = 20;
const DefaultVars: SimPropImpl<WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  evaluate: (reading, defaults) => {
    const zones = reading.zones;
    const defaultZones = defaults?.zones;
    // Fail closed on a zone-count mismatch. reading.zones is simulation.zones
    // truncated to config.zonesCount; deriveWildfireDefaults() (WM-27) emits one
    // entry per *populated* config.zones slot independent of zonesCount, so
    // defaultZones can be longer than reading.zones. The zones.every() below
    // iterates reading.zones only — without this guard a too-long defaultZones
    // tail goes unchecked and the prop can pass while ignoring a default zone.
    if (!zones || zones.length === 0 || !defaultZones ||
        zones.length !== defaultZones.length || !reading.wind || !defaults?.wind) return false;
    const zonesAtDefault = zones.every((z, i) => {
      const def = defaultZones[i];
      return def !== undefined &&
        z.vegetation === def.vegetation && z.droughtLevel === def.droughtLevel;
    });
    if (!zonesAtDefault) return false;
    const magnitudeOk =
      Math.abs(reading.wind.speed - defaults.wind.speed) <= WIND_MAGNITUDE_TOLERANCE;
    // Circular angle difference — fold the wrap so 350 vs 10 reads as 20.
    const rawDelta = Math.abs(reading.wind.direction - defaults.wind.direction) % 360;
    const angleDelta = Math.min(rawDelta, 360 - rawDelta);
    return magnitudeOk && angleDelta <= WIND_ANGLE_TOLERANCE_DEG;
  },
};

// Per the sheet (tab 54): every zone's vegetation is at its config-sourced
// default. Compares against the WM-27 deriveWildfireDefaults() output — the
// config is the source of truth, so no hard-coded sheet constant (per CA-3).
const DefaultVegetations: SimPropImpl<WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  evaluate: (reading, defaults) => {
    const zones = reading.zones;
    const defaultZones = defaults?.zones;
    // Fail closed on a zone-count mismatch — see the DefaultVars guard comment.
    if (!zones || !defaultZones || zones.length === 0 ||
        zones.length !== defaultZones.length) return false;
    return zones.every((z, i) => {
      const def = defaultZones[i];
      return def !== undefined && z.vegetation === def.vegetation;
    });
  },
};

// Per the sheet (tab 54): every zone is at Severe Drought. Compares against
// droughtLabels[DroughtLevel.SevereDrought] (src/types.ts) — the enum label is
// the source of truth, so no hard-coded sheet constant (per CA-3). The
// SimulationStarted payload sets zones[].droughtLevel = droughtLabels[…]
// (src/components/bottom-bar.tsx), so this matches the payload by construction.
const SevereDroughts: SimPropImpl<WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  evaluate: (reading) => {
    const zones = reading.zones;
    if (!zones || zones.length === 0) return false;
    return zones.every((z) => z.droughtLevel === droughtLabels[DroughtLevel.SevereDrought]);
  },
};

// Stub — deferred to WM-28 ("Hazbot: Helitack run-window detection"). In-run
// helitack correlation needs an engine-substrate change out of WM-18 scope
// (see the Helitack Technical Notes in requirements.md). Kept as a stub so
// tabs 45/47/54 load. A false stub leaves tab 45 Cat 4 unreachable and degrades
// tabs 47/54 Cat 3-5 / tab 45 Cat 3 — documented in localhost-urls.md.
const Helitack: SimPropImpl<WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  isStub: true,
  evaluate: () => false,
};
```

Then extend the `simProps` map with the seven new entries (`CorrectZoneSetup`,
`UniformZoneSettings`, `Fireline`, `DefaultVars`, `DefaultVegetations`,
`SevereDroughts`, `Helitack`).

**New factor variables** — appended to `factor-variables.ts`. Add an import
`import { vegetationLabels } from "../../types";` (the same module
`derive-defaults.ts` imports from) — that is the only new import needed;
`simulationStartedReadings`, used by both new impls, is a file-local function
already defined in `factor-variables.ts` and in scope for the appended code:

```ts
// Per the sheet (tab 34): across all runs the union of zone vegetation covers
// every Vegetation enum value. Folds the run-union against vegetationLabels
// (src/types.ts) — the enum is the source of truth, so no sheet constant (CA-3).
const triedAllVegetations: FactorVariableImpl<boolean, WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  compute: (readings) => {
    const witnesses = simulationStartedReadings(readings);
    const seen = new Set<string>();
    for (const r of witnesses) {
      for (const z of r.zones ?? []) {
        if (z.vegetation !== undefined) seen.add(z.vegetation);
      }
    }
    const value = Object.values(vegetationLabels).every((v) => seen.has(v));
    return { value, witnesses };
  },
};

// Per the sheet (tab 45): some run drew a fire line. True if any
// SimulationStarted reading carries >= 2 fire-line markers.
const usedFireline: FactorVariableImpl<boolean, WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  compute: (readings) => {
    const witnesses = simulationStartedReadings(readings).filter(
      (r) => (r.fireLineMarkers?.length ?? 0) >= 2,
    );
    return { value: witnesses.length > 0, witnesses };
  },
};
```

Change the `import { sawIntenseFire }` line to also import `usedHelitack`, and
add `triedAllVegetations`, `usedFireline`, `usedHelitack` to the
`factorVariables` map (`sawIntenseFire` stays for now — removed in the
sawIntenseFire-removal step):

```ts
import { sawIntenseFire, usedHelitack } from "./factor-variable-stubs";
// ...
export const factorVariables: Record<string, FactorVariableImpl<...>> = {
  // ...existing entries...
  triedAllVegetations,
  usedFireline,
  sawIntenseFire,   // removed in the sawIntenseFire-removal step
  usedHelitack,
};
```

**`factor-variable-stubs.ts`** — add `usedHelitack` next to `sawIntenseFire`:

```ts
// Stub — deferred to WM-28 ("Hazbot: Helitack run-window detection"). See the
// Helitack Technical Notes in the WM-18 requirements spec.
export const usedHelitack: FactorVariableImpl<boolean, WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  isStub: true,
  compute: () => ({ value: false, witnesses: [] }),
};
```

**Unit tests.** `sim-props.test.ts` / `factor-variables.test.ts` each get a
`describe` block per new impl, modeled on the existing blocks (true case, false
case, fail-closed-on-undefined where applicable). Two impls get sheet-citing
fixtures (R6 / CA-2):

- `CorrectZoneSetup` — the test fixture builds its "correct" zones through the
  same label maps the impl uses — `terrainType: terrainLabels[TerrainType.Foothills]`,
  `vegetation: vegetationLabels[Vegetation.Grass]`,
  `droughtLevel: droughtLabels[DroughtLevel.NoDrought]` for zone 1 (and the
  `MildDrought` / `MediumDrought` zone-2 values) — *not* hard-coded label
  strings, so impl and fixture track one source of truth and a `src/types.ts`
  relabeling does not false-alarm the test (per CA-5). A comment cites the tab-23
  sheet row, documenting the per-zone *enum choice* — the actual sheet-authored
  constant — so a future sheet change to that zone setup forces a visible,
  reviewed test diff.
- `DefaultVars` — the test asserts the `+/-2` magnitude / `+/-20 deg` angle
  boundaries (a reading just inside passes, just outside fails), with a comment
  citing the tab-45/47 sheet definition.

`DefaultVars` and `DefaultVegetations` each additionally get a
zone-count-mismatch case — a reading whose `zones` is shorter than
`defaults.zones` — asserting the prop fails closed (`false`), covering the
`zones.length !== defaultZones.length` guard (per external-review item ER-1).

`Helitack` / `usedHelitack` get the same stub assertion the existing
`SparksAtTopAndBottom` / `sawIntenseFire` blocks use (`isStub === true`,
evaluates/computes to `false`).

The `Fireline` / `usedFireline` tests model the real run-boundary snapshot
mechanic per **R6a** — the Fire Line tool is disabled until a run starts, so the
first run's snapshot always carries empty `fireLineMarkers` and a drawn line is
captured only by a subsequent `SimulationStarted`. Because `Fireline` and
`usedFireline` are different impl kinds, that mechanic is exercised differently
for each:

- `usedFireline` is a **factor variable** (`compute(readings)` takes the whole
  array): its test runs a multi-`SimulationStarted` sequence — an early reading
  with empty `fireLineMarkers`, a later reading with `>= 2` markers — and
  asserts `compute` returns `true` (the later run is the witness), not a single
  synthetic reading.
- `Fireline` is a **sim-prop** (`evaluate(reading)` takes one witness reading,
  per the `WITH` contract — see every existing entry in `sim-props.ts`): a
  sim-prop has no readings sequence to receive, so its test is three
  single-reading `evaluate` cases — an undefined/empty-`fireLineMarkers` reading
  → `false`, a one-marker reading (a half-placed line) → `false`, a `>= 2`-marker
  reading → `true` — pinning both ends of the `>= 2` threshold.

(requirements.md R6a's wording — "the `Fireline` / `usedFireline` unit tests
therefore exercise a multi-`SimulationStarted` sequence" — carries the same
factor-variable/sim-prop conflation and should be tightened the same way; that
is a requirements-side edit, flagged separately.)

---

### Re-extract all 11 rule-set modules; rewrite the 23/24/25 test files

**Summary**: Run the extractor against the 2026-05-22 workbook, producing the
11 rule-set modules, `index.ts`, and `dsl-grammar.md` (R2, R3, R4). Modules
`23–35` are regenerated; `42, 45, 47, 54` are new. Because regeneration changes
the behavior of `23/24/25` (e.g. tab 23 Cat 5's expression changes — see
Background), their existing test files encode pre-WM-18 behavior and would fail
`npm test`. This step **rewrites `23.test.ts` / `24.test.ts` / `25.test.ts`**
against the regenerated modules in the *same commit*, so the commit stays green
(see [Open Question IQ1](#open-questions) for the alternative).

**Files affected**:
- `src/hazbot/rule-sets/23.ts … 35.ts` — regenerated (7 modules, generated).
- `src/hazbot/rule-sets/42.ts, 45.ts, 47.ts, 54.ts` — new (4 modules, generated).
- `src/hazbot/rule-sets/index.ts` — regenerated; exports all 11 rule-sets (R4).
- `src/hazbot/dsl-grammar.md` — regenerated from the README tab (generated).
- `src/hazbot/rule-sets/23.test.ts, 24.test.ts, 25.test.ts` — rewritten by hand
  against the regenerated modules (R8/R9 for those three tabs).
- `src/hazbot/rule-sets/index.test.ts` — new; the explicit R5 load gate (see below).

**Estimated diff size**: generated content (~600+ lines of TS modules +
grammar); ~300 hand-written lines for the three rewritten test files; ~50 lines
for `index.test.ts`.

**The command** (R2):

```bash
node scripts/extract-hazbot-sheets.js ~/Downloads/Wildfire-Hazbot-Feedback-Tables-2026-05-22.xlsx
```

This writes `src/hazbot/rule-sets/<id>.ts` for all 11 tabs, `index.ts`, and
`src/hazbot/dsl-grammar.md`. `README` / `SIMINIT` are auto-skipped. **No
hand-edits afterward** — the modules are committed exactly as emitted.

**Capture the extractor console output (per self-review CA-2).** Run the command
with its stdout/stderr captured and review every `[extract]` line. A
misnumbering warning (from R1a) is not a build failure — it prints and the
extraction proceeds — so it must be read deliberately. Treat any warning as
either a sheet-quality issue to flag to the author (per Out of Scope) or, if the
extractor itself misclassified the row, an extractor bug to fix.

**Verification (R2 / R2a — clean regenerate).** Before staging, run
`git diff src/hazbot/rule-sets/{23,24,25,32,33,34,35}.ts` and confirm every change is
*sheet-content* drift (expressions, factor-variable definitions, categories) —
**not** structural drift such as a re-introduced `defaults:` field or a changed
module skeleton. A structural diff would mean the extractor still has WM-27
residue; given the extractor step's finding (the extractor already omits
`defaults`), the expected result is a clean content-only diff.

**Verify all 11 load cleanly — the explicit R5 gate.** Add
`src/hazbot/rule-sets/index.test.ts`: a hand-written test that constructs the
engine for every entry of the regenerated `ruleSets` record and asserts each
engine's collected load errors are exactly — zero `missing-impl`, zero
`parse-error`, and the expected per-engine `stub-warning` distribution. The
engine emits one `stub-warning` per *referenced* stub per rule-set engine
([engine.ts](../../src/hazbot/engine/engine.ts) `runLoadTimeValidation`), and the
three stub names fan out unevenly across the 11 tabs: tab 25 →
`{SparksAtTopAndBottom}`, tab 45 → `{Helitack, usedHelitack}`, tab 47 →
`{Helitack}`, tab 54 → `{Helitack}`, every other tab → none — five
`stub-warning` entries in total, not three. This is R5's explicit verification
("no category loads with a `missing-impl` failure"): a regenerated module that
references an impl the requirements-phase sheet scan missed fails this test
loudly and by name, instead of surfacing later as an opaque "expected N, got
null" R9 failure in a per-rule-set file. Load errors are resolved at engine
construction, so the test needs no `defaults`. Because the engine's
construction-error model is asymmetric — `missing-impl` / `parse-error` land in
`engine.errors`, while the temporal-error variants throw `EngineConstructionError`
(see the "Asymmetric construction-error model" comment in
[engine.ts](../../src/hazbot/engine/engine.ts)) — the test wraps each engine
construction in `try` / `catch` and, on a caught `EngineConstructionError`, folds
its `.errors` into the inspected set, so a temporal misconfiguration in a future
re-extraction is reported by kind and rule-set id rather than crashing the test
with an uncaught throw. All three deferred names are
stubs registered by the new-impls step, so the test is green at this commit;
`sawIntenseFire` is still present but is referenced by no regenerated module, so
it raises no `stub-warning`.

**Rewrite `23.test.ts` / `24.test.ts` / `25.test.ts`.** Each is rewritten
against its regenerated module following the [per-rule-set test file
structure](#per-rule-set-test-file-structure) — the behavior sweep (a)–(d), the
(e) stub-gated shape only where applicable (tab 25 keeps its
`SparksAtTopAndBottom`-gated Cat 6 (e) case), and the R9 per-category block.
The category expressions come from the regenerated modules, so these files
cannot be authored before the extraction in this step is run.

**Note on `index.ts` ordering.** The regenerated `index.ts` lists rule-sets in
workbook sheet order, which differs from today's file. The `ruleSets` record is
keyed by tab id, so order is functionally irrelevant — this is expected churn,
not a regression.

---

### Verify extraction fidelity against the source sheets

**Summary**: Diff every regenerated/new module against its source sheet tab
(R11a) before the standalone test-file and playbook steps are built on top of
the modules. Verification work — its only code output is an extractor fix *if*
the diff finds a fidelity bug. Placed immediately after the re-extract step (per
self-review BR-1) so an extractor bug surfaces before the 32–35 / 42–54 test
steps and the playbook steps build on the modules. (The 23/24/25 test files are
the one exception — they are rewritten *in* the re-extract step, per IQ1, so a
fidelity fix touching those three tabs also re-touches their test files; see the
forward-commit note below.)

**Files affected**:
- `scripts/extract-impl.js` + `scripts/extract-impl.test.js`, the re-regenerated
  `src/hazbot/rule-sets/` modules, and — if the affected tab is 23, 24, or 25 —
  the corresponding `23.test.ts` / `24.test.ts` / `25.test.ts` (rewritten in the
  re-extract step, so a corrected re-regenerate may invalidate them) — *only if*
  the diff surfaces an extractor-fidelity bug (see below).

**Estimated diff size**: ~0 (verification); an extractor fix + regression test +
corrected re-regenerate only if a bug is found.

For each of the 11 modules, diff the regenerated module against its source sheet
tab using `dump-xlsx.js` (`node scripts/dump-xlsx.js <workbook> <tabId>`).
Compare:
- category **id and priority order** (excluding the `id >= 100` rows the
  extractor drops per R1a — the sheet retains them, the module does not),
- category expressions,
- factor-variable definitions,
- `logEvents`.

A discrepancy is either an **extractor bug** — fixed in `scripts/extract-impl.js`
(so the regenerate stays clean per R2), with a regression case added to
`scripts/extract-impl.test.js` — or a **sheet-quality issue**, flagged to the
sheet author per Out of Scope (not fixed here). An extractor bug is fixed as
this step's **own forward commit**: the `extract-impl.js` fix, the
`extract-impl.test.js` regression case, the corrected re-regenerate (re-run
`extract-hazbot-sheets.js`, commit the changed modules / `index.ts` /
`dsl-grammar.md`), *and* — if the bug changed a tab-23/24/25 module — the
matching `23/24/25.test.ts` re-aligned to the corrected module, since those test
files were already rewritten in the re-extract step. That keeps the plan's
forward-only commit model intact — no
rewrite of the earlier extractor or re-extract commits, and no interactive
rebase — at the cost of the branch history showing an "extractor fidelity fix"
commit after the original extractor change. A squash-merged PR collapses that
distinction anyway; an unsquashed merge keeps an honest record of the fix. The
forward commit leaves `npm run lint && npm test && npm run build` green like
every other step.

Doing this *before* the standalone test-file and playbook steps means a fidelity
fix has minimal downstream churn — the 32–35 and 42–54 test files and all
playbooks are still downstream, so only the 23/24/25 test files (rewritten in the
re-extract step) can need re-aligning, and only when the bug lands in one of
those three tabs. The later playbook walk (R11) validates engine *behavior*; it
cannot replace this diff, because playbooks are derived from the modules and so
cannot catch a faithfully-wrong extraction.

---

### Remove the now-unreferenced `sawIntenseFire` stub

**Summary**: After the re-extract, the regenerated tab-34 module no longer
references `sawIntenseFire` (its 2026-05-22 sheet uses `triedAllVegetations`
instead — per Q2). No rule-set references `sawIntenseFire`, so the stub is dead
code and is removed (R7a). This is a separate, post-extract commit because the
stub cannot be removed until the re-extract has dropped the last reference to it.

**Files affected**:
- `src/hazbot/wildfire/factor-variable-stubs.ts` — delete the `sawIntenseFire`
  export.
- `src/hazbot/wildfire/factor-variables.ts` — drop `sawIntenseFire` from the
  import and from the `factorVariables` map.
- `src/hazbot/wildfire/factor-variables.test.ts` — delete the
  `sawIntenseFire (stub)` describe block.

**Estimated diff size**: ~20 lines removed.

After this step, `factor-variable-stubs.ts` holds exactly one export
(`usedHelitack`); `sim-props.ts` holds two stubs (`SparksAtTopAndBottom`,
`Helitack`). Confirm with `grep -rn "sawIntenseFire" src/` that no reference
remains (the only matches before this step are the stub file, the bridge map,
and the test). `npm test` stays green: the regenerated `34.ts` does not import
or reference the symbol.

---

### Add per-rule-set test files for 32, 33, 34, 35

**Summary**: Tabs `32, 33, 34, 35` have regenerated modules but no test files.
Add one Jest file per tab (R8, R9), modeled on `23.test.ts` / `25.test.ts`.
Pure additions — no existing test changes — so the commit stays green.

**Files affected**:
- `src/hazbot/rule-sets/32.test.ts, 33.test.ts, 34.test.ts, 35.test.ts` — new.

**Estimated diff size**: ~400 lines (4 files).

<a id="per-rule-set-test-file-structure"></a>
**Per-rule-set test file structure (applies to the 23/24/25 rewrites and to
both test-file steps).** Each file imports the rule-set module and the
`test-helpers.ts` harness (`makeWildfireEngine`, `matchAgainst`, `mkReading`)
and contains:

1. **The behavior sweep** — the structural model from `23.test.ts` /
   `25.test.ts`:
   - **(a) empty state** — no readings.
   - **(b) a single matching category**.
   - **(c) multiple-true → highest-wins** — where the rule-set has no genuine
     multi-true state (mutually exclusive categories), (c) verifies the highest
     single-true category instead.
   - **(d) stability** — once a category matches, a later reading leaves it
     matched. Note: wildfire factor variables are cumulative (a witness never
     leaves the `simulationStartedReadings` filtered set), so no readings
     sequence drives a matched category's expression true→false — shape (d)
     therefore verifies match-*stability* across a later benign reading, not the
     engine's monotonic floor in isolation. The worked `42.test.ts` (d) case
     reflects this (its `setAnyVar` witness persists, so cat 2 genuinely keeps
     matching).
   - **(e) a stub-gated shape** — *only* where the rule-set has a stub-gated
     category (tab 25 Cat 6, tab 45 Cat 4); asserts the fully-satisfying state
     still never matches the gated category. N/A otherwise.
2. **The R9 per-category block** — a `describe("R9 — per-category coverage")`
   with one `it` per **reachable** category, asserting it is the matched
   category for a representative readings sequence. **Stub-gated** categories
   are excluded and documented in a file comment; **config-gated** categories
   are *not* excluded (a Jest test builds readings directly, bypassing LARA
   config — per R9).
3. A header comment listing the categories and any stub-gated / stub-degraded
   notes.

A rule-set whose categories reference a `set*` factor variable **or** a
`defaults`-consuming sim-prop (`DefaultVars`, `DefaultVegetations`) **must** pass
`defaults` to `makeWildfireEngine` — see the caution in `test-helpers.ts`. That
covers `23, 24, 32, 33, 34, 35, 42` (`set*` factor variables), `45` and `47`
(`DefaultVars`), and `54` (`DefaultVegetations`). `DefaultVars` /
`DefaultVegetations` `evaluate(reading, defaults)` and fail closed (`return
false`) when `defaults` is absent, so omitting it silently misclassifies every
category gated on them — the same trap the `test-helpers.ts` caution describes,
via a sim-prop rather than a `set*` factor variable. Only a rule-set using
*purely* spark / graph props and no `defaults`-consuming impl (e.g. tab 25) may
omit `defaults`.

**Worked example — `42.test.ts`** (tab 42 uses only already-implemented factor
variables; its categories after the `id >= 100` filter are `1: NOT
ranSimulation`, `2: setAnyVar`, `3: ranSimulation AND NOT setAnyVar`):

```ts
import { ruleSet42 } from "./42";
import { makeWildfireEngine, matchAgainst, mkReading } from "./test-helpers";
import { WildfireReading } from "../wildfire/types";

// Tab 42 categories (the feedback-mechanism Cat 100 is dropped by the extractor):
//   1: NOT ranSimulation
//   2: setAnyVar
//   3: ranSimulation AND NOT setAnyVar
// No stub-gated category — the (e) shape is N/A.

const defaultZones = [
  { terrainType: "Plains", vegetation: "Shrub", droughtLevel: "Mild Drought" },
  { terrainType: "Plains", vegetation: "Shrub", droughtLevel: "Mild Drought" },
];
const defaults = { zones: defaultZones, wind: { speed: 0, direction: 0 } };

function startReading(opts: Partial<WildfireReading> = {}): WildfireReading {
  return mkReading("SimulationStarted", opts.at ?? 100, {
    zones: defaultZones, sparks: [], wind: { speed: 0, direction: 0 }, ...opts,
  });
}

describe("ruleSet 42 — per-rule-set behavior sweep", () => {
  it("(a) empty readings → cat 1 (NOT ranSimulation)", () => {
    const e = makeWildfireEngine(ruleSet42, defaults);
    expect(matchAgainst(ruleSet42, e, [])).toBe(1);
  });
  it("(b) ran sim, changed wind → cat 2 (setAnyVar)", () => {
    const e = makeWildfireEngine(ruleSet42, defaults);
    expect(matchAgainst(ruleSet42, e, [startReading({ wind: { speed: 9, direction: 90 } })])).toBe(2);
  });
  it("(c) highest single-true — ran sim with no changes → cat 3", () => {
    const e = makeWildfireEngine(ruleSet42, defaults);
    expect(matchAgainst(ruleSet42, e, [startReading()])).toBe(3);
  });
  it("(d) stability — cat 2 holds across a later all-default run", () => {
    const e = makeWildfireEngine(ruleSet42, defaults);
    const r0 = startReading({ wind: { speed: 9, direction: 90 } });
    expect(matchAgainst(ruleSet42, e, [r0])).toBe(2);
    expect(matchAgainst(ruleSet42, e, [r0, startReading({ at: 200 })])).toBe(2);
  });
});

describe("ruleSet 42 — R9 per-category coverage", () => {
  const e = () => makeWildfireEngine(ruleSet42, defaults);
  it("cat 1 — no run", () => expect(matchAgainst(ruleSet42, e(), [])).toBe(1));
  it("cat 2 — ran with a changed variable", () =>
    expect(matchAgainst(ruleSet42, e(), [startReading({ wind: { speed: 9, direction: 90 } })])).toBe(2));
  it("cat 3 — ran with no changes", () =>
    expect(matchAgainst(ruleSet42, e(), [startReading()])).toBe(3));
});
```

The other test files follow this shape; their fixtures are derived from each
regenerated module's category expressions. Tab 34's R9 block must construct a
readings sequence whose zone vegetation, across runs, covers all four
`Vegetation` values so `triedAllVegetations` is exercised.

---

### Add per-rule-set test files for 42, 45, 47, 54

**Summary**: Add Jest files for the four new-tab modules (R8, R9), same
structure as the 32–35 test step. Pure additions plus one comment-only edit —
commit stays green.

**Files affected**:
- `src/hazbot/rule-sets/42.test.ts, 45.test.ts, 47.test.ts, 54.test.ts` — new.
- `src/hazbot/rule-sets/test-helpers.ts` — refresh the stale `makeWildfireEngine`
  defaults-passing caution comment (comment-only; see below).

**Estimated diff size**: ~400 lines (4 files) + a ~6-line comment edit.

These files follow the [per-rule-set test file
structure](#per-rule-set-test-file-structure). Stub-affected categories get
explicit handling:

- **`45.test.ts`** — Cat 4 is **stub-gated** (`… AND Helitack`): include the
  (e) shape asserting a fully-satisfying state never matches Cat 4. Cat 3 is
  **stub-degraded** (`NOT (usedFireline AND usedHelitack)` → `NOT (… AND
  false)` = always true): its R9 assertion verifies Cat 3 is the matched
  category for a representative *reachable* sequence (a plain run); the
  stub-induced over-match (a fireline+helitack run also landing at Cat 3) is
  recorded in the file header comment, with a `WM-28` reference, **not**
  asserted as a test.
- **`47.test.ts` / `54.test.ts`** — Cat 3 is **stub-degraded** (`NOT (Fireline
  OR Helitack)` → `NOT Fireline`) and the helitack arm of Cat 4/5 is dead. R9
  asserts each fireline-reachable category for a representative reachable
  sequence; the stub-induced over-match (a helitack-only run landing at Cat 3)
  and the dead helitack arm are recorded in the file header comment with a
  `WM-28` reference, not asserted.
- **`42.test.ts`** — no stubs (worked example in the 32–35 test step).

The (a)–(d) sweep still runs for every tab; only the per-category R9 assertions
for **stub-gated** categories are omitted (and documented). Stub-degradation is
documentation-only — recorded in a header comment, not pinned by a test —
consistent with requirements.md R9 ("documented as such in the file"); WM-28
owns re-validating tabs 45/47/54 once helitack detection lands.

**Refresh the `test-helpers.ts` `makeWildfireEngine` caution (per QA-5).** The
comment above `makeWildfireEngine` still enumerates the pre-WM-18
must-pass-`defaults` set ("23, 24, 32–35") and describes only the
`set*`-factor-variable throw-and-catch failure path. Update it to match the
[per-rule-set test file structure](#per-rule-set-test-file-structure) rule: the
must-pass set is any rule-set referencing a `set*` factor variable **or** a
`defaults`-consuming sim-prop (`DefaultVars` / `DefaultVegetations`) — i.e.
`23, 24, 32–35, 42, 45, 47, 54` — and a rule-set built without `defaults`
misclassifies either way (a `set*` variable throws and is caught to `false`; a
`defaults`-consuming sim-prop hits its `if (!defaults…) return false` guard).
Comment-only edit — no behavior change, commit stays green.

---

### Regenerate the validation playbooks

**Summary**: Regenerate the per-rule-set validation playbooks for all 11
rule-sets (R10).

**Files affected**:
- `docs/hazbot-validation/23.md … 54.md` — regenerated / new (generated).

**Estimated diff size**: generated content.

**The command**:

```bash
node scripts/generate-hazbot-validation-playbook.js
```

This reads the rule-set modules and emits one playbook per rule-set. After
this step, `docs/hazbot-validation/` has playbooks `23, 24, 25, 32, 33, 34, 35,
42, 45, 47, 54` (the first seven regenerated, four new). Committed exactly as
emitted — `docs/hazbot-validation/*.md` are auto-generated and not hand-edited
(the one hand-maintained file in that directory, `localhost-urls.md`, is
updated in the housekeeping step).

---

### Housekeeping — version bump, TBD.md, localhost-urls.md

**Summary**: Bump `APP_RULES_VERSION` (R13), update `TBD.md` to the post-WM-18
state (R14), and refresh `localhost-urls.md` (R12).

**Files affected**:
- `src/hazbot/wildfire/rules-version.ts` — `APP_RULES_VERSION` `1 → 2`.
- `src/hazbot/TBD.md` — §3 resolved, §2 stub set refreshed, §4 updated.
- `docs/hazbot-validation/localhost-urls.md` — tables + regen snippet updated.

**Estimated diff size**: ~60 lines.

**`rules-version.ts` (R13)** — a one-line change:

```ts
// before
export const APP_RULES_VERSION = 1;
// after
export const APP_RULES_VERSION = 2;
```

`rules-version.test.ts` asserts only that the constant is a positive integer,
so it still passes. `APP_RULES_VERSION` is consumed only by the dev sidebar's
version display (verified — it gates no persisted or cached state), so the bump
is inert beyond the displayed value.

**`TBD.md` (R14)**:
- **§3 "Missing rule-sets entirely"** — resolved: all four tabs now have
  modules. Replace the section body with a one-line note that WM-18 extracted
  tabs `42/45/47/54` and they are now loadable.
- **§2 "Stubbed factor variables / sim-props"** — remove the `sawIntenseFire`
  subsection; keep `SparksAtTopAndBottom` (→ WM-15); add a `Helitack` /
  `usedHelitack` subsection (→ WM-28) describing the run-window-detection gap
  and the stub-gated / stub-degraded effect on tabs 45/47/54.
- **§4** — drop the `sawIntenseFire` casing/`outcome` note (the feature is no
  longer referenced by any rule-set per Q2).

**`localhost-urls.md` (R12)**:
- Move the `45 / 47 / 54` rows from the "Placeholder tabs" table to the
  "Loadable rulesets" table, with `[<id>.md](<id>.md)` validation-doc links and
  `&hazbotRules=<id>` appended to each URL.
- The "Placeholder tabs" table currently lists a stale `43` row (no tab `43`
  exists in the workbook). Correct it to `42` *as part of the move* — there is
  no `42` row to relocate as-is — then move that `42` row to "Loadable" too.
  After this step the "Placeholder tabs" table is empty; either drop the
  section or note "(none — all tabs extracted as of WM-18)".
- In the "Regenerating this doc" embedded script, change `const EXCLUDED =
  new Set(["43", "45", "47", "54"])` to `new Set([])`, and update the line
  below it that says the set "must match `EXCLUDED_TABS`".
- In "Common gotchas", update the stubbed-sim-prop bullet: `SparksAtTopAndBottom
  and sawIntenseFire` → `SparksAtTopAndBottom and Helitack` (`sawIntenseFire`
  no longer exists; `Helitack` is the new stub).
- The "Current validation status" table is left for the playbook-walk step to
  refresh once the walk is done (this step only does the structural table moves).

---

### Validate — playbook walk

**Summary**: Walk every regenerated/new playbook against a running dev server
with the Hazbot sidebar (R11), and record the per-rule-set result in
`localhost-urls.md`. Verification work, not a code diff — but it is a hard
closure gate (Q5). Module↔sheet fidelity (R11a) was already checked in the
fidelity-diff step.

**Files affected**:
- `docs/hazbot-validation/localhost-urls.md` — "Current validation status"
  table refreshed with the per-rule-set walk result.

**Estimated diff size**: ~30 lines of doc edits (status table).

With `npm start` running, for each rule-set walk its playbook using that tab's
URL from `localhost-urls.md` (each URL encodes the real LARA per-page config —
reachability is judged against it, not CLAUDE.md's single example). Use the
`window.test.*` helpers and the Hazbot sidebar per the CLAUDE.md "Playwright MCP
testing" section. Confirm each **reachable** category becomes the active
category. For tabs 45/47/54 the walk covers the *fire-line* progression path
(functional); helitack-dependent behavior is not walked (deferred to WM-28).
The generated `45/47/54.md` playbooks still contain steps for the
helitack-gated category (tab 45 Cat 4) and the helitack arms of tabs 47/54 Cat
4–5 — those steps instruct a helitack action (e.g.
`window.test.placeHelitackInZone(...)`). When the walk reaches one, **skip the
helitack action — do not execute it, and do not count it as a walk failure**:
the `Helitack` / `usedHelitack` stubs evaluate `false`, so no helitack step can
flip its target category. Annotate the skipped step in the walk notes as
"stub-gated — WM-28" and continue down the fire-line path. Stub-gated (tab 25
Cat 6, tab 45 Cat 4) and stub-degraded (tabs 47/54 Cat 3–5, tab 45 Cat 3)
categories are recorded **as such** in the status table — stub-gated /
stub-degraded / unreached, not failed — so a skipped-helitack walk reads as
complete rather than incomplete.

Refresh the "Current validation status" table in `localhost-urls.md` with
per-rule-set results, dated, noting stub-gated / stub-degraded / unreached
categories.

---

### Closeout — final gate and Jira comments

**Summary**: Run the full quality gate (R15) and perform the requirements.md
"Closeout actions" — the WM-18 and WM-28 Jira comments.

**Files affected**: none (verification + Jira).

**Estimated diff size**: n/a (verification step).

**R15 — quality gate.** Confirm all three pass on the final branch state:

```bash
npm run lint && npm test && npm run build
```

**Post-implementation findings** (recorded here for trace; also captured in
requirements.md "Post-implementation findings"):
- The "Re-extract" step's "Files affected" did not list
  `src/hazbot/wildfire/__fixtures__/expected.json`. The ruleset-25 replay
  fixture is a generated regression artifact downstream of the rule-set
  modules; regenerating modules 23–35 invalidated `matchedCategoryHistory`,
  so `node scripts/generate-replay-fixture.js` was run as part of the
  re-extract step and the regenerated fixture was committed alongside the
  modules. R15 (`npm test` green) requires it.
- Tab 25 cat 5 **and** cat 6 are stub-gated (not only cat 6 as this spec
  consistently names). The 2026-05-22 sheet places `SparksAtTopAndBottom` in
  a top-level AND of both cats' `WITH` prop-expressions; `25.test.ts`
  reflects this. The (e) shape in this plan's per-rule-set test file
  structure section names "tab 25 Cat 6" and "tab 45 Cat 4" as the canonical
  stub-gated examples — tab 25's set is now {Cat 5, Cat 6}.
- Tab 35 Cat 2 is unreachable (shadowed by Cat 3 — sheet authoring
  inconsistency). Faithful extraction; flagged per R11a / Out of Scope in
  [src/hazbot/TBD.md §4](../../src/hazbot/TBD.md). `35.test.ts` documents
  the shadowing and excludes Cat 2 from R9.

**Closeout actions** (from requirements.md "Closeout actions"; the
`filreLineMarkers` sheet-typo flag is already done — corrected in the workbook
before the re-extract step):
- **WM-18 comment** — post a summary comment recording the scope changes this
  spec made: the `sawIntenseFire` premise dropped (WM-19 closed), `Helitack` /
  `usedHelitack` → WM-28, `SparksAtTopAndBottom` → WM-15, the category-100
  extractor filter.
- **WM-28 comment** — post a comment on WM-28 (or extend its description)
  recording that its acceptance criteria include re-validating the
  helitack-dependent categories of tabs 45/47/54.

## Requirements coverage

| Requirement | Step(s) |
|-------------|---------|
| R1 — empty `EXCLUDED_TABS` | Extend the extractor |
| R1a — drop `id >= 100` + misnumbering warning | Extend the extractor |
| R1b — extractor changes covered by `extract-impl.test.js` | Extend the extractor |
| R2 — clean deterministic re-extract | Re-extract all 11 modules (verified there) |
| R2a — no per-rule-set `defaults` field | Extend the extractor (verify-only — already done by WM-27); Re-extract (diff confirms) |
| R3 — new modules 42/45/47/54; 23–35 regenerated | Re-extract all 11 modules |
| R4 — `index.ts` exports all 11 | Re-extract all 11 modules |
| R5 — every referenced impl backed or stubbed | Implement the 8 impls + 2 stubs; Re-extract (`index.test.ts` load gate) |
| R6 — 8 in-scope impls with unit tests | Implement the 8 impls + 2 stubs |
| R6a — `fireLineMarkers` substrate + `Fireline`/`usedFireline` test shape | Add `fireLineMarkers` to the bridge (substrate); Implement the 8 impls + 2 stubs (test shape) |
| R7 — `Helitack` / `usedHelitack` stubbed + ticketed | Implement the 8 impls + 2 stubs |
| R7a — remove the `sawIntenseFire` stub | Remove the `sawIntenseFire` stub |
| R8 — per-rule-set behavior-sweep test files | Re-extract (23/24/25 rewrite); test files 32–35; test files 42–54 |
| R9 — per-category coverage in each test file | Re-extract (23/24/25 rewrite); test files 32–35; test files 42–54 |
| R10 — regenerate validation playbooks | Regenerate the validation playbooks |
| R11 — playbook walk of each reachable category | Validate — playbook walk |
| R11a — module↔sheet fidelity diff | Verify extraction fidelity |
| R12 — refresh `localhost-urls.md` | Housekeeping; Validate — playbook walk (status table) |
| R13 — bump `APP_RULES_VERSION` | Housekeeping |
| R14 — update `TBD.md` | Housekeeping |
| R15 — lint / test / build pass | Closeout |

## Open Questions

<!-- Implementation-focused questions only. Requirements questions go in
     requirements.md. -->

### RESOLVED: IQ1 — Commit granularity for the re-extract and the per-rule-set test files

**Context**: The re-extract regenerates 11 modules at once and changes the
behavior of `23/24/25`, whose existing test files would then fail `npm test`.
There are also 11 per-rule-set test files to produce (3 rewritten, 8 new),
totalling ~1000–1400 hand-written lines — well over the ~500-line per-commit
guideline if done as one commit. This plan currently assumes: (i) the re-extract
step carries the regenerate **plus** the `23/24/25` test rewrites in one commit,
so every commit stays green; and (ii) the 8 new test files are split into two
commits — `32/33/34/35` and `42/45/47/54`.

**Options considered**:
- A) **As planned** — re-extract step = regenerate + rewrite `23/24/25` tests
  (green); then a `32–35` test commit; then a `42–54` test commit. Three
  commits, each green, each reviewable. The re-extract commit is large but
  mostly *generated* content; the hand-written part (3 test files) is ~300 lines.
- B) Re-extract step = regenerate **only** (leaves `npm test` red for `23/24/25`
  until the next commit); a single following commit rewrites/adds all 11 test
  files. Cleaner separation of generated vs. hand-written, but one commit is
  knowingly red and the test commit is ~1000+ lines.
- C) One commit per rule-set — regenerate that module + its test file together,
  11 commits. Every commit green and small, but the regenerate is run once and
  produces all 11 modules at once, so this means staging modules one at a time
  out of a single extractor run — awkward, and `index.ts` (all 11 exports)
  cannot be split.

**Decision**: **A.** Three commits, each green and independently reviewable:
the re-extract step carries the regenerate plus the `23/24/25` test rewrites;
the 32–35 test step and the 42–54 test step carry their respective new files.
Every commit leaves `npm test` green, and the 32–35 / 42–54 batches stay
reviewable as focused units. This plan is already written for A — no step
changes needed.

### RESOLVED: IQ2 — R2a is already satisfied by WM-27; confirm the verify-only treatment

**Context**: requirements.md Background and R2a state that WM-18 "owns
reconciling the modules so a re-extract is once again clean" — the premise being
that the extractor still emits a per-rule-set `defaults` field that drifted from
the hand-edited modules. Codebase inspection shows this is **already done**:
WM-27 commit `6334af7` (`refactor(hazbot): retire sheet-based defaults
extraction from extract-impl.js`) removed the `defaults` emission, `emitTabModule`
emits only `id` / `categories` / `factorVariables`, and `extract-impl.test.js`
already asserts `not.toMatch(/defaults:/)`. So R2a needs no extractor code
change — only the re-extract step's `git diff` confirmation that the regenerate
is structurally clean.

**Options considered**:
- A) Treat R2a as **verify-only** — no extractor change; the re-extract step's
  diff is the confirmation; R1b's `defaults`-omission coverage is the
  already-present `extract-impl.test.js` assertion. (This plan is written for A.)
- B) Something in the modules still drifts (not the `defaults` field) and R2a
  has real reconciliation work — if so, identify what, so a step can own it.

**Decision**: **A.** R2a is treated as **verify-only** — no extractor code
change. WM-27 commit `6334af7` already retired the `defaults` emission;
`emitTabModule` emits only `id` / `categories` / `factorVariables`; and
`extract-impl.test.js` already asserts `not.toMatch(/defaults:/)`. The
re-extract step's `git diff` of the regenerated `23–35` modules is the empirical
confirmation that the regenerate is structurally clean. requirements.md
Background and R2a still *describe* a drift that WM-27 has since eliminated — a
stale-wording issue on the requirements side, flagged for the Phase 3
cross-reference review (it does not change any implementation step).

## Self-Review

<!-- Phase 3 multi-perspective review of implementation.md (with requirements.md
     as context). Roles: Senior Engineer, QA Engineer, Build/Release Engineer,
     Curriculum/Content Author. Issues processed one at a time with the spec
     author; OPEN → RESOLVED as each is addressed.
     Round 2 re-run: no new substantive issues; one minor wording tweak applied
     to the fidelity-diff step's extractor-bug contingency. Review converged.
     Round 3 re-run (2026-05-22, user-requested): 5 new OPEN issues (SE-2, QA-3,
     QA-4, BR-2, CA-3) found against the post-round-2 spec, grounded against the
     wildfire-bridge source; all 5 resolved. Round 3 re-run against the resolved
     spec found no new implementation.md issues — review converged. Two
     requirements-side wording follow-ups surfaced (R6a's "sequence" phrasing,
     R8's "monotonicity" shape name) are flagged in the SE-2 / QA-4 resolutions
     for a separate requirements.md pass.
     Round 4 re-run (2026-05-22, user-requested): 6 new OPEN issues (SE-3, QA-5,
     QA-6, QA-7, BR-3, CA-4) found against the post-round-3 spec, grounded
     against the wildfire-bridge source and src/types.ts; all 6 resolved.
     Round 5 re-run (2026-05-22) against the post-round-4 spec found no new
     implementation.md issues — review converged. One requirements-side wording
     follow-up surfaced (R6 Technical Note's "CorrectZoneSetup … constants"
     phrasing) is flagged in the CA-4 resolution for a separate requirements.md
     pass.
     Round 6 re-run (2026-05-22, user-requested): 3 new OPEN issues (SE-4, QA-8,
     CA-5) found against the post-round-5 spec, grounded against the engine
     substrate (engine.ts / types.ts) and the wildfire bridge. Build/Release
     Engineer re-reviewed — no new issues.
     Round 7 re-run (2026-05-22, user-requested): 3 new OPEN issues (BR-4, QA-9,
     CA-6) found against the post-round-6 spec, grounded against the wildfire
     bridge (sim-props.ts / factor-variables.ts), the extractor (extract-impl.js),
     and the rule-set modules. Senior Engineer re-reviewed the impl snippets
     against the bridge source — no new issues. -->

### Senior Engineer

#### RESOLVED: SE-1 — The new-impls step omits the R6a-mandated multi-`SimulationStarted` test for `Fireline` / `usedFireline`

*Resolution*: Upheld. The new-impls step's unit-tests section gains a sentence
requiring the `Fireline` / `usedFireline` tests to exercise a
multi-`SimulationStarted` sequence (an early empty reading, a later populated
one) per R6a.


requirements.md **R6a** explicitly requires: "the `Fireline` / `usedFireline`
unit tests therefore exercise a multi-`SimulationStarted` sequence (an early
reading empty, a later reading populated), not a single synthetic reading" —
because the first `SimulationStarted` of a session always snapshots an empty
`fireLineMarkers` (the Fire Line tool is disabled until a run has started). The
new-impls step's test description called out the sheet-citing fixtures for
`CorrectZoneSetup` and `DefaultVars`, but said nothing about this R6a
constraint. An implementer following it as written would likely unit-test
`usedFireline` with a single synthetic reading carrying `fireLineMarkers`, which
passes but does not model the real run-boundary mechanic R6a is built around.
Suggested resolution: add a sentence to the new-impls step's test section
requiring the `Fireline` / `usedFireline` tests to exercise a
multi-`SimulationStarted` sequence per R6a.

---

#### RESOLVED: SE-2 — The `Fireline` / `usedFireline` test instruction prescribes a "multi-`SimulationStarted` sequence," but `Fireline` is a sim-prop evaluated against a single reading

*Resolution*: Upheld. The new-impls step's `Fireline` / `usedFireline` test
paragraph is split by impl kind — `usedFireline` (factor variable,
`compute(readings)`) gets the multi-`SimulationStarted` sequence fixture;
`Fireline` (sim-prop, `evaluate(reading)`) gets two single-reading `evaluate`
cases (empty `fireLineMarkers` → `false`, `>= 2` markers → `true`). A
parenthetical notes that requirements.md R6a carries the same conflation and is
flagged for a matching requirements-side wording tweak.


The new-impls step's unit-test section (the SE-1 resolution, echoing
requirements.md R6a) says: "The `Fireline` / `usedFireline` tests exercise a
multi-`SimulationStarted` sequence per R6a — an early reading with empty
`fireLineMarkers` and a later reading with `>= 2` markers — rather than a single
synthetic reading."

That instruction is coherent for `usedFireline` but not for `Fireline`.
`usedFireline` is a **factor variable** — its `compute(readings)` takes the
whole readings array, so a multi-`SimulationStarted` sequence is exactly the
right fixture. `Fireline` is a **sim-prop** — `SimPropImpl.evaluate(reading,
defaults)` takes a *single* reading, the one witness reading a `WITH` clause
binds to (verified against `src/hazbot/wildfire/sim-props.ts`: every sim-prop,
incl. the impl's own `Fireline`, is `evaluate: (reading) => …`, and the existing
`OneSparkPerZone` / `UniqueVegetationPerZone` sim-prop tests assert against one
reading at a time). There is no "sequence" to hand a sim-prop, so "rather than a
single synthetic reading" is literally unsatisfiable for `Fireline`.

Why it matters: an implementer following step 4 verbatim is told to write a
sequence-based test for a per-reading predicate. The intent — covering the
verified mechanic that the first run's snapshot is always empty — is satisfied
for `Fireline` simply by two single-reading `evaluate` cases: an
empty-`fireLineMarkers` reading → `false`, a `>= 2`-marker reading → `true`. The
sequence framing belongs only to `usedFireline`.

Suggested resolution: split the instruction in the new-impls step — `usedFireline`
(factor variable) gets the multi-`SimulationStarted` sequence fixture; `Fireline`
(sim-prop) gets two single-reading `evaluate` cases (empty → false, populated →
true). requirements.md R6a carries the same conflation ("the `Fireline` /
`usedFireline` unit tests therefore exercise a multi-`SimulationStarted`
sequence") and could be tightened the same way.

---

#### RESOLVED: SE-3 — `DefaultVars` is missing the `zones.length === 0` fail-closed guard that every sibling zone-consuming sim-prop has

*Resolution*: Upheld. The new-impls step's `DefaultVars` guard is changed to
`if (!zones || zones.length === 0 || !defaultZones || !reading.wind ||
!defaults?.wind) return false;` — the empty-`zones` case now fails closed,
matching `UniformZoneSettings` / `DefaultVegetations` / `SevereDroughts` and the
fail-closed convention the plan applies everywhere else.


The new-impls step's `DefaultVars` opens with:

```ts
const zones = reading.zones;
const defaultZones = defaults?.zones;
if (!zones || !defaultZones || !reading.wind || !defaults?.wind) return false;
const zonesAtDefault = zones.every((z, i) => { ... });
```

The guard rejects a missing (`undefined`) `zones`, but not an *empty* `zones: []`
array — `[]` is truthy, so `!zones` is `false`. `[].every(...)` returns `true`
vacuously, so `zonesAtDefault` is `true` for a zoneless reading and `DefaultVars`
then returns whatever the wind check yields — it can return `true` for a reading
with no zones at all.

Every other zone-consuming sim-prop in the same step guards `zones.length === 0`
explicitly: `UniformZoneSettings` (`if (!zones || zones.length === 0) return
false;`), `DefaultVegetations` (`if (!zones || !defaultZones || zones.length ===
0) return false;`), `SevereDroughts` (`if (!zones || zones.length === 0) return
false;`) — as do the pre-existing `UniformDroughtLevels` / `UniformTerrainTypes`
/ `UniqueVegetationPerZone` in `sim-props.ts`. `DefaultVars` is the lone
exception, and its own sibling `UniformZoneSettings` carries the comment "Fail
closed on undefined — symmetric with the Uniform* props already here," so the
convention is explicit and `DefaultVars` silently departs from it.

Why it matters: benign in practice — a real `SimulationStarted` payload always
carries ≥1 zone — but it is an unguarded `true` return on a degenerate input,
inconsistent with the fail-closed discipline the plan applies everywhere else,
and exactly the asymmetry a future reader will (rightly) suspect is a bug.
(`DefaultVars` originally had no `zones.length !== defaultZones.length` guard
either: a too-long `reading.zones` failed closed via `defaultZones[i] ===
undefined`, but a too-*short* `reading.zones` — reachable because
`deriveWildfireDefaults()` emits one entry per populated `config.zones` slot
independent of `zonesCount` — was silently accepted. External-review item ER-1
later added that length guard to both `DefaultVars` and `DefaultVegetations`;
this SE-3 resolution covers only the empty-`zones` case.)

Suggested resolution: add `zones.length === 0` to `DefaultVars`'s opening guard
— `if (!zones || zones.length === 0 || !defaultZones || !reading.wind ||
!defaults?.wind) return false;` — matching `UniformZoneSettings` /
`DefaultVegetations` / `SevereDroughts`.

---

#### RESOLVED: SE-4 — The R5 `index.test.ts` gate reads `engine.errors`, but the engine's asymmetric construction-error model throws `EngineConstructionError` for the temporal-error variants

*Resolution*: Partially upheld — a real gap against the gate's stated "durable
regression guard for future re-extractions" purpose, though no WM-18 rule-set can
trigger a temporal throw. The re-extract step's `index.test.ts` description now
states the engine's asymmetric construction-error model and requires the test to
wrap each engine construction in `try` / `catch`, folding a caught
`EngineConstructionError`'s `.errors` into the inspected set so a temporal
misconfiguration is reported by kind and rule-set id rather than as an uncaught
throw. One-sentence addition to the QA-6 paragraph; no scope change.


The QA-6 resolution adds `src/hazbot/rule-sets/index.test.ts` as the explicit R5
gate: it "constructs the engine for every entry of the regenerated `ruleSets`
record and asserts the engine's collected load errors are exactly — zero
`missing-impl`, zero `parse-error`, and the three expected `stub-warning`s." That
description treats every load error as reachable from one place — a constructed
engine's `errors` array.

It is not. `src/hazbot/engine/engine.ts` documents (the "Asymmetric
construction-error model (deliberate)" comment, lines 138–147) two delivery
paths: `missing-impl` and `parse-error` are pushed to `this.errors` and the
engine still constructs successfully (an inert-but-live engine, gated by
`isActive`); the *temporal* error variants — `temporal-validation`,
`trigger-state-change-overlap`, `temporal-initial-values-mismatch` — instead
**throw `EngineConstructionError`** from the constructor, so no engine instance
is returned at all.

For the three error kinds `index.test.ts` actually asserts on (`missing-impl`,
`parse-error`, `stub-warning`), reading `engine.errors` is correct — they are
non-throwing — so for WM-18's own 11 rule-sets the gate works as written. The
gap is the gate's *stated durable purpose*: QA-6 calls `index.test.ts` "a
durable regression guard for future re-extractions." A future re-extraction
that produces a rule-set with a `trigger-state-change-overlap` — e.g. a
factor-variable `logEvents` entry colliding with the `chartTabOpen` temporal
variable's `acceptedEvents`, the exact collision class the requirements.md
Helitack Technical Note calls out for a `helitackUsed` temporal variable — would
make `makeWildfireEngine` *throw*. An `index.test.ts` written literally to the
QA-6 description (a loop of `const e = makeWildfireEngine(rs); collect(e.errors)`)
crashes with an uncaught `EngineConstructionError` instead of the clean, by-name
assertion failure QA-6 promises ("fails loudly and by name").

Why it matters: the gate still goes red on a throw, so it is not silently
broken — but QA-6 introduced `index.test.ts` specifically so a load regression
"fails loudly and by name rather than [...] as an opaque [...] mismatch." A bare
uncaught `EngineConstructionError` is exactly the opaque failure it set out to
replace, for one whole class of load error — and the temporal class is a real,
documented engine reject mode, not a hypothetical.

Suggested resolution: have the re-extract step's `index.test.ts` description
note the asymmetric model — wrap each `makeWildfireEngine` construction in a
`try`/`catch`, and on a caught `EngineConstructionError` fold its `.errors` into
the inspected error set, so a temporal misconfiguration is reported by kind and
rule-set id like the non-throwing variants. One sentence in the QA-6 paragraph
covers it.

---

### QA Engineer

#### RESOLVED: QA-1 — The extractor step's misnumbering-warning test covers only one of the two directions R1a describes

*Resolution*: Upheld. The extractor step's `extract-impl.test.js` block gains a
second case covering the `id < 100` + `-- no pseudo code --` misnumbering
direction; the existing case is relabelled to name the `id >= 100` direction it
covers.


R1a's misnumbering warning fires in two cases: "a feedback row misnumbered below
100, or a sim-use category misnumbered at/above 100." The extractor step's
proposed `extract-impl.test.js` case (`[100, "Ran it", …, "ranSimulation"]`)
covered only the second — a sim-use expression numbered `>= 100`. The first
direction — a row with `id < 100` whose pseudocode cell *is* `-- no pseudo
code --` — had no test. R1b requires the extractor changes to be covered; a
one-directional test half-covers the warning. Suggested resolution: add a second
case to the extractor step exercising the `id < 100` + `-- no pseudo code --`
direction.

---

#### RESOLVED: QA-2 — The 42–54 test step's R9 handling of stub-degraded categories is vague, and the plan does not decide whether the degradation is pinned by a test

*Resolution*: Upheld. The 42–54 test step's tab-45 and tab-47/54 bullets are
reworded — a stub-degraded category's R9 assertion verifies it is matched for a
representative *reachable* sequence; the stub-induced over-match is recorded in
the file header comment (with a `WM-28` reference), **not** pinned by a test.
This stays consistent with requirements.md R9 ("documented as such in the
file"). A behavior-pinning test was considered and declined — it would encode
known-wrong behavior as a green test.


The 42–54 test step said, for tab 45's stub-degraded Cat 3, "the R9 assertion
for the reachable categories accounts for the over-match." What "accounts for"
meant was unclear: R9 asserts a category is the matched category for *a*
representative readings sequence — for a stub-degraded category that is simply a
plain reachable sequence, and the over-match (a different sub-population also
landing there) is not something an R9 assertion expresses. Separately, the plan
never decided whether the *known* stub-degradation (e.g. a helitack-only run
mis-landing at tab 47/54 Cat 3) gets an explicit test that pins the current
behavior — such a test would fail loudly when WM-28 corrects it, which is
arguably desirable. Suggested resolution: reword so R9 for a stub-degraded
category just asserts it is matched for a representative reachable sequence
(degradation documented in the file header, not asserted); and decide explicitly
whether to add a behavior-pinning test for the stub-degradation.

---

#### RESOLVED: QA-3 — The `makeWildfireEngine` defaults-passing guidance omits the `defaults`-consuming sim-props, so tabs 45/47/54 are wrongly told they may omit `defaults`

*Resolution*: Upheld — the strongest finding of the round. The per-rule-set
test-file structure section's defaults-passing rule is restated to require
`defaults` for any rule-set referencing a `set*` factor variable **or** a
`defaults`-consuming sim-prop (`DefaultVars`, `DefaultVegetations`) — adding tabs
`45`, `47`, `54` to the must-pass set — and "fire-line props" is dropped from the
"may omit it" list, which now covers only purely spark/graph-prop rule-sets
(e.g. tab 25). The reworded text also states why (`DefaultVars` /
`DefaultVegetations` fail closed on absent `defaults`).


The per-rule-set test-file structure section says: "A `set*`-using rule-set
(`23, 24, 32, 33, 34, 35, 42`) **must** pass `defaults` to `makeWildfireEngine`
— see the caution in `test-helpers.ts`. Tabs that use only spark / graph /
fire-line props may omit it."

That frames the must-pass-`defaults` set as exactly the tabs using `set*`
*factor variables*. But two of the new sim-props consume the `defaults` argument
too: `DefaultVars` (`evaluate: (reading, defaults) => { … if (!defaultZones ||
!reading.wind || !defaults?.wind) return false; … }`, used by tabs 45/47) and
`DefaultVegetations` (`evaluate: (reading, defaults) => { … if (!defaultZones …)
return false; … }`, used by tab 54). A `45.test.ts` / `47.test.ts` /
`54.test.ts` built without `defaults` makes `DefaultVars` / `DefaultVegetations`
fall straight into their `!defaults` guard and return `false` — silently — for
every reading.

That is the exact failure mode the `test-helpers.ts` caution describes
("evaluates against `undefined` … silently misclassifying"), only via a sim-prop
rather than a `set*` factor variable. And the guidance actively points the wrong
way: tabs 45/47/54 use the `Fireline` sim-prop, so an implementer reads "tabs
that use only … fire-line props may omit it" and omits `defaults` — breaking
`DefaultVars` / `DefaultVegetations` and any category whose expression depends on
them. The R9 per-category assertions for those categories then test against
wrong behavior inside a green `npm test` run.

Why it matters: this is precisely the silent trap the `test-helpers.ts` caution
exists to prevent, and the guidance as written walks the implementer into it for
3 of the 11 tabs — the same `Fireline`/`DefaultVars`-bearing tabs the spec
already treats as delicate (stub-degradation, R6a timing).

Suggested resolution: restate the rule as "any rule-set referencing a `set*`
factor variable **or** a `defaults`-consuming sim-prop (`DefaultVars`,
`DefaultVegetations`) must pass `defaults`" — which adds tabs 45 and 47
(`DefaultVars`) and 54 (`DefaultVegetations`) to the must-pass set — and drop
"fire-line props" from the "may omit it" list.

---

#### RESOLVED: QA-4 — The worked `42.test.ts` (d) case is labeled "monotonicity" but does not exercise the engine's monotonic floor

*Resolution*: Upheld as a wording/accuracy fix (the softest finding of the
round — shape (d) is inherited from the `23.test.ts` model, so the imprecision
is partly pre-existing). The worked `42.test.ts` (d) case is relabelled
`"(d) stability — cat 2 holds across a later all-default run"`, and the
per-rule-set test-file structure section's shape-(d) bullet now states that
because wildfire factor variables are cumulative, (d) verifies match-stability
across a later benign reading, not the engine's monotonic floor in isolation. No
genuine floor test was added — no rule-set among the 11 admits a true→false
category transition, so the floor cannot be isolated; the spec is honest about
that rather than faking it. (requirements.md R8 still names this shape
"monotonicity"; the implementation.md shape-(d) bullet now explicitly ties the
"stability" realization back to R8's intent, so the two are reconciled — but R8's
shape name is flagged for an optional requirements-side tweak.)


The "Add per-rule-set test files for 32, 33, 34, 35" step gives `42.test.ts` as
the canonical worked example for all 11 test files. Its (d) case:

```ts
it("(d) monotonicity — cat 2 floor holds after a later all-default run", () => {
  const r0 = startReading({ wind: { speed: 9, direction: 90 } });
  expect(matchAgainst(ruleSet42, e, [r0])).toBe(2);
  expect(matchAgainst(ruleSet42, e, [r0, startReading({ at: 200 })])).toBe(2);
});
```

`setAnyVar` (cat 2's expression) aggregates over *all* readings —
`src/hazbot/wildfire/factor-variables.ts` computes it by filtering
`simulationStartedReadings(readings)`. `r0` stays in the list, so `setAnyVar` is
still genuinely `true` on the second call and cat 2 *genuinely matches*. The
engine's monotonic floor — "a category that *stopped* matching is still reported
because an earlier reading matched it" — is never engaged, because cat 2's
expression never goes false. The (d) assertion would pass identically against an
engine with no floor logic at all.

This matters because (d) is one of the R8 behavior shapes and the worked example
is the template the other 10 files copy. The wildfire factor variables are
cumulative by construction (a witness never disappears from the filtered set),
so for these rule-sets no readings sequence can drive a matched category's
expression from true to false — the floor genuinely cannot be isolated. The (d)
shape as the worked example implements it verifies match-*stability*, not the
floor; calling it "monotonicity … floor holds" over-claims.

Suggested resolution: relabel the worked (d) case (e.g. "(d) stability — cat 2
holds across a later all-default run") and add a sentence to the per-rule-set
test-file structure section noting that, because wildfire factor variables are
cumulative, shape (d) verifies match-stability rather than the engine floor in
isolation — or, if any of the 11 rule-sets admits a true→false category
transition, use that rule-set's sequence for one genuine floor test.

---

#### RESOLVED: QA-5 — The per-rule-set test structure cites the `test-helpers.ts` `makeWildfireEngine` caution, but that caution is stale and no step updates it

*Resolution*: Upheld. The 42–54 test step (the last test-file step, and the one
that introduces the `DefaultVars` / `DefaultVegetations`-consuming tabs) gains a
"Refresh the `test-helpers.ts` `makeWildfireEngine` caution" instruction and a
`test-helpers.ts` "Files affected" entry — the comment is updated to the
QA-3-resolved rule (must-pass set `23, 24, 32–35, 42, 45, 47, 54`; both the
`set*` throw-and-catch and the `defaults`-consuming-sim-prop fail-closed paths
named). Comment-only edit, so the step stays green.


The per-rule-set test-file structure section says: "A rule-set whose categories
reference a `set*` factor variable **or** a `defaults`-consuming sim-prop
(`DefaultVars`, `DefaultVegetations`) **must** pass `defaults` to
`makeWildfireEngine` — see the caution in `test-helpers.ts`." That is the QA-3
fix, and it is correct.

But the caution it points the implementer at — the comment above
`makeWildfireEngine` in `src/hazbot/rule-sets/test-helpers.ts` — currently reads:
"a caller testing such a rule-set (**23, 24, 32–35**) must pass `defaults`." That
enumeration is pre-WM-18. It omits tab **42** (which uses `setAnyVar`) and tabs
**45 / 47** (`DefaultVars`) and **54** (`DefaultVegetations`) — the exact tabs
QA-3 identified as the danger zone. The caution also describes only the
`set*`-factor-variable failure path ("every `set*` factor variable throws and is
caught to its `false` fallback"); it never mentions the `defaults`-consuming
*sim-prop* path, and that path is not even a throw-and-catch — `DefaultVars` /
`DefaultVegetations` fail closed via an explicit `if (!defaults…) return false`,
a different mechanism.

No step in the implementation plan updates this comment. So an implementer who
follows the plan's cross-reference and reads the actual `test-helpers.ts`
caution finds guidance that contradicts the plan: the caution says "23, 24,
32–35," the plan says "also 42, 45, 47, 54." For 4 of the 11 tabs the cited
authority is wrong, and QA-3's resolution — recorded as "the strongest finding
of the round," and the thing that keeps `45/47/54.test.ts` from silently
misclassifying — is undercut by the un-updated comment it depends on.

Why it matters: a diligent implementer who trusts the cited source over the
plan's prose builds `42/45/47/54.test.ts` without `defaults` and walks straight
into the silent-misclassification trap QA-3 closed.

Suggested resolution: have one of the test-file steps (the 42–54 step is the
natural owner — or the new-impls step, since it adds `DefaultVars` /
`DefaultVegetations`) update the `test-helpers.ts` `makeWildfireEngine` caution
to match the QA-3 rule: name the must-pass set as "any rule-set referencing a
`set*` factor variable or a `defaults`-consuming sim-prop (`DefaultVars` /
`DefaultVegetations`)" — i.e. 23, 24, 32–35, 42, 45, 47, 54 — and note the
sim-prop fail-closed-return path alongside the `set*` throw-and-catch path. Add
that comment edit to the step's "Files affected."

---

#### RESOLVED: QA-6 — R5's "no category loads with a `missing-impl` failure" has no owning verification step; the coverage table attributes it to a "load check" the re-extract step never performs

*Resolution*: Upheld. The re-extract step gains an explicit R5 gate — a new
committed test `src/hazbot/rule-sets/index.test.ts` that constructs the engine
for all 11 regenerated rule-sets and asserts the collected load errors are
exactly zero `missing-impl`, zero `parse-error`, and the three expected
`stub-warning`s (`Helitack`, `usedHelitack`, `SparksAtTopAndBottom`). A missed
impl name now fails loudly and by name rather than as an opaque R9 mismatch, and
the gate is a durable regression guard for future re-extractions. The
requirements-coverage table's R5 cell is corrected from "Re-extract (load
check)" to "Re-extract (`index.test.ts` load gate)" so it points at a step that
performs the check.


The requirements-coverage table maps **R5** ("Every factor variable and sim-prop
referenced by an extracted module either has a working impl or is a documented
stub. **No category loads with a `missing-impl` failure.**") to "Implement the 8
impls + 2 stubs; **Re-extract (load check)**."

The "Implement" half is real — the new-impls step covers the "has an impl / is a
stub" side. But the "**load check**" attributed to the re-extract step does not
exist in that step. The re-extract step runs the extractor (pure text emission —
it never loads a module through the engine) and verifies the `git diff` is
content-only drift. The next step, the fidelity diff, is a static
`dump-xlsx.js`-vs-module-text comparison — also no engine load. The first time
any regenerated module is loaded through the engine is incidental to the
per-rule-set test steps (`makeWildfireEngine`).

So R5's core promise is verified only indirectly and late. A `missing-impl` on a
referenced name would make that category fail to match, so its R9 assertion
would fail and `npm test` would go red at closeout — but as an opaque "expected
4, got null," not as "missing-impl: <name>." And nothing pins the *expected*
error set either: `Helitack` / `usedHelitack` / `SparksAtTopAndBottom` should
produce exactly three `stub-warning`s and zero `missing-impl`s — no step asserts
that. A genuinely missed name (a sheet referencing an impl absent from the
requirements-phase scan) surfaces as a confusing fixture-looking test failure
rather than a clear load error.

Why it matters: R5 is the requirement that makes "all 11 rule-sets load" true.
The plan implements the impls but never explicitly *checks the engine's load
errors* — and the coverage table claims a check ("load check") at a step that
has none, so a reader believes R5 is gated when it is only caught as a side
effect.

Suggested resolution: add an explicit, cheap R5 gate — load all 11 regenerated
rule-sets through the engine and assert the collected `EngineError`s contain
zero `missing-impl` / zero `parse-error` and exactly the expected `stub-warning`
set (`Helitack`, `usedHelitack`, `SparksAtTopAndBottom`). It can live at the end
of the re-extract step (making the coverage table's "load check" true) or as a
small dedicated test. Either way, correct the coverage-table cell so R5's
verification points at a step that actually performs it.

---

#### RESOLVED: QA-7 (minor) — The `Fireline` sim-prop test is framed as "empty → false, `>= 2` → true," which skips the length-1 boundary

*Resolution*: Upheld (minor). The new-impls step's `Fireline` test instruction
now calls for three single-reading `evaluate` cases — undefined/empty → `false`,
one marker (a half-placed line) → `false`, two-or-more → `true` — so both ends
of the `>= 2` threshold are pinned, matching the boundary precision the
`DefaultVars` test already applies.


The new-impls step's `Fireline` test description says the sim-prop "test is two
single-reading `evaluate` cases — an empty-`fireLineMarkers` reading → `false`,
a `>= 2`-marker reading → `true`." `Fireline`'s predicate is
`(reading.fireLineMarkers?.length ?? 0) >= 2`, and a `WildfireFireLineMarker` is
"one endpoint of a fire line" — so the meaningful boundary is **one** marker (a
half-placed line: a student dropped one endpoint and stopped), which must
evaluate `false`. The "empty → false / `>= 2` → true" framing exercises lengths
0 and 2 but skips length 1, the only non-trivial false case.

Why it matters: minor — it is just a missing test case, and the impl is correct
regardless (`0 >= 2` and `1 >= 2` are both false). But the plan is otherwise
precise about boundary tests — the `DefaultVars` test explicitly checks "just
inside passes, just outside fails" for the ±2 / ±20° tolerances — and the same
precision should apply to `Fireline`'s threshold.

Suggested resolution: reword the `Fireline` test instruction to call for three
single-reading cases — `fireLineMarkers` undefined/empty → `false`, **one**
marker → `false`, two-or-more markers → `true` — so the `>= 2` threshold's
boundary is pinned.

---

#### RESOLVED: QA-8 — The R5 `index.test.ts` gate's expected stub-warning set is stated as "three," but `Helitack` is referenced by three rule-sets, so the engine emits five `stub-warning` entries

*Resolution*: Upheld — the strongest of the round; left as written the R5 gate
fails on its own first run. The re-extract step's `index.test.ts` description now
states the per-engine `stub-warning` distribution explicitly — tab 25 →
`{SparksAtTopAndBottom}`, tab 45 → `{Helitack, usedHelitack}`, tab 47 →
`{Helitack}`, tab 54 → `{Helitack}`, every other tab → none (five entries in
total) — and notes that the engine emits one `stub-warning` per referenced stub
per rule-set engine. The "three expected `stub-warning`s" phrasing is dropped. No
scope change.


The re-extract step's R5 gate (QA-6 resolution) says `index.test.ts` "asserts
the engine's collected load errors are exactly — zero `missing-impl`, zero
`parse-error`, and the three expected `stub-warning`s (`Helitack`,
`usedHelitack`, `SparksAtTopAndBottom`)."

"Three" is the count of distinct stub *names*, not the count of `stub-warning`
*entries* the engine produces. `runLoadTimeValidation` in
`src/hazbot/engine/engine.ts` (lines 244–253) emits one `stub-warning` per
*referenced* stub, *per rule-set engine*. The three stubs are referenced
unevenly across the 11 rule-sets:

- `SparksAtTopAndBottom` — tab 25 only → **1** `stub-warning`.
- `usedHelitack` (factor-variable stub) — tab 45 only → **1** `stub-warning`.
- `Helitack` (sim-prop stub) — tabs 45, 47, **and** 54 (per the requirements.md
  Helitack Technical Notes) → **3** `stub-warning`s.

So across the 11 engines the gate sees **five** `stub-warning` entries,
distributed per engine as: tab 25 → 1, tab 45 → 2 (`Helitack` + `usedHelitack`),
tab 47 → 1, tab 54 → 1, every other tab → 0. There is also no aggregate `errors`
object — each engine carries its own `errors` array — so `index.test.ts` must
collect per engine, and the natural expectation is a per-engine distribution,
not one global list.

Why it matters: an implementer writing `index.test.ts` to the QA-6 wording will
most naturally write `expect(stubWarnings).toHaveLength(3)` or build an expected
list of three entries — and the test fails against the real count of five on its
first run, for a spec that is otherwise precise about cardinality (cf. the
`Fireline` `>= 2` boundary, the `DefaultVars` `±2 / ±20°` boundary). The gate
that exists to catch load regressions would itself need debugging before it is
trusted.

Suggested resolution: restate the QA-6 paragraph's expectation precisely —
either as the per-engine distribution (25 → `{SparksAtTopAndBottom}`, 45 →
`{Helitack, usedHelitack}`, 47 → `{Helitack}`, 54 → `{Helitack}`, others →
none), or as the aggregate (five `stub-warning` entries with the `stubName`
multiset `{Helitack ×3, usedHelitack ×1, SparksAtTopAndBottom ×1}`). Keep "three"
only where it is explicitly labelled as the distinct-name count, never as the
entry count.

---

#### RESOLVED: QA-9 — The requirements-coverage table maps R6a to one step, but R6a's unit-test-shape clause is satisfied in a different step

*Resolution*: Upheld. The requirements-coverage table's R6a row is updated to
name both owning steps — "Add `fireLineMarkers` to the bridge (substrate);
Implement the 8 impls + 2 stubs (test shape)" — and the row description is
widened from "`fireLineMarkers` on the reading + translate" to "`fireLineMarkers`
substrate + `Fireline`/`usedFireline` test shape" so it no longer implies R6a is
only the reading/translate change. No scope change — the test-shape work was
already specified in the new-impls step (SE-1 / SE-2); only the traceability row
was incomplete.


The requirements-coverage table has one row for R6a: "R6a — `fireLineMarkers`
on the reading + translate | Add `fireLineMarkers` to the bridge."

requirements.md R6a has two distinct halves. The **substrate** half — extend
`WildfireReading` + `translate.ts` to carry `fireLineMarkers` — is the "Add
`fireLineMarkers` to the bridge" step, correctly. The other half is a
**unit-test-shape** requirement: R6a specifies that `usedFireline` is tested
against a multi-`SimulationStarted` sequence and `Fireline` with single-reading
`evaluate` cases. That clause is satisfied in the "Implement the 8 new
factor-variable / sim-prop impls" step — this file's own SE-1 and SE-2
self-review entries explicitly added the `Fireline` / `usedFireline`
test-shape instructions *there*, not in the `fireLineMarkers` step.

So R6a is covered by two steps and the table names only one — and the one it
names does not contain R6a's test-shape work. The row description
("`fireLineMarkers` on the reading + translate") also restates R6a too
narrowly, dropping the test-shape half.

Why it matters: this is the same defect class as QA-6 (round 6), where the
coverage table attributed R5 to a "load check" the named step did not perform.
The coverage table is the spec's traceability artifact; a reader auditing R6a is
pointed at a step that does only half of it and would not learn the test-shape
half lives in the new-impls step.

Suggested resolution: map R6a to both steps — e.g. "Add `fireLineMarkers` to
the bridge (substrate); Implement the 8 impls + 2 stubs (`Fireline` /
`usedFireline` test shape)" — and widen the row description so it no longer
implies R6a is only the reading/translate change.

---

### Build/Release Engineer

#### RESOLVED: BR-1 — The R11a module↔sheet diff was a late gate; an extractor bug found there would invalidate downstream steps

*Resolution*: Upheld — the strongest of the six findings. R11a (the
module↔sheet diff) is split out of the combined "Validate" step into its own
"Verify extraction fidelity" step, placed immediately after the re-extract step
and before the test-file and playbook steps. R11 (the playbook walk) keeps its
late position — it needs the playbooks and a running dev server. The
requirements-coverage table now maps R11a to the new fidelity-diff step and R11
to the reduced playbook-walk step.


The combined "Validate" step ran the R11a module↔sheet fidelity diff *after*
the test-file and playbook steps — so the regenerated modules had already had
test files and playbooks built on top of them. A late-discovered extractor bug
therefore forced re-running not just the re-extract but the downstream
test-fixture and playbook work too. The R11a *diff* needs only `dump-xlsx.js`
and the regenerated modules — **no running dev server** — so it can run
immediately after the re-extract step. Only the R11 *playbook walk* genuinely
needs the late position (it needs the playbooks and a dev server). Suggested
resolution: split R11a (the diff) into its own step right after the re-extract,
leaving R11 (the walk) where it is — so extractor-fidelity bugs surface before
the test files and playbooks are built on the modules.

---

#### RESOLVED: BR-2 — The "How to read this plan" preamble calls the playbook-walk step "not a code commit," but that step edits a tracked file

*Resolution*: Upheld (minor — a clean internal contradiction). The "How to read
this plan" preamble parenthetical is reworded: only the fidelity-diff and
closeout steps are named verification-only; the playbook-walk step is described
as "verification plus a small documentation commit, the refreshed
validation-status table in `localhost-urls.md`."


The preamble states: "Three steps — the fidelity diff, the playbook walk, and
closeout — are verification work, not code commits."

The playbook-walk step ("Validate — playbook walk") contradicts that: its
**Files affected** lists `docs/hazbot-validation/localhost-urls.md` ("'Current
validation status' table refreshed"), its **Estimated diff size** is "~30 lines
of doc edits (status table)," and the housekeeping step explicitly defers that
table to it ("The 'Current validation status' table is left for the
playbook-walk step to refresh once the walk is done"). A ~30-line edit to a
tracked file is a commit.

The other two steps the preamble names are defensible: the fidelity-diff step
hedges that an extractor fix happens "only if a bug is found," and the closeout
step is genuinely commitless (lint/test/build + Jira comments). Only the
playbook-walk step is both named commitless *and* unconditionally produces a
tracked-file diff.

Why it matters: minor, but the preamble is the plan's own statement of its
commit structure, and commit granularity (IQ1) was a deliberately reasoned
decision — an inconsistency here invites an implementer to leave the
validation-status edit uncommitted or to fold it into an unrelated commit.

Suggested resolution: reword the preamble — e.g. "Two steps — the fidelity diff
and closeout — are verification work; the playbook-walk step is verification
plus a small documentation commit (the refreshed validation-status table)" — or
state explicitly in the playbook-walk step that its `localhost-urls.md` edit is
its own commit.

---

#### RESOLVED: BR-3 — The fidelity-diff step's "fold the fix back into earlier commits via interactive rebase" makes the extractor and re-extract commits provisional, in tension with the plan's stated commit model

*Resolution*: Upheld; resolved via option (b). The fidelity-diff step's
extractor-bug contingency is rewritten — a fidelity bug is now fixed as the
step's **own forward commit** (the `extract-impl.js` fix + `extract-impl.test.js`
regression case + the corrected re-regenerate), with no fold-back into earlier
commits and no interactive rebase. This keeps the plan's forward-only commit
model intact; the only cost is the branch history showing an "extractor fidelity
fix" commit after the original extractor change, which a squash-merge collapses
anyway. The step's "Files affected" and "Estimated diff size" are updated to
include the re-regenerated modules in the conditional fix. The preamble already
characterizes the fidelity-diff step's commit as conditional ("only if a bug is
found," per the BR-2 resolution), so it needs no further change.


The "How to read this plan" preamble states the plan's commit model: each step
is "a single commit that leaves `npm run lint && npm test && npm run build`
green," and "Steps build on each other in order; there are no forward
dependencies." IQ1 reaffirms "every commit leaves `npm test` green … each green
and independently reviewable."

The "Verify extraction fidelity" step breaks that model when it finds a bug. Its
contingency reads: "the extractor fix folds back into the extractor step's
commit and the regenerated modules into the re-extract step's commit (via
interactive rebase, or as fix-up commits squashed before the PR) — so the final
history still shows one clean extractor change and one clean regenerate."

Two problems:

1. **The commit model is bent.** "Fold back into the extractor step's commit"
   means the extractor-step and re-extract-step commits are not final until the
   fidelity-diff step passes — they are provisional. That is a *backward* rewrite
   of already-made commits, the opposite of the preamble's "steps build on each
   other in order." The preamble presents the commit structure as settled and
   forward-only; a reader planning the commit sequence gets no signal that two
   of the early commits may be retroactively amended.
2. **The prescribed mechanism may be unavailable.** `git rebase -i` (interactive
   rebase) — and `git commit --fixup` + `--autosquash`, which still needs an
   interactive rebase to apply — are interactive Git operations. In an
   automated / agent execution context interactive rebase is not available, so
   the step's primary mechanism cannot run as written.

Why it matters: the fidelity-diff step is a real acceptance gate (R11a) that
*can* surface a genuine extractor bug, so this is not a hypothetical branch.
When it fires, the implementer is told to rewrite history with a tool that may
not be usable, and the plan's own commit-structure description (a deliberately
reasoned artifact — see IQ1) silently stops holding.

Suggested resolution: pick one and state it. Either (a) acknowledge in the
preamble and the fidelity-diff step that the extractor and re-extract commits
are provisional until fidelity is verified; or (b) — cleaner and consistent with
the forward-only model — land a fidelity fix as its **own forward commit**
(extractor fix + the re-regenerated modules), accepting that the history then
shows "extractor change" followed by "extractor fidelity fix" rather than a
single squashed extractor commit. Drop the reliance on interactive rebase, or
explicitly scope it to a human-run, not-yet-pushed branch.

---

#### RESOLVED: BR-4 — The fidelity-diff step's "no test fixtures built yet" rationale is inaccurate; the 23/24/25 test files were rewritten in the prior step

*Resolution*: Upheld. The fidelity-diff step's placement rationale is corrected
in the Summary and the "Doing this before…" paragraph — the 23/24/25 test files,
rewritten in the re-extract step per IQ1, are named as the one class of
downstream work that already exists when the fidelity diff runs. The step's
conditional "Files affected" now includes `23/24/25.test.ts`, and the BR-3
forward-commit description requires a tab-23/24/25 fidelity fix to re-align the
matching test file in the same commit. Resolution (a) — IQ1's green-commit model
is preserved; option (b) (a knowingly-red re-extract commit) was declined.


The "Verify extraction fidelity" step justifies its placement with: "Doing this
*before* the test-file and playbook steps means a fidelity fix has no downstream
churn — no test fixtures or playbooks have been built on the modules yet." The
BR-1 resolution placed it "immediately after the re-extract step and before the
test-file and playbook steps."

That is only partly true. The re-extract step — the step *immediately before*
the fidelity-diff step — rewrites `23.test.ts` / `24.test.ts` / `25.test.ts`
against the regenerated modules (IQ1 decision A requires it in that commit, or
the re-extract commit leaves `npm test` red). Those three files *are* test
fixtures built on the regenerated modules. The fidelity-diff step's blanket "no
test fixtures have been built on the modules yet" is false for 3 of the 11 tabs.

Consequence: if the R11a diff surfaces a fidelity bug in tab 23, 24, or 25, the
BR-3 forward-commit fix (`extract-impl.js` fix + `extract-impl.test.js`
regression case + corrected re-regenerate) changes that module — and the
`23/24/25.test.ts` written one step earlier, which encodes the pre-fix
expressions, can then fail `npm test`. The fidelity-diff step's "Files affected"
lists only `extract-impl.js`, `extract-impl.test.js`, and the re-regenerated
modules — not the test files — yet the step promises to leave `npm run lint &&
npm test && npm run build` green. A 23/24/25 fidelity fix breaks that promise
unless those test files are re-touched in the same commit.

Why it matters: BR-1's stated purpose was to surface fidelity bugs *before*
downstream work is built on the modules. That goal is met for the 32–35 and
42–54 standalone test steps, but the 23/24/25 test files are downstream work
built one step too early — and the spec asserts the goal is fully met.

Suggested resolution: (a) reword the fidelity-diff step's rationale to be
accurate (only the 23/24/25 test files have been built; a fidelity fix touching
those tabs re-touches those files in the same forward commit) and add
`src/hazbot/rule-sets/23.test.ts / 24.test.ts / 25.test.ts` to the step's
conditional "Files affected"; or (b) move the 23/24/25 test rewrites out of the
re-extract step to *after* the fidelity-diff step, accepting a knowingly-red
re-extract commit (IQ1 option B, previously rejected). (a) is the smaller change
and preserves IQ1's green-commit model.

---

### Curriculum / Content Author

#### RESOLVED: CA-1 — The new-impls step copied the hardcoded `CorrectZoneSetup` / `DefaultVars` constants from the requirements table rather than re-confirming them against the workbook

*Resolution*: Upheld. The new-impls step gains a "Before coding — re-confirm the
sheet constants" instruction directing the implementer to verify the
`CorrectZoneSetup` and `DefaultVars` constants against the current workbook via
`dump-xlsx.js` before coding, treating the requirements.md R6 table as a
secondary copy.


The new-impls step writes the `CorrectZoneSetup` zone constants (`Foothills` /
`Grass` / `No Drought`, etc.) and the `DefaultVars` wind tolerances (`±2` /
`±20°`) directly into the impl code, taken from the requirements.md R6 table.
The requirements table is a secondary copy; the **workbook is the source of
truth** (per CA-2, these were verified via `dump-xlsx.js` during the
requirements review, but that was against the workbook state at that time). An
implementer should re-confirm the constants against the current workbook at
coding time, so a workbook revision between requirements-finalization and
implementation is not silently missed. Suggested resolution: add an instruction
to the new-impls step to verify the `CorrectZoneSetup` / `DefaultVars` constants
against the workbook via `dump-xlsx.js` before coding the impls.

---

#### RESOLVED: CA-2 — Nothing instructed the implementer to read the extractor's misnumbering warnings

*Resolution*: Upheld. The re-extract step gains a "Capture the extractor console
output" instruction directing the implementer to capture stdout/stderr and
review every `[extract]` warning line, treating a misnumbering warning as a
sheet-quality issue to flag or an extractor bug to fix.


R1a's misnumbering warning (the extractor step) is a `console.warn` emitted
during the extraction run. The re-extract step ("run the command", "git diff")
never told the implementer to capture and review the extractor's console
output. A warning that no one reads delivers none of R1a's value — the whole
point of the warning is to surface an authoring misnumbering at extraction time.
Suggested resolution: add an instruction to the re-extract step to capture the
extractor's stdout/stderr and review any `[extract]` warning lines, treating a
misnumbering warning as a sheet-quality issue to flag (per Out of Scope) or an
extractor bug to fix.

---

#### RESOLVED: CA-3 — `SevereDroughts` hard-codes the `"Severe Drought"` string literal, the exact anti-pattern requirements.md CA-3 forbids

*Resolution*: Upheld. The new-impls step's `SevereDroughts` impl is changed to
compare `z.droughtLevel === droughtLabels[DroughtLevel.SevereDrought]` instead of
the literal `"Severe Drought"`, and the "New sim-props" intro adds the
`import { DroughtLevel, droughtLabels } from "../../types";` line. The impl now
matches its own comment and requirements.md CA-3, and is coupled to the enum
rather than a baked literal. `CorrectZoneSetup` is left as-is — CA-3 explicitly
sanctions it as a constant-baker with R6 sheet-citing-test treatment.


requirements.md's CA-3 resolution and the R6 "New factor variables / sim-props"
Technical Note draw an explicit line: `CorrectZoneSetup` and `DefaultVars`
legitimately bake sheet constants (and get R6 sheet-citing tests), while
`triedAllVegetations`, `SevereDroughts`, and `DefaultVegetations` "are
implemented against the enums / config and carry no R6 sheet constant …
implement them against the enum / config, not a literal set." CA-3's resolution
even names the residual risk it is guarding against: "that an implementer
hard-codes a literal set anyway."

The new-impls step's `SevereDroughts` realizes exactly that risk:

```ts
// … "Severe Drought" is droughtLabels[DroughtLevel.SevereDrought] (src/types.ts)
// — the enum label is the source of truth, so no hard-coded sheet constant (per CA-3).
const SevereDroughts: SimPropImpl<WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  evaluate: (reading) => {
    const zones = reading.zones;
    if (!zones || zones.length === 0) return false;
    return zones.every((z) => z.droughtLevel === "Severe Drought");
  },
};
```

The comment claims "no hard-coded sheet constant (per CA-3)" while the code
hard-codes the literal `"Severe Drought"`. The sibling impls in the same step
honor the rule — `triedAllVegetations` uses `Object.values(vegetationLabels)`,
`DefaultVegetations` compares to the config-derived `def.vegetation` — so
`SevereDroughts` is the lone outlier, and its own comment contradicts its code.

Why it matters: this is benign *today* — `src/types.ts` has
`droughtLabels[DroughtLevel.SevereDrought] === "Severe Drought"` and the
`SimulationStarted` payload sets `zones[].droughtLevel = droughtLabels[…]`
(verified in `src/components/bottom-bar.tsx`), so the impl is behaviorally
correct. The point CA-3 settled is *coupling*: an enum-referencing impl tracks a
future relabeling automatically; a hard-coded literal silently desyncs and
`SevereDroughts` would then evaluate `false` forever — tab 54's severe-drought
categories going dark. And because CA-3 exempted `SevereDroughts` from an R6
sheet-citing test *on the premise it bakes no constant*, nothing would catch the
desync.

Suggested resolution: change the `SevereDroughts` impl to
`import { DroughtLevel, droughtLabels } from "../../types"` (the same module the
factor-variable step already imports `vegetationLabels` from) and compare
`z.droughtLevel === droughtLabels[DroughtLevel.SevereDrought]`, so the impl
matches its own comment and requirements.md CA-3. (`CorrectZoneSetup` is *not*
in scope here — CA-3 explicitly accepts it as a constant-baker with R6
sheet-citing-test treatment.)

---

#### RESOLVED: CA-4 — `CorrectZoneSetup` bakes terrain / vegetation / drought *label-string literals*; this is the coupling hazard CA-3 fixed for `SevereDroughts`, and CA-3's exemption of `CorrectZoneSetup` was drawn too broadly

*Resolution*: Upheld. The new-impls step's `CorrectZoneSetup` impl is changed to
resolve each enum member through the label maps —
`z.terrainType === terrainLabels[TerrainType.Foothills]`,
`z.vegetation === vegetationLabels[Vegetation.Grass]`,
`z.droughtLevel === droughtLabels[DroughtLevel.NoDrought]` (and `MildDrought` /
`MediumDrought` for zone 2) — instead of baking literal strings, mirroring the
CA-3 `SevereDroughts` fix. The "New sim-props" intro import is widened to
`import { TerrainType, terrainLabels, Vegetation, vegetationLabels, DroughtLevel,
droughtLabels } from "../../types";`, and the `CorrectZoneSetup` snippet comment
is narrowed: the per-zone *enum choice* is the sheet-authored constant (still
hand-mirrored, still R6 sheet-citing-test treated); the label *strings* are not.
Flagged for a requirements-side follow-up: requirements.md's R6 "New factor
variables / sim-props" Technical Note still describes `CorrectZoneSetup` as
encoding sheet "constants ... [whose] values must be hand-mirrored in the impl"
— accurate for the *enum choice* but no longer for the label strings; it should
be tightened the same way on a requirements.md pass.


The new-impls step's `CorrectZoneSetup` compares zone fields against hard-coded
label strings: `z.terrainType === "Foothills"`, `z.vegetation === "Grass"`,
`z.droughtLevel === "No Drought"` / `"Mild Drought"` / `"Medium Drought"`. Those
strings are not free-form — `reading.zones[].terrainType` etc. are populated from
`terrainLabels` / `vegetationLabels` / `droughtLabels` (`src/types.ts`, via
`bottom-bar.tsx`'s `SimulationStarted` payload and `deriveWildfireDefaults`). The
five literals happen to equal the current label values
(`terrainLabels[TerrainType.Foothills] === "Foothills"`, etc. — verified in
`src/types.ts`), so the impl is correct today.

This is the coupling CA-3 just settled for `SevereDroughts`. CA-3 changed
`SevereDroughts` from the literal `"Severe Drought"` to
`droughtLabels[DroughtLevel.SevereDrought]` precisely because "an
enum-referencing impl tracks a future relabeling automatically; a hard-coded
literal silently desyncs." `CorrectZoneSetup` has the identical hazard across
three label maps, yet CA-3's resolution explicitly waved it through:
"`CorrectZoneSetup` is *not* in scope here — CA-3 explicitly accepts it as a
constant-baker with R6 sheet-citing-test treatment."

That exemption conflates two different things. The *sheet constant* in
`CorrectZoneSetup` is the **choice** of (Foothills, Grass, No Drought) for zone 1
and (Foothills, Grass, Mild-or-Medium) for zone 2 — that combination genuinely
has no home but the sheet. But the **label strings** themselves *do* have a home
— `terrainLabels` / `vegetationLabels` / `droughtLabels` — exactly as "Severe
Drought" does. Baking the strings, rather than resolving the enum members
through the label maps, is the part CA-3 forbids.

And the R6 sheet-citing test does **not** catch this. The plan's R6 fixture for
`CorrectZoneSetup` builds a "correct" reading with `z.terrainType = "Foothills"`
(a literal, citing the tab-23 sheet row) and asserts the impl returns `true`.
Impl and fixture share the same literal, so the test passes whether or not
`"Foothills"` is still what `terrainLabels[TerrainType.Foothills]` actually
emits. A relabeling would break the real-payload comparison while leaving the
unit test green — the test gives false confidence on precisely the coupling CA-3
exists to guard.

Why it matters: tab 23 Cat 5 is gated on `CorrectZoneSetup` (`ranSimulation WITH
CorrectZoneSetup AND OneSparkPerZone`). A silent label desync makes
`CorrectZoneSetup` evaluate `false` forever and tab 23's top category goes dark
— with no failing test, because CA-3 exempted it from the literal-vs-label
scrutiny on the premise it bakes no relabelable constant.

Suggested resolution: implement `CorrectZoneSetup` against the label maps,
mirroring the CA-3 `SevereDroughts` fix — `z.terrainType ===
terrainLabels[TerrainType.Foothills]`, `z.vegetation ===
vegetationLabels[Vegetation.Grass]`, `z.droughtLevel ===
droughtLabels[DroughtLevel.NoDrought]`, etc. (the enum *member* is the
sheet-authored choice; the label string is not a sheet constant). Add
`import { TerrainType, terrainLabels, Vegetation, vegetationLabels, DroughtLevel,
droughtLabels } from "../../types";` to `sim-props.ts`. If the literals are kept
instead, the `CorrectZoneSetup` R6 test must additionally assert each literal
equals its `*Labels[...]` value, so a divergence is caught. Either way, narrow
the new-impls step's `CorrectZoneSetup` Technical Note ("these are sheet-authored
constants — this impl is NOT regenerated"): the *enum choice* is the sheet
constant; the label string is not.

---

#### RESOLVED: CA-5 — CA-4 moved the `CorrectZoneSetup` impl onto the label maps, but the new-impls step still describes its R6 test fixture with hard-coded label literals

*Resolution*: Upheld — the test-side completion of CA-4's impl-side fix. The
new-impls step's `CorrectZoneSetup` R6 test description now builds the "correct"
fixture zones through the same label maps the impl uses
(`terrainLabels[TerrainType.Foothills]` etc.), not hard-coded label strings, so
impl and fixture track one source of truth and a `src/types.ts` relabeling no
longer false-alarms the test; the sheet-citing comment documents the per-zone
*enum choice*. `DefaultVars`'s R6 test is untouched — its `±2` / `±20°`
constants have no enum home (CA-2). No scope change.


CA-4 (round 4) changed the `CorrectZoneSetup` impl from baking label strings
(`z.terrainType === "Foothills"`) to resolving each enum member through the
label maps (`z.terrainType === terrainLabels[TerrainType.Foothills]`), so a
relabeling in `src/types.ts` tracks automatically rather than silently
desyncing.

The new-impls step's unit-test description was not carried along with that fix.
It still says: "`CorrectZoneSetup` — the test fixture's 'correct' zones
(`Foothills`/`Grass`/`No Drought`; `Foothills`/`Grass`/`Mild Drought`) are
written with a comment pointing at the tab-23 sheet row." Every sibling zone
fixture in the repo (`23.test.ts`, the worked `42.test.ts`) builds zones from
literal strings — `{ terrainType: "Plains", vegetation: "Shrub", … }` — so as
described, the `CorrectZoneSetup` fixture hard-codes the label *strings*, while
the CA-4-fixed impl compares against `terrainLabels[TerrainType.Foothills]` and
friends. Impl and its own test are now coupled to two different representations
of the same fact.

Two consequences:

- **False alarm on relabeling.** Change `terrainLabels[TerrainType.Foothills]`
  in `src/types.ts`: the impl stays correct in production — impl and the real
  `SimulationStarted` payload both resolve through the maps — but the
  literal-string fixture stops matching what the impl resolves, so the R6 test
  goes red for a still-correct impl. CA-4's resolution explicitly noted "the R6
  sheet-citing test does not catch this," then corrected only the impl; the test
  was left exposed to the inverse failure.
- **The test no longer tracks what R6 intends.** The R6 sheet-citing test exists
  so a deliberate change to the *sheet* (the per-zone enum *choice*) forces a
  visible, reviewed test diff. With a literal fixture, a sheet change means
  editing the impl's enum member *and* separately editing the fixture's string
  literal — two hand-edits against two representations, one of which a reviewer
  can miss. The fixture is pinned to the label string, not to the enum choice
  the sheet actually authors.

Why it matters: tab 23 Cat 5 is gated on `CorrectZoneSetup`. CA-3 / CA-4 spent
two rounds removing exactly this literal-vs-label-map coupling from the impls so
a relabeling cannot silently break classification; leaving the coupling in the
test re-introduces it one layer out — now as a spurious red build rather than a
silent desync, but still the failure mode the two rounds set out to eliminate.

Suggested resolution: have the new-impls step's `CorrectZoneSetup` R6 test build
the "correct" fixture zones through the same label maps the impl uses
(`terrainType: terrainLabels[TerrainType.Foothills]`,
`vegetation: vegetationLabels[Vegetation.Grass]`,
`droughtLevel: droughtLabels[DroughtLevel.NoDrought]`, and the
`MildDrought` / `MediumDrought` zone-2 values), with the sheet-citing comment
documenting the per-zone *enum choice*. Impl and fixture then track one source
of truth, the sheet-citing test still forces a diff on a genuine sheet change,
and a pure relabeling no longer false-alarms. (`DefaultVars`'s R6 test is
unaffected — its `±2` / `±20°` constants have no enum home, per CA-2, so literal
numbers there are correct.)

---

#### RESOLVED: CA-6 — The "re-confirm the sheet constants" instruction omits `triedAllVegetations`, whose full-`Vegetation`-enum assumption is equally sheet-derived

*Resolution*: Upheld. The new-impls step's "Before coding — re-confirm the sheet
constants" instruction is extended to also cover `triedAllVegetations`: confirm
its tab-34 definition via `node scripts/dump-xlsx.js <workbook> 34` — the impl
folds the run-union against the full `Vegetation` enum, so a tab-34 narrowing to
a vegetation subset must be caught before coding, and a subset takes the R6
sheet-citing-test treatment per requirements.md CA-3's contingency. Scoped to
`triedAllVegetations` only — `UniformZoneSettings`'s "terrainType uniform by
design" is a structural assumption, not a set-membership constant, and is left
out deliberately.


CA-1 (round 4) added a "Before coding — re-confirm the sheet constants"
instruction to the new-impls step: verify the `CorrectZoneSetup` and
`DefaultVars` constants against the current workbook via `dump-xlsx.js`, because
"the workbook is the source of truth, and a workbook revision between
requirements-finalization and implementation must not be silently missed."

`triedAllVegetations` carries the same class of sheet-derived assumption, and
the re-confirm instruction does not name it. The impl snippet is
`Object.values(vegetationLabels).every((v) => seen.has(v))` — it hard-assumes
tab 34 wants the run-union to cover the **full** `Vegetation` enum. "Full enum
vs. a subset" is a choice authored in the tab-34 sheet's `triedAllVegetations`
definition, exactly as `CorrectZoneSetup`'s per-zone setup is authored in tab 23.

requirements.md's CA-3 resolution did not merely permit this — it explicitly
named the subset case as a live future possibility: "If a future sheet narrows
one (e.g. `triedAllVegetations` to a vegetation *subset*), that subset becomes a
sheet constant and gets the R6 treatment." If tab 34 has narrowed
`triedAllVegetations` since requirements-finalization, an implementer following
the snippet verbatim (full-enum fold) ships a wrong impl, and the re-confirm
instruction — scoped to `CorrectZoneSetup` / `DefaultVars` — would not catch it.
That is precisely the CA-1 failure mode, one impl wider than CA-1 drew the net.

Why it matters: CA-1 exists because requirements-finalization and implementation
are separated in time and the workbook can move between them.
`triedAllVegetations`'s scope (full enum or subset) is as workbook-dependent as
`DefaultVars`'s tolerances; leaving it out of the re-confirm step is an
inconsistency, and the cost of closing it is one `dump-xlsx.js` glance.

Suggested resolution: extend the new-impls step's "Before coding — re-confirm
the sheet constants" instruction to also cover `triedAllVegetations` — confirm
via `node scripts/dump-xlsx.js <workbook> 34` whether its definition targets the
full `Vegetation` enum (the snippet's assumption) or a narrowed subset; if a
subset, that subset is a sheet constant and `triedAllVegetations` takes the R6
sheet-citing-test treatment per CA-3's contingency.

---

## External Review

<!-- Phase 4 external review of the spec (LLM reviewer). Comments processed one
     at a time with the spec author; OPEN → RESOLVED as each is addressed. -->

### RESOLVED: ER-1 — `DefaultVars` / `DefaultVegetations` do not guard against a `reading.zones` / `defaults.zones` length mismatch

*Resolution*: Upheld — a real reachable gap, not only defensive hardening. Both
impls' opening guards gain `zones.length !== defaultZones.length`, failing
closed on any zone-count mismatch. The new-impls step's unit-test section gains
a zone-count-mismatch case for each impl. SE-3's resolution text, which claimed
"only the empty-array case slips through," is corrected to name the too-short
`reading.zones` direction it had missed.


`DefaultVars` and `DefaultVegetations` compare each `reading.zones[i]` against
`defaultZones[i]` via `zones.every((z, i) => …)`, which iterates `reading.zones`
only. If `defaults.zones` is longer than `reading.zones`, the extra `defaultZones`
tail is never inspected and the prop can return `true` while ignoring a default
zone.

This is reachable, not hypothetical. `reading.zones` is `simulation.zones`
([bottom-bar.tsx](../../src/components/bottom-bar.tsx) `SimulationStarted`
payload), which is `config.zones.map(new Zone)` truncated to `config.zonesCount`
([simulation.ts](../../src/models/simulation.ts)). `defaults.zones` is
`deriveWildfireDefaults()` output ([derive-defaults.ts](../../src/hazbot/wildfire/derive-defaults.ts)),
which emits one entry per *populated* `config.zones` slot — its own comment
states "independent of `zonesCount`". A config whose `zonesCount` is smaller
than its populated `config.zones` count therefore yields `defaults.zones`
longer than `reading.zones`.

`CorrectZoneSetup` is unaffected — it hard-guards `zones.length !== 2` and never
indexes `defaults`.

Resolution: add `zones.length !== defaultZones.length` to both impls' opening
guards, failing closed on any mismatch — consistent with the fail-closed
discipline SE-3 established for these props. For a correctly authored
preset+sheet pairing the counts match, so the guard is inert on real input; a
genuine mismatch fails closed and is caught by the R11 playbook walk as an
unreachable category.

---

### RESOLVED: ER-2 — `CorrectZoneSetup` relies on zone-array order without the spec stating the ordering invariant

*Resolution*: Upheld — resolved by stating the invariant (the reviewer's first
offered option), not by changing the impl. `reading.zones` order is guaranteed
positional, so `CorrectZoneSetup`'s `[z1, z2]` destructuring is already correct;
the gap was that the spec did not say *why*. A "zone-array order is positional
and stable" Technical Note is added to requirements.md, and the new-impls step's
`CorrectZoneSetup` impl comment gains a sentence pointing at it. No code change.


`CorrectZoneSetup` destructures `const [z1, z2] = zones` and checks `z1` against
the zone-1 setup and `z2` against the zone-2 setup. `DefaultVars` /
`DefaultVegetations` likewise compare `reading.zones[i]` to `defaults.zones[i]`
by index. None of this is wrong — but the spec never stated the invariant the
correctness rests on, so a reader cannot tell a deliberate guarantee from an
unexamined assumption.

The invariant holds and is verifiable in the bridge source: `simulation.zones`
is `config.zones.map(...)` in `config.zones` tuple order
([simulation.ts](../../src/models/simulation.ts)), fixed at config load and
never reordered at runtime (Terrain Setup's `updateZones` rebuilds the array
preserving order); the model uses that array index as the canonical zone
identity throughout (`zoneIdx`, `totalCellCountByZone`, the run-outcome
`zoneIndex`); and the `SimulationStarted` payload emits `simulation.zones.map(...)`
preserving the order. So `reading.zones` slots 0 / 1 are the sheet's "zone 1" /
"zone 2".

The reviewer's alternative — compare by a stable per-zone identifier — is not
available: `WildfireZone` declares an optional `index`, but the
`SimulationStarted` payload ([bottom-bar.tsx](../../src/components/bottom-bar.tsx))
does not populate it. An `index`-based comparison would need a bridge change and
would be redundant with the array position. Stating the order invariant is the
correct resolution.

Resolution: add the "zone-array order is positional and stable" Technical Note
to requirements.md (covering `CorrectZoneSetup`, `DefaultVars`, and
`DefaultVegetations`), and add a sentence to the new-impls step's
`CorrectZoneSetup` impl comment noting the `[z1, z2]` destructuring is positional
and pointing at that note. The impl is unchanged.

---

### RESOLVED: ER-3 — The re-extract step's `git diff` verification command uses a Unicode ellipsis and will not run in a shell

*Resolution*: Upheld (mechanical). The re-extract step's verification command is
changed from `git diff src/hazbot/rule-sets/23.ts … 35.ts` to
`git diff src/hazbot/rule-sets/{23,24,25,32,33,34,35}.ts` (bash brace expansion
over the exact regenerated set). The same ellipsis-abbreviated-command defect in
the new-impls step's "re-confirm the sheet constants" instruction (`… 45` /
`… 47`) is spelled out in the same pass. The `…` in the two "Files affected"
bullets (`23.ts … 35.ts`, `23.md … 54.md`) is left as-is — those are
descriptive ranges, not commands.


The re-extract step instructs the implementer to "run
`git diff src/hazbot/rule-sets/23.ts … 35.ts`". The `…` is U+2026, not shell
syntax — a shell parses it as a literal path argument, so the command fails (or
diffs a nonexistent path named `…`). The regenerated set is the seven modules
23/24/25/32/33/34/35 (26–31 are not rule-set tabs), so a numeric range cannot
express it; brace expansion `{23,24,25,32,33,34,35}.ts` is the concise runnable
form. The new-impls step's `dump-xlsx.js` re-confirm instruction carried the
same defect (`` `… 45` / `… 47` ``, an ellipsis-abbreviated command in
backticks); it is spelled out as part of this fix.

---

### RESOLVED: ER-4 — The playbook-walk step gives no guidance for generated playbook steps that instruct helitack actions

*Resolution*: Upheld — a real procedural gap. The playbook-walk step's paragraph
is expanded with explicit step-level guidance: the generated `45/47/54.md`
playbooks contain steps for the helitack-gated category (tab 45 Cat 4) and the
helitack arms of tabs 47/54 Cat 4–5; when the walk reaches a helitack-instructing
step it is skipped (not executed, not counted as a failure — the stubs evaluate
`false`), annotated "stub-gated — WM-28", and the walk continues down the
fire-line path, with the affected category recorded as stub-gated /
stub-degraded / unreached rather than failed.


The playbook-walk step said only that "helitack-dependent behavior is not walked
(deferred to WM-28)" and that "stub-gated ... and stub-degraded ... categories
are recorded as such." It never addressed what the walker physically does on
reaching a generated playbook step that instructs a helitack action — the
playbook generator emits one step block per category, so `45/47/54.md` *will*
contain helitack steps (tab 45 Cat 4's `… AND Helitack`, the helitack arms of
tabs 47/54 Cat 4–5). Without explicit handling the walk could stall on such a
step or be reported as incomplete.

Resolution: expand the walk paragraph — on reaching a helitack-instructing step
(`window.test.placeHelitackInZone(...)` or equivalent), skip the action, do not
treat it as a walk failure (the `Helitack` / `usedHelitack` stubs evaluate
`false`, so the step cannot flip its target category), annotate it "stub-gated —
WM-28", and continue down the fire-line path. The affected category is recorded
in the status table as stub-gated / stub-degraded / unreached — not failed — so
a skipped-helitack walk reads as complete.

---

### RESOLVED: ER-5 — External review (Gemini): three execution checkpoints, no spec change required

*Resolution*: Verify-only. An external review (Gemini) cleared the spec for
implementation and raised three "execution checkpoints." All three were checked
against the codebase and need no spec change — one rests on a misread, two are
already covered by established codebase patterns. The new-impls step's
factor-variable import instruction gained a one-clause clarification noting
`simulationStartedReadings` is a file-local function (preempting the misread);
no other change.


1. **`simulationStartedReadings` import** — the review suggested ensuring
   `simulationStartedReadings` is imported in `factor-variables.ts` for the new
   `triedAllVegetations` / `usedFireline` impls. It is not an import:
   `simulationStartedReadings` is a function defined locally in
   `factor-variables.ts` ([factor-variables.ts](../../src/hazbot/wildfire/factor-variables.ts)),
   already in scope for impls appended to that file. The spec's import
   instruction correctly named only the one delta import (`vegetationLabels`).
   To preempt the same misread by an implementer, the new-impls step's
   factor-variable import line now states explicitly that
   `simulationStartedReadings` is file-local and needs no import.

2. **`EngineConstructionError` as a runtime value** — the review noted the R5
   `index.test.ts` gate's `instanceof EngineConstructionError` (per SE-4)
   requires a value import, not `import type`. `EngineConstructionError` is a
   `class` ([engine/types.ts](../../src/hazbot/engine/types.ts)), re-exported as
   a value from `engine/index.ts`, and two sibling files already use the
   import-and-`instanceof` pattern (`engine-singleton.ts`, `engine.test.ts`). An
   `index.test.ts` modeled on existing blocks copies a working pattern, and
   `import type` + `instanceof` is an immediate TypeScript error — self-correcting.
   No spec change.

3. **CI/CD workbook path** — the review suggested an env-var fallback for the
   `~/Downloads/...xlsx` workbook path in case the branch is evaluated on a
   remote runner. The extractor (`extract-hazbot-sheets.js`) is a local dev
   operation, not a CI step: the implementer runs it once and commits the
   modules / `index.ts` / `dsl-grammar.md` / playbooks, and CI lints/tests/builds
   only those committed artifacts — it never reads the workbook. An env-var
   fallback would configure a path no automated runner uses. No spec change.

---
