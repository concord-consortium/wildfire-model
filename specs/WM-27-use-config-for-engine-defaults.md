# Hazbot: Source Engine Defaults from the Simulation Config

**Jira**: https://concord-consortium.atlassian.net/browse/WM-27

**Status**: **Closed**

## Overview

The Hazbot analysis engine decides whether a student changed a simulation
variable by comparing logged `SimulationStarted` events against a "defaults"
object. Previously that object was hand-extracted, per rule-set, from a
spreadsheet's Details column — and when the extraction came up empty the engine
refused to load the rule-set. This work makes the engine derive its
change-detection defaults directly from the resolved simulation config (preset +
URL params), which is the actual initial state the simulation loads, and removes
the per-rule-set defaults object and the missing-defaults failure mode.

The Hazbot gives students feedback based on what they changed in the wildfire
model. To know what "changed" means, it needs the model's starting state.
Previously that starting state was transcribed by hand from a planning
spreadsheet into each rule-set, which was brittle: when the transcription was
incomplete, the Hazbot silently turned off for that activity. This change has
the Hazbot read the starting state from the same configuration the simulation
itself uses, so every activity's Hazbot works without manual data entry, and a
class of "Hazbot won't load" failures disappears. It also unblocks WM-18, which
needs the engine to load freshly-extracted rule-sets.

**Impact scope.** The Hazbot is in early development; no students are using it
yet. It is surfaced only through the developer/researcher sidebar
(`hazbotSidebar`). Rule-sets 32–35 previously shipped with `defaults: {}` *and*
referenced `set*` factor variables, so they failed to load — meaning they could
not be exercised in the dev sidebar or research tooling. There was no live
student-facing breakage; removing the failure mode also ensures those rule-sets
work when the student-facing UI ships.

## Requirements

### Config-derived defaults

1. A shared `getResolvedConfig()` helper is added to `src/config.ts`. It returns
   the full resolved config — the merge `Object.assign(getDefaultConfig(),
   preset, getUrlConfig())`, with the preset resolved from the URL as
   `presets[getUrlConfig().preset || getDefaultConfig().preset]`. It accepts an
   optional explicit preset partial; when one is supplied the helper uses it in
   place of the URL-resolved preset, so a caller can still resolve a config
   around an injected preset (the `SimulationModel` constructions in
   `simulation.test.ts` rely on this). The explicit preset partial substitutes
   **only** the preset slot of the merge: the result is still
   `Object.assign(getDefaultConfig(), explicitPreset, getUrlConfig())`, so
   `getUrlConfig()` overrides continue to apply on top. `src/models/simulation.ts`
   and the wildfire bridge both route through this helper for the full merge.
   `src/models/stores.ts` no longer resolves a preset itself: its duplicated
   `getUrlConfig().preset || getDefaultConfig().preset` expression is deleted and
   it constructs `SimulationModel` with no argument. The `SimulationModel`
   constructor / `load()` `presetConfig` parameter becomes optional, retained
   only so tests can inject a config. The merge is intentionally a **shallow**
   `Object.assign`: each top-level config key — including the `zones` tuple — is
   taken wholesale from the highest-priority source that defines it (URL over
   preset over base defaults), with no per-zone or other nested deep merge.
   Throughout this spec, "**resolved config**" refers to exactly this merge
   result.
2. The wildfire bridge derives `WildfireDefaults` (per-zone `terrainType` /
   `vegetation` / `droughtLevel`, plus wind `speed` / `direction`) from the
   resolved config returned by `getResolvedConfig()`.
3. Derived zone defaults are expressed as the same string labels the
   `SimulationStarted` payload uses (`terrainLabels` / `vegetationLabels` /
   `droughtLabels`), with one default derived per populated entry of the
   resolved `config.zones` tuple, in tuple order (independent of `zonesCount`),
   so factor-variable comparisons are like-for-like. Deriving a default for
   every config zone is safe even when a run uses fewer zones: `anyZoneDiffers`
   is driven by the reading's zones and ignores surplus defaults.
4. Derived wind defaults are `{ speed: config.windSpeed, direction:
   config.windDirection }`.
5. `setTerrainType`, `setVegetation`, `setDroughtLevel`, `setWind`,
   `setAnyZoneVar`, and `setAnyVar` compare logged `SimulationStarted` events
   against the config-derived defaults, which reach `compute()` via a new
   engine-level `EngineOpts.defaults` input the bridge supplies at construction.

### Substrate removal (full)

6. `RuleSet.defaults` and `FactorVariableImpl.requiredDefaults` /
   `SimPropImpl.requiredDefaults` are removed from the engine substrate. The
   `DeepPartial` helper, retained only for `RuleSet.defaults`, is removed.
7. The `missing-defaults` failure mode and all its supporting machinery are
   removed: the `missing-defaults` reason in the `load-failure` `EngineError`
   variant — and the code that produces it — while the `load-failure` variant
   itself stays for its `missing-rule-set` / `missing-impl` reasons;
   `Engine.collectFromImpl()`, `Engine.implsWithIncompleteDefaults`,
   `validate-defaults.ts` (`validateDefaultsPath`), and the incomplete-defaults
   guard branch in `safely-evaluate-impl.ts`. The engine no longer rejects or
   degrades any rule-set for absent or incomplete defaults.
8. The engine loads every existing rule-set — 23, 24, 25, 32, 33, 34, 35 — with
   no load-blocking error attributable to defaults.
9. Rule-sets 23 and 24 — whose presets the Background's *Spreadsheet
   verification* table confirms match their documented initial conditions —
   continue to classify behaviour unchanged. The existing per-rule-set
   classification suites `23.test.ts` and `24.test.ts` pass unchanged once
   `RuleSet.defaults` is replaced by config-derived defaults supplied via
   `EngineOpts.defaults`. No test is added that pins config-derived defaults to
   the now-deleted hand-extracted `defaults` objects.

### Extractor & generated modules

10. The sheet-based defaults-extraction logic is retired from
    `scripts/extract-impl.js` (`mergeDefaults`, `parsePerZoneDefault`,
    `parseWindDefaults`, the `FACTOR_VAR_TO_FIELD` map, the `defaults` assembly
    in `parseTab`, `emitDefaults`, and the `TBD (activity revision)` handling).
    The generator no longer emits a `defaults` field.
11. The `defaults` field is removed from the 7 committed generated rule-set
    modules (`23.ts`–`35.ts`) by a direct surgical edit — **not** by
    regeneration — so no formatter, import-ordering, line-ending, or whitespace
    drift is introduced. Every line other than the removed `defaults` field
    stays byte-identical to what is currently committed.
12. A note is added to `docs/hazbot-update-workflow.md` recording that, after
    WM-27, the committed `src/hazbot/rule-sets/*.ts` modules are intentionally
    *not* a clean regenerate: regenerating them before WM-18 lands will
    reintroduce unrelated `details`/wording drift from the newer spreadsheet,
    because the surgical strip removed only the `defaults` field and left all
    other content at its older-sheet revision. WM-18 owns reconciling the
    modules with a clean regenerate.

### Observability

13. The bridge surfaces the preset name the activity URL **requested** and
    whether that name was **recognized** (matched a key in `src/presets.ts`),
    so a mis-binding is visible rather than silent.
    - **Log payload.** When the URL provides a `preset` value, that value is
      added verbatim to the `AnalysisEngineActivated` log payload — together
      with a boolean indicating whether that value is **recognized**. This
      extends `buildAnalysisEngineActivatedPayload()`. The payload is emitted via
      `src/log.ts`'s `externalLog` path, so the unrecognized-preset case is
      machine-detectable in logs. *Limitation:* the `AnalysisEngineActivated`
      event is emitted only when the engine activates; an activity whose engine
      never activates logs no such event, so a mis-bound `preset` there is
      caught by the dev sidebar but not by logs.
    - **Dev sidebar.** When the URL provides a `preset` value, the dev sidebar
      displays it, styled with the sidebar's existing match/no-match convention:
      green when the value is a **recognized** preset, red with strikethrough
      when it does not. Because `text-decoration` is not announced by screen
      readers, the no-match state additionally carries a **text** cue (e.g.
      ` (unrecognized preset)`). The display carries a short identifying label
      (e.g. "Requested preset:") preceding the value.
    - When the URL provides no `preset` param, the sidebar shows nothing.

    Requirement 13 surfaces the *requested* preset name, not the full derived
    `WildfireDefaults`. An activity configured via URL params alone, or a preset
    plus heavy URL overrides, can still derive a wrong baseline that this
    observability will not catch. Surfacing the full derived defaults is
    deliberately deferred — the Hazbot is dev-only with no students yet — and is
    a natural candidate to revisit when the Hazbot becomes student-facing.

### Quality gates

14. Affected unit tests are updated; `npm test`, `npm run lint`, and
    `npm run build` all pass.

## Technical Notes

- **Config resolution.** The merge is `Object.assign(getDefaultConfig(),
  presets[getUrlConfig().preset || getDefaultConfig().preset], getUrlConfig())`.
  Before WM-27 it lived in `simulation.ts`; `stores.ts` separately duplicated
  only the preset-name resolution. `getResolvedConfig()` centralizes both.
- **Zone count.** The resolved config's `zones` is a fixed-arity tuple
  (`[Zone, Zone, Zone?]`) and `zonesCount` (`2 | 3 | undefined`) determines how
  many are live. The derivation emits one default per populated entry of
  `config.zones`, regardless of `zonesCount`. `anyZoneDiffers` iterates the
  *reading's* zones and skips when the default for that index is `undefined`, so
  surplus derived zones are harmless.
- **Wind.** `setWind` compares `speed` and `direction` only; `windScaleFactor`
  is not part of the comparison. All current rule-sets (23–35) have wind 0/0.
- **Substrate genericity.** Removing `RuleSet.defaults` / `requiredDefaults` /
  `validate-defaults.ts` is deliberately a *relocation*, not a narrowing: the
  engine keeps a generic default-injection channel in `EngineOpts.defaults`,
  which any future consumer can supply at construction. What is removed is
  `RuleSet`-baked *static* defaults and load-time *path validation* of them.
  Post-WM-27 substrate philosophy: defaults are an engine-construction input,
  and ensuring they are complete and well-formed is the consumer's
  responsibility, not the substrate's.
- **Derivation does no validation, by design.** The config → `WildfireDefaults`
  derivation reads `terrainType` / `vegetation` / `droughtLevel` and
  `windSpeed` / `windDirection` straight from the resolved config, converting
  enum values via the *total* `terrainLabels` / `vegetationLabels` /
  `droughtLabels` maps. The config's zone shape (`ZoneOptions`) types these
  fields loosely (`terrainType?` / `vegetation?` optional, `droughtLevel?` is
  `number`), so the derivation casts (`as TerrainType` etc.) to index the label
  maps. The casts are sound, not defensive: `getDefaultConfig()` and every
  preset populate all three zone fields and are TypeScript-checked. The only way
  to inject a malformed value is a hand-crafted `?zones=` URL param — which
  visibly breaks terrain rendering independent of the Hazbot.
- **Sim-props** carry a `WildfireDefaults` type parameter but none read
  defaults, so they are behaviourally unaffected.
- **Spreadsheet verification.** Cross-checking the source spreadsheet's SIMINIT
  sheet against `src/presets.ts` confirmed that, for every current rule-set, a
  preset exists whose zone/wind values match the documented initial condition,
  so config-derived defaults are equivalent to the (correct) hand-extracted
  ones. This verifies that matching presets *exist*; it does not verify each
  activity's LARA URL selects the matching preset (see RESOLVED OQ4).

## Out of Scope

- WM-18 (rule-set validation) — this story unblocks it but does not implement it.
- Refreshing the generated rule-set modules' non-`defaults` content from the
  2026-05-21 spreadsheet — belongs to WM-18.
- Adding new rule-sets, presets, or activity pages.
- Changing the activity → preset/URL-param bindings in LARA, and verifying or
  auditing those bindings against SIMINIT — activity setup is the PI's
  responsibility. No follow-up ticket is filed.
- Rule-sets 42 / 45 / 47 / 54 (not currently extracted).
- Automated detection of drift between the spreadsheet's SIMINIT sheet and the
  presets in `src/presets.ts`. Noted as potential future tooling, not WM-27 scope.
- The xlsx-reading wrapper in `extract-hazbot-sheets.js` beyond removing the
  `defaults` emission path.
- Any change to how sim-props are evaluated.

### Implementation-spec verification rounds

The implementation spec was verified against the codebase across four
self-review rounds. Beyond the decisions above, these rounds corrected
code-block-level details so each step leaves `npm test` / `npm run lint` /
`npm run build` green — notably: the `deriveWildfireDefaults` and
`getRequestedPresetInfo` casts (`ZoneOptions` types zone fields loosely;
`getUrlConfig()` returns `preset` as runtime-optional and `parseFloat`-coerces
all-digit values, so `?preset=23` arrives as a number); computing `recognized`
via `Object.prototype.hasOwnProperty.call(presets, name)` rather than a bare
bracket lookup (which would resolve inherited `Object.prototype` members); the
dev-sidebar diagnostics section being intentionally **not** gated on
`engine.ruleSet` (a `?preset=` mis-binding is worth surfacing even with no
rule-set); computing the sidebar diagnostic inside the sidebar-mount branch so
the `getUrlConfig()` scan is not paid on every render; and the documented
limitation that the `AnalysisEngineActivated` preset payload is emitted only
when the engine activates.
