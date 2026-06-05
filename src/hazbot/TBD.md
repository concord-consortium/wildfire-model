# Hazbot — outstanding work to fully deliver the feature

Snapshot of what remains before the Hazbot analysis engine is "done." Sourced
from the validation status in
[docs/hazbot-validation/localhost-urls.md](../../docs/hazbot-validation/localhost-urls.md),
TBD markers in the generated rule-set modules, stubbed impls in
[wildfire/](wildfire/), and the WM-10 spec under
[specs/WM-10-hazbot-analysis-engine/](../../specs/WM-10-hazbot-analysis-engine/).

The substrate (engine + parser + sidebar + provider/hook) is feature-complete
for what WM-10 scoped; everything below is either content-shaped (sheet authors
need to fill rows in) or downstream-feature-shaped (a host-app UI to surface
matched feedback, two new algorithms, more rule-sets).

---

## 1. Rule-sets blocked on missing defaults — RESOLVED (WM-27)

Rule-sets 32–35 were previously blocked: each declared `requiredDefaults` paths
that didn't resolve against a hand-extracted `RuleSet.defaults`, producing a
`missing-defaults` load failure. WM-27 removed that mechanism entirely — the
engine now derives its change-detection defaults from the resolved simulation
config (preset + URL params), the same initial state the simulation loads, so
defaults are always complete and 32–35 load. There is no longer a
`missing-defaults` failure mode, a `RuleSet.defaults` field, or a
`requiredDefaults` declaration to fill in.

---

## 2. Stubbed factor variables / sim-props — RESOLVED (WM-15, WM-28)

There are no remaining `isStub: true` impls; the engine emits no `stub-warning`
for any of the 11 rule-sets.

- `SparksAtTopAndBottom` was implemented in WM-15 (ruleset 25 now reaches its
  Cat 6 success state).
- `Helitack` (sim-prop) / `usedHelitack` (factor variable) were implemented in
  [WM-28](https://concord-consortium.atlassian.net/browse/WM-28) ("Hazbot:
  Helitack run-window detection"). An in-run helitack is recorded on the
  run-start reading by a translate `modifier` (a third engine substrate result
  kind, chosen over reworking the trigger-state-change-overlap guard); the
  `Helitack` sim-prop reads it per-run and `usedHelitack` aggregates across
  runs, mirroring `Fireline` / `usedFireline`. Tabs 45/47/54 were re-validated
  (Jest per-category coverage plus a Playwright MCP walk); see the WM-28 spec.

---

## 3. Missing rule-sets entirely — RESOLVED (WM-18)

All four previously-missing placeholder tabs (42, 45, 47, 54) were extracted
from the 2026-05-22 workbook in WM-18 and are now loadable. `EXCLUDED_TABS` in
`scripts/extract-impl.js` is empty — the only auto-skipped tabs are the
non-rule-set ones (`README` / `SIMINIT`), detected by the absence of a
category block. The stale `43` tab reference (a renumbering artifact —
activity 4 page 3's rule-set is now numbered `42`) has been cleaned up.

---

## 4. Sheet-quality issues surfaced during validation

Items where the source data should be corrected before the next re-extract:

- **`Forest with Suppression` casing mismatch.**
  `wildfire/sim-props.ts` checks `vegetation === "Forest With Suppression"`
  ([sim-props.ts:67](wildfire/sim-props.ts#L67)) — confirm the actual
  payload value matches the cased form (vs. `"forest with suppression"` /
  `"Forest with Suppression"`). One bad case turns the predicate into a
  silent false.
- **Stub flag on `ForestWAWOSuppression`** — `wildfire/sim-props.ts:62`
  notes the sheet describes a paired-run semantic ("two-run check") but the
  current impl evaluates a single witness reading. The substrate has no
  paired-reading primitive in the DSL today (see §6). Either downgrade the
  sheet's spec to single-reading, or extend the DSL.
- **Typos that don't currently break anything but should be fixed at
  source.** As of the 2026-06-02 re-extract, `"SimualtionStarted"` and
  `"whiel"` have been corrected at source and no longer appear. Still
  outstanding: `"neecessarily"` (multiple — 23/24/32/35/42.ts) and
  `"magitude"` / `"magnituide"` (24/33/34/35/42.ts). These are in Details
  prose only, not parsed by the engine, but they survive re-extracts.
- **Tab 35 Cat 2 shadowing — RESOLVED (2026-06-02 workbook).** Cat 2 is
  `ranSimulation AND NOT setAnyVar`; Cat 3 was previously
  `ranSimulation WITH NOT ForestWAWOSuppression`, which any default run
  satisfying Cat 2 also satisfied — and Cat 3 > Cat 2 won, leaving Cat 2
  unreachable. The 2026-06-02 sheet adds the predicted `setAnyVar AND` guard
  (Cat 3 is now `setAnyVar AND ranSimulation WITH NOT ForestWAWOSuppression`),
  matching tab 33's analogous Cat 3. A default run (NOT setAnyVar) no longer
  satisfies Cat 3, so Cat 2 is reachable again. Fixed at source per WM-18
  R11a; carried in by the re-extract.

---

## 5. Student-facing UI is missing

The engine computes `matchedCategory` and exposes it via
`useAnalysisEngine()` ([engine/react/use-analysis-engine.ts:17](engine/react/use-analysis-engine.ts#L17)),
but the **only consumer today is the dev sidebar**. The pedagogical loop
described in the rule-sets — coach-marks, "Show me" walk-throughs, confetti
on success, the Hazbot character launcher — is not wired up in the production
UI.

What's missing:

- **A Hazbot launcher** (the in-app button/avatar that students click to
  surface the current category's `feedback` text).
- **A feedback panel** rendering `Category.feedback` (and `Category.arrowText`
  when the panel is in "walk-through" mode).
- **Visual-feedback overlays** that interpret `Category.visualFeedback`
  (outlining the Restart button, drawing coach-marks at the Setup panel,
  pointing at specific zone tabs, etc.). Today `visualFeedback` is a plain
  prose string; turning it into UI hints needs either:
  - A structured schema in the sheet (e.g. JSON-shaped pointers), or
  - A hand-authored mapping in the host app keyed by `(ruleSetId, categoryId)`.
- **Confetti / success animation** on terminal "ready to answer" categories.
- **Re-trigger / cooldown logic** — when should the same feedback show
  again? Once per session? Per page? Per matched-category transition?
- **Matched-category transition events.** [engine/safely-evaluate-impl.ts:30](engine/safely-evaluate-impl.ts#L30)
  notes this as a future engine-event affordance (rather than computing
  transitions on the consumer side from snapshot diffs).

The dev sidebar is appropriately scoped — it's the validation surface, not
the student-facing surface. Treat the work above as a separate feature on
top of the substrate, not part of WM-10.

---

## 6. Engine features not implemented (would unlock richer rule-sets)

- **Paired-reading DSL.** Some sheet rubrics implicitly compare two runs
  (e.g. "ran with X, then ran with Y"). Today the DSL has `WITH` binding
  to a single witness reading and factor variables that fold across all
  readings. There's no primitive for "two readings exist such that …". The
  current bridge-side `ForestWAWOSuppression` cheats by checking whether
  both vegetation types appear in **one** witness reading's zones (i.e.
  two zones in one run), which works for two-zone presets but isn't
  literally "paired runs."
- **`arrowText` rendering.** Defined on `Category`
  ([engine/types.ts:41](engine/types.ts#L41)) and authored in rule-sets
  23–25; not surfaced anywhere yet. The substrate's responsibility is just
  carrying it through — host app needs to display it.
- **Persistence.** Engine state is in-memory only — page reload clears
  readings + factor variables. Documented in [CLAUDE.md](../../CLAUDE.md)
  "Restart vs Reload behavior." Fine for the current feature, but a future
  "show me where I was last session" surface needs serialization.
- **Engine-emitted log events.** Today the engine receives events via
  `consume()` but emits nothing back to the LARA log stream beyond the
  one-shot `AnalysisEngineActivated`. A "matched category changed" event
  would let dataset consumers correlate student behavior with pedagogical
  state without re-running the engine offline.

---

## 7. Tooling / process gaps

- **Manual validation snapshot.** The "Current validation status" table in
  [localhost-urls.md](../../docs/hazbot-validation/localhost-urls.md#L143)
  is a hand-maintained snapshot (currently dated 2026-05-11). It drifts
  whenever rule-sets are re-extracted or stubs are filled. Either:
  - Automate it (a script that loads each rule-set + walks categories), or
  - Drop the snapshot and rely on the per-rule-set Jest sweeps.
- **No end-to-end Playwright regression suite.** Validation today is a
  Playwright-MCP-driven manual walk per the
  [CLAUDE.md "Playwright MCP testing" section](../../CLAUDE.md). For each
  re-extract or stub fill we walk seven playbooks by hand. A Cypress or
  Playwright spec that drives a representative scenario per rule-set
  would catch regressions on every CI run.
- **Parser ↔ grammar drift.** The DSL grammar lives in
  [dsl-grammar.md](dsl-grammar.md) (auto-generated from the sheet's README
  tab). The hand-written parser at [engine/parser/](engine/parser/) does
  **not** update when `dsl-grammar.md` changes. The workflow doc tells
  contributors to "verify the parser still implements the documented
  grammar" but there's no mechanical check. A grammar-conformance test
  that consumes `dsl-grammar.md` as fixture data would close the gap.
- **`APP_RULES_VERSION` discipline.** Bumped by hand in
  [wildfire/rules-version.ts](wildfire/rules-version.ts) per the policy
  in [docs/hazbot-update-workflow.md](../../docs/hazbot-update-workflow.md#L137).
  CI doesn't enforce "if `src/hazbot/rule-sets/*.ts` changed in a PR, this
  constant must change." A pre-merge check would catch the obvious miss.
- **`EXCLUDED_TABS` lives in two places.** `scripts/extract-impl.js` has the
  authoritative set; `localhost-urls.md` and the "Regenerating this doc"
  script in it both reference the same set by hand. Single source if/when
  the placeholder tabs get filled.

---

## 8. Extracting the engine into its own library

The substrate (`src/hazbot/engine/`) was designed for extraction from day one:

- Lives in its own tree with no upward imports (a `.eslintrc.js` boundary
  rule blocks any). See [engine/.eslintrc.js](engine/.eslintrc.js).
- No MobX dependency (forbidden by the same eslint config).
- React-dom-free (only `react` is imported, for hooks + the Provider).
- Self-contained version string at [engine/version.ts](engine/version.ts).
- Public API surface explicitly enumerated in
  [engine/index.ts](engine/index.ts).
- Generic over `TReading` and `TDefaults` — wildfire-specific types live
  outside the engine in `src/hazbot/wildfire/`.

The work below is mechanical scaffolding plus a few small substrate-side
cleanups to make the package boundary unambiguous.

### 8.1 What stays vs. what moves

```
NEW PACKAGE (e.g. @concord-consortium/analysis-engine)
├── src/                          ← move src/hazbot/engine/* here
│   ├── engine.ts
│   ├── evaluator.ts
│   ├── types.ts
│   ├── version.ts                ← becomes sole source of truth; drop the
│   │                               constant, read package.json at build time
│   ├── parser/
│   ├── react/
│   ├── sidebar/
│   ├── error-rendering.ts
│   ├── safely-evaluate-impl.ts
│   ├── find-last.ts
│   ├── walk-references.ts
│   ├── session-id.ts
│   ├── index.ts                  ← unchanged public API
│   └── *.test.ts                 ← move tests + Jest config
├── docs/
│   └── dsl-grammar.md            ← move from src/hazbot/dsl-grammar.md
├── package.json                  ← peer-deps: react ≥17 (any version that has
│                                   useSyncExternalStore — i.e. 18+, with the
│                                   `use-sync-external-store/shim` if you want 17)
├── tsconfig.json                 ← strict TS, emits ESM + CJS + d.ts
├── rollup.config.js / tsup       ← bundler of choice
└── .eslintrc.js                  ← carry the no-mobx / no-react-dom rules

STAYS IN wildfire-model
├── src/hazbot/wildfire/          ← bridge — unchanged, just re-points imports
├── src/hazbot/rule-sets/         ← generated content — unchanged
├── src/hazbot/TBD.md             ← this file (or moved to package's docs/)
├── scripts/extract-hazbot-sheets.js
├── scripts/extract-impl.js
├── scripts/generate-hazbot-validation-playbook.js
├── scripts/playbook-impl.js
└── docs/hazbot-validation/       ← stays (host-app-specific playbooks)
```

The wildfire bridge keeps `getAnalysisEngine()`, `factorVariables`,
`simProps`, `translate`, the `WildfireReading` / `WildfireDefaults` types,
and `APP_RULES_VERSION`. The rule-set extractor + playbook generator are
host-app concerns; they import nothing from the engine substrate today.

### 8.2 Step-by-step

1. **Create the package skeleton.** New repo (or monorepo subpath), npm
   init, set `name` (e.g. `@concord-consortium/analysis-engine`), `version`
   matching today's `ENGINE_VERSION` (`0.0.1`), `main` / `module` / `types`
   pointing at the build output.
2. **Pick a bundler.** `tsup` is the lowest-friction choice for a small TS
   library — `tsup src/index.ts --format esm,cjs --dts` produces both
   module formats plus `.d.ts` with no rollup config required.
3. **Move the engine tree wholesale.** `git mv src/hazbot/engine/*
   <newpkg>/src/` (use `git mv` so history is preserved). Move
   `src/hazbot/dsl-grammar.md` to `<newpkg>/docs/`.
4. **Adjust `engine/.eslintrc.js`.** The current rule says "files in
   `src/hazbot/engine` can only import from inside `src/hazbot/engine`."
   In the new package, the boundary is the package itself; either drop
   the rule (the package is already inherently isolated) or convert it to
   a "no parent-directory imports" rule for future safety. Carry over the
   `no-restricted-imports` rules (no MobX, no `react-dom`).
5. **Replace `ENGINE_VERSION` with a build-time inject.** Today
   [engine/version.ts](engine/version.ts) hard-codes `"0.0.1"`. Replace
   with a tiny build step that writes the package.json `version` into the
   bundle — keeps the runtime + npm versions identical so a host app can
   correlate.
6. **Carry over the Jest config.** The engine's tests use plain Jest; copy
   the relevant slice of root `jest.config.js` (TS transform, jsdom env
   for `react/`/`sidebar/` tests). The wildfire-model app's Jest config
   stays as-is.
7. **In wildfire-model, swap the imports.** Replace `from "../engine"`
   inside the wildfire bridge with `from
   "@concord-consortium/analysis-engine"`. Add the package as a dep in
   `wildfire-model/package.json`. The boundary already runs through
   `index.ts` — only the wildfire-bridge files (`engine-singleton.ts`,
   `factor-variables.ts`, `sim-props.ts`, `translate.ts`,
   `types.ts`) need the change.
8. **Update the rule-sets generator's emitted import path.** Each rule-set
   module starts with `import { RuleSet } from "../engine"`. Update
   `scripts/extract-impl.js`'s emit template (and the generated files; or
   just re-extract once after the swap).
9. **Drop the in-app `import/no-restricted-paths` zone.** Once the engine
   is an external package, the zone that prevented `src/hazbot/engine` from
   importing app code is moot. Delete `src/hazbot/engine/.eslintrc.js`
   (or leave it, marked vestigial, while the move stabilizes).
10. **CI / release flow on the new package.** GitHub Actions running
    `npm test` + `npm run lint` + `npm run build` on PR, tag-driven
    publish to npm (`npm publish --access public` for the scoped name, or
    private registry). Cut `0.1.0` for the first published version once
    the package is wired into wildfire-model.

### 8.3 Substrate-side cleanups to do before or alongside extraction

These are small and don't block extraction, but the moment of extraction is
a natural time to do them:

- **Sidebar as a `package.json#exports` subpath.** The in-app boundary is
  already split — [engine/index.ts](engine/index.ts) no longer re-exports
  `Sidebar`; consumers import from `../engine/sidebar`. The packaged form
  needs the same split codified in `package.json#exports` so users get
  `@concord-consortium/analysis-engine` (core) vs.
  `@concord-consortium/analysis-engine/sidebar` (opt-in, side-effect CSS
  import scoped to that subpath).
- **Decide on `arrowText` typing — once a consumer exists.** Today
  ([engine/types.ts:41](engine/types.ts#L41)) it's an optional `string`
  written by the extractor and read by no one. The right schema (free-form
  string vs. `string[]` vs. typed `{ step, text, target, … }[]`) depends
  on what the host-app coach-mark renderer (TBD §5) wants from it.
  Defer until that renderer is being built; while the field has one
  writer and zero readers, changing its type costs nothing. Re-visit
  before the substrate is published.
- **Flesh out the package README.** A placeholder
  [engine/README.md](engine/README.md) exists today and points at the
  spec, [engine/index.ts](engine/index.ts), and
  [engine/types.ts](engine/types.ts) as the API source-of-truth. At
  extraction, replace the placeholder body with: install instructions,
  minimal-usage example (build a `RuleSet`, construct an `Engine`, feed
  `consume()`), `ConsumedEvent` / `BaseReading` walkthrough,
  `useAnalysisEngine` hook signature, the sidebar subpath entry, and a
  `CHANGELOG.md` capturing `0.0.1` → `0.1.0` (first published version).

### 8.4 What extraction does **not** unblock

- Filling in the two stubbed impls — those are wildfire-bridge code, not
  substrate code. They stay in `src/hazbot/wildfire/` regardless.
- Building the student-facing UI — that's a host-app feature.
- The parser ↔ grammar drift concern — actually slightly *worse* after
  extraction (the host app re-generates `dsl-grammar.md` from its own
  sheet; the package ships its own copy of what the parser implements;
  drift becomes cross-repo). The grammar-conformance test in §7 closes
  this gap.
