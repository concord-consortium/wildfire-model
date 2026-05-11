# Implementation Plan: Hazbot Analysis Engine + Debug Sidebar

**Jira**: [WM-10](https://concord-consortium.atlassian.net/browse/WM-10)
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **In Development**

## Overview

Fourteen steps, ordered by dependency. Each step is a single coherent commit. The substrate + wildfire-bridge work lands first (eight steps) in isolation; the supporting scripts and the generated artifacts follow (four steps); a workflow doc consolidates the late-update round-trip; a final wire-up step plugs everything into the running app. No step depends on a later step. Code shapes pinned by the requirements spec are referenced rather than duplicated here — the implementation plan is about ordering, file layout, and algorithm choices, not retyping spec contracts.

Roughly: substrate = ~2200 lines (~half tests), bridge = ~600 lines, scripts = ~800 lines, generated rule-set + playbook artifacts = ~1500 lines (mostly mechanical), wire-up = ~200 lines. Tests interleave with the code they test.

## Implementation Plan

### Substrate scaffolding, types, and ESLint guard

**Summary**: Create the substrate's directory layout, declare every substrate-owned type the rest of the work depends on, pin the public API surface as a re-export barrel, and stand up the ESLint `import/no-restricted-paths` rule that mechanically enforces "zero imports out of `src/hazbot/engine/**`." This step ships no behavior — it's the foundation everything else lands on, and getting the substrate boundary right on commit 1 prevents accidental wildfire-leakage in later commits.

**Files affected**:
- `src/hazbot/engine/types.ts` — new. `BaseReading`, `ReadingUpdate`, `ConsumedEvent`, `EngineError` discriminated union (per spec line ~525), `RuleSet<TDefaults>`, `Category`, `FactorVariableDef`, `FactorVariableImpl<V, TReading, TDefaults>`, `SimPropImpl<TReading, TDefaults>`, plus a small `DeepPartial<T>` utility type. Verbatim from Tech Notes' "Library scope and the Reading boundary" + "Rule-set TypeScript shape" + "Factor-variable / Sim-prop implementation interface" — **except** `compute` takes a second `defaults: TDefaults` parameter (per PASS3-API-1) so factor-variable impls have the same defaults-access channel as sim-props. Final shape: `compute: (readings: TReading[], defaults: TDefaults) => { value: V; witnesses: TReading[] }`. Both impl interfaces carry a **required `defaultValue: V` field** (sim-props always `false` since they're boolean predicates; factor variables declare per their value type — `false` for booleans, `new Set()` for Set-typed, `[]` for array-typed) — read by `safelyEvaluateImpl` on catch (see step 4 / ENG-1). Both impl interfaces additionally carry an optional `isStub?: boolean` field (per IMPL-4) — fits the existing optional-metadata pattern alongside `ambientStateKeys` and `requiredDefaults`. The substrate's load-time walk reads `impl.isStub === true` to decide whether to emit a `stub-warning` for that referenced impl. **`RuleSet<TDefaults>.defaults` is typed as `DeepPartial<TDefaults>`** (per EXT-8) — a recursive-partial form that lets generated rule sets emit incomplete defaults (e.g., tabs 32–35 with per-zone TBD fields) without TS-level escapes. `DeepPartial<T>` definition: `type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;` (recursive form needed because wildfire's defaults are nested — `zones[i].droughtLevel` may be missing per zone, not just at the top level). The substrate's runtime validator (step 3) walks `requiredDefaults` paths against the partial-typed defaults and emits `missing-defaults` load failures for unresolved paths; bridge-side impls receive defaults typed as `TDefaults` (not Partial) because the wrappers cast internally when `isActive` (see step 4). **API baseline note** (per PASS2-1): both impl interfaces' field sets — including `defaultValue`, `requiredDefaults`, `ambientStateKeys`, `isStub`, and the `compute(readings, defaults)` two-argument signature — and the `RuleSet.defaults: DeepPartial<TDefaults>` typing are baselined at the substrate's `0.0.1` initial version per Tech Notes line 509. Adding required fields to either interface post-`0.0.1` would be a substrate-API expansion event triggering a semver bump per Req 20; adding optional fields is a minor bump; removing fields is a major bump. Tightening `defaults` from `DeepPartial<TDefaults>` to `TDefaults` post-`0.0.1` would be a major bump (host apps' incomplete-defaults rule sets would fail to compile); loosening further (e.g., to `unknown`) would also be a major bump.
- `src/hazbot/engine/version.ts` — new. `export const ENGINE_VERSION = "0.0.1";`
- `src/hazbot/engine/error-rendering.ts` — new. The single source-of-truth `(severity, message)` map (spec Tech Notes "Error rendering map"); exports `renderError(e: EngineError, ctx?: { readingsLength: number }): { severity: "error" | "warning"; message: string }`. The optional `ctx` parameter (per EXT-19) gives the renderer access to dynamic context that's not on the EngineError itself — currently just `readingsLength` for the factor-variable `impl-eval-throw` rendering, which substitutes the readings count into "during computation over N readings." Both call sites (the engine's parallel `console.error`/`console.warn` path and the sidebar's `<ErrorsPanel />`) pass `{ readingsLength: engine.readings.length }`; the parameter is optional only so that non-substrate consumers (e.g., a future programmatic-export tool that doesn't have engine state in scope) can render the canonical message without the per-error count, falling back to a context-free phrasing ("during computation" without a count). **`impl-eval-throw` rendering branches on `implKind` and `readingIndex` presence** (per EXT-19): sim-prop rendering uses the existing `"Sim-prop ${implName} threw at reading ${readingIndex}: ${String(thrown)}"` template; factor-variable rendering uses `"Factor variable ${implName} threw during computation over ${ctx?.readingsLength ?? "?"} readings: ${String(thrown)}"`. Honest framing — the substrate can't attribute factor-variable throws to a specific reading without re-running compute incrementally; the readings-count context is the most useful per-error signal the substrate can provide for that case. **Exhaustive narrowing** (per PASS3-MAINT-1): the renderer's outer `switch (e.kind)` AND the inner `switch (e.reason)` blocks for `load-failure` and `orphan-modifier` (the two variants whose `reason` field discriminates further into rendering-map rows) end with a `default: { const _exhaustive: never = e; throw new Error(\`Unrendered error kind: ${(_exhaustive as { kind: string }).kind}\`); }` (or the analogous `_exhaustive: never = e.reason` for the inner switches). Adding a new `EngineError` variant — or a new `reason` value to the discriminated unions — fails TS compile at the renderer rather than relying on the test suite to catch a missed row. The test suite (`error-rendering.test.ts`) still exists as a behavior check on each row's content, but the *exhaustiveness* invariant is enforced by the type system, not by remembering to author a new test row alongside each new variant. Symmetric with how the spec already treats other substrate invariants (ESLint zone rule, AC for auto-generated header, defaults-path validator) as mechanical guards.
- `src/hazbot/engine/error-rendering.test.ts` — new. One test per row in the rendering map: assert non-empty message + correct severity for each `kind` × `reason` combination. Fixture-style: small array of `EngineError` literals, snapshot-style asserts on the rendered output. The test verifies content, not exhaustiveness — exhaustiveness is now a TS-compile-time guard per the renderer's `_: never` pattern (see above). **`impl-eval-throw` per-impl-kind coverage** (per EXT-19): two distinct test rows — (i) sim-prop variant with `readingIndex` populated → asserts the rendered string includes "at reading {N}"; (ii) factor-variable variant without `readingIndex` → asserts the rendered string includes "during computation over {N} readings" with the `readingsLength` context substituted from the test's `ctx` argument. A third assertion verifies the context-free fallback ("during computation" without a count) when `ctx` is omitted.
- `src/hazbot/engine/find-last.ts` — new (per EXT-10). Tiny substrate-internal utility: `export function findLast<T>(arr: readonly T[], pred: (item: T, i: number) => boolean): T | undefined { for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i], i)) return arr[i]; return undefined; }`. Replaces `Array.prototype.findLast` (ES2023, ~2022 browser availability) which would either fail at runtime in older school-managed browsers or require `lib: ["ES2023"]` in tsconfig — neither acceptable for a substrate that aims for broad runtime support. Five lines, no deps, lives alongside `session-id.ts` as another substrate-internal utility. Used by step 4's orphan-modifier detection (`lastFailedTrigger = findLast(errors, e => e.kind === "ambient-validation")`). Stays substrate-internal — not re-exported from `engine/index.ts` per PASS2-2's internal-only export surface convention. Polyfilling `Array.prototype.findLast` was rejected because mutating the global prototype is incompatible with the substrate's "MobX-free, minimal public footprint" stance per Req 1. **Substrate ES2022+ avoidance** (per EXT-17): the same posture applies to `Array.prototype.at` (ES2022, Chrome 92 / Safari 15.4 / Firefox 90) — step 4's orphan-modifier pseudocode uses `arr[arr.length - 1]` instead of `arr.at(-1)`. If a future call site needs negative-index access elsewhere, a `last<T>(arr): T | undefined` helper alongside `findLast` is the natural extension; for one current call site, inline is fine.
- `src/hazbot/engine/find-last.test.ts` — new. Three cases: returns the last matching element when matches exist; returns `undefined` when no element matches; returns `undefined` on an empty array. ~20 lines.
- `src/hazbot/engine/index.ts` — new. Public API barrel. Re-exports exactly the names listed in spec Tech Notes' "Substrate public API surface": `Engine`, `EngineOpts`, `BaseReading`, `ReadingUpdate`, `ConsumedEvent`, `EngineError`, `RuleSet`, `Category`, `FactorVariableDef`, `FactorVariableImpl`, `SimPropImpl`, `Expression`, `ParseError`, `ENGINE_VERSION`, `AnalysisEngineProvider`, `AnalysisEngineProviderProps`, `useAnalysisEngine`, `Sidebar`. The class/component re-exports point at empty stubs in this commit; subsequent steps fill them in. Stubs are typed correctly so downstream commits can compile against them.
- `src/hazbot/engine/.eslintrc.js` — new. Sub-folder ESLint override that adds `import/no-restricted-paths` zone rule scoped to the substrate:

  ```js
  module.exports = {
    rules: {
      // Direction note (per EXT-14): `target` = the directory whose files are SUBJECT to the rule
      // (the importer side — these files' imports get checked). `from` = paths the `target`'s files
      // CANNOT IMPORT. `except` = exceptions within `from` that ARE allowed. So this zone reads:
      // "files inside src/hazbot/engine cannot import from anywhere in src/, except other files
      // inside src/hazbot/engine itself" — i.e., engine files can only import within engine.
      // Importers OUTSIDE engine/ (e.g., the wildfire bridge) remain free to import engine exports;
      // this rule does not restrict that direction.
      "import/no-restricted-paths": ["error", {
        zones: [{
          target: "./src/hazbot/engine",       // engine files are checked (importer side)
          from: "./src",                       // cannot import from anywhere in src/
          except: ["./src/hazbot/engine"],     // except intra-substrate imports
          message: "Substrate code may not import outside src/hazbot/engine/. See Req 1."
        }]
      }],
      "no-restricted-imports": ["error", {
        // `paths` matches exact module names. `patterns` matches subpaths (per EXT-15) —
        // catches `react-dom/client` (React 18 root API), `mobx-react/lite`, etc. that bare-name
        // matchers silently allow. Both clauses needed: `paths` covers the bare-name case
        // (some glob engines don't match the bare name with `name/*` patterns).
        paths: [
          { name: "mobx", message: "Substrate is MobX-free (Req 1)." },
          { name: "mobx-react", message: "Substrate is MobX-free (Req 1)." },
          { name: "react-dom", message: "Substrate ships no react-dom imports (LA-2 / R10-3)." }
        ],
        patterns: [
          { group: ["mobx/*", "mobx-react/*"], message: "Substrate is MobX-free (Req 1)." },
          { group: ["react-dom/*"], message: "Substrate ships no react-dom imports (LA-2 / R10-3)." }
        ]
      }]
    }
  };
  ```

  **Path-resolution gotcha** (per LIB-1): `eslint-plugin-import`'s `no-restricted-paths` resolves `target` / `from` / `except` via `path.resolve(basePath, ...)` where `basePath = process.cwd()` (verified against `eslint-plugin-import@2.27.5`'s rule source, line 78). Paths are **project-root-relative**, not config-file-relative — even when this rule lives in `src/hazbot/engine/.eslintrc.js`. Drafting `target: "./"` / `from: "../.."` (the natural "relative to my config file" reading) would silently match nothing useful. The `.eslintrc.js` placement (rather than a root-level rule) is still right because it keeps the substrate's invariants co-located with the substrate — the file moves with the substrate when extracted to its own package; only the path strings change to be relative to the new package root. Root `.eslintrc.js` is unchanged.

  **Direction gotcha** (per EXT-14): the `target` / `from` semantic reads like "what to apply the restriction to" but actually means "the IMPORTER side that's subject to the rule." Files matching `target` get their imports checked; imports resolving inside `from` (but not inside `except`) are flagged. Reversing the two — `target: "./src"` with `from: "./src/hazbot/engine"` — would mean "any file in src/ cannot import from engine/," which would block the wildfire bridge from importing substrate types and make the substrate unusable. The current direction (target=engine, from=src, except=engine) restricts the substrate's outbound imports while leaving the bridge's inbound imports free. Verified by reading `eslint-plugin-import@2.27.5`'s rule source: per-file traversal selects files matching `target`, then walks each import statement in those files and checks resolution against `from` / `except`.
- `specs/WM-10-hazbot-analysis-engine/requirements.md` — modified (per EXT-5, EXT-8, EXT-19). Four targeted edits to keep the published-API contract aligned with the substrate code landing in this commit:
  - **Line ~613, `FactorVariableImpl` interface**: change `compute: (readings: TReading[]) => { value: V; witnesses: TReading[] }` to `compute: (readings: TReading[], defaults: TDefaults) => { value: V; witnesses: TReading[] }`. Add `TDefaults` to the interface's generic parameter list (`FactorVariableImpl<V = unknown, TReading extends BaseReading = BaseReading, TDefaults = unknown>`). Reflects PASS3-API-1's substrate API change — symmetric with `SimPropImpl.evaluate(reading, defaults)`. Add a one-sentence callout in the surrounding prose noting that factor-variable impls receive defaults at compute-time, with the same load-time `requiredDefaults` validation pattern as before.
  - **Line ~728+ (Rule-set TypeScript shape subsection), `RuleSet.defaults` field**: change the field type from `TDefaults` to `DeepPartial<TDefaults>` (per EXT-8) and add the `DeepPartial` definition + a one-sentence rationale: "the partial typing lets generated rule sets emit incomplete defaults (e.g., tabs blocked on TBD source values) without TS-level escapes; substrate runtime validation walks `requiredDefaults` paths and emits `missing-defaults` load failures for unresolved paths; bridge-side impls receive `defaults: TDefaults` (cast internally by `safelyEvaluateImpl` when `isActive`)."
  - **Line ~502, "Substrate public API surface" — React layer subsection**: add a `HookReturn` bullet alongside the existing `AnalysisEngineProvider` / `AnalysisEngineProviderProps` / `useAnalysisEngine` entries. Reflects PASS3-API-3's published-API formalization — `HookReturn` is the named return type of `useAnalysisEngine`, used by host apps writing typed factory wrappers per LIB-3's recommended pattern.
  - **Line ~531, `EngineError`'s `impl-eval-throw` variant** (per EXT-19): change `readingIndex: number` (required) to `readingIndex?: number` (optional). Update the surrounding prose at line ~537 ("`impl-eval-throw`'s `readingIndex` resolves to the full reading...") to honestly describe the new policy: sim-prop throws populate `readingIndex` (the WITH-bound witness reading whose payload triggered the throw inside `evaluate()`); factor-variable throws omit it because `compute(readings, defaults)` operates over the full readings array and the substrate cannot attribute the throw to a specific reading without re-running compute incrementally (rejected as too heavy for an error path). Update the rendering map at line ~578 to branch on `readingIndex` presence: sim-prop renders `"Sim-prop ${implName} threw at reading ${readingIndex}: ${String(thrown)}"`; factor-variable renders `"Factor variable ${implName} threw during computation over ${readings.length} readings: ${String(thrown)}"`.

**Estimated diff size**: ~280 lines (most in `types.ts` + the rendering map; +~20 lines for the requirements.md edits).

The ESLint guard is verified five ways (per PASS3-SEC-1, extended per EXT-15): (a) a deliberate static-import violation (`import { foo } from "../../store"` inside any substrate file during local dev) must error in `npm run lint`; (b) a deliberate **dynamic-import** violation (`const { foo } = await import("../../store")`) must error — `eslint-plugin-import@2.27.5`'s `no-restricted-paths` covers `ImportExpression` AST nodes, but the project's pinned version's behavior should be confirmed against a one-line probe rather than assumed; (c) a deliberate **type-only-import** violation (`import type { Store } from "../../store"`) must error — type-only imports compile away to nothing in JS output, but the rule still flags them as `ImportDeclaration` nodes in AST traversal, and a TS-level coupling defeats the substrate's "no knowledge of host types" intent even though it has no runtime cost. (d) A deliberate **react-dom subpath import** (`import { createRoot } from "react-dom/client"`) must error — covers the React 18+ root API path that bare-name `paths` entries miss. (e) A deliberate **mobx subpath import** (`import { autorun } from "mobx-react/lite"` or `import { observable } from "mobx/dist/mobx.esm.js"`) must error — covers MobX subpath bypasses. (f) The AC "Engine substrate has zero imports from wildfire-model app state... mechanically enforced via an ESLint rule" already requires the rule's existence — adding it here means later steps' tests will surface boundary breaches as soon as they're written. **Verification outcome documentation**: after running (a)–(e) locally during step 1, the implementer captures the result in a comment block atop `engine/.eslintrc.js` listing which import forms the rule catches at the project's pinned ESLint version. If any of (a)–(e) silently passes, the rule needs upgrading (e.g., add `eslint-plugin-import-x` which has stronger dynamic-import coverage, supplement `patterns` with additional globs, or add a custom rule) before step 1 ships — a substrate boundary that doesn't catch its own violations is worse than no documented boundary at all. Captured as a comment rather than a separate spec note so the verification stays co-located with the rule it documents.

---

### DSL parser

**Summary**: Hand-written tokenizer + recursive-descent parser that produces an AST node tree from a DSL expression string. The parser is the load-bearing primitive for engine construction (Req 12) and the validation-playbook generator (AC: validation-playbook generator output). Each category's expression is parsed once at engine load and the resulting AST is cached on the in-memory rule set; runtime evaluation never re-parses.

**Files affected**:
- `src/hazbot/engine/parser/ast.ts` — new. `Expression` discriminated union (`{ kind: "boolean-leaf"; name: string }`, `{ kind: "comparison"; op: ">" | "<" | ... ; lhs: Operand; rhs: Operand }`, `{ kind: "with"; varName: string; propExpr: Expression }`, `{ kind: "and" | "or"; left, right }`, `{ kind: "not"; child }`, `{ kind: "sim-prop-leaf"; name: string }`, `{ kind: "accessor"; name: string; accessor: ".size" | ".length" }`, `{ kind: "literal"; value: number }`), plus `Operand` (the comparison-operand subset: accessor or literal).
- `src/hazbot/engine/parser/tokenize.ts` — new. Linear scan emits tokens with `{ kind, text, start, end }` spans for error reporting. Token kinds: `IDENT-LOWER`, `IDENT-UPPER`, `AND`, `OR`, `NOT`, `WITH`, `LPAREN`, `RPAREN`, `DOT-SIZE`, `DOT-LENGTH`, `EQ`, `NEQ`, `LT`, `LTE`, `GT`, `GTE`, `NUMBER`, `EOF`. Numeric literal grammar pinned to `/^\d+$/` per Req 12; floats / hex / scientific tokenize as `NUMBER` only when they match the integer regex, else they raise a parse error with form-mismatch text.
- `src/hazbot/engine/parser/parse.ts` — new. Recursive-descent over the token stream implementing the precedence table from Req 12 / OQ "AND/OR precedence":
  - `parseExpression` → `parseOr` → `parseAnd` → `parseNot` → `parseUnary` → `parseComparisonOrPrimary` → `parsePrimary`.
  - `parsePrimary` recognizes `( expr )`, `IDENT-LOWER WITH propExpr` (lookahead for `WITH`), `IDENT-LOWER (.size|.length)?`, or — only when the parser is currently inside a `WITH` prop expression's recursion — a sim-prop `IDENT-UPPER`.
  - **WITH greedy binding**: `parseWith` consumes `propExpr` via a dedicated `parsePropExpression` recursion that accepts only sim-prop leaves and the operators between them (AND/OR/NOT/parens); the moment a lowercase identifier or any non-prop token appears, the prop-expression terminates. Parens override the greedy rule (`varName WITH (UniqueX) AND ...` parses with the second AND outside WITH).
  - **Bare sim-prop**: `parsePrimary` outside a WITH context raises `parse-error` if it sees `IDENT-UPPER` ("expected `WITH` binding for sim-prop `<name>`"). Inside WITH, sim-props are valid.
  - **Comparison operand validation**: `parseComparisonOrPrimary` after consuming an operand asserts the operand kind is `accessor` (`.size`/`.length`) or `literal`. A bare `IDENT-LOWER` or parenthesized logical expr in operand position raises `parse-error` with form-mismatch text per Req 12.
  - On any failure: `throw new ParseError({ expression, tokenSpan, offendingToken, detail })`. Caller (Engine constructor) catches and converts to an `EngineError` `parse-error` variant (no inline mutation here).
- `src/hazbot/engine/parser/index.ts` — new. Re-exports `parse(expr: string): Expression`, `ParseError`, AST types. (`Expression` and `ParseError` live in the substrate's public API per spec line ~495.)
- `src/hazbot/engine/parser/parser.test.ts` — new. Per AC: DSL parser handles all operators + precedence + parens + numeric-literal boundaries — tests for each operator, precedence, parens (required and optional), WITH greedy, parens-override-WITH-greedy, comparisons against `.size`/`.length`, error cases. Numeric-literal boundary tests cover the four rejected forms (1.5, -1, 0xff, 1e3) and the three accepted ones (0, 1, 42). `WITH` worked examples (a–d) from the README come from the requirements spec's Background section.

**Estimated diff size**: ~700 lines. Parser code itself is ~300 lines; tests are the rest.

The parser is intentionally hand-written rather than grammar-generated — the DSL is small enough (one paragraph of grammar) and the README is unstable enough (sheet-edited by the author) that a hand-written parser with its own test suite is lower-investment than introducing a parser-generator dep and matching it to README drift. The AC's comprehensive parser test sweep is the stable guard.

---

### Engine class: construction, listener API, load-time validation

**Summary**: The substrate's central `Engine<TReading, TDefaults>` class. This step covers everything that runs during construction — parsing all category expressions, the reference-driven validation walk (missing-impl, missing-defaults, ambient-state-key collection), stub-warning emission, the `subscribe`/`getSnapshot` listener API with reentrancy + atomicity guarantees, and the snapshot-tick rule. `consume()` lands here as a typed shell that early-returns on `!isActive`; the actual trigger/modifier pipeline + evaluator are next step.

**Files affected**:
- `src/hazbot/engine/engine.ts` — new. The `Engine` class:
  - **Constructor** receives `EngineOpts` per spec line ~430. Behavior:
    1. `this.sessionId = generateSessionId()` (helper imported from `engine/session-id.ts`).
    2. `this.requestedRuleSetId = opts.requestedRuleSetId`.
    3. If `opts.ruleSet === undefined`: append `{ kind: "load-failure", reason: "missing-rule-set", ruleSetId: opts.requestedRuleSetId, ... }` to `this.errors`. Skip parse + validation. **Do not retain `this.ruleSet`** — this is the only rejection mode where `ruleSet` stays undefined per Req 11a.
    4. Otherwise: `this.ruleSet = opts.ruleSet`. Parse every `category.expression` via `parser.parse()`; on `ParseError` append a `parse-error` `EngineError` (with `categoryId`, `expression`, `tokenSpan`, `offendingToken`) and store a sentinel in the AST cache for that category.
    5. Run the **reference-driven validation walk**: AST-walk every successfully-parsed category's expression to collect referenced lower-case identifiers (factor variables) and upper-case identifiers (sim-props). For each referenced name: look up the impl in `factorVariables`/`simProps`; emit `missing-impl` if absent. Union every found impl's `requiredDefaults` paths and walk them against `opts.ruleSet.defaults` via `validateDefaultsPath` (helper, see below); emit `missing-defaults` per path failure (one per failing path, including the `[*]` index in the message). **Per-impl defaults-completeness cache** (per EXT-18): as the validation walk visits each impl's `requiredDefaults`, populate `this.implsWithIncompleteDefaults: Set<string>` (impl names whose declared paths don't all resolve against the rule set's defaults). Side-effect of the existing walk — no new validation pass; the Set is the substrate's source-of-truth for "which impls have incomplete defaults" used by step 4's `evaluateForRender` defaults-guard. Union every found impl's `ambientStateKeys` per trigger event type; cache as `this.ambientKeysByTrigger: Map<string, Set<string>>` for trigger-time validation in step 4.
    6. Stub-warning emission: only after the validation walk completes successfully (no `load-failure` or `parse-error` in `errors`), emit `{ kind: "stub-warning", stubName, ... }` for each referenced impl whose `compute()`/`evaluate()` is the stub form. The bridge declares stubs by exposing a static `isStub: true` flag on the impl; substrate reads that flag rather than maintaining its own list.
    7. **Single notify at end of construction** — always fires per Req 19's atomicity rule, even with zero listeners (the counter tick is the load-bearing effect for SE-18). Counter goes 0 → 1.
  - **`isActive: boolean`** — getter, derived as `!this.errors.some(e => e.kind === "load-failure" || e.kind === "parse-error")`. Computed each access to keep the source-of-truth single (the errors log). The `load-failure` check covers all three load-failure reasons (`missing-rule-set`, `missing-defaults`, `missing-impl` per requirements.md's `EngineError` union at line ~527) — so any of those three, plus `parse-error`, makes the engine inactive. Symmetric with step 6's `<CategoriesPanel />` enumeration of the three defined-but-inactive cases (parse-error / missing-defaults / missing-impl).
  - **`subscribe(listener)`**: pushes onto `private listeners: Set<() => void>`; returns unsubscribe. **Reentrancy**: notify snapshots the set into an array before iterating, so subscribe/unsubscribe during a notify doesn't affect the in-flight notify. **Reentrancy guard**: a `private notifying: boolean` flag; if a listener calls back into a state-changing op (e.g., `consume()`), the inner mutation buffers a pending-notify (`this.pendingNotify = true`) instead of recursing; after the outer notify finishes, drains pending into a single follow-up notify. Tests assert each Pass-8 R-item.
  - **`getSnapshot(): number`**: returns `this.snapshotVersion`. Counter ticks: construction always (0→1); `consume()` only if `readings` or `errors` actually mutated (no-op consumes / inactive-engine consumes leave it untouched).
  - **Declaration form for React-callback methods** (per PASS3-API-2): `subscribe` and `getSnapshot` are declared as **arrow-function class fields**, not prototype methods, so they capture `this` at construction and remain callable when passed as bare references. Step 5's hook does `useSyncExternalStore(ctx.engine.subscribe, ctx.engine.getSnapshot)` — a prototype-method declaration would lose `this` when `useSyncExternalStore` later invokes the captured reference and `this.listeners` / `this.snapshotVersion` would crash. Concretely: `subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };` and `getSnapshot = (): number => this.snapshotVersion;`. The same rule applies to any future method that gets passed across the React-callback boundary; `consume` and `isActive` (the consume-path API + getter) stay as conventional class members because they're called via `engine.consume(...)` / `engine.isActive` with `this` intact at the call site. Per-instance arrow-field allocation cost is irrelevant at one engine per page.
- `src/hazbot/engine/session-id.ts` — new. The 12-char nanoid-style helper from spec line ~385. Pure function, no engine deps.
- `src/hazbot/engine/validate-defaults.ts` — new. `validateDefaultsPath(defaults: unknown, path: string): { ok: true } | { ok: false; failingPath: string }`. Implements the Req 11a / "`requiredDefaults` path syntax" semantics: dot segments traverse fields, `[*]` traverses every entry. Empty array fails; undefined intermediate fails; populates the failing path including the offending `[*]` index (e.g., `"zones[1].terrainType"`).
- `src/hazbot/engine/walk-references.ts` — new. AST walker that collects `referencedFactorVars: Set<string>` and `referencedSimProps: Set<string>` from a parsed `Expression`. Pure function.
- `src/hazbot/engine/engine.test.ts` — new. Covers AC: basic listener (Engine exposes subscribe/getSnapshot, listener fires after each consume mutation), AC: listener API contracts (reentrancy, atomicity, initial-snapshot, hook-outside-Provider deferred to step 5, memoization deferred to step 5, snapshot-tick edge cases), AC: defaults validation walk (incl. `[*]` failures, sim-prop side, top-level field), AC: reference-driven walk (declared-but-unused factor variable does not block load), AC: stub warns once per session per stub, AC: runStartTriggers opt recorded by bridge (no-op until step 4 wires consume), **bare-reference invocation** (per PASS3-API-2 — extract `engine.subscribe` and `engine.getSnapshot` into local variables and call them without the engine receiver; assert listener is registered + snapshot is read correctly; protects against a future refactor that converts the arrow-field declarations back to prototype methods).
- `src/hazbot/engine/validate-defaults.test.ts` — new. Each branch of the path-traversal grammar.
- `src/hazbot/engine/walk-references.test.ts` — new. Each AST-node kind round-trips into the right reference set.

**Estimated diff size**: ~600 lines. Engine code ~250 lines; tests ~350 lines.

`consume()` lands as `consume(event: ConsumedEvent): void { if (!this.isActive) return; /* TODO step 4 */ }` so step 4 layers in cleanly without re-touching the listener API or the load-time path.

---

### Engine consume pipeline + evaluators

**Summary**: Wire up the trigger/modifier/no-op pipeline behind `consume()`. Adds the trigger-time ambient-state validation, the orphan-modifier detection rule keyed on `runStartTriggers`, the matching evaluator (highest-first reverse iter over `categories`) and non-short-circuiting leaf evaluator (for sidebar truth-coloring), the WITH evaluator using `compute(readings).witnesses`, and the `safelyEvaluateImpl` wrapper that catches `compute()`/`evaluate()` throws into `impl-eval-throw` errors.

**Files affected**:
- `src/hazbot/engine/engine.ts` (extended) — `consume()` body:
  1. `if (!this.isActive) return;` (no tick).
  2. Call `opts.translate(event, this.sessionId)`. Three branches:
     - `kind: "trigger"` → trigger-time ambient validation against `this.ambientKeysByTrigger.get(event.name)`. For each missing key: append `ambient-validation` error per (impl, key) pair (cardinality rule from Req 3b), populating all fields per requirements.md's EngineError union at line ~529 — `ruleSetId`, `trigger: event.name`, `implName`, `missingKey`, **`event` (the rejected ConsumedEvent itself)**, and **`at: event.at`** (the rejected trigger's timestamp; load-bearing for the modifier-side `failedTrigger.at > lastReading.at` comparison in the orphan-modifier branch below). On *any* missing key: do **not** append a Reading. On no missing keys: append the returned `reading` to `this.readings`.
     - `kind: "modifier"` → run the orphan-modifier detection rule (Tech Notes pseudocode): `lastReading = readings[readings.length - 1]` (per EXT-17 — replaces `readings.at(-1)` for the same ES2022-avoidance reason as `findLast`; `arr[arr.length - 1]` returns `undefined` on empty arrays, matching `at(-1)`'s behavior), `lastFailedTrigger = findLast(errors, e => e.kind === "ambient-validation")` (substrate-internal helper from step 1's `engine/find-last.ts`, replaces `Array.prototype.findLast` per EXT-10). If neither: `orphan: no-prior-trigger`. If failedTrigger.at > lastReading.at (or lastReading absent): `orphan: prior-trigger-failed`. Else, if `runStartTriggers && !runStartTriggers.includes(lastReading.triggeredBy)`: `orphan: between-runs`. Else: append `update.value` to `lastReading.updates`. Orphans append an `orphan-modifier` `EngineError` (no Reading mutation).
     - `kind: "no-op"` → no mutation, no tick.
  3. **Single notify at end of `consume()` if any state mutated** (atomicity rule, Req 19). The counter ticks once iff any of the three branches mutated `readings` or `errors`.
- `src/hazbot/engine/safely-evaluate-impl.ts` — new. Two exports — both run `compute()` (factor-variable) or `evaluate()` (sim-prop), catch throws, and synthesize the **per-impl-kind fallback shape** that matches what the impl's success-path return shape would have been (per EXT-12):
  - For `FactorVariableImpl<V, ...>`: on catch, return `{ value: impl.defaultValue, witnesses: [] as TReading[] }` — synthesizes `compute`'s `{ value, witnesses }` shape with the declared `defaultValue` and an empty witnesses array. Empty witnesses cleanly composes with `evaluateWith`'s "empty witnesses → WITH evaluates to false" semantics per requirements.md line 648, so a thrown factor-variable surfaces as the same observable behavior as a non-throwing impl that legitimately produces no witnesses.
  - For `SimPropImpl<...>`: on catch, return `impl.defaultValue` (boolean) — matches `evaluate`'s `boolean` return.
  - Wrappers internally discriminate on impl kind (already implicit from PASS2-2's "both run `compute()` (factor-variable) or `evaluate()` (sim-prop)" framing) and produce the matching fallback shape. `defaultValue: V` semantics stay intact — it stays the underlying scalar/set/array on each impl interface; the wrapper handles shape composition so impl authors don't need to declare a `{value, witnesses}`-shaped fallback.

  Both wrappers take `defaults` as a parameter (per PASS3-API-1) and pass it through to `compute(readings, defaults)` / `evaluate(reading, defaults)`:
  - `safelyEvaluateImpl(engine, impl, readings, defaults: TDefaults)` — **consume-path** wrapper. Appends `impl-eval-throw` to `engine.errors` on catch with `implKind` discriminator and **per-impl-kind `readingIndex` policy** (per EXT-19): for sim-props (`evaluate(reading, defaults)` operates on a single reading), populates `readingIndex` with that reading's index; for factor variables (`compute(readings, defaults)` operates over the full array), omits `readingIndex` (the EngineError variant's `readingIndex` is optional per the requirements.md edit in this step) because the substrate can't attribute a thrown error to a specific reading without re-running compute incrementally — rejected as too heavy on an error path that should stay cheap. Returns the per-impl-kind fallback shape above. Used by the `consume()` pipeline; `defaults` source is `engine.ruleSet.defaults` (typed as `DeepPartial<TDefaults>` at the rule-set level per EXT-8), cast internally to `TDefaults` before passing to `compute` / `evaluate` — bounded-safe because `isActive` implies load-time validation passed, which guarantees every `requiredDefaults` path resolves to a non-undefined value. The cast is one substrate-internal location; bridge-side impls receive `defaults: TDefaults` (not Partial) and access fields without null-guards.
  - `evaluateForRender(impl, readings, defaults: TDefaults | undefined, engine?: Engine<...>)` — **render-path** wrapper. Accepts `undefined` for `defaults` because the React hook may invoke it when `engine.ruleSet === undefined` (missing-rule-set load failure). The optional `engine` parameter (passed by the React hook from its `engine` context) gives the wrapper access to `engine.implsWithIncompleteDefaults` for the per-impl missing-defaults guard (per EXT-18). **Defaults-guard logic** (three branches):
    - **Branch 1: `defaults === undefined`** (missing-rule-set state, per EXT-7). Check `impl.requiredDefaults?.length`: if non-empty (impl reads defaults), return the per-impl-kind fallback shape directly without calling compute. If empty / undefined (impl doesn't read defaults), call `compute(readings, defaults as TDefaults)` — TS cast bounded-safe because the impl's contract says it doesn't access `defaults`. Forgotten-`requiredDefaults` declarations are caught by the throw-handler returning the per-impl-kind fallback (defensive degradation).
    - **Branch 2: `defaults !== undefined && engine?.implsWithIncompleteDefaults.has(impl.name)`** (defined-but-incomplete-defaults state, per EXT-18). Return the per-impl-kind fallback shape directly without calling compute. The impl's declared `requiredDefaults` paths don't all resolve against the rule set's defaults (load-time validation already detected this and stored the result in the engine's per-impl Set), so calling `compute` would silently produce nonsensical comparisons against `undefined` field values without throwing — exactly the misleading-values failure mode EXT-18 prevents. Same fallback semantics as Branch 1; the difference is the trigger condition (impl-level incomplete vs. defaults-level missing).
    - **Branch 3: `defaults !== undefined && impl is complete (or has no requiredDefaults)`**. Call `compute(readings, defaults)` normally.
  - All three branches catch throws and return the per-impl-kind fallback shape **without mutating engine state** (no `errors` append, no snapshot tick) per ENG-2 — render path stays pure per React's hook contract; render-path throws don't trigger re-render loops or silent error accumulation per render. Shared `defaultValue` mechanism per ENG-1. Note: the consume-path wrapper (`safelyEvaluateImpl`) doesn't need this incomplete-defaults guard because consume runs only when `isActive`, which guarantees no impls are in `implsWithIncompleteDefaults`.
- `src/hazbot/engine/evaluator.ts` — new. Four exports — each takes an injected `wrap: (impl, readings, defaults) => V` parameter so the call site (consume vs render) chooses the wrapper, plus a `defaults: TDefaults` parameter threaded through every evaluator call so sim-prop `evaluate(reading, defaults)` and factor-variable `compute(readings, defaults)` both have the same defaults source-of-truth. Default value is `safelyEvaluateImpl.bind(null, engine)` for consume-path callers; the React hook passes `evaluateForRender`:
  - `highestTrueAt(ruleSet, factorVariables, simProps, readings, defaults, wrap?)` — **one-shot per-state evaluator**. Iterates `ruleSet.categories` in reverse (highest-first), returns the highest-id category whose AST evaluates to `true` against the supplied readings + defaults, or `null`. Used by `perCategoryTruth` callers and by `computeMatchedCategoryFloor` below.
  - `computeMatchedCategoryFloor(ruleSet, factorVariables, simProps, readings, defaults, wrap?)` — **monotone floor**. Implements requirements.md Tech Notes line ~557 (`matchedCategory ≡ max over i of highestTrueAt(readings.slice(0, i+1))`). Iterates `i ∈ 0..readings.length`, calls `highestTrueAt(readings.slice(0, i+1), defaults)`, returns the max-over-i. Returns `null` only if every prefix returns `null`. Required because non-monotone expressions (e.g., `setDroughtLevel AND NOT usedOneSparkPerZone`) over monotone impls can produce non-monotone per-state matches; the floor computation enforces Req 7 monotonicity at the substrate level rather than relying on per-impl monotonicity contracts the impls don't actually owe.
  - `evaluateLeaf(expr, ctx, wrap?)` — non-short-circuiting; returns a tree mirror of `expr` with each leaf's truth value attached (for the sidebar's truth-coloring per Req 17). `ctx` carries `readings`, `defaults`, `factorVariables`, `simProps` so leaf evaluation has the full impl-resolution context. **Factor-variable leaf accesses route through `wrap`** (symmetric with `evaluateWith` per EXT-13): boolean leaves (`varName`) and accessor leaves (`varName.size`, `varName.length`) read the factor variable's value via `wrap(factorVariables[varName], readings, defaults).value` rather than calling `compute` directly, so a throwing impl produces the per-impl-kind fallback (`{ value: defaultValue, witnesses: [] }`) instead of escaping the evaluator. Sim-prop leaves inside WITH bindings route through the same `wrap` for the corresponding `evaluate(reading, defaults)` call.
  - `evaluateWith(varName, propExpr, ctx, wrap?)` — per Tech Notes' "Evaluator interface extensions": iterates over the witnesses obtained by **routing the factor-variable compute through the injected `wrap`** (per EXT-13) — `wrap(factorVariables[varName], readings, defaults)` returns the per-impl-kind fallback shape from EXT-12 (`{ value, witnesses }`), and `evaluateWith` reads `.witnesses` from the wrapped result. When the impl throws inside `compute`, the wrapper returns `{ value: defaultValue, witnesses: [] }` — evaluateWith iterates an empty array and produces the empty-candidates path. Returns `{ value, boundReading?, candidateEvaluations: Array<{ reading, propResult, perPropDetails }> }`. Empty witnesses (whether from a non-throwing "no witnesses" impl or a wrapped throw) → `value: false`, empty `candidateEvaluations`. Per-prop detail comes from `evaluateLeaf` over the propExpr against the candidate reading's bound context. **Routing through `wrap` preserves the consume-path/render-path split** (per ENG-2): consume-path calls go through `safelyEvaluateImpl` (mutates `engine.errors` on throw, then returns the fallback); render-path calls go through `evaluateForRender` (returns the fallback without mutating engine state). evaluateWith stays deterministic and render-safe — no impl throw escapes the wrapper boundary.

  Cost note: `computeMatchedCategoryFloor` is O(N² × C × L). For N (readings) in the tens, that's ~6000 evaluator invocations per snapshot; absorbed by the React hook's WeakMap memoization (step 5) so it runs once per snapshot bump, not once per render. Future amortization (engine stores the floor as derived state mutated on `consume()`) is deferred — premature for WM-10's debug-only sidebar use.
- `src/hazbot/engine/consume.test.ts` — new. AC: ambient-rejected SimulationStarted (no Reading; subsequent ChartTabShown drops with `prior-trigger-failed`; bootstrap `no-prior-trigger`); AC: between-runs orphan-modifier; AC: WITH evaluator iterates over wrapped-compute witnesses (per EXT-13 — including empty-witnesses case from a non-throwing impl AND empty-witnesses from a wrapped throw, both producing the empty-candidates path).
- `src/hazbot/engine/evaluator.test.ts` — new. **Two separate sweeps for the matching path** (per ENG-3): (a) `highestTrueAt` — per-state correctness, including a state matching multiple categories asserts the highest-id is selected; (b) `computeMatchedCategoryFloor` — monotonicity sweep covering AC: per-rule-set five-shape sweep (d) (after engine matches category N, lower-matching inputs leave the matched category at N). The (b) sweep includes the canonical non-monotone-expression case: a sequence where cat 2 (`setDroughtLevel AND NOT usedOneSparkPerZone`) fires at reading 3 then evaluates false at reading 5 (because `usedOneSparkPerZone` flipped to true) — assert the floor stays at 2. Plus: leaf evaluator non-short-circuit; WITH evaluator's `boundReading` / `candidateEvaluations` shapes.
- `src/hazbot/engine/safely-evaluate-impl.test.ts` — new. Asserts: (i) a throwing factor-variable through `safelyEvaluateImpl` (consume path) produces a single `impl-eval-throw` error per consume, returns `{ value: impl.defaultValue, witnesses: [] }` per EXT-12, and does not poison subsequent consumes; (ii) a throwing sim-prop through `safelyEvaluateImpl` produces a single `impl-eval-throw` error and returns `impl.defaultValue` (boolean) per EXT-12; (iii) the same throwing impls through `evaluateForRender` (render path) return the same per-impl-kind fallback shapes and do **not** mutate `engine.errors` (per ENG-2 — render path is pure, consume path mutates).

**Estimated diff size**: ~550 lines. Engine consume body + evaluator + wrapper ~250; tests ~300.

The matching evaluator's monotonicity (Req 7) is a derived property, not implementation. The engine never *stores* a "current matched category" field — the substrate's two append-only logs (`readings`, `errors`) are the only mutable domain state. Consumers (the sidebar, the hook's `matchedCategory` derived field) compute it on demand.

**Internal-only export surface** (per PASS2-2): all six new exports added by this step (`safelyEvaluateImpl`, `evaluateForRender`, `highestTrueAt`, `computeMatchedCategoryFloor`, `evaluateLeaf`, `evaluateWith`) — plus the `findLast` helper introduced in step 1 (per EXT-10) — stay internal to the substrate per requirements.md Tech Notes line 507. None are re-exported from `src/hazbot/engine/index.ts`. The `wrap?` injection parameter is an internal API for crossing the consume/render path boundary (per ENG-2); it's not part of the substrate's published surface and not subject to the API-baseline policy in step 1's PASS2-1 note.

---

### React layer: Provider + useAnalysisEngine hook

**Summary**: Substrate-owned React context and hook. The hook backs `useSyncExternalStore` against the engine's listener API (no MobX), enforces "must be inside Provider" with the documented exact error message, and memoizes derived fields (`factorVariableValues`, `matchedCategory`, `perCategoryTruth`) per snapshot via a module-level WeakMap so multiple consumer components in the same render share a single O(C×L×N) computation.

**Files affected**:
- `src/hazbot/engine/react/context.ts` — new. `AnalysisEngineContext = React.createContext<{ engine: Engine<unknown, unknown>; appRulesVersion: string | number } | null>(null)`. The `null` initial value is what `useAnalysisEngine` checks for the outside-Provider throw. **Type-narrowing note** (per LIB-3): React contexts can't carry generic type parameters at the boundary, so the engine is typed as `Engine<unknown, unknown>` here. The hook's `useAnalysisEngine<TReading, TDefaults>()` generic params are a *consumer's claim* about the engine type — TS does not validate them against the Provider's actual engine type. For WM-10 this is fine (the only React-side consumer is the substrate's own `Sidebar`, which is generic over unknown `TReading` and pretty-prints payload via `JSON.stringify`). Post-extraction host apps with strict type-safety needs should wrap `useAnalysisEngine` in a typed factory in their bridge layer (e.g., `useWildfireAnalysisEngine = (): HookReturn<WildfireReading, WildfireDefaults> => useAnalysisEngine()`).
- `src/hazbot/engine/react/provider.tsx` — new. `AnalysisEngineProvider<TReading, TDefaults>` component. Props per spec line ~183 (`engine` required, `appRulesVersion` required, `children`). Body is a one-liner returning `<AnalysisEngineContext.Provider value={{ engine, appRulesVersion }}>`. Required-prop posture means there's no fallback / runtime warning for forgotten `appRulesVersion` — TS catches it at compile time per FE-5 / Req 19.
- `src/hazbot/engine/react/use-analysis-engine.ts` — new. Hook implementation:
  1. `const ctx = useContext(AnalysisEngineContext);`
  2. `if (ctx === null) throw new Error("useAnalysisEngine must be used inside <AnalysisEngineProvider>");` — exact-match string per Req 19 / R9-3 ordering.
  3. `useSyncExternalStore(ctx.engine.subscribe, ctx.engine.getSnapshot)` — no `getServerSnapshot`; substrate is browser-only per Req 19's "Browser-only" paragraph.
  4. Read derived view via the WeakMap cache helper:

     ```ts
     // module-level
     const cache = new WeakMap<Engine<any, any>, { snapshot: number; view: HookReturn<any, any> }>();
     function getMemoizedView<TR, TD>(engine: Engine<TR, TD>, appRulesVersion: string|number): HookReturn<TR, TD> {
       const snapshot = engine.getSnapshot();
       const entry = cache.get(engine);
       if (entry && entry.snapshot === snapshot) return entry.view;
       const view = computeView(engine, appRulesVersion);
       cache.set(engine, { snapshot, view });
       return view;
     }
     ```
  5. `computeView` calls each impl's `compute(readings, defaults)` once over the engine's readings via `evaluateForRender` (memoized to factorVariableValues), runs `computeMatchedCategoryFloor` (matchedCategory — the monotone floor per ENG-3) and `evaluateLeaf` per category (perCategoryTruth — current truth at the latest readings, NOT the floor) **with `evaluateForRender` injected as the wrap parameter** (per ENG-2 — render path must not mutate `engine.errors`) and `engine.ruleSet.defaults` threaded as the `defaults` argument (per PASS3-API-1; non-null in the active path because `engine.isActive` implies `ruleSet` defined per Req 11a). Bundles + returns the destructurable shape from spec line ~161. Render-time impl throws are swallowed to `defaultValue` per impl; consume-path errors continue to land in `engine.errors` via `safelyEvaluateImpl`. The O(N²) cost of `computeMatchedCategoryFloor` is amortized to once-per-snapshot by the WeakMap memoization below. **Inactive-path semantics** (per PASS4-1, tightened per EXT-4, EXT-7, and EXT-9): when `!engine.isActive` (any of the four inactive sub-cases — missing-rule-set, parse-error, missing-defaults, missing-impl), `computeView` splits into two branches:

- **`factorVariableValues` runs in all states**, dispatched through `evaluateForRender`'s three-branch defaults guard (per EXT-7 + EXT-18). For each impl in `engine.factorVariables`:
  - **Missing-rule-set state** (`engine.ruleSet === undefined` → `defaults === undefined`, Branch 1 per EXT-7): if `impl.requiredDefaults?.length > 0`, the wrapper returns the per-impl-kind fallback directly without calling compute. If `requiredDefaults` is empty / undefined (impl doesn't read defaults), the wrapper calls `compute(readings, undefined as TDefaults)` and the impl returns real values against the readings. Result: ALL defaults-reading impls fall back; non-defaults-reading impls return real values.
  - **Missing-defaults state** (`engine.ruleSet` defined, defaults partially populated, impl in `engine.implsWithIncompleteDefaults`, Branch 2 per EXT-18): the wrapper returns the per-impl-kind fallback directly without calling compute — the impl's declared `requiredDefaults` paths don't all resolve, and calling compute against partial defaults would silently produce nonsensical comparisons against `undefined` field values without throwing. The per-impl Set populated during step 3's load-time validation is the source of truth. Result: impls with incomplete declared paths fall back to `defaultValue`; impls whose declared paths fully resolve compute normally; impls without `requiredDefaults` declarations compute normally.
  - **Parse-error / missing-impl states** (`engine.ruleSet` defined, defaults fully populated for all referenced impls, Branch 3 per EXT-18): the wrapper calls `compute(readings, defaults)` for every impl. Defaults are complete; all impls return real values against real defaults. Result: factorVariableValues is fully meaningful — the inactive engine is "stuck" because of an expression-parse failure or a missing impl referenced by some category, not because of defaults invalidity.
  - Across all inactive states, the three-branch guard + throw-handler produces consistent "couldn't compute" signaling at the impl level without crashing the substrate or propagating undefined into impl signatures or surfacing nonsensical comparisons against undefined defaults fields.
- **`matchedCategory` and `perCategoryTruth` short-circuit when `!engine.isActive`**, regardless of why. `computeView` returns `matchedCategory: null` and `perCategoryTruth: {}` directly without invoking `computeMatchedCategoryFloor` / `evaluateLeaf`. The short-circuit covers all four inactive sub-cases: (a) missing-rule-set — `ruleSet.categories` doesn't exist; (b) parse-error — `ruleSet.categories` exists but contains parse-error AST sentinels the evaluator's behavior on which is unspecified; (c) missing-defaults — defined categories reference impls whose declared defaults paths don't all resolve, producing inconsistent matching; (d) missing-impl — defined categories reference impls not in the registry, producing undefined lookups inside the evaluator. The substrate's load-time validation guarantees soundness only when `isActive`; the matching/leaf paths require that guarantee, so the short-circuit is the substrate-level protection against running evaluators in any unvalidated state. Composes with step 6's `<CategoriesPanel />` rendering suppression as defense-in-depth.

The split reflects an actual implementation difference: the `factorVariableValues` path is registry-driven and survives any inactive state (with `requiredDefaults` metadata + throw-handler as runtime guards); the matching/leaf paths are rule-set-driven and require the load-time-validation invariant `isActive` provides. Symmetric with active-path impl-eval-throws for the `factorVariableValues` half: the same `defaultValue` fallback is the substrate's universal "couldn't compute" signal regardless of upstream cause (impl threw vs. defaults missing vs. defaults undefined). The sidebar's load-error banner is the dominant visual across all inactive states; the `<FactorVariablesPanel />`'s "Engine inactive — values shown are impl defaults" inline note (step 6) stays gated on `ruleSet === undefined` specifically (the only state where ALL defaults-reading impls fall back) — defined-but-`!isActive` states produce a meaningful mix, so the "all defaults" framing would mislead there.
  6. The `appRulesVersion` field on the cache value matches the prop — if the bridge ever reconfigured `appRulesVersion` mid-run (it doesn't, in WM-10) the cache key would stay valid because the snapshot count would not change, so the version field is bundled into the memoized view directly rather than re-read from context per use. **Side note**: appRulesVersion is treated as immutable per host-app instance; future bridge-side bumps require a Provider remount.
- `src/hazbot/engine/react/index.ts` — new. Barrel re-exports `AnalysisEngineProvider`, `AnalysisEngineProviderProps`, `useAnalysisEngine`, `HookReturn` type alias.
- `src/hazbot/engine/react/use-analysis-engine.test.tsx` — new. Each Req-19 contract: outside-Provider throw with exact message; first-render reads errors from a missing-rule-set engine (initial-snapshot semantics, snapshot=1); re-render on `consume()`; reference-equal derived fields across two `useAnalysisEngine()` calls in the same render (memoization); inactive-engine consume does not re-render (snapshot doesn't tick); render-path impl throw does not mutate `engine.errors` and does not trigger a re-render loop (per ENG-2). **No SSR test** (per QA-3): wildfire-model is not server-rendered and the substrate is internal — Req 19's "browser-only" stance is a documented contract, captured in the hook's jsdoc, not a runtime guard or React-API spy.

**Estimated diff size**: ~400 lines. Hook + Provider + context ~150; tests ~250.

The WeakMap key is the engine instance, so when an engine is discarded (typical in tests) the cache entry is GC'd automatically. Multiple consumer components in the same render hit the same cache hit since `engine.getSnapshot()` doesn't tick between them — this is the FE-3 / R10-1 "shared O(C×L×N)" computation.

**Render-path staleness window** (per PASS2-3): because `evaluateForRender` swallows impl throws without ticking the snapshot (per ENG-2 — render is pure), an impl that starts throwing between two consume events produces a cached pre-throw view until the next `consume()` ticks the snapshot. Bounded by the next consumed event — typically sub-second in a student session. Acceptable for WM-10's debug-only sidebar; the alternative (invalidating the cache on render-path throw) would re-introduce render-path mutation that ENG-2 was specifically resolving.

---

### Substrate sidebar UI

**Summary**: The generic `<TReading, TDefaults>` sidebar. Substrate-owned per Req 1; ships with the future-extractable library so any host inherits the same debug UI. Top-level `Sidebar` component plus per-panel sub-components, all reading via `useAnalysisEngine()`. Generic payload rendering uses `JSON.stringify(_, null, 2)` for unknown `TReading` fields. Plain CSS file imported directly from the components.

**Files affected**:
- `src/hazbot/engine/sidebar/sidebar.tsx` — new. Top-level `Sidebar` component, no props (single light theme — no `theme` prop per Req 17 / R9-4). Composes:
  - `<HeaderPanel />` — rule-set id (`engine.ruleSet?.id ?? engine.requestedRuleSetId ?? "(none)"`), `sessionId`, `engineVersion`, `appRulesVersion`. Format mirrors log-monitor: `<strong>` title + muted version text.
  - `<LoadErrorBanner />` — only renders when `engine.errors.find(e => e.kind === "load-failure" || e.kind === "parse-error")`. Uses `renderError()` from step 1's rendering map for the message.
  - `<CategoriesPanel />` — gated on `engine.ruleSet !== undefined`. When `engine.ruleSet` is defined but `!engine.isActive` (parse-error / missing-defaults / missing-impl), suppresses per-category truth signals and per-leaf coloring (Req 17's split-by-`ruleSet`-defined rule). When fully active, renders each category with status icon (✓/✗), feedback text, and the expression with double-encoded leaves (green+underline / red+strikethrough). Currently-matched category gets the bold border. Per-category click-toggle for AST inspection (renders `JSON.stringify(parsedExpr, null, 2)`).
  - `<ReadingsPanel />` — chronological list of `engine.readings`. Each row shows `triggeredBy`, `at`, `updates.length`. Click-expanded row shows the `updates` array detail and `JSON.stringify(reading, null, 2)` for the rest of the fields (the substrate doesn't know `TReading`'s shape).
  - `<FactorVariablesPanel />` — iterates `factorVariableValues` from the hook. Each entry shows name, value (rendered per type — boolean / Set / array / other) and is click-expandable to show `witnesses` (each rendered the same way as `<ReadingsPanel />` rows). **Inactive-engine values are fallbacks** (per PASS4-1): when `engine.ruleSet === undefined`, every entry's value is the impl's `defaultValue`, not a real read — the load-error banner above this panel is the dominant signal in that state. A small inline note at the top of the panel ("Engine inactive — values shown are impl defaults") makes the fallback visible to a debugging dev rather than letting the panel masquerade as fresh data. The note suppresses itself when the engine is active (or partially active per the `ruleSet`-defined-but-`!isActive` split).
  - `<ErrorsPanel />` — chronological view over `engine.errors`. Each entry uses `renderError(e, { readingsLength: engine.readings.length })` for the canonical message + severity (the `readingsLength` context is consumed by the factor-variable `impl-eval-throw` rendering per EXT-19). Per-entry context-hydration logic branches on the variant's identifying fields:
    - **`readingIndex` present** (sim-prop `impl-eval-throw`): the panel hydrates the reading from `engine.readings[readingIndex]` and renders its trigger event + payload alongside the message.
    - **`readingIndex` absent** (factor-variable `impl-eval-throw`, per EXT-19 — the substrate can't attribute the throw to a specific reading): the panel renders just the impl-level message (which already includes the readings count via `renderError`'s `ctx.readingsLength` substitution); no per-reading hydration. The dev sees impl name + readings count + thrown message, and can manually scrub the readings panel to investigate.
    - **`event: ConsumedEvent` present** (`ambient-validation`, `orphan-modifier`): the panel renders the event's name + payload inline.
    - **`tokenSpan` / `offendingToken` present** (`parse-error`): the panel renders the offending token highlight inline (per Req 13).
- `src/hazbot/engine/sidebar/expression-renderer.tsx` — new. Walks the parsed `Expression` AST + the per-category leaf-truth tree from `evaluateLeaf` and emits a JSX expression with neutral operators/parens and double-encoded leaves. **Click-expand for WITH sub-expressions** (renders bound reading or per-reading evaluation per Req 17): the click affordance is a `<button>` element whose `onClick` toggles `aria-expanded` and reveals the WITH provenance inline. **Hover** triggers the same expansion as a UX shortcut for mouse users (via CSS `:hover` styling that mirrors the click-expanded state) — same content, same toggle, just an alternative trigger. Per EXT-11: the click path is the keyboard-accessible primary; no content is hover-only, so keyboard users see all WITH provenance details. Parse-error categories receive the inline `tokenSpan`/`offendingToken` highlight here — when the AST cache slot is the parse-error sentinel, this component falls back to rendering the raw `expression` string with the offending span highlighted.
- `src/hazbot/engine/sidebar/sidebar.css` — new. Plain CSS with all variables under the `.hazbot-sidebar` root selector. Light-mode only — no `prefers-color-scheme`, no `data-theme` attribute. Color values mirrored from log-monitor's `[data-theme="light"]` block; layout/typography mirrored from log-monitor's overall look (~300px fixed-width, monospace stack, similar header/entry/button affordances). **Class-naming convention** (per LIB-4): flat prefix `hazbot-sidebar-` on every class (e.g., `.hazbot-sidebar`, `.hazbot-sidebar-header`, `.hazbot-sidebar-entry`, `.hazbot-sidebar-button`, `.hazbot-sidebar-category`, `.hazbot-sidebar-leaf-true`, `.hazbot-sidebar-leaf-false`). Mirrors log-monitor's flat-prefix posture (verified in `node_modules/@concord-consortium/log-monitor/dist/log-monitor-styles.js`: `.log-monitor`, `.log-monitor-entry`, `.log-monitor-header`, etc.). No descendant-selector specificity tricks, no BEM double-underscores. Each class self-documents its substrate scope at the call site, which means a host app's existing CSS can't accidentally bleed into the sidebar (or vice versa) without explicit collision on the prefix. PR-review hook: any new class added without the prefix is a flag. **Color contrast** (per A11Y-1): the mirrored log-monitor light-theme colors must be spot-checked against WCAG AA (axe DevTools or Lighthouse audit on the mounted sidebar) and adjusted if any combination fails — log-monitor's contrast is not a guaranteed inheritance. **Focus indicators** (per A11Y-2): no `outline: none` resets anywhere in the file. If any element resets outline for non-focus state (e.g., to remove a default form-control outline), it must supply an equivalent `:focus-visible { outline: ... }` rule so keyboard-focus visibility is never lost — the sidebar relies on `<button>` defaults for keyboard activation per Req 17, and silently dropping the focus ring would defeat that. Imported by `sidebar.tsx` via `import "./sidebar.css"`.
- `src/hazbot/engine/sidebar/index.ts` — new. Re-exports `Sidebar`.
- `src/hazbot/engine/sidebar/sidebar.test.tsx` — new (substrate-side per AC: substrate sidebar tests use synthetic TReading, no wildfire imports). Drives the sidebar against a synthetic `interface TestReading extends BaseReading { foo: string; bar: number }` declared inline. **Zero wildfire imports.** Asserts: generic JSON pretty-print of `foo`/`bar` fields, basic render with populated engine, load-error banner shows on inactive engine, snapshot-tick re-renders the readings count, smoke-level coverage per AC: sidebar smoke RTL tests cases 1–4 (renders without throwing given populated engine + Provider; displays matched category number + feedback text; renders load-error message when engine inactive due to bad rule-set id; re-renders when snapshot ticks via consume).

**Estimated diff size**: ~700 lines. Sub-components ~250; expression-renderer ~150; CSS ~80; tests ~220.

Interactive controls use `<button>` per Req 17's accessibility paragraph — gives keyboard activation + focus indicators automatically. **Keyboard parity for WITH sub-expression details** (per EXT-11): the click path is the keyboard-accessible primary affordance for revealing WITH provenance (bound reading + per-reading evaluation); hover acts as an optional UX shortcut for mouse users that reveals the same content via the same `aria-expanded` toggle. No content is hover-only — keyboard users see all WITH provenance details via the click path with `<button>` defaults handling focus + activation + screen-reader-readable expanded state. No `aria-live`. No theme switching.

---

### Wildfire bridge: types, impls, translate, factory, AnalysisEngineActivated emission

**Summary**: The wildfire-specific layer. Lives outside the substrate — imports freely from `src/log.ts` and from substrate. Declares `WildfireReading` / `WildfireDefaults`, all factor-variable + sim-prop impls (incl. the two stubs), the `translate` callback, the engine-singleton factory the rest of the app calls into, and the `AnalysisEngineActivated` log emitter. Bridge-side sidebar tests drive the substrate sidebar against a real generated rule set.

**Files affected**:
- `src/hazbot/wildfire/types.ts` — new. `WildfireReading extends BaseReading` (with `zones`/`sparks`/`wind`/`ambientState: { chartTabOpenAtStart?: boolean }`); `WildfireDefaults` (zones `[*].terrainType`/`vegetation`/`droughtLevel`, wind speed/direction); `ZoneDefaults`. Verbatim from spec Tech Notes' "Library scope and the Reading boundary" + "Rule-set TypeScript shape."
- `src/hazbot/wildfire/factor-variables.ts` — new. `Record<string, FactorVariableImpl<unknown, WildfireReading, WildfireDefaults>>` keyed by name. Each impl declares `compute(readings, defaults)` (per PASS3-API-1 — second arg is the rule set's defaults, available to comparison-against-default impls listed below), `defaultValue` (per step 1 / ENG-1 — `false` for boolean impls, `new Set()` for Set-typed, `[]` for array-typed), plus `requiredDefaults`/`ambientStateKeys` where applicable. Concrete impls cover everything referenced by tabs 23/24/25:
  - `ranSimulation` (boolean; witnesses = SimulationStarted readings)
  - `setDroughtLevel` (boolean; witnesses = SimulationStarted readings whose any-zone drought differs from the default; `requiredDefaults: ["zones[*].droughtLevel"]`)
  - `setVegetation` (boolean; per-zone vegetation comparison; `requiredDefaults: ["zones[*].vegetation"]`)
  - `setTerrainType` (boolean; per-zone terrain comparison; `requiredDefaults: ["zones[*].terrainType"]`)
  - `setWind` (boolean; wind speed or direction differs from default; `requiredDefaults: ["wind.speed", "wind.direction"]`)
  - `setAnyZoneVar` (boolean; OR over set{Drought,Vegetation,Terrain}Level; `requiredDefaults: ["zones[*].terrainType", "zones[*].vegetation", "zones[*].droughtLevel"]`)
  - `setAnyVar` (boolean; setAnyZoneVar OR setWind)
  - `usedOneSparkPerZone` (boolean; some prior reading has sparks.length === zones.length)
  - `uniqueWindValuesUsed` (Set of "speed-direction" string keys; witnesses = SimulationStarted readings whose unique key contributed)
  - `uniqueNonZeroWindValuesUsed` (Set; witnesses = same restricted to non-zero wind)
  - `simulationRuns` (array; witnesses = same as value)
- `src/hazbot/wildfire/sim-props.ts` — new. `Record<string, SimPropImpl<WildfireReading, WildfireDefaults>>` keyed by name. Each impl declares `evaluate()` and `defaultValue: false` (sim-props are boolean predicates per step 1 / ENG-1). Concrete impls:
  - `OneSparkPerZone` (sparks.length === zones.length, distinct zones)
  - `UniqueVegetationPerZone` (per-zone vegetations are distinct)
  - `UniformDroughtLevels` (all zones share droughtLevel)
  - `UniformTerrainTypes`
  - `ForestWAWOSuppression` (paired-runs check — flagged as an `isStub: false` but with the documented "two-run" semantics from the sheet)
  - `TwoSparks`
  - `GraphOpen` (`r.ambientState?.chartTabOpenAtStart || r.updates.some(u => u.source === "ChartTabShown")`; declares `ambientStateKeys: { SimulationStarted: ["chartTabOpenAtStart"] }` per AC: sim-prop ambient-state validation symmetric with factor variables)
  - **Stubs** (`isStub: true`, return false): `SparksAtTopAndBottom`.
- `src/hazbot/wildfire/factor-variable-stubs.ts` — new. The single stubbed factor variable: `sawIntenseFire` (`isStub: true`, returns false). Same registry shape as `factor-variables.ts`; merged into the bridge's combined factor-variables map at boot. Separated into its own module so the stub flag is grep-able.
- `src/hazbot/wildfire/translate.ts` — new. `translate(event, sessionId): TriggerResult`. Maps:
  - `SimulationStarted` → `{ kind: "trigger", reading: { ...baseReading, zones, sparks, wind, ambientState: event.ambientState as { chartTabOpenAtStart?: boolean } } }`
  - `SimulationEnded` / `SimulationStopped` → `{ kind: "trigger", reading: { ...baseReading, ...payloadFields } }`
  - `ChartTabShown` → `{ kind: "modifier", update: { source: "ChartTabShown", value: true, at: event.at } }`
  - `ChartTabHidden` → `{ kind: "modifier", update: { source: "ChartTabHidden", value: false, at: event.at } }`
  - `SimulationRestarted` / `SimulationReloaded` / `TopBarReloadButtonClicked` → `{ kind: "no-op" }`
  - `AnalysisEngineActivated` → `{ kind: "no-op" }` (engine doesn't consume its own activation; AC: bridge translate maps AnalysisEngineActivated to no-op)
- `src/hazbot/wildfire/rules-version.ts` — new. `export const APP_RULES_VERSION = 1;` per Req 20.
- `src/hazbot/wildfire/engine-singleton.ts` — new. Lazy memoized `getAnalysisEngine()`:
  1. Module-level closure caches a `boolean | "uninit"` for whether to construct (avoids the per-call URL re-check while staying import-order-resilient — per the log.ts sketch's "lazy accessor" rationale).
  2. On first call: read URL flags via `getUrlConfig()`; if neither `hazbotRules` nor `hazbotSidebar`: cache `false`, return undefined permanently.
  3. Else: import `ruleSets` from `src/hazbot/rule-sets/index.ts`; resolve `opts.ruleSet = ruleSets[hazbotRules]` (or undefined if no match); construct `new Engine({ ruleSet, requestedRuleSetId: hazbotRules, factorVariables, simProps, translate, runStartTriggers: ["SimulationStarted"] })`; if `engine.isActive && engine.ruleSet`: emit `log("AnalysisEngineActivated", { engineVersion: ENGINE_VERSION, appRulesVersion: APP_RULES_VERSION, ruleSetId: engine.ruleSet.id })` — no `sessionId` in payload (Req 20 / R9-7). Cache + return the engine.
  4. Subsequent calls: return cached.
- `src/hazbot/wildfire/factor-variables.test.ts` + `sim-props.test.ts` + `translate.test.ts` — new. Direct unit tests per impl; `translate` round-trip per event kind; verify `GraphOpen.ambientStateKeys` per AC: bridge sim-props registry includes GraphOpen with declared ambientStateKeys; verify no impl declares `ambientStateKeys` for a trigger that the wildfire-bridge never produces.
- `src/hazbot/wildfire/engine-singleton.test.ts` — new. AC: bridge passes runStartTriggers: ["SimulationStarted"] verbatim, no runEndTriggers opt; AC: AnalysisEngineActivated emitted exactly once when active, payload shape includes engineVersion + appRulesVersion + ruleSetId, no sessionId; AC: APP_RULES_VERSION is a positive integer.
- `src/hazbot/wildfire/index.ts` — new. Re-export `getAnalysisEngine`, `APP_RULES_VERSION`, `WildfireReading`, `WildfireDefaults`. Used by `src/log.ts` and `src/components/app.tsx` in step 12.

**Estimated diff size**: ~600 lines (~50/50 code/tests). Most of the bulk is the factor-variable + sim-prop impls.

The bridge module orchestrates the boot sequence in one place — call sites (log.ts, app.tsx) ask it for the engine and never construct one directly. This contains all the wildfire-specific assumption (URL flags, log emitter wiring, the choice of `runStartTriggers`) inside `src/hazbot/wildfire/` and keeps the substrate's `Engine` constructor free of host-app default behavior.

Bridge-side sidebar coverage (AC: bridge-side sidebar tests against real `ruleSets["23"]`) lands in step 10 alongside the generated rule sets it depends on (per IMPL-2). Step 6 ships the bridge code with unit-level coverage of impls + translate + the engine-singleton factory, but does **not** include an integration-style sidebar render against a real wildfire engine — that requires `ruleSets["23"]`, which is a step-10 deliverable.

---

### Versioning + LOGGED-EVENTS.md entry

**Summary**: Lock down the version-export tests + the documented log-event entry. Small commit, but groups the cross-AC "is this version a string / is that version a positive integer / is the LOGGED-EVENTS entry present" checks in one place so they don't get scattered across other commits.

**Files affected**:
- `src/hazbot/engine/version.test.ts` — new. AC: ENGINE_VERSION is a string matching `/^\d+\.\d+\.\d+$/`.
- `src/hazbot/wildfire/rules-version.test.ts` — new. AC: APP_RULES_VERSION is a number `>= 1`.
- `LOGGED-EVENTS.md` — extended. New "Hazbot" subsection documenting `AnalysisEngineActivated`: event name, payload schema (`engineVersion: string`, `appRulesVersion: string | number`, `ruleSetId: string`; no `sessionId`), when fired (once per page load, only when `engine.isActive` post-construction). Reviewer manually checks per AC: LOGGED-EVENTS.md gains AnalysisEngineActivated entry.

**Estimated diff size**: ~100 lines.

Lands here rather than tucked into step 6 because the LOGGED-EVENTS update + the version exports are the kind of thing that's easy to forget — isolating them in a small commit makes them harder to skip.

---

### Extraction-script overhaul: emit `.ts` modules + `dsl-grammar.md`

**Summary**: Rewrite `scripts/extract-hazbot-sheets.js` to emit typed TypeScript modules instead of raw 2D-array JSON. The script reads an `.xlsx` workbook, walks each sheet tab, identifies the rule-row block vs. the factor-variable block, parses defaults from the Details column, and emits one `<id>.ts` per loadable tab plus an `index.ts` aggregating them. The README tab dumps to `src/hazbot/dsl-grammar.md`. Auto-generated headers per Req 11. TS-literal escaping for hostile content. Fixture-based tests.

**Files affected**:
- `scripts/extract-hazbot-sheets.js` — rewritten. New responsibilities (replacing the existing JSON-dump):
  1. Per tab, segment rows into rule-row block (categories) and factor-variable block. Tab 23 includes a "Text to Go with Arrows" column between visualFeedback and pseudocode; tabs 24/25/32–35 don't. Output shape stays consistent — `arrowText?: string`.
  2. Parse Details-column default-value strings (e.g., `'Default values = "Plains" (zone 1), "Plains" (zone 2)'`) into the structured `defaults` field. TBD entries (tabs 32–35 today) leave the corresponding default absent so the engine's load-time validator catches the gap. **No `as` escape needed in generated TS** (per EXT-8): `RuleSet.defaults` is typed as `DeepPartial<TDefaults>` (per step 1's `types.ts` description), so partial defaults compile cleanly without type casts. Generator emits whatever defaults are present in the source data; engine's runtime `requiredDefaults` validator detects unresolved paths and emits `missing-defaults` load failures.
  3. Empty / placeholder tabs (43, 45, 47, 54): excluded from the generated index.
  4. TS-literal escape pass for hostile strings: backticks, `${`, newlines, double-quotes, single-quotes. Default to template literals (backticks) for multi-line content with `\\` / `\`` / `\${` escaping; default to double-quoted strings otherwise.
  5. Auto-generated header on first line: `// AUTO-GENERATED — DO NOT EDIT — re-run scripts/extract-hazbot-sheets.js` for `.ts` files; `> **AUTO-GENERATED — DO NOT EDIT — re-run \`scripts/extract-hazbot-sheets.js\`**\n\n` for `dsl-grammar.md` (per R10-6).
  6. Dump the README tab to `src/hazbot/dsl-grammar.md` on every run.
  7. Per-tab TS module: `import { RuleSet } from "../engine/types"; import { WildfireDefaults } from "../wildfire/types"; export const ruleSet23: RuleSet<WildfireDefaults> = { ... };`. Each category's `expression` is a string; the engine parses it at load.
  8. `index.ts`: `export { ruleSet23 } from "./23"; ...; export const ruleSets: Record<string, RuleSet<WildfireDefaults>> = { "23": ruleSet23, ... };`.
- `scripts/__fixtures__/synthetic.xlsx` — new. Small synthetic workbook covering: (a) categories parsed in order, (b) factor-variable defs extracted, (c) defaults parsed from Details column, (d) TBD defaults left absent, (e) at least one row whose feedback content includes the TS-literal escape edge cases (backtick, `${`, newline, `"`, `'`).
- `scripts/__fixtures__/expected/` — new. Expected output `.ts` files + `dsl-grammar.md` for snapshot-style assertions. Implementer's choice between snapshot diff and per-field assertions; pin to per-field for stability against trivial whitespace changes.
- `scripts/extract-hazbot-sheets.test.js` — new. Runs the rewritten extraction script against the synthetic fixture, asserts:
  - Generated `.ts` files compile cleanly via a quick `ts-node`/`tsc --noEmit` pass over the output (catches the TS-literal escape regression where `${` leaks into a template literal as a real interpolation).
  - **Round-trip via load-and-deep-equal** (per QA-2): compile the generated `.ts` via `ts-node/register` (or shell out to `tsc` writing to a tmpdir + `require` the resulting `.js`), import the generated `ruleSet<id>` export, and deep-equal it against the synthetic-fixture's in-memory source rows. Hostile-content rows (backtick, `${`, newline, double-quote, single-quote) either fail compile — caught by the bullet above — or load with corrupted strings — caught by this deep-equal. (The previous draft's `JSON.parse(JSON.stringify(...))` shape was a no-op against the loaded JS value and didn't actually verify the source-to-output round trip.)
  - Auto-generated header is present and matches the per-format regex (per AC: every generated file begins with AUTO-GENERATED header in pinned per-format shape).
  - Defaults extraction matches per-zone expectations.
  - TBD entries leave defaults absent.

**Estimated diff size**: ~600 lines. Script ~250; fixture + expected ~150; tests ~200.

The script is `.js` (Node) per the existing shape; running it from `npm` is the existing flow. Bringing in `ts-node` for the compile-check is fine — `typescript` is already a devDep transitively. The fixture is a checked-in `.xlsx` (~10 KB), authored once and rarely touched; the source `.xlsx` of real rule sets stays local-only per the resolved Direct-Sheets-fetch question.

---

### Generated rule-set modules + per-rule-set test sweeps

**Summary**: Run the extraction script against the user's local `~/Downloads/Wildfire Hazbot Feedback Tables.xlsx`, commit the generated `src/hazbot/rule-sets/{23,24,25,32,33,34,35}.ts` + `index.ts` + `src/hazbot/dsl-grammar.md` files. Tabs 32–35 are committed even though the engine refuses to load them (defaults TBD) so they're discoverable + the validation playbook generator (step 11) can run against them. Loadable rule sets (23, 24, 25) get the per-rule-set test sweeps from AC: per-rule-set five-shape sweep — five test shapes (a) through (e) per rule set, including the "unreachable while stubbed" cat-6 test for rule set 25.

**Files affected**:
- `src/hazbot/rule-sets/23.ts` — generated.
- `src/hazbot/rule-sets/24.ts` — generated.
- `src/hazbot/rule-sets/25.ts` — generated.
- `src/hazbot/rule-sets/32.ts` — generated. (Loadable: ❌, `defaults` partial / TBD.)
- `src/hazbot/rule-sets/33.ts` — generated. (Loadable: ❌.)
- `src/hazbot/rule-sets/34.ts` — generated. (Loadable: ❌.)
- `src/hazbot/rule-sets/35.ts` — generated. (Loadable: ❌.)
- `src/hazbot/rule-sets/index.ts` — generated. Aggregating barrel.
- `src/hazbot/dsl-grammar.md` — generated. Pinned blockquote header + dumped README content.
- `src/hazbot/rule-sets/23.test.ts` — new. Per AC: per-rule-set five-shape sweep — state matching no category, state matching exactly one, multi-true with highest selected, monotonicity sequence, no stub-gated category in this rule set so (e) is N/A.
- `src/hazbot/rule-sets/24.test.ts` — new. Same five shapes; (e) N/A.
- `src/hazbot/rule-sets/25.test.ts` — new. Same five shapes including (e): an otherwise-fully-satisfying state asserts the matched category does **not** include category 6 (the `SparksAtTopAndBottom`-stubbed success category). Catches the regression where a stub accidentally returns true.
- `src/hazbot/wildfire/sidebar.test.tsx` — new (bridge-side per AC: bridge-side sidebar tests against real `ruleSets["23"]`, deferred from step 6 per IMPL-2). Wraps the substrate `Sidebar` in `<AnalysisEngineProvider engine={engine} appRulesVersion={1}>` over a real `Engine<WildfireReading, WildfireDefaults>` constructed with `ruleSets["23"]` and synthetic readings. Asserts the wildfire payload (`zones`, `sparks`, `wind`, `ambientState`) renders via the generic-payload path and that the matched category / feedback text from the real rule set show up in the rendered output. Lands here because `ruleSets["23"]` is a step-10 deliverable.
- A `.gitattributes` line marking the generated files as `linguist-generated=true` (small QoL — not strictly required by the spec but normal for generated code).

**Estimated diff size**: ~1500 lines (mostly mechanical — generated TS bodies are repetitive). Tests are ~350 lines (including the bridge-side sidebar test).

The rule-set test sweeps are written as a parameterized helper that takes a rule set + a witness-construction lambda + the five expected outcomes, so adding tabs 32–35 once they're loadable becomes a single new test file per rule set (~30 lines each). The helper lives at `src/hazbot/rule-sets/test-helpers.ts`.

---

### Validation-playbook generator script + fixture tests

**Summary**: New `scripts/generate-hazbot-validation-playbook.js` (or co-located with `extract-hazbot-sheets.js`). Walks the parsed AST of each loadable category in each rule set whose categories have authored expressions (23, 24, 25, 32, 33, 34, 35 — explicitly skips 54 + 43/45/47); emits one markdown checklist per tab to `docs/hazbot-validation/<id>.md`. Per-leaf breakdown preserves the AND/OR/NOT logical structure (Finding 18). Fixture-based tests cover the AND/OR/NOT/WITH preservation. Generation depends only on the DSL parser (engine load-time validation isn't required), so blocked-on-defaults tabs can be playbook-validated in parallel with Sam filling defaults at source. **Generated `docs/hazbot-validation/*.md` outputs land in the next step (per IMPL-3)** — this commit is script + tests only.

**Files affected**:
- `scripts/generate-hazbot-validation-playbook.js` — new. **TS-loading mechanism** (per EXT-6): the script begins with `require("ts-node/register");` so subsequent `require()`s of the substrate parser (`src/hazbot/engine/parser/`) and the generated rule-set modules (`src/hazbot/rule-sets/<id>.ts`) resolve `.ts` files through TS compilation at load time. Without this register call, Node's default `.js` resolver fails on the first TS require with `ERR_UNKNOWN_FILE_EXTENSION`. Same mechanism as step 9's extraction-script tests (per QA-2's resolution). `ts-node` is already a project devdep at `^10.9.1` (per DEV-1) — no new devdep needed. For each tab in `[23, 24, 25, 32, 33, 34, 35]`:
  1. Import the generated rule-set module (or re-extract from the local `.xlsx`).
  2. Per category: parse the expression via the substrate's parser (the script imports from `src/hazbot/engine/parser/` — substrate parser is published-API per `index.ts`).
  3. AST-walk to render nested-bullet markdown:
     - `AND` node → `ALL of:` + indented bullets.
     - `OR` node → `ANY of:` + indented bullets.
     - `NOT` node → `NOT` prefix on its child (or `the following must be FALSE:` for compound negations).
     - Boolean leaf inside / outside `NOT` → `<varName>: true` or `<varName>: false`.
     - Comparison leaf → `<accessor> <op> <literal>` literal (e.g., `uniqueWindValuesUsed.size > 1`).
     - `WITH` sub-expression → "exists a `<triggerEvent>` reading where `<propExpr>` holds" (with propExpr broken down recursively).
  4. Inline each factor variable's `details` string from the rule set alongside its leaf bullet (so the `Event->prop.<i>.x` notation reaches Sam's checklist).
  5. Write the result to `docs/hazbot-validation/<id>.md`. Auto-generated header at top.
- `scripts/__fixtures__/playbook-fixture.ts` — new. A small synthetic rule-set TS module (or reuse the extraction-script fixture's output as input) that includes one fixture row per leaf kind (boolean, comparison, WITH) and at least one row whose expression includes both `OR` and `NOT` (e.g., `setDroughtLevel AND (NOT usedOneSparkPerZone OR uniqueWindValuesUsed.size > 1)`).
- `scripts/__fixtures__/expected/playbook.md` — new. Expected rendered output.
- `scripts/generate-hazbot-validation-playbook.test.js` — new. Per AC: validation-playbook generator fixture-based tests — per-leaf breakdown for boolean factor variables, comparison-operator leaves, WITH sub-expressions; the AND/OR/NOT preservation row; auto-generated header present.

**Estimated diff size**: ~500 lines. Script ~250; fixture + expected ~100; tests ~150.

The script importing the substrate's parser (`src/hazbot/engine/parser/`) is fine — the parser is in the substrate's published API per the public-surface list. The substrate doesn't take a dep on the script; the import direction is correct.

---

### Generated validation-playbook docs

**Summary**: Mechanical commit. Run the validation-playbook generator script from the previous step against the generated rule-set modules from step 10; commit the output. Splitting from the script commit (per IMPL-3) keeps script-review focused on logic + tests and lands the docs as a pure mechanical artifact that reviewers can skim structurally.

**Files affected**:
- `docs/hazbot-validation/23.md` — generated.
- `docs/hazbot-validation/24.md` — generated.
- `docs/hazbot-validation/25.md` — generated.
- `docs/hazbot-validation/32.md` — generated.
- `docs/hazbot-validation/33.md` — generated.
- `docs/hazbot-validation/34.md` — generated.
- `docs/hazbot-validation/35.md` — generated.

**Estimated diff size**: ~150 lines (mostly mechanical bullets).

Each file carries the auto-generated header pinned by the previous step's script. Reviewers don't audit the markdown line-by-line — the previous step's fixture tests cover the rendering correctness; this commit is "did the generator output what the tests say it should" verified by running the script.

---

### Late-update workflow doc

**Summary**: Author `docs/hazbot-update-workflow.md` so a future contributor (you, six months from now, or anyone else) can re-run the toolchain end-to-end when Sam fills defaults for tabs 32–35, edits an existing tab's categories/expressions, or adds a new factor variable / sim-prop. Documents the round-trip from "Sam edited the sheet" through "PR is ready to merge" — including the manual touchpoints the substrate will fail loudly about (new impls, new per-rule-set test files, parser updates for DSL grammar changes). Lands here so all the scripts + rule sets + bridge code the doc references are already in the repo.

**Files affected**:
- `docs/hazbot-update-workflow.md` — new. Sections:
  1. **Prerequisites** — link to the source Google Sheet; local Node + npm setup; export workflow (`File → Download → .xlsx`).
  2. **Re-extract rule sets** — exact command (`node scripts/extract-hazbot-sheets.js <path/to/.xlsx>`); note the auto-generated header is rewritten on every run; `src/hazbot/dsl-grammar.md` also refreshes.
  3. **Inspect the generated diff** — `git diff src/hazbot/rule-sets/ src/hazbot/dsl-grammar.md`. Three scenarios with what each implies:
     - Defaults filled for previously-blocked tabs → expected; proceed.
     - Categories or expressions changed → may need new factor-var / sim-prop impls.
     - `dsl-grammar.md` changed → may need parser update (rare but possible; see Tech Notes' "Grammar/parser drift" in `requirements.md`).
  4. **Run tests; respond to load failures** — `npm test`. Failure recipes:
     - `missing-defaults` — source-side fix in the sheet, re-extract.
     - `missing-impl` — hand-author the new `FactorVariableImpl` / `SimPropImpl` in `src/hazbot/wildfire/factor-variables.ts` or `sim-props.ts`. Include `compute()` / `evaluate()`, declare `requiredDefaults` and `ambientStateKeys` if the impl needs them, set `isStub: true` only if the impl genuinely can't be implemented yet.
     - `parse-error` — typo in sheet expression (fix at source) or new DSL construct (update parser at `src/hazbot/engine/parser/`).
  5. **Add per-rule-set test files** — for each newly-loadable tab, create `src/hazbot/rule-sets/<id>.test.ts` using the helper at `src/hazbot/rule-sets/test-helpers.ts`. Include the `AC: per-rule-set five-shape sweep (a–e)`. ~30-line template included in the doc.
  6. **Re-generate validation playbooks** — `node scripts/generate-hazbot-validation-playbook.js`. Commit the updated `docs/hazbot-validation/*.md`.
  7. **Bump `APP_RULES_VERSION`** — increment `src/hazbot/wildfire/rules-version.ts` per Req 20's bump policy. (Editorial-only feedback-text edits do not require a bump.)
  8. **Smoke-check in-app** — `npm start`, navigate to `?hazbotRules=<newly-loadable-id>&hazbotSidebar=true`, confirm the sidebar renders without a `load-failure` banner and the matched-category logic looks right.
  9. **PR checklist** — group the regenerated rule-set modules + new impls + new tests + updated playbook docs + version bump in one PR.

**Estimated diff size**: ~150 lines.

The doc is workflow-focused, not API-reference. Substrate / bridge contracts are documented in code (TS types) and in the requirements spec; this file's purpose is "given a sheet edit, what do I run and in what order, and how do I respond when something breaks." Living under `docs/` (not in-source) signals it's a process artifact rather than something the build consumes.

---

### App wire-up: URL flags, log.ts wrapper, app.tsx mount, ambientState call sites

**Summary**: The final commit. Wire the engine into the running app: URL flag plumbing in `src/config.ts`, log-wrapper update in `src/log.ts` for the `ambientState` parameter + engine fork, app.tsx mount of Provider + Sidebar gated on URL flags, ambientState passed at the SimulationStarted call sites, the integration-style `ambientState` plumbing test from AC: ambientState plumbing end-to-end (chartStore.tabOpen reflected in resulting Reading). Layout extension for the dual-sidebar case (logMonitor + Hazbot sidebar side-by-side per AC: dual-sidebar layout when both URL flags set).

**Files affected**:
- `src/config.ts` — `ISimulationConfig` extended with `hazbotRules?: string;` and `hazbotSidebar?: boolean;`. `getDefaultConfig` returns `hazbotRules: undefined, hazbotSidebar: false`. `getUrlConfig`'s loop already picks them up generically.
- `src/log.ts` — rewritten:

  ```ts
  import { log as laraLog } from "@concord-consortium/lara-interactive-api";
  import { createLogWrapper } from "@concord-consortium/log-monitor";
  import { getUrlConfig } from "./config";
  import { getAnalysisEngine } from "./hazbot/wildfire";

  const { logMonitor } = getUrlConfig();

  // External destinations — wrapper constructed once (see Tech Notes).
  const externalLog = logMonitor ? createLogWrapper(laraLog) : laraLog;

  type LogFn = (name: string, data?: unknown, ambientState?: unknown) => void;

  export const log: LogFn = (name, data, ambientState) => {
    externalLog(name, data);
    getAnalysisEngine()?.consume({ name, data, ambientState, at: Date.now() });
  };
  ```

  All existing call sites continue to compile — `log("SimulationEnded", { ... })` still works; the new third parameter is optional. The third parameter was the contract we wanted, per Req 3a. **Wrapper carries no engine-state knowledge** (per ENG-4): the `?.` covers the no-engine case (URL flags unset), and the engine's `consume()` covers the inactive-engine case (per Req 10's `if (!isActive) return` early return at the top of step 3's `consume()` body). One contract source — the engine itself — for "what does inactive mean."
- `src/components/right-panel.tsx` — unchanged. `log("ChartTabShown")` / `log("ChartTabHidden")` already call with two args (data omitted) — works unchanged.
- `src/components/bottom-bar.tsx` — modified at the SimulationStarted call site only. Passes `ambientState: { chartTabOpenAtStart: ui.showChart }` (or the `chartStore.tabOpen` equivalent — both stores are in scope). Other Simulation* call sites unchanged.
- `src/components/app.tsx` — modified:
  1. Import `getAnalysisEngine`, `AnalysisEngineProvider`, `Sidebar`, `APP_RULES_VERSION`.
  2. Read `hazbotSidebar` from `getUrlConfig()`.
  3. At top of `AppComponent`, `const engine = getAnalysisEngine();` (returns undefined if neither URL flag is set).
  4. Layout: when `hazbotSidebar` is true AND `engine !== undefined`, mount `<AnalysisEngineProvider engine={engine} appRulesVersion={APP_RULES_VERSION}>` around `<Sidebar />` as a third right column. The Provider does **not** wrap the main `content` — only `Sidebar` consumes the engine context for WM-10, so a tighter wrap matches the Provider mount truth table at requirements.md line ~196 (Provider mounts iff Sidebar mounts; FE-4 / R9-2) and avoids mounting a dead Provider on the page in the `hazbotRules`-only no-sidebar mode. Existing flex shape stays — extend the `display: flex` branch to support a second optional right column.

     ```jsx
     return (
       <div style={(logMonitor || hazbotSidebar) ? { display: "flex", width: "100%", height: "100%" } : { width: "100%", height: "100%" }}>
         {(logMonitor || hazbotSidebar)
           ? <div style={{ flex: 1, overflow: "hidden", position: "relative", transform: "scale(1)" }}>{content}</div>
           : content
         }
         {logMonitor && <LogMonitor logFilePrefix="wildfire-log-events" />}
         {hazbotSidebar && engine && (
           <AnalysisEngineProvider engine={engine} appRulesVersion={APP_RULES_VERSION}>
             <Sidebar />
           </AnalysisEngineProvider>
         )}
       </div>
     );
     ```

     If only `?hazbotRules` is set (no sidebar), the engine constructs but neither Provider nor Sidebar mounts — the engine consumes events via the log wrapper and exposes its state to devtools-only consumers. This matches the Provider mount truth table at spec line ~196.
- `src/components/log-events.test.tsx` — extended. Per AC: ambientState plumbing end-to-end — parameterize a new test (or two test cases) over `chartStore.tabOpen` / `ui.showChart` set to true and false; trigger `SimulationStarted`; assert the resulting engine Reading's `ambientState.chartTabOpenAtStart` reflects the set value.
- `src/components/app.test.tsx` (new, light) — RTL-style mount checks per AC: dual-sidebar layout when both URL flags set — with `?logMonitor=true` + `?hazbotSidebar=true`, both right columns render. With only `?hazbotSidebar=true`, only the Hazbot column renders. With neither flag, neither column renders. Mocks `getUrlConfig` to drive cases.

**Estimated diff size**: ~250 lines. Most of the bulk is the layout JSX extension + the new test cases. The actual wire-up surface is small because the bridge module orchestrates everything.

This commit is the smallest of the twelve, but it's the load-bearing one — until this lands, nothing is reachable from the running app. Earlier steps' code is fully tested in isolation; this step verifies the integrated runtime path.

---

## Open Questions

<!-- Implementation-focused questions only. Requirements questions go in requirements.md. -->

### RESOLVED: IMPL-1 — Steps that exceed the ~500-line guideline (parser, rule sets)

**Context**: Two of the drafted steps exceed the spec's "~500 lines or fewer per commit" guideline:

- **Parser step**: ~700 lines (~300 code + ~400 tests). The parser AST + tokenizer + recursive-descent + the comprehensive AC: DSL parser coverage (operators + precedence + numeric-literal boundaries) test sweep land together.
- **Generated rule-set step**: ~1500 lines. Mostly mechanical generated TS bodies — `23.ts` + `24.ts` + `25.ts` are loadable, `32.ts` through `35.ts` are blocked-on-defaults but committed for discoverability + playbook coverage. Tests for the three loadable rule sets run the AC: per-rule-set five-shape sweep.

**Options considered**:
- A) Keep both as drafted. The parser is logically one unit (AST + parser + tests are mutually verifying); the rule-set commit is mostly generated code that's reviewed structurally rather than line-by-line.
- B) Split the parser step into "parser code" + "parser tests" (two commits). Splits the verification chain — first commit lands code without tests proving it works.
- C) Split the rule-set step into "loadable rule sets + tests" (23, 24, 25 ~600 lines incl. tests) + "blocked-on-defaults rule sets" (32–35, ~700 lines, no tests). Each part stays under the line ceiling and the second commit is purely structural.
- D) Both A — accept the over-budget commits.

**Decision**: A — keep both as drafted. The parser's AST + parser + tests verify each other; splitting them lands code without tests in the first commit, which is worse than an over-budget commit. The rule-set step is dominated by mechanical generated code that reviewers skim structurally rather than line-by-line. The 500-line guideline is a guideline, not a hard ceiling, and the spec's framing ("~500 lines or fewer") accommodates these cases.

---

### RESOLVED: IMPL-2 — Bridge-side sidebar test placement

**Context**: AC: bridge-side sidebar tests against real `ruleSets["23"]` requires a bridge-side sidebar test that drives the substrate `Sidebar` against a real wildfire `Engine<WildfireReading, WildfireDefaults>` using a generated rule set (e.g., `ruleSets["23"]`). The wildfire-bridge step lands before the rule-set extraction step, so the test can't depend on a generated rule set when its own commit lands.

**Options considered**:
- A) Land the test in the bridge step with a **hand-authored fixture rule set** (a small inline `RuleSet<WildfireDefaults>` declared in the test file, mimicking ruleSet 23's structure). Test verifies the substrate/bridge integration without depending on the extraction script. Bridge-side sidebar coverage lands earlier; the AC's "real generated rule set" clause is satisfied later by a follow-on test that reuses the same harness with `ruleSets["23"]`.
- B) Defer the test to the generated-rule-set step — landed alongside the generated rule sets it depends on. The bridge step ships its code uncovered for sidebar/integration cases until the rule-set step lands.
- C) Split: hand-authored fixture test in the bridge step (proves the wiring) **plus** a separate generated-rule-set test in the rule-set step (proves the extraction-script output integrates). Both substrate-side and bridge-side sidebar-test sub-bullets satisfied with explicit ownership per commit.

**Decision**: B — defer the bridge-side sidebar test to the generated-rule-set step. The bridge step retains unit-level coverage of impls + translate + the engine-singleton factory, which is sufficient verification of the bridge wiring on its own commit; the integration-style sidebar render is added once the real `ruleSets["23"]` is available. Avoids carrying a hand-authored fixture rule set that would need to be removed once the real one lands (option A) and avoids the parallel two-test maintenance burden of option C.

---

### RESOLVED: IMPL-3 — Generated playbook docs commit timing

**Context**: The validation-playbook generator script and its fixture tests land in one step; the script's *output* (`docs/hazbot-validation/{23,24,25,32,33,34,35}.md`) is also committed per AC: validation-playbook generator emits per-tab markdown checklists.

**Options considered**:
- A) Bundle the generator script + the generated `docs/hazbot-validation/*.md` files in a single commit (~600 lines). Re-running the script is the operation that produced both.
- B) Split into two commits: (i) generator script + fixture tests (~500 lines); (ii) generated `docs/hazbot-validation/*.md` outputs (~150 lines, mechanical). Keeps the script's review focused on logic + tests; the docs land as a pure mechanical artifact.

**Decision**: B — split. Implementation Plan now has a separate "Generated validation-playbook docs" step after the generator-script step. Reviewers reading the script-step PR focus on logic + fixture tests; the docs commit is a mechanical artifact reviewed structurally. Mirrors how the extraction-script overhaul + generated rule-set modules already split into two commits.

---

### RESOLVED: IMPL-4 — Stub-flag mechanism on factor-variable / sim-prop impls

**Context**: The substrate emits `stub-warning` errors for impls flagged as stubs (Req 6 — `SparksAtTopAndBottom`, `sawIntenseFire`). The substrate needs a way to identify stub impls.

**Options considered**:
- A) Static `isStub?: true` field on the impl object. E.g., `SparksAtTopAndBottom: { isStub: true, evaluate: () => false, ... }`. Substrate reads the flag at load time. Simple; flag co-located with the impl that wears it.
- B) Separate stubs-registry on `EngineOpts`: `stubs?: string[]` listing the names of stubbed impls. Bridge passes `["SparksAtTopAndBottom", "sawIntenseFire"]` alongside the impl maps. Decouples "what's a stub" from the impl shape; one place to grep.
- C) Convention-based: any impl whose `compute()`/`evaluate()` matches a known sentinel return signature (e.g., a substrate-exported `STUB_FACTOR_VARIABLE` / `STUB_SIM_PROP` helper). The bridge declares `SparksAtTopAndBottom: STUB_SIM_PROP("SparksAtTopAndBottom")`; substrate identifies the helper by reference equality on a marker symbol. Avoids both an extra interface field and an out-of-band registry.

**Decision**: A — `isStub?: boolean` optional field on both `FactorVariableImpl` and `SimPropImpl`. Fits the existing optional-metadata pattern alongside `ambientStateKeys` and `requiredDefaults`; keeps the flag co-located with the impl that wears it; no drift risk between an impl and an out-of-band registry (option B); no indirection through a sentinel helper (option C, which would be over-engineering for the two stubs WM-10 actually has). Reflected in the substrate scaffolding step's `types.ts` description.

---

## Self-Review

### Senior Engineer

#### RESOLVED: ENG-1 — `safelyEvaluateImpl` sentinel-return mechanism is hand-wavy

Step 4 said the wrapper "returns a sentinel default (boolean false / empty Set / empty array as appropriate to the impl's declared value type — discoverable via the impl's TS generic parameter at the call site, with a fallback to `false`)." TypeScript generics are erased at runtime — the wrapper has no way to "discover" the impl's value type from its TS generic parameter. **Resolution**: Added a required `defaultValue: V` field on both `FactorVariableImpl<V, TReading>` and `SimPropImpl<TReading, TDefaults>` (step 1's `types.ts` description); `safelyEvaluateImpl` now reads `impl.defaultValue` on catch (step 4). Sim-props always declare `defaultValue: false`; factor variables declare per their value type. Step 7's wildfire-bridge impl listings updated accordingly. Co-locates the sentinel with the impl that wears it — same rationale as IMPL-4's `isStub` decision.

---

#### RESOLVED: ENG-2 — Render-time `compute()` / `evaluate()` throws would mutate `engine.errors`

The React layer (step 5) calls `computeView` from inside the hook's render path. Step 4's `safelyEvaluateImpl` catches throws and appends `impl-eval-throw` to `errors`. If a buggy impl threw during render-driven evaluation, either (i) the snapshot would tick → re-render loop, or (ii) the snapshot wouldn't tick → silent error accumulation per render — both unacceptable. **Resolution**: Step 4's `safely-evaluate-impl.ts` now exports two wrappers: `safelyEvaluateImpl` (consume path — mutates `errors`) and `evaluateForRender` (render path — swallows throws to `defaultValue` without mutation). Step 4's `evaluateMatch` / `evaluateLeaf` / `evaluateWith` accept an injected `wrap` parameter so the call site picks the appropriate wrapper. Step 5's `computeView` injects `evaluateForRender`. New tests in step 4 (`safely-evaluate-impl.test.ts`) and step 5 (`use-analysis-engine.test.tsx`) lock in the consume/render split. Mutation of `errors` is now structurally confined to the `consume()` pipeline; render is pure per React's hook contract.

---

#### RESOLVED: ENG-3 — `evaluateMatch` signature unclear about monotonicity derivation

Step 4 declared `evaluateMatch(readings)` as one-shot, but the test description referenced the "max-over-i derivation" — and requirements.md Tech Notes line ~557 explicitly defines `matchedCategory ≡ max over i of highestTrueAt(readings.slice(0, i+1))`. **Per-impl monotonicity is not sufficient for monotone match**: a counter-example is cat 2 = `setDroughtLevel AND NOT usedOneSparkPerZone`, where both impls are monotone-true but the AND is non-monotone (true → false transition possible) — so one-shot `evaluateMatch(readings)` against the latest state can regress.

**Resolution**: Step 4's `evaluator.ts` now exports two distinct functions instead of one ambiguous `evaluateMatch`: (a) `highestTrueAt(readings, ...)` — one-shot per-state, returns the highest-id true category at the supplied state; (b) `computeMatchedCategoryFloor(readings, ...)` — iterates prefixes and returns `max over i of highestTrueAt(readings.slice(0, i+1))`, implementing Req 7 monotonicity at the substrate level rather than relying on per-impl monotonicity contracts the impls don't owe. Step 4's evaluator tests split into matching sweeps (a) and (b), with the canonical non-monotone-expression case (cat 2 fires at reading 3 then expression evaluates false at reading 5; assert floor stays at 2) covering AC: per-rule-set five-shape sweep (d). Step 5's hook uses `computeMatchedCategoryFloor` for the `matchedCategory` field; `perCategoryTruth` continues to use `evaluateLeaf` per category at the latest readings (current truth, not floor). O(N²) cost amortized by the existing WeakMap memoization (once per snapshot).

---

#### RESOLVED: ENG-4 — Redundant `isActive` check in `log.ts` wrapper

Step 12's wrapper duplicated the engine's inactive-engine contract by guarding with `if (engine?.isActive)` before calling `consume()`. **Resolution**: Replaced with `getAnalysisEngine()?.consume({ ... })`. The `?.` covers the no-engine case (URL flags unset → `getAnalysisEngine` returns undefined); `consume()` handles the inactive-engine case per its own contract. Wrapper carries no engine-state knowledge — one source of truth.

---

### QA Engineer

#### RESOLVED: QA-1 — AC citations by line number will drift

Implementation steps cited acceptance criteria as "AC line 232", "AC line 245", etc. — and the original drafting was already off-by-one against current `requirements.md` (e.g., "AC line 247 (basic listener)" actually pointed at requirements.md line 248), confirming the drift concern empirically. **Resolution**: All 28 forward-facing AC citations in the Implementation Plan converted to descriptive-handle form (`AC: <descriptor>`), e.g., `AC line 247` → `AC: basic listener (Engine exposes subscribe/getSnapshot, listener fires after each consume mutation)`. Reader greps requirements.md for the descriptor phrase. No edits to requirements.md required (avoids scope-creep into a spec that has already been through 11 review passes). Self-Review's QA-1 and QA-4 entries deliberately preserve their original `AC line N` citations to keep the issue text accurate.

---

#### RESOLVED: QA-2 — Extraction-script round-trip test mechanism doesn't apply

Step 9's draft used `JSON.parse(JSON.stringify(...))` as the round-trip mechanism — but the generated artifact is TS source, not JSON, and `JSON.parse(JSON.stringify(...))` against an already-loaded JS value is a no-op. The actual escape-generation regression risk is between the source rows and the generated TS literal. **Resolution**: Rewrote step 9's test mechanism: compile the generated `.ts` via `ts-node/register` (or shell out to `tsc` to a tmpdir + `require`), import the generated `ruleSet<id>` export, and deep-equal against the synthetic-fixture source rows. Hostile-content rows fail at either compile (caught by the existing `tsc --noEmit` bullet) or at deep-equal. Implies a `ts-node` devdep — see DEV-1.

---

#### RESOLVED: QA-3 — SSR posture test via `useSyncExternalStore` arg-count spy is brittle

Step 5 proposed asserting SSR posture by spying on `useSyncExternalStore`'s call shape — a brittle test against React's API surface that doesn't actually verify SSR behavior. **Resolution**: Dropped the SSR test entirely. Wildfire-model is never server-rendered (confirmed by user) and the substrate is internal; Req 19's "browser-only" stance is captured in the hook's jsdoc as a documented contract, no runtime guard needed. Test budget reallocated to behavior-bearing assertions.

---

#### RESOLVED: QA-4 — "Smoke-level coverage per AC line 266 (cases 1–4)" is vague

Step 6's sidebar test description referenced "cases 1–4" without enumerating them, forcing a pivot to requirements.md. **Resolution**: Inlined the four case names in step 6 during the QA-1 conversion pass — "renders without throwing given populated engine + Provider; displays matched category number + feedback text; renders load-error message when engine inactive due to bad rule-set id; re-renders when snapshot ticks via consume." Implementer no longer needs a second source of truth to write the test.

---

### Library / Substrate Architect

#### RESOLVED: LIB-1 — ESLint `import/no-restricted-paths` zone path semantics

Step 1's config drafted `target: "./"` and `from: "../.."` — the natural "relative to my config file" reading. **Verified against `eslint-plugin-import@2.27.5` source** (rule file line 78: `basePath = options.basePath || process.cwd()`): the rule resolves paths via `path.resolve(basePath, ...)` where `basePath` is the eslint cwd (project root), NOT the config-file location. The drafted config would silently match nothing useful → substrate has no actual ESLint guard despite the AC requirement. **Resolution**: Rewrote step 1's `.eslintrc.js` snippet with project-root-relative paths (`target: "./src/hazbot/engine"`, `from: "./src"`, `except: ["./src/hazbot/engine"]`), and added a "path-resolution gotcha" callout documenting the basePath/cwd semantic so a future contributor doesn't redraft it as config-file-relative. Also confirms LIB-1's "verify locally" guidance — the deliberate-violation check in step 1's "verified two ways" paragraph now actually verifies a working rule.

---

#### WITHDRAWN: LIB-2 — `renderError` not in public API barrel

I raised this without checking requirements.md's "Substrate public API surface" subsection (Tech Notes line 486), which **intentionally** keeps `renderError` internal alongside `parse()`, the evaluators, and the sidebar sub-components. The documented pattern for host apps that want custom error rendering is to inspect `engine.errors` programmatically and build their own renderer against the public `EngineError` discriminated union — symmetric with the `Expression` / `ParseError` carve-out for "advanced consumers building custom expression visualizers" (line 496). Adding `renderError` to the barrel would expand the substrate API surface against explicit Tech Notes design. **No spec change.**

---

#### RESOLVED: LIB-3 — Generic type narrowing across React context boundary

The substrate's `AnalysisEngineContext` types its engine as `Engine<unknown, unknown>` because React contexts can't carry generic type parameters at the boundary. The hook's `useAnalysisEngine<TReading, TDefaults>()` generic params are therefore a consumer's *claim*, not a TS-validated narrowing — `useAnalysisEngine<WrongReading, WrongDefaults>()` compiles. **Resolution**: Documented the type-narrowing limitation in step 5's `context.ts` description with a note explaining (a) why it's fine for WM-10 (the only React-side consumer is the substrate's generic `Sidebar`, which works against unknown payload via `JSON.stringify`), and (b) the recommended pattern for post-extraction host apps with strict type-safety needs (wrap `useAnalysisEngine` in a typed factory in the bridge layer). No runtime change; documentation captures the contract that was previously implicit.

---

#### RESOLVED: LIB-4 — Sidebar CSS class names not namespaced

Step 6's draft only namespaced the root selector (`.hazbot-sidebar`); per-element classes (`.entry`, `.header`, `.button`) were unprefixed and would risk collision with host-app CSS. **Resolution**: Adopted log-monitor's flat-prefix posture (verified in `node_modules/@concord-consortium/log-monitor/dist/log-monitor-styles.js`: `.log-monitor-header`, `.log-monitor-entry`, etc.). Step 6's `sidebar.css` description now pins the convention: every class prefixed with `hazbot-sidebar-` (e.g., `.hazbot-sidebar-header`, `.hazbot-sidebar-entry`, `.hazbot-sidebar-leaf-true`). Self-documents at the call site; PR-review catches any new unprefixed class addition.

---

### Build / DevOps Engineer

#### RESOLVED: DEV-1 — `ts-node` devdep + tsconfig for generated files

Both unverified assumptions turn out to be already-handled:
- `ts-node` is **already** a devdep (`^10.9.1` in `package.json`). No new devdep needed.
- `tsconfig.json` `include: ["./src/**/*", "./setupTests.ts"]` — `src/hazbot/**` is picked up automatically. No tsconfig change needed.

Step 11's script-side parser import via `ts-node/register` works without further setup. **No spec change required**; the existing draft is implementable as written. (Discovered while applying QA-2's resolution.)

---

#### RESOLVED: DEV-2 — ESLint version compatibility for sub-folder `.eslintrc.js`

Verified during LIB-1 investigation: project is on ESLint `^8.42.0` + `eslint-plugin-import ^2.27.5`, root `.eslintrc.js` is legacy. No flat-config migration imminent; sub-folder legacy config will work as designed. Adding a step 1 note about flat-config migration would be premature — when the project does upgrade, the substrate's `.eslintrc.js` becomes one of dozens of files needing migration and won't be the load-bearing concern. **No spec change required.**

---

### WCAG Accessibility Expert

#### RESOLVED: A11Y-1 — Sidebar inherits log-monitor color contrast without verification

Step 6's `sidebar.css` description gained a "**Color contrast**" callout: mirrored log-monitor light-theme colors must be spot-checked against WCAG AA via axe DevTools or Lighthouse on the mounted sidebar; adjust if any combination fails. Documents that contrast inheritance is not a guarantee, prevents the assumption that "log-monitor passed AA so we do too" from going un-validated.

---

#### RESOLVED: A11Y-2 — Focus indicator preservation not pinned in sidebar.css description

Step 6's `sidebar.css` description gained a "**Focus indicators**" callout: no `outline: none` resets anywhere in the file; if any element resets outline for non-focus state, supply an equivalent `:focus-visible { outline: ... }` rule so keyboard-focus visibility is never lost. Locks in the implicit assumption that `<button>` defaults give keyboard activation per Req 17.

---

### Re-review (Pass 2 — issues introduced by Pass 1 resolutions)

#### RESOLVED: PASS2-1 — `defaultValue: V` is a substrate-API expansion that should be acknowledged

ENG-1's added required `defaultValue: V` field on `FactorVariableImpl` and `SimPropImpl` is a structural addition to two published interfaces. Since this is the initial `0.0.1` substrate version, no semver bump is needed — but the addition should be explicitly captured in the baseline. **Resolution**: Added an "API baseline note" to step 1's `types.ts` description: both impl interfaces' field sets (`defaultValue`, `requiredDefaults`, `ambientStateKeys`, `isStub`) are baselined at `0.0.1`; adding required fields post-`0.0.1` is a major API expansion per Req 20, optional fields a minor bump, removals a major bump. Codifies the versioning policy at the spot a future contributor would touch.

---

#### RESOLVED: PASS2-2 — Evaluator's new `wrap?` injection parameter and four-export shape need explicit "internal" framing

The six new exports added by ENG-2 + ENG-3 (`safelyEvaluateImpl`, `evaluateForRender`, `highestTrueAt`, `computeMatchedCategoryFloor`, `evaluateLeaf`, `evaluateWith`) needed explicit "internal-only" framing so a future contributor doesn't accidentally re-export them. **Resolution**: Added a closing "Internal-only export surface" paragraph to step 4 enumerating the six exports and the `wrap?` injection parameter as internal-to-the-substrate per Tech Notes line 507; none are re-exported from `src/hazbot/engine/index.ts`. Cross-references PASS2-1's API-baseline policy to make the exclusion explicit.

---

#### RESOLVED: PASS2-3 — WeakMap memoization staleness under render-path impl throw

The interaction between ENG-2's pure render-path wrapper and ENG-3's snapshot-keyed memoization produces a stale-cache window when an impl starts throwing between consume events. **Resolution**: Added a "Render-path staleness window" note to step 5 acknowledging the bounded staleness (next consumed event clears it) and explaining the tradeoff — invalidating the cache on render-path throw would re-introduce the render-path mutation ENG-2 specifically resolved. Acceptable for WM-10's debug-only use; documented for future-debugger honesty.

---

### Re-review (Pass 3 — fresh perspectives: perf, security, API design, test strategy, maintainability)

#### RESOLVED: PASS3-API-1 — `FactorVariableImpl.compute()` interface receives no `defaults`, but multiple bridge impls need them

Six of the eleven wildfire factor variables described in step 7 — `setDroughtLevel`, `setVegetation`, `setTerrainType`, `setWind`, `setAnyZoneVar`, `setAnyVar` — are documented as comparing reading values "against the default" (e.g., `setDroughtLevel`: "witnesses = SimulationStarted readings whose any-zone drought differs from the default; `requiredDefaults: ["zones[*].droughtLevel"]`"). But the substrate's `FactorVariableImpl` interface (requirements.md line 596 and step 1's `types.ts` description) declared:

```ts
compute: (readings: TReading[]) => { value: V; witnesses: TReading[] };
```

`compute` received only `readings` — no `defaults`. The `requiredDefaults` field is metadata for load-time path validation, not a value-passing channel. By contrast, `SimPropImpl.evaluate(reading, defaults)` (requirements.md line 638) already received defaults. This was an asymmetry: sim-props could read defaults at evaluation time, factor variables structurally could not.

**Resolution**: Picked option A — substrate API change. `FactorVariableImpl<V, TReading, TDefaults>` gains a third generic parameter and `compute` becomes `(readings: TReading[], defaults: TDefaults) => { value: V; witnesses: TReading[] }`, symmetric with `SimPropImpl.evaluate(reading, defaults)`. Updated:

- **Step 1's `types.ts` description**: interface signature, generic parameter list, and PASS2-1 API-baseline note (the new two-argument `compute` signature is part of the `0.0.1` baseline; future signature changes are governed by the same major/minor/patch policy).
- **Step 4's `safely-evaluate-impl.ts` and `evaluator.ts` descriptions**: both wrappers and all four evaluator exports thread `defaults` through. `safelyEvaluateImpl` reads `engine.ruleSet.defaults` (non-null because consume-path runs only when `isActive`); `evaluateForRender` reads `engine.ruleSet?.defaults` from the hook's context.
- **Step 5's `computeView` description**: passes `engine.ruleSet.defaults` to evaluator calls; when engine is inactive the hook surfaces load errors and skips evaluator calls (so `defaults` never gets read in the inactive branch).
- **Step 7's `factor-variables.ts` description**: registry typed as `Record<string, FactorVariableImpl<unknown, WildfireReading, WildfireDefaults>>`; impls' `compute` receives the second `defaults` arg.

Picked A over option B (bridge factory pattern with closures over defaults) because: (i) symmetry with sim-props' already-existing `evaluate(reading, defaults)` collapses one asymmetry rather than introducing a second mechanism; (ii) inspectability — static `Record`s let tests construct impls and call them directly without first calling a factory, and let tooling statically read each impl's shape; (iii) PASS2-1 baseline cost — adding the parameter post-`0.0.1` would be a major bump, but doing it now (before `0.0.1` ships) is a pure baseline addition. Picked A over option C (engine-side defaults storage with a getter) because C adds more substrate machinery for the same outcome without the symmetry payoff.

**Requirements.md follow-on (now scheduled in step 1, per EXT-5)**: `FactorVariableImpl`'s declared interface in requirements.md (line ~613) and the surrounding "Factor-variable implementation interface" Tech Notes subsection currently show the one-arg `compute(readings)` signature. This implementation-level decision implies a small follow-on edit to requirements.md to keep the substrate's published interface aligned. Originally deferred to Phase 5 finalization; per EXT-5's resolution, the edit now lands as part of step 1's commit (added to step 1's "Files affected" list) so doc and code align in the same commit and there's no drift window.

---

---

#### RESOLVED: PASS3-API-2 — `engine.subscribe` and `engine.getSnapshot` need to be `this`-stable callbacks

Step 5's hook reads:

```ts
useSyncExternalStore(ctx.engine.subscribe, ctx.engine.getSnapshot)
```

This passes the methods as bare references. `useSyncExternalStore` later calls them as plain functions (e.g., `subscribe(listener)`, `getSnapshot()`), which means `this` is `undefined` at call time. If `subscribe` and `getSnapshot` were declared as ordinary class methods on `Engine` (the natural reading of step 3's prose: "`subscribe(listener)`: pushes onto `private listeners: Set<() => void>`"), the methods would crash at runtime with `Cannot read property 'listeners' of undefined` because `this.listeners` / `this.snapshotVersion` is unreachable.

**Resolution**: Picked option A — declare `subscribe` and `getSnapshot` as arrow-function class fields on `Engine`. Step 3's engine.ts description gains an explicit "Declaration form for React-callback methods" sub-bullet pinning the form: `subscribe = (listener: () => void) => { ... }` and `getSnapshot = (): number => this.snapshotVersion;`. `consume` and `isActive` stay as conventional class members because they're called via `engine.consume(...)` / `engine.isActive` with `this` intact at the call site. Step 3's `engine.test.ts` AC list gains a "bare-reference invocation" test that extracts `engine.subscribe` and `engine.getSnapshot` into locals and calls them without the engine receiver — protects against a future refactor "cleanup" that reverts to prototype methods.

Picked A over option B (`useCallback` in `useAnalysisEngine`) because: (i) class-field arrow functions are idiomatic for React-store classes (Zustand, RTK, the official `useSyncExternalStore` examples all use this pattern); (ii) option B's `useCallback`s with `[engine]` deps become a footgun for future host apps that pass the engine indirectly through wrapper hooks; (iii) the unsubscribe closure already returned by `subscribe` is itself an arrow function — declaring `subscribe` the same way is consistent rather than introducing a second style. Per-instance arrow-field allocation cost is irrelevant at one engine per page.

---

---

#### RESOLVED: PASS3-API-3 — `HookReturn` export inconsistency between requirements.md and step 5

Step 5's `react/index.ts` description: "Barrel re-exports `AnalysisEngineProvider`, `AnalysisEngineProviderProps`, `useAnalysisEngine`, `HookReturn` type alias."

But requirements.md's "Substrate public API surface" subsection (line 499–502) — the canonical published-API list — enumerated only `AnalysisEngineProvider`, `AnalysisEngineProviderProps`, `useAnalysisEngine` for the React layer. `HookReturn` was not listed. The current state was the worst of both: implementation said it's exported, requirements said it wasn't. A reviewer comparing the two notices the drift; a future contributor reading only one of the two gets a partial picture.

**Resolution**: Picked option B — formalize `HookReturn` in requirements.md's published API surface. Step 5's export stays as drafted; no implementation change needed. The requirements.md edit becomes a documentation follow-on (handled at Phase 5 finalization or in a follow-on PR alongside the substrate's first commit, bundled with the same documentation-update task that PASS3-API-1's `compute(readings, defaults)` signature change implies).

Picked B over option A (drop `HookReturn` from step 5's barrel) because: (i) **LIB-3's already-resolved recommendation depends on `HookReturn` being a published type** — LIB-3 instructed post-extraction host apps to wrap `useAnalysisEngine` in a typed factory like `useWildfireAnalysisEngine = (): HookReturn<WildfireReading, WildfireDefaults> => useAnalysisEngine()`, which is unimplementable without the named export; (ii) `ReturnType<typeof useAnalysisEngine>` is awkward when the hook is itself generic over `<TReading, TDefaults>` and TS's `ReturnType` doesn't propagate generics through a function reference cleanly; (iii) the hook's return shape is part of the contract whether it's named or not — naming it formally is hygiene, not API expansion in any meaningful sense. PASS2-1's baseline policy treats this as a `0.0.1` baseline addition with no semver impact.

**Documentation follow-on consolidation (now scheduled in step 1, per EXT-5)**: PASS3-API-1 (`compute(readings, defaults)` signature) and PASS3-API-3 (add `HookReturn` to published surface) both imply edits to requirements.md's already-closed Tech Notes subsections. Originally bundled to land at Phase 5 finalization; per EXT-5's resolution, both edits now land as part of step 1's commit alongside the code that introduces them, eliminating the drift risk of unscheduled doc-only follow-ons.

---

---

#### RESOLVED: PASS3-MAINT-1 — `renderError`'s exhaustive-narrowing not pinned

Step 1's `error-rendering.ts` description was: `exports renderError(e: EngineError): { severity: "error" | "warning"; message: string }`. The associated test (`error-rendering.test.ts`) covered "one test per row in the rendering map." Both right, but the implementation strategy did not pin TypeScript exhaustive-narrowing via the `_: never` pattern. Without it, adding a new `EngineError` variant (or a new `reason` value within `load-failure` / `orphan-modifier`) would compile cleanly even if the renderer forgot to handle it — caught only by the test suite, and only if a corresponding test row was authored, which is the very thing the test was supposed to mechanically enforce.

**Resolution**: Pinned exhaustive narrowing in step 1's `error-rendering.ts` description. The renderer's outer `switch (e.kind)` AND the inner `switch (e.reason)` blocks for `load-failure` and `orphan-modifier` (the two variants whose `reason` field discriminates further into rendering-map rows) end with a `default: { const _exhaustive: never = e; throw new Error(...); }` clause. Adding a new variant — or a new `reason` value — fails TS compile at the renderer rather than waiting for a missed test row. Step 1's `error-rendering.test.ts` description tightened to clarify that the test verifies *content*, not exhaustiveness — exhaustiveness is now a compile-time guard.

Symmetric with how the spec already treats other substrate invariants (ESLint zone rule, AC for auto-generated header, defaults-path validator) as mechanical guards rather than test-only guards. One-paragraph spec edit, one-line code addition per switch — vanishingly small cost for permanently removing the "added a variant, forgot the renderer" regression class over the substrate's lifetime.

---

---

#### RESOLVED: PASS3-SEC-1 — ESLint `no-restricted-paths` coverage of dynamic and type-only imports unverified

Step 1 establishes the substrate boundary via `eslint-plugin-import`'s `no-restricted-paths` zone rule + `no-restricted-imports` for mobx/react-dom. LIB-1's resolution verified path-resolution semantics. What was not verified: whether the rule flags two specific bypass routes a substrate-internal author could accidentally use — dynamic imports (`const store = await import("../../store");`) and type-only imports (`import type { Store } from "../../store";`). The first has variable plugin coverage by version; the second compiles away in JS but creates a TS-level coupling that defeats the substrate's "no knowledge of host types" intent.

**Resolution**: Picked option C — verify locally during step 1 *and* document the verification outcome inline. Step 1's "verified two ways" paragraph expanded to "verified three ways" covering: (a) static-import violation, (b) dynamic-import violation, (c) type-only-import violation. After running all three checks locally, the implementer captures the result in a comment block atop `engine/.eslintrc.js` listing which import forms the rule catches at the project's pinned ESLint/`eslint-plugin-import` versions. If any of (a)–(c) silently passes, the rule is upgraded (e.g., switch to `eslint-plugin-import-x` for stronger dynamic-import coverage, or supplement with a custom rule) before step 1 ships.

Picked C over option A (extend verification only — one-time check, no permanent doc) because the verification result needs to outlive step 1 — a future contributor making substrate changes wants to know what the boundary actually enforces vs. what's enforced by convention. Picked C over option B (document only — no actual verification) because documenting an unverified claim is worse than no documentation. The combined cost is roughly ten extra minutes during step 1: five for the deliberate-violation checks, five for the comment block. Co-locating the verification outcome with the rule (rather than in this spec or a separate note) keeps the documentation alive across future ESLint upgrades — anyone touching the rule sees the verification result immediately.

A substrate boundary that doesn't catch its own violations is worse than no documented boundary at all; the comment-block convention forces the implementer to confront that during step 1 rather than discovering it during a later regression hunt.

---

---

#### WITHDRAWN: PASS3-TEST-1 — No end-to-end bootstrap integration test

I raised this without fully crediting how much integration coverage already exists across the unit-level test descriptions. Walking it back:

- **Step 10's bridge-side `sidebar.test.tsx`** already mounts the `Sidebar` inside a real `<AnalysisEngineProvider>` over a real `Engine<WildfireReading, WildfireDefaults>` constructed from a real generated `ruleSets["23"]` rule set, with synthetic readings + assertions on matched-category + wildfire-payload rendering. This is the integration heavy-lift — it proves the substrate's React layer + the bridge-side engine + the generated rule sets compose correctly.
- **Step 7's `engine-singleton.test.ts`** covers the URL-flag → `getAnalysisEngine()` factory path with URL-flag combinations and `AnalysisEngineActivated` emission shape.
- **Step 12's `app.test.tsx`** covers the Provider/Sidebar mount truth table under URL-flag combinations.
- **Step 12's `log-events.test.tsx`** covers `ambientState` plumbing end-to-end through `log()` to engine `Reading`.

The wiring concerns I originally flagged ("`getAnalysisEngine` returns engine but `app.tsx` doesn't mount Provider," "Provider mounts but Sidebar reads from the wrong context") are exactly what step 12's `app.test.tsx` Provider-mount truth table covers. An additional integration test that re-exercised these same junctions would add maintenance cost without finding new bugs — TS itself enforces most of the inter-module compositions structurally, and the remaining behavioral compositions are already covered.

The one path that's *not* automated is "URL really gets parsed by URLSearchParams → really gets read by the singleton" because step 12's `app.test.tsx` mocks `getUrlConfig`. Automating that round trip would either re-stub `window.location` (defeating the point of testing real URL parsing) or run in a real browser via Cypress (heavyweight for one path). The manual smoke-check (workflow doc step 8 in step 11) is the right level for that thin remaining slice — it's a one-time per-merge ritual, not a recurring runtime risk.

**No spec change.**

---

---

#### WITHDRAWN: PASS3-TEST-2 — No AC-to-test coverage matrix at finalization

I raised this as a process recommendation but on closer inspection the marginal value is too low for the form I proposed. The failure modes it would catch (dropped ACs, mis-cited ACs) are mostly already addressed:

- **Dropped ACs** — surface naturally during PR review when each commit's PR description lists "ACs covered in this PR." The matrix front-loads what PR review already does, without adding a check that wouldn't otherwise happen.
- **Mis-cited ACs** — a coverage matrix only catches these if the matrix is built by grepping requirements.md for each cited descriptor, which is the same check a careful implementer (or reviewer) does once at PR-authoring time. The matrix is bookkeeping, not a new bug-catching mechanism.

A permanent matrix in `requirements.md` or `implementation.md` decays fast: if an AC is split during late-stage edits, or a step is split per the Implementation Plan's existing "steps may be split/merged" framing, the matrix needs updating. A document that has to track every spec edit is a maintenance liability for a one-time check.

**Lighter alternative captured here, no spec change**: at Phase 5 finalization, do a single sweep mapping each `AC:` handle in implementation.md to the AC descriptor in requirements.md's AC section, producing a transient checklist that the author verifies once and then discards. The skill's Phase 5 step 1 already scans for OPEN items across all spec files; extending that one-time scan to AC-handle-vs-AC-text coverage is the right level — it does the bookkeeping check without committing it as a permanent table that has to be kept in sync.

**No spec change.**

---

### Re-review (Pass 4 — issues introduced by Pass 3 resolutions)

#### RESOLVED: PASS4-1 — `computeView` inactive-path semantics ambiguous after PASS3-API-1

PASS3-API-1's resolution edited step 5's `computeView` description to say: "when not active, `computeView` skips evaluator calls and surfaces only load errors." Surfacing the `defaults` threading made the inactive-path question concrete, but the wording was ambiguous about *which* paths get skipped — `computeView` does two distinct things in the active branch (populates `factorVariableValues` via per-impl `compute()`, AND runs matching/leaf evaluators), and "skips evaluator calls" naturally reads as the second only. Without a clarification, the hook would call each impl's `compute(readings, undefined)`, impls that read `defaults` would throw, throws would be swallowed to `defaultValue`, and the sidebar's `<FactorVariablesPanel />` would render the fallback values as if they were real reads.

**Resolution**: Picked option C — document the current behavior as intentional. Step 5's `computeView` description gains an explicit "Inactive-path semantics" paragraph spelling out: when `engine.ruleSet === undefined`, `computeView` runs all the same calls without special-casing, `defaults` resolves to `undefined`, impls reading defaults throw → swallowed to `defaultValue`, `matchedCategory` resolves to `null`, `perCategoryTruth` is the empty object, and `factorVariableValues` populates with each impl's `defaultValue` as fallback values. Step 6's `<FactorVariablesPanel />` description gains an "Inactive-engine values are fallbacks" callout: a small inline note at the top of the panel ("Engine inactive — values shown are impl defaults") makes the fallback visible to a debugging dev when `ruleSet === undefined`, suppressed otherwise.

Picked C over option A (skip path #1 too when inactive) because: (i) the `defaultValue` fallback is the substrate's universal "couldn't compute" signal, used identically in the active-path impl-eval-throw case — adding a separate inactive-path skip introduces a second mechanism for the same semantics; (ii) the inactive sidebar is a typo-the-URL-flag edge case, not a normal-traffic path, and the load-error banner already dominates the user's visual attention; (iii) options A and B add type-shape complications (an inactive-state branch in the panel, an undefined-vs-empty distinction at the hook boundary) that pay maintenance cost forever for what's effectively a developer-typo edge case. Option C is purely documentation: one paragraph in step 5, one inline note in step 6, no runtime branch.

---

### External review (Copilot, first pass)

#### RESOLVED: EXT-1 — `isActive` clarity vs. apparent inconsistency with UI suppression logic (Copilot finding, Medium)

Copilot flagged: "`isActive` is defined to ignore `missing-defaults` and `missing-impl` errors, but later UI logic assumes those conditions make the engine inactive. This inconsistency means the UI may treat an invalid ruleset as active and show truth coloring/values that should be suppressed."

**Assessment**: Copilot mis-read the `EngineError` discriminated union — `missing-defaults` and `missing-impl` are *reasons* on the `load-failure` kind (per requirements.md line 527), not separate `kind` values. Step 3's `isActive` check `e.kind === "load-failure" || e.kind === "parse-error"` correctly catches all three load-failure reasons plus parse-error. Runtime behavior is correct; no inconsistency exists.

**However**, Copilot's mis-read pointed at a real clarity gap — a reader who hasn't internalized the EngineError union sees `e.kind === "load-failure"` and reasonably wonders whether all three sub-reasons flow through. The spec assumed cross-reference to requirements.md; not every reviewer does that.

**Resolution**: Tightened step 3's `isActive` description with one explicit sentence noting that the `load-failure` check covers all three reasons (missing-rule-set / missing-defaults / missing-impl) and is symmetric with step 6's `<CategoriesPanel />` enumeration. One-sentence clarification, no behavior change. Records the false-positive review finding as a small clarity improvement.

---

#### RESOLVED: EXT-2 — App mount text/JSX disagree on Provider scope (Copilot finding, Medium)

Copilot flagged: "App mount description and JSX snippet disagree on how the `AnalysisEngineProvider` is applied. The text says to wrap the main content in the provider when `engine !== undefined`, but the JSX shows the provider only around the `Sidebar`, which would result in either double providers or a mismatch with the stated plan."

**Assessment**: Correct catch. Step 12's prose said "if `engine !== undefined`, wrap the existing `content` (or `content` + LogMonitor) in `<AnalysisEngineProvider>`," but the JSX block in the same step mounts the Provider only around `<Sidebar />`, gated on `hazbotSidebar && engine`. The JSX matches the requirements.md Provider mount truth table at line ~196 (Provider mounts iff Sidebar mounts; FE-4 / R9-2 resolution); the prose was a holdover from an earlier draft.

**Resolution**: Rewrote the "Layout" bullet to match the JSX: "When `hazbotSidebar` is true AND `engine !== undefined`, mount `<AnalysisEngineProvider>` around `<Sidebar />` as a third right column. The Provider does **not** wrap the main `content` — only `Sidebar` consumes the engine context for WM-10, so a tighter wrap matches the Provider mount truth table at requirements.md line ~196 (Provider mounts iff Sidebar mounts; FE-4 / R9-2) and avoids mounting a dead Provider on the page in the `hazbotRules`-only no-sidebar mode." JSX block unchanged.

Picked "narrow the prose to match the JSX" over "broaden the JSX to wrap content" because: (i) only `Sidebar` consumes the engine context for WM-10 — wrapping `content` would mount a context provider with no consumers, wasted React work per render; (ii) the truth table was already pinned during requirements review (FE-4 / R9-2) to "Provider mounts iff Sidebar mounts" and the JSX faithfully reflects that; (iii) leaving the broader scope as a future-proofing affordance is premature — when a future feature adds an engine-context consumer outside the Sidebar, the Provider scope is a one-line move at that time, not a structural concern WM-10 should pre-pay.

---

#### RESOLVED: EXT-3 — Orphan-modifier logic appears to depend on undeclared `at` field on ambient-validation errors (Copilot finding, High)

Copilot flagged: "The consume-path orphan-modifier check compares `lastFailedTrigger.at` to `lastReading.at`, but the ambient-validation error description never guarantees an `at` (or `event`) field is recorded on ambient-validation errors. If ambient-validation errors do not carry a timestamp (or full event), the orphan detection can misclassify modifiers or throw when accessing `at`."

**Assessment**: Copilot's structural concern doesn't apply at runtime — requirements.md's `EngineError` union at line 529 declares the ambient-validation variant with **both** `event: ConsumedEvent` and `at: number` as required fields, so TS refuses to compile an append that omits them. Severity was also overcalled: the pseudocode uses only `failedTrigger.at`, not `.event`. No runtime crash possible.

**However**, Copilot's reading is reasonable from step 4's text alone — the ambient-validation-append text said "append `ambient-validation` error per (impl, key) pair" without explicitly listing fields, forcing the reviewer to cross-reference the EngineError union to verify `at` is populated. A reader auditing step 4 in isolation would hit the same uncertainty.

**Resolution**: Tightened step 4's ambient-validation-append description to enumerate the populated fields explicitly (`ruleSetId`, `trigger: event.name`, `implName`, `missingKey`, `event`, `at: event.at`) and called out that `at: event.at` is "load-bearing for the modifier-side `failedTrigger.at > lastReading.at` comparison in the orphan-modifier branch below." One-clause clarification, no behavior change, same shape of fix as EXT-1 — Copilot's mis-read pointing at a real clarity gap, resolved by tightening implementation-side prose so step 4 stands alone without requiring cross-reference to the EngineError union.

The orphan-modifier pseudocode itself stays as-is (its `failedTrigger.at` is correct against the union). No EngineError shape change.

---

#### RESOLVED: EXT-4 — Inactive-path `computeView` description internally inconsistent (Copilot finding, Medium)

Copilot flagged: "The inactive-path description says `computeView` 'runs all the same calls without special-casing,' but also says `matchedCategory` is `null` and `perCategoryTruth` is empty because there are no categories when `ruleSet` is undefined. These statements conflict unless there is an explicit guard to skip rule-set-dependent evaluators."

**Assessment**: Correct catch. This is the exact wording imprecision I noticed in my Pass-4 internal re-review and decided not to fix on the (incorrect) judgment that an implementer would naturally short-circuit at coding time and the wording was good enough. Copilot independently flagging this confirms the wording is more confusing than I gave it credit for. The "runs all the same calls without special-casing" framing was overbroad — at runtime, calling `computeMatchedCategoryFloor(undefined, ...)` would TypeError on `ruleSet.categories`, contradicting the same paragraph's claim that `matchedCategory` resolves to `null`.

**Resolution**: Rewrote step 5's "Inactive-path semantics" paragraph to be explicit about the split. Two clear branches now:

- **`factorVariableValues` runs unchanged** — the hook iterates `engine.factorVariables` (registry, independent of `ruleSet`); impls reading defaults throw → swallowed to `defaultValue`, impls not reading defaults return real values. Mix of real and fallback values across the registry.
- **`matchedCategory` and `perCategoryTruth` short-circuit** — these need `ruleSet.categories` to iterate; without a rule set there are no categories; `computeView` returns `matchedCategory: null` / `perCategoryTruth: {}` directly without invoking the evaluators.

The split now reflects an actual implementation difference (registry-driven vs. rule-set-driven) rather than papering over the contradiction with a false "runs all the same calls" framing. Step 6's `<FactorVariablesPanel />` "Engine inactive — values shown are impl defaults" inline note from PASS4-1 stays accurate: factorVariableValues *is* populated in the inactive state, and the values *are* a mix of real and fallback per-impl.

Acknowledging the implementation cost: this is wording-only, not a behavior change — PASS4-1's resolution always intended this split semantically; the original phrasing just papered over it. Lesson for future internal re-review passes: when self-review says "this is small enough to leave," surface it explicitly anyway — the threshold for "good enough wording" should match what an outside reviewer would catch, not what the author considers minor.

---

#### RESOLVED: EXT-5 — Requirements.md alignment left as unscheduled follow-on (Copilot finding, Medium)

Copilot flagged: "The spec acknowledges required requirements.md updates for the `compute(readings, defaults)` signature and the `HookReturn` export, but there is no explicit implementation step/commit to perform those updates. Leaving requirements.md out of the planned work risks a lasting doc/contract drift where the published API surface does not match the implementation."

**Assessment**: Correct catch. Both PASS3-API-1 and PASS3-API-3 deferred their requirements.md edits to "Phase 5 finalization or a follow-on PR alongside the substrate's first commit" — left the work unowned. If the implementer forgets, requirements.md's published API surface (line ~502) won't list `HookReturn` and the `FactorVariableImpl` interface (line ~613) will still show the one-arg `compute(readings)`. Drift risk is real — the published-API contract and the implementation drift apart silently.

**Resolution**: Folded the requirements.md edits into step 1's commit (option B). Step 1's "Files affected" list now includes a `specs/WM-10-hazbot-analysis-engine/requirements.md` entry with the two specific edits enumerated:

- Line ~613, `FactorVariableImpl` interface — change `compute: (readings: TReading[]) => ...` to `compute: (readings: TReading[], defaults: TDefaults) => ...` and add `TDefaults` to the generic parameter list.
- Line ~502, "Substrate public API surface" React-layer subsection — add a `HookReturn` bullet alongside the existing entries.

Updated PASS3-API-1's "Requirements.md follow-on" paragraph and PASS3-API-3's "Documentation follow-on consolidation" paragraph to reference the new schedule (step-1 commit instead of Phase-5 deferral). Step 1's estimated diff size grew from ~250 lines to ~260 lines (the +10 covers both requirements.md edits).

Picked option B (fold into step 1) over option A (separate dedicated step) because: (i) step 1 is the natural home — it introduces `FactorVariableImpl` in `types.ts` and the React-layer barrel including `HookReturn`, so doc and code land together with no drift window; (ii) keeps the 14-step Implementation Plan intact (no new step needed); (iii) Phase 5 finalization becomes a verification, not a performance — the scan confirms doc/code alignment instead of remembering to update requirements.md. Picked B over option C (Phase-5-only treatment) because Phase-5 deferral is exactly what created the drift risk in the first place.

---

#### RESOLVED: EXT-6 — Playbook generator step omits TS-loading mechanism (Copilot finding, Medium)

Copilot flagged: "The generator script is specified as a JS file but is expected to import generated TS rule-set modules; the plan does not state how Node will load TS (e.g., `ts-node/register`, TS build output, or a pure-JSON source). Without an explicit loading strategy, the generator is likely to fail at runtime (`ERR_UNKNOWN_FILE_EXTENSION .ts`) or require ad-hoc local setup."

**Assessment**: Correct catch. Step 11's generator script is `scripts/generate-hazbot-validation-playbook.js` (`.js`) but step 11.1 imports generated rule-set modules (TS) and step 11.2 imports the substrate parser from `src/hazbot/engine/parser/` (TS). Without an explicit TS-loading mechanism, Node's default `.js` resolution fails on the first TS `require` with `ERR_UNKNOWN_FILE_EXTENSION`. The same gap was identified and resolved for step 9's extraction-script tests via QA-2 (use `ts-node/register`) + DEV-1 (`ts-node` is already a project devdep at `^10.9.1`), but step 11 inherited the gap without referencing those resolutions.

**Resolution**: Added a "TS-loading mechanism" sub-bullet at the top of step 11's `scripts/generate-hazbot-validation-playbook.js` description: "the script begins with `require("ts-node/register");` so subsequent `require()`s of the substrate parser (`src/hazbot/engine/parser/`) and the generated rule-set modules (`src/hazbot/rule-sets/<id>.ts`) resolve `.ts` files through TS compilation at load time." Cross-references QA-2 (same mechanism for step 9 tests) and DEV-1 (`ts-node` already a devdep, no new dependency). One-line code addition (`require("ts-node/register");` at the top of the generator), no new devdep, no build-time compile step, no JSON-conversion needed.

Picked the `ts-node/register` approach over the alternatives Copilot listed (convert generator to TS + ts-node CLI; consume `.xlsx` directly bypassing TS modules) because: (i) consistency with step 9's already-resolved approach — same JS-script-loads-TS pattern, same one-line register call, same devdep; (ii) keeps the generator's import chain pointing at the same sources of truth as the engine itself (substrate parser via published API, generated rule-set modules) rather than re-implementing extraction logic in the generator; (iii) avoids a redundant `.xlsx` parse path that would diverge from the extraction script's interpretation over time.

---

#### RESOLVED: EXT-7 — Defaults type mismatch in inactive render path (Copilot finding, High)

Copilot flagged: "The plan has `useAnalysisEngine` call `evaluateForRender` with `defaults` set to `undefined` when `engine.ruleSet` is missing, but `FactorVariableImpl.compute(readings, defaults)` is specified as requiring `TDefaults` (non-optional), creating a compile-time mismatch or forcing unsafe casts. This either breaks TypeScript or allows `undefined` into impls that expect valid defaults, leading to runtime exceptions and inconsistent behavior across inactive vs active paths."

**Assessment**: Correct and substantive catch. PASS3-API-1 made `compute(readings, defaults: TDefaults)` non-optional; EXT-4 said factorVariableValues runs in the inactive path with `defaults === undefined`. These two together produce a TS error: calling `wildfireImpl.compute(readings, undefined)` doesn't satisfy the `defaults: WildfireDefaults` (non-undefined) signature. The compile would either fail or require an `as any` escape, and at runtime undefined would propagate into impls that don't expect it — Copilot's exact concern.

**Resolution**: Picked Option B — the wrapper short-circuits on `requiredDefaults` metadata when defaults is undefined, keeping the `compute` interface non-optional. Concretely:

- Step 4's `evaluateForRender` signature now accepts `defaults: TDefaults | undefined`. Inside the wrapper, when `defaults === undefined`: if `impl.requiredDefaults?.length > 0` (impl reads defaults), return `impl.defaultValue` directly without calling compute. If `requiredDefaults` is empty / undefined (impl doesn't read defaults), call `compute(readings, defaults as TDefaults)` — TS cast bounded-safe because the impl's contract says it doesn't access defaults. Impls that read defaults but forgot to declare `requiredDefaults` throw on undefined access; throws are caught by the wrapper's existing throw-handler and return `defaultValue` (defensive degradation, same observable behavior).
- Step 5's inactive-path description now describes the metadata-driven dispatch instead of the previous "throws on undefined access, swallowed to defaultValue" framing. Both paths produce the same result for impls that need defaults (`defaultValue` fallback); the metadata-guard is more robust against impls with subtle defaults-access patterns and keeps the type system honest.
- `safelyEvaluateImpl` (consume-path) keeps `defaults: TDefaults` (non-optional) — the consume path runs only when `isActive`, which guarantees `engine.ruleSet.defaults` is non-undefined per Req 11a's load-time validation. No undefined possible on the consume path.

Picked B over Copilot's Option A (`compute(readings, defaults: TDefaults | undefined)` impl-level) because: (i) less impl-author boilerplate — every impl reading defaults would otherwise need a null-check for the undefined case; wrapper-level handling centralizes the logic; (ii) `requiredDefaults` already exists as substrate-validated metadata — using it as a runtime guard is consistent with its existing role at load time; (iii) `compute` signature stays clean — no `| undefined` propagating into impl signatures or downstream consumers.

---

#### RESOLVED: EXT-8 — `RuleSet.defaults` type doesn't reconcile with missing-defaults generation (Copilot finding, Medium)

Copilot flagged: "The extraction script generates `RuleSet<WildfireDefaults>` modules but also states that tabs with missing defaults should leave those defaults absent, which conflicts if `RuleSet.defaults` is required or if `WildfireDefaults` requires all fields. Generated rule sets for tabs 32–35 could fail to compile or require `as any` workarounds, undermining type safety and masking actual missing-defaults conditions."

**Assessment**: Correct catch. The spec hadn't pinned `RuleSet.defaults`'s type — step 9 says generator emits `RuleSet<WildfireDefaults>` for tabs 32–35 with TBD defaults left absent, but if `defaults: TDefaults` (non-optional, fully populated) at the type level, those generated modules wouldn't compile without `as any` escapes. The runtime validation logic existed (the substrate's `requiredDefaults` walk emits `missing-defaults` load failures), but the type-system contract didn't permit the generator's intent.

**Resolution**: Picked Copilot's `defaults: Partial<TDefaults>` family of options, refined to `DeepPartial<TDefaults>` because wildfire's defaults are nested (`zones[i].droughtLevel` may be missing per zone, not just top-level fields). Concretely:

- **Step 1's `types.ts` description** now declares `RuleSet<TDefaults>.defaults` as `DeepPartial<TDefaults>` and includes the `DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T` definition. PASS2-1's API-baseline note expanded to cover the partial-typing baseline (loosening or tightening post-`0.0.1` is a major bump).
- **Step 4's `safelyEvaluateImpl`** description now spells out the internal cast: `engine.ruleSet.defaults` is typed as `DeepPartial<TDefaults>` at the rule-set level, cast to `TDefaults` before passing to `compute` / `evaluate` — bounded-safe because `isActive` implies load-time validation passed. The cast is one substrate-internal location; bridge-side impls receive `defaults: TDefaults` (not Partial) and access fields without null-guards.
- **Step 9's extraction-script** description gets a one-sentence note that no `as` escape is needed in generated TS — `DeepPartial` lets partial defaults compile cleanly.
- **Engine's runtime validator** (step 3's reference-driven walk): unchanged. Already walks `requiredDefaults` paths against `defaults` and emits `missing-defaults` load failures for unresolved paths. Path-based validation is orthogonal to TS-level typing.
- **Requirements.md follow-on bundled into step 1's existing edit list** (per EXT-5): added a third edit covering the "Rule-set TypeScript shape" subsection (line ~728+) — change `RuleSet.defaults: TDefaults` to `RuleSet.defaults: DeepPartial<TDefaults>` with the `DeepPartial` definition and the cast-internally-when-active rationale.

Picked `DeepPartial<TDefaults>` over `Partial<TDefaults>` (top-level only) because the per-zone TBD field pattern in tabs 32–35 requires recursive partiality. Picked `DeepPartial<TDefaults>` over `defaults?: TDefaults` (whole field optional) because tabs 32–35 have a defaults object with some fields present and others absent — the partial-object form matches that shape; whole-field-optional doesn't.

---

#### RESOLVED: EXT-9 — Inactive-but-defined rule sets can still drive evaluation (Copilot finding, High)

Copilot flagged: "The hook's `computeView` only short-circuits when `engine.ruleSet === undefined`, but the UI rules explicitly suppress per-category truth when `ruleSet` exists and `!engine.isActive`; in that state, evaluators can still run and hit missing impls or missing defaults. A missing-impl or missing-defaults load failure can still trigger evaluator work and crash the sidebar or show misleading values, undermining the 'inactive' UI behavior."

**Assessment**: Correct catch and substantive. EXT-4's resolution short-circuited only the missing-rule-set inactive sub-case (where `ruleSet === undefined` would TypeError on `ruleSet.categories`). The other three inactive sub-cases (parse-error, missing-defaults, missing-impl) leave `ruleSet.categories` defined, so the original short-circuit reasoning didn't apply — but the substrate hadn't validated the evaluator's preconditions in those states either. Running `computeMatchedCategoryFloor` / `evaluateLeaf` against unvalidated rule sets would either produce undefined behavior on parse-error AST sentinels, surface undefined lookups for missing-impl references, or compute inconsistent matching when impls' declared defaults paths don't all resolve. Step 6's `<CategoriesPanel />` rendering suppression handled the visible side, but `computeView` still ran the evaluators and exposed their fragile paths.

**Resolution**: Generalized step 5's inactive-path short-circuit from `ruleSet === undefined` to `!engine.isActive` (covering all four inactive sub-cases). Concretely:

- **`matchedCategory` and `perCategoryTruth` short-circuit when `!engine.isActive`**, regardless of sub-cause. `computeView` returns `null` / `{}` directly without invoking the matching/leaf evaluators. Reasoning generalized: the substrate's load-time validation guarantees evaluator soundness only when `isActive`; the matching/leaf paths require that guarantee. Defense-in-depth alongside step 6's `<CategoriesPanel />` rendering suppression — both layers of protection ensure the inactive-state UI behavior is coherent regardless of which sub-cause produced the inactivity.
- **`factorVariableValues` continues to run** in all states via `evaluateForRender`'s metadata guard (per EXT-7). In the missing-rule-set state (`defaults === undefined`), the metadata guard short-circuits per-impl; ALL defaults-reading impls return `defaultValue`. In the defined-but-`!isActive` states, `defaults` is defined and impls compute against real readings + real defaults; impls reading missing paths throw → swallowed to `defaultValue` by the wrapper's throw-handler; impls reading present paths return real values. Result: a meaningful mix of real and fallback values across the registry, preserving the developer's debugging signal in inactive states where partial computation is meaningful.
- **Step 6's `<FactorVariablesPanel />` "Engine inactive — values shown are impl defaults" inline note stays gated on `ruleSet === undefined`** specifically — the only state where ALL defaults-reading impls fall back. Defined-but-`!isActive` states produce a meaningful mix, so the "all defaults" framing would mislead there. The CategoriesPanel suppression remains the dominant inactive-state cue across all sub-causes.

Picked the generalized `!isActive` short-circuit over the alternatives Copilot considered (make evaluators robust to missing impls / parse-error sentinels; case-by-case guards inside the evaluators) because: (i) the substrate's invariant for evaluator soundness is `isActive` — there's no separate per-evaluator guard the substrate could provide that's stronger than that aggregate invariant; (ii) defense-in-depth with step 6's existing rendering suppression keeps the protection at two layers; (iii) preserves the EXT-4 / EXT-7 design (factorVariableValues runs in all states with metadata guard) without introducing a third inactive-path code branch. The short-circuit is one new line in `computeView` (`if (!engine.isActive) { matchedCategory = null; perCategoryTruth = {}; ... }`) — same shape as EXT-4's original short-circuit, with the condition broadened.

---

#### RESOLVED: EXT-10 — `findLast` may break in supported browsers (Copilot finding, Medium)

Copilot flagged: "The orphan-modifier logic relies on `errors.findLast(...)`, which is ES2023 and not supported in older Safari/Chromium versions commonly used in classrooms. A runtime `TypeError` in `consume()` would stop all engine processing and break the sidebar/logging path."

**Assessment**: Correct catch. `Array.prototype.findLast` is ES2023 (Stage 4 in 2022, formally ES2023). Browser availability: Chrome 97+ (Jan 2022), Safari 15.4+ (March 2022), Firefox 104+ (Aug 2022), Node 18+. School-managed devices may run older browsers (school IT lag); even on supported runtime targets, the project's tsconfig may not include `lib: ["ES2023"]` and would surface the call as a TS compile error. Either way, runtime fragility for cheap-to-fix code.

**Resolution**: Added a substrate-internal `findLast` helper in step 1's "Files affected" list:

- **`src/hazbot/engine/find-last.ts`** — new. `export function findLast<T>(arr: readonly T[], pred: (item: T, i: number) => boolean): T | undefined { for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i], i)) return arr[i]; return undefined; }`. Five lines, no deps, lives alongside `session-id.ts` as another substrate-internal utility.
- **`src/hazbot/engine/find-last.test.ts`** — new. Three cases: returns last matching element when matches exist; returns `undefined` when no element matches; returns `undefined` on empty array.
- Step 4's orphan-modifier pseudocode updated from `errors.findLast(...)` to `findLast(errors, ...)` — same shape, substrate-resolved.
- Step 4's "Internal-only export surface" note (PASS2-2) updated to include `findLast` in the internal list — not re-exported from `engine/index.ts`.

Picked a substrate-internal helper over the alternatives:

- **Manual reverse loop inlined at the call site**: works for the single current call site, but each future use repeats the boilerplate. A named helper is more reusable + testable.
- **Polyfilling `Array.prototype.findLast`**: rejected because mutating the global prototype is incompatible with the substrate's "MobX-free, minimal public footprint" stance per Req 1 — a substrate that ships a global Array.prototype mutation as part of its loaded effect would be a worse global-state contributor than the MobX dependency it explicitly avoids.
- **Bumping tsconfig `lib` to ES2023 + accepting the runtime risk**: rejected because the runtime risk is the load-bearing concern (compile-time access to the type doesn't help if the runtime browser doesn't have the method).

The helper is a one-time five-line addition with a three-case test; future uses of "find last matching" inside the substrate get a stable substrate-resolved reference.

---

#### RESOLVED: EXT-11 — Hover-only WITH details lack keyboard access (Copilot finding, Medium)

Copilot flagged: "The spec calls out 'hover/click-expand' but also explicitly says there is no keyboard equivalent for hover-revealed WITH details. Hover-only content is not accessible to keyboard users or touch users, violating basic WCAG interaction expectations even in debug UIs."

**Assessment**: Correct catch. Step 6's `expression-renderer.tsx` description said "Hover/click-expand for WITH sub-expressions," and the closing paragraph said "no keyboard equivalent for hover-revealed WITH binding detail." Together these implied (or at least failed to rule out) that hover and click reveal *different* content — and the explicit no-keyboard-equivalent disclaimer was a self-acknowledged WCAG violation. Even though the sidebar is a debug-only UI, Concord ships software to schools and may be subject to procurement-level WCAG conformance requirements. Affected criteria: WCAG 2.1.1 Keyboard (Level A — all functionality must be keyboard-operable) and WCAG 1.4.13 Content on Hover or Focus (Level AA).

**Resolution**: Tightened step 6's spec wording to pin click as the keyboard-accessible primary affordance with hover as an optional UX shortcut for mouse users that reveals the *same* content. Concretely:

- **`expression-renderer.tsx` description** changed from "Hover/click-expand for WITH sub-expressions (renders bound reading or per-reading evaluation per Req 17)" to: click-expand uses a `<button>` whose `onClick` toggles `aria-expanded` and reveals WITH provenance inline; hover triggers the same expansion via CSS `:hover` styling that mirrors the click-expanded state — same content, same toggle, just an alternative trigger. Per EXT-11: the click path is the keyboard-accessible primary; no content is hover-only.
- **Closing accessibility paragraph** rewritten to remove the "no keyboard equivalent for hover-revealed WITH binding detail" disclaimer (which was the explicit WCAG violation Copilot caught), replaced with positive language: "Keyboard parity for WITH sub-expression details: the click path is the keyboard-accessible primary affordance ... No content is hover-only — keyboard users see all WITH provenance details via the click path with `<button>` defaults handling focus + activation + screen-reader-readable expanded state."

Implementation cost is essentially zero — `<button>` already supports both `:hover` and click events; making them produce the same `aria-expanded` toggle is a single toggle handler bound to `onClick` plus existing default mouse hover styling. The main change is *spec wording*: pinning the keyboard-equivalence guarantee instead of opting out.

The resolution complements the existing `<button>`-everywhere convention (already pinned by step 6's "Interactive controls use `<button>`" paragraph) and the WCAG-2 / R10-3 resolutions in requirements.md that established the substrate's accessibility baseline. Adds the missing "keyboard reaches all content" tie-in for the WITH-specific affordance that this review pass surfaced.

---

#### RESOLVED: EXT-12 — Factor-variable fallback shape mismatch (Copilot finding, High)

Copilot flagged: "`safelyEvaluateImpl`/`evaluateForRender` are described as returning `impl.defaultValue` on catch, but factor-variable `compute()` returns `{ value, witnesses }`; the fallback is typed as `V`, so any caller expecting witnesses (e.g., `evaluateWith`) would lose the witness list or break type guarantees."

**Assessment**: Correct catch and substantive. PASS3-API-1's loose framing said the wrappers "return `impl.defaultValue` on catch" without acknowledging the factor-variable vs. sim-prop return shape difference. Sim-prop `evaluate(reading, defaults) → boolean` matches `defaultValue: V (V=boolean)` cleanly. Factor-variable `compute(readings, defaults) → { value: V; witnesses: TReading[] }` does NOT match `defaultValue: V` — the wrapper's "return `defaultValue`" produced just `V`, not the `{value, witnesses}` wrapper, leaving `evaluateWith` and any other caller that destructures `.witnesses` either crashing on `undefined.witnesses` or silently losing witness data.

**Resolution**: Updated step 4's `safelyEvaluateImpl` and `evaluateForRender` descriptions to document the **per-impl-kind fallback shape**:

- For `FactorVariableImpl<V, ...>`: on catch, return `{ value: impl.defaultValue, witnesses: [] as TReading[] }` — synthesizes `compute`'s success-path return shape with the declared `defaultValue` and an empty witnesses array.
- For `SimPropImpl<...>`: on catch, return `impl.defaultValue` (boolean) — matches `evaluate`'s `boolean` return.
- Wrappers internally discriminate on impl kind (already implicit from PASS2-2's framing) and produce the matching shape. `defaultValue: V` semantics stay intact at the impl-interface level — the wrapper handles shape composition so impl authors don't need to declare a `{value, witnesses}`-shaped fallback.

The `witnesses: []` fallback on factor-variable throws cleanly composes with `evaluateWith`'s "empty witnesses → WITH evaluates to `false`" semantics per requirements.md line 648 — a thrown factor-variable surfaces as the same observable behavior as a non-throwing impl that legitimately produces no witnesses. Defensive degradation matches the substrate's universal "couldn't compute" signal.

Picked the synthesized-fallback approach over Copilot's alternative ("make `defaultValue` itself be `{ value, witnesses }` for factor variables") because: (i) `defaultValue: V` is already established at the impl-interface level (per ENG-1) and used throughout the spec — changing it to a shape-aware union would propagate complexity to every impl declaration; (ii) the wrapper is the single substrate-internal location that already knows about the success-path return shapes (it's the layer that wraps both `compute` and `evaluate`) — adding shape composition there is local change; (iii) keeps impl authors' mental model simple — `defaultValue` is just "the underlying value," same shape as `V`.

Resolution interlocks with EXT-13 — once the wrapper guarantees `{value, witnesses}` for factor variables, `evaluateWith` can route through the wrap function and access `.witnesses` safely.

---

#### RESOLVED: EXT-13 — `evaluateWith` bypasses the safety wrapper (Copilot finding, High)

Copilot flagged: "`evaluateWith` is described as calling `factorVariables[varName].compute(readings, defaults)` directly to get `witnesses`, ignoring the injected `wrap` and its render-path safety guarantees. A throwing impl would either mutate `engine.errors` during render or throw out of render entirely, violating ENG-2's 'render path is pure' requirement and risking re-render loops or crashes."

**Assessment**: Correct catch and substantive. Step 4's original `evaluateWith` description called `factorVariables[varName].compute(readings, defaults)` directly — a throwing impl would propagate the exception out of `evaluateWith` and out of whichever evaluator chain triggered it. In the consume path, the throw escapes the `safelyEvaluateImpl` boundary that's supposed to catch it; in the render path, the throw escapes `evaluateForRender` and propagates into React's render loop, **violating ENG-2's render-path purity invariant** that PASS3-internal-review specifically established to prevent this exact failure mode.

Interlocks with EXT-12 — once the wrapper synthesizes `{value, witnesses}` for factor-variable returns, `evaluateWith` can route the compute call through `wrap` and access `.witnesses` from the wrapped result.

**Resolution**: Routed `evaluateWith`'s factor-variable compute call through the injected `wrap`. Concretely:

- **Step 4's `evaluateWith` description** rewritten: "iterates over the witnesses obtained by routing the factor-variable compute through the injected `wrap`" — `wrap(factorVariables[varName], readings, defaults)` returns the per-impl-kind fallback shape from EXT-12 (`{ value, witnesses }`), and `evaluateWith` reads `.witnesses` from the wrapped result. When the impl throws inside `compute`, the wrapper returns `{ value: defaultValue, witnesses: [] }` and evaluateWith iterates an empty array → produces the empty-candidates path (`value: false`, empty `candidateEvaluations`) — same observable behavior as a non-throwing impl that legitimately produces no witnesses.
- **Step 4's `evaluateLeaf` description** tightened symmetrically (per the same routing principle): boolean leaves (`varName`) and accessor leaves (`varName.size`, `varName.length`) read the factor variable's value via `wrap(factorVariables[varName], readings, defaults).value` rather than calling `compute` directly. Sim-prop leaves inside WITH bindings route through the same `wrap` for `evaluate(reading, defaults)` calls. This generalizes the routing fix to all factor-variable / sim-prop accesses inside the leaf evaluator, not just the `evaluateWith`-specific path.
- **Step 4's `consume.test.ts` AC description** updated: "AC: WITH evaluator iterates over wrapped-compute witnesses (including empty-witnesses case from a non-throwing impl AND empty-witnesses from a wrapped throw, both producing the empty-candidates path)" — captures the new test coverage that the wrapped-throw path produces the same observable behavior as the legitimately-empty path.

The fix preserves `evaluateWith`'s deterministic, render-safe contract and unifies the substrate's "all impl invocations go through the wrapper" rule. No new types, no new wrappers — just routing existing compute calls through the existing wrap injection. Composes cleanly with EXT-12 (per-impl-kind fallback shape) and ENG-2 (render-path purity): consume-path `wrap` (`safelyEvaluateImpl`) mutates `engine.errors` on throw and returns the fallback; render-path `wrap` (`evaluateForRender`) returns the fallback without mutating engine state. No throw escapes the wrapper boundary in either path.

---

#### RESOLVED (mis-read): EXT-14 — ESLint zone rule blocks the wrong direction (Copilot finding, High)

Copilot flagged: "The `import/no-restricted-paths` zone rule uses `target: "./src/hazbot/engine"` with `from: "./src"`, which restricts imports *into* the engine instead of restricting engine files from importing *out of* the engine. This fails to enforce the substrate boundary (engine files can still import from app code), and can also inadvertently block legitimate imports of engine exports from elsewhere."

**Assessment**: Copilot got the rule's direction semantic inverted. The actual `eslint-plugin-import` rule semantics (verified against `@2.27.5`'s source per LIB-1's earlier verification):

- `target` = the directory whose files are SUBJECT to the rule (the **importer** side — these files' import statements get checked).
- `from` = paths the `target`'s files CANNOT IMPORT.
- `except` = paths within `from` that ARE allowed.

The current spec config (`target: ./src/hazbot/engine`, `from: ./src`, `except: [./src/hazbot/engine]`) correctly enforces "engine files can only import from within engine" — exactly the substrate boundary requirement. Copilot's proposed reversal would invert this to "any file in src/ cannot import from engine/, except files inside engine itself" — which would block the wildfire bridge (`src/hazbot/wildfire/factor-variables.ts`) from importing substrate types like `FactorVariableImpl`, making the substrate unusable. The spec is correct; the proposed fix is wrong.

**However**, Copilot's confusion is reasonable — `target` reads like "what to apply the restriction to" which could be parsed either as "what to restrict access to" (Copilot's reading) or "what files are subject to the restriction" (the actual rule semantic). LIB-1's resolution already documented a "Path-resolution gotcha" callout for the path-relative semantic; a parallel "Direction gotcha" callout for `target` / `from` heads off the same confusion in future reviews.

**Resolution**: Added a **"Direction gotcha"** callout in step 1's surrounding prose (alongside LIB-1's existing "Path-resolution gotcha") that documents the rule's `target` / `from` semantic explicitly, with reference to the rule's source verification. Plus an inline comment block atop the `.eslintrc.js` snippet pinning the direction at the call site so a future reader doesn't have to leave the file to confirm. Two clarity additions, no behavior change. Same shape of fix as EXT-1, EXT-3, EXT-4 — Copilot's mis-read pointing at a real prose gap, resolved by tightening the spec so it stands alone without requiring cross-reference to the rule's source code.

---

#### RESOLVED: EXT-15 — `no-restricted-imports` can be bypassed via subpath imports (Copilot finding, Medium)

Copilot flagged: "The restriction only blocks `react-dom` by exact name, but `react-dom/client` (and other subpaths) remain allowed. Substrate files can still import react-dom via subpaths, undermining the 'no react-dom' constraint and making boundary enforcement incomplete."

**Assessment**: Correct catch. ESLint's `no-restricted-imports` `paths` clause matches exact module names only; subpath imports bypass it. Concrete impact:

- `import { createRoot } from "react-dom/client"` — the React 18+ root API path — bypassed.
- `import { autorun } from "mobx-react/lite"` — a real MobX-React variant — bypassed.
- `import { observable } from "mobx/dist/mobx.esm.js"` — explicit subpath — bypassed.

Each undermines the substrate's "no react-dom" (LA-2 / R10-3) and "MobX-free" (Req 1) constraints — the very invariants the rule exists to enforce.

**Resolution**: Added a `patterns` clause to `no-restricted-imports` to match subpaths via gitignore-style globs. The `paths` clause stays for the bare-name case (some glob engines don't match the bare name with `name/*` patterns). Final config:

```js
"no-restricted-imports": ["error", {
  paths: [/* exact-name matches */],
  patterns: [
    { group: ["mobx/*", "mobx-react/*"], message: "Substrate is MobX-free (Req 1)." },
    { group: ["react-dom/*"], message: "Substrate ships no react-dom imports (LA-2 / R10-3)." }
  ]
}]
```

Plus an inline comment block in step 1's `.eslintrc.js` snippet documenting why both clauses are needed.

**PASS3-SEC-1's verification list extended from three ways to five ways**: added (d) deliberate `react-dom/client` import must error, and (e) deliberate `mobx-react/lite` (or `mobx/dist/...`) import must error. Implementer runs all five during step 1's local-dev verification and captures the result in the existing `.eslintrc.js` verification comment. Cumulative verification cost: ~10 minutes (five quick deliberate-violation probes vs. the original three).

Picked the `patterns`-clause extension over the alternatives Copilot didn't explicitly enumerate (e.g., switching to `eslint-plugin-import-x`'s no-extraneous-dependencies posture, or moving to a single-rule replacement) because: (i) `paths` + `patterns` is the canonical ESLint pattern for this case — well-documented, no new plugin needed; (ii) the extension is additive — preserves the existing exact-name matches and adds subpath matches alongside; (iii) keeps the verification list and the rule config in step 1's same file location, no spread across multiple steps.

---

#### RESOLVED: EXT-16 — Line-number AC reference reintroduces drift risk (Copilot finding, Low)

Copilot flagged: "The workflow doc step references 'AC-232,' which is a line-number style citation, contradicting the earlier decision to use descriptive AC handles to avoid drift. Line-number references will become stale as the requirements spec changes, making the workflow step harder to follow."

**Assessment**: Correct catch. Step 11's workflow doc step 5 carried over `AC-232` from an earlier draft — slipped through QA-1's resolution pass that converted line-citation handles to descriptive ones. The pattern was supposed to be uniform across the spec; this was the sole remaining instance.

**Resolution**: Trivial swap — `AC-232 five-shape sweep (a–e)` → `AC: per-rule-set five-shape sweep (a–e)`, matching the descriptive handle used elsewhere (e.g., step 4's `evaluator.test.ts` description, step 10's rule-set test descriptions). One-word change in step 11; no spec-shape impact.

Records the cleanup as a small post-merge cleanup the QA-1 conversion missed. If similar AC-line-number citations appear elsewhere in the spec, they're caught by the same find-and-replace approach — but this re-review against the current spec found no other instances.

---

#### RESOLVED: EXT-17 — `Array.at` used despite legacy-browser constraint (Copilot finding, Medium)

Copilot flagged: "The modifier-path pseudocode uses `readings.at(-1)` while the plan explicitly avoids `Array.prototype.findLast` for older-browser compatibility; `.at` is the same ES2022-era feature and will fail in the same environments. This contradicts the compatibility stance and can break orphan-modifier detection in older school-managed browsers."

**Assessment**: Correct catch. `Array.prototype.at` is ES2022 (Chrome 92, Firefox 90, Safari 15.4 — same Safari minimum as `findLast`). EXT-10's resolution avoided `Array.prototype.findLast` for substrate-broad runtime support; the same posture applies to `at`. The spec's avoidance was inconsistent — accepted `findLast` was unavailable but used `at(-1)` in the same step.

**Resolution**: Replaced `readings.at(-1)` with `readings[readings.length - 1]` in step 4's orphan-modifier pseudocode. JavaScript returns `undefined` for `arr[arr.length - 1]` when `arr.length === 0`, matching `arr.at(-1)`'s behavior on empty arrays — no explicit length check needed. Plus extended step 1's `find-last.ts` description with a "Substrate ES2022+ avoidance" callout that documents `Array.prototype.at`'s parallel exclusion and notes the natural future extension (a `last<T>(arr): T | undefined` helper alongside `findLast` if more call sites accumulate; inline is fine for one).

One-character change in step 4's pseudocode + one-paragraph note in step 1. Same shape of fix as EXT-10 (helper / inline replacement for ES2022+ avoidance), no new top-level helper file because the single call site doesn't justify the abstraction yet.

---

#### RESOLVED: EXT-18 — Missing-defaults render-path can surface misleading values (Copilot finding, Medium)

Copilot flagged: "In defined-but-`!isActive` states, the plan calls `compute(readings, defaults)` for every impl and relies on throws to fall back to `defaultValue`, but missing defaults can yield undefined comparisons without throwing (e.g., `reading.value !== defaults.foo`). The sidebar can show 'real' values for impls that are actually invalid due to missing defaults, undermining the intended 'inactive engine' signaling."

**Assessment**: Correct catch and substantive — exposes an asymmetry between EXT-7's metadata guard (handled missing-rule-set / `defaults === undefined`) and EXT-9's broader inactive-state handling (let factorVariableValues run for all `!isActive` states). In the missing-defaults sub-case, `engine.ruleSet.defaults` is defined but partially unresolved; the wrapper passed the partial defaults to compute, and impls reading missing paths produced nonsensical comparisons without throwing (`reading.zones[i].droughtLevel !== undefined` evaluates to `true` silently). The dev sees factorVariableValues populated with values that look real but aren't — exactly what EXT-7's metadata guard was supposed to prevent for the missing-rule-set case but didn't catch for the missing-defaults case.

**Resolution**: Extended the engine's load-time validation (step 3) to record per-impl defaults-completeness on the engine, and added a third defaults-guard branch to `evaluateForRender` (step 4) that consults the cache. Concretely:

- **Step 3's reference-driven validation walk** now populates `this.implsWithIncompleteDefaults: Set<string>` (impl names whose declared `requiredDefaults` paths don't all resolve) as a side effect of the existing per-impl path walk. No new validation pass; the Set is the substrate's source-of-truth for "which impls have incomplete defaults," used by step 4's `evaluateForRender`.
- **Step 4's `evaluateForRender` defaults-guard** now has three branches: (1) `defaults === undefined` (missing-rule-set, per EXT-7) — fallback for defaults-reading impls; (2) `defaults !== undefined && impl is in implsWithIncompleteDefaults` (missing-defaults, per EXT-18) — fallback regardless of whether the impl declared `requiredDefaults`; (3) `defaults !== undefined && impl is complete` — call compute normally. The wrapper signature gains an optional `engine?: Engine<...>` parameter so the wrapper can read `engine.implsWithIncompleteDefaults`.
- **Step 5's inactive-path semantics** rewritten to describe all three sub-cases of `!isActive`: (a) missing-rule-set → defaults-reading impls fall back, others return real; (b) missing-defaults → impls with incomplete declared paths fall back (per EXT-18), others (including impls without `requiredDefaults`) return real; (c) parse-error / missing-impl → all impls return real values (defaults are complete; the inactive cause is unrelated to defaults).
- **Consume-path wrapper** (`safelyEvaluateImpl`) doesn't need this guard because consume runs only when `isActive`, which guarantees no impls are in `implsWithIncompleteDefaults` (load-time validation populated the Set; a non-empty Set causes a `missing-defaults` load-failure, making the engine inactive).

The Set is precomputed once at load time; no per-render path walk. Stable for the engine's lifetime per requirements.md line 520 (defaults are immutable post-construction). Adds one substrate-internal field on the engine and one new branch in the wrapper — small surface, restores EXT-7's "guard against silently-misleading values" semantics for the full defaults-completeness spectrum.

Picked the precomputed-Set approach over Copilot's "precompute a per-impl 'defaultsComplete' flag during validation" because: (i) Set-of-incomplete is symmetric with the existing missing-defaults error append (both are side effects of the same path-walk loop); (ii) checking `Set.has(implName)` is a tighter render-path call than walking a flag (one Set lookup vs. one boolean read — equivalent at runtime, marginally cleaner code). Picked precompute over re-walk-per-render for the same reason EXT-9 chose `!engine.isActive` over per-evaluator guards: the substrate's load-time validation is the single source of truth for "did the impls' declared defaults paths resolve;" re-walking would be wasted work given the result is invariant.

---

#### RESOLVED: EXT-19 — `impl-eval-throw` lacks a defined reading index for factor variables (Copilot finding, Low)

Copilot flagged: "The plan requires `impl-eval-throw` to include `readingIndex`, but factor-variable `compute(readings, ...)` operates over many readings, and the spec does not define which index should be reported. Error panels that hydrate a reading by index can show inconsistent or arbitrary context for factor-variable failures."

**Assessment**: Correct catch. The substrate's `impl-eval-throw` EngineError variant required `readingIndex: number`, and requirements.md line 537 asserted "readingIndex points to the bad input reading whose payload triggered the throw inside compute()" — but this assertion is unverifiable from the wrapper's vantage point. For sim-props (`evaluate(reading, defaults)` operates on a single reading), `readingIndex` is unambiguous. For factor variables (`compute(readings, defaults)` operates over the full array), the thrown Error doesn't tell the wrapper which iteration of the impl's internal loop produced the throw — the wrapper would either invent a misleading attribution (e.g., "last reading") or omit the field. The spec was implicitly inventing.

**Resolution**: Picked Copilot's option to omit `readingIndex` for factor-variable throws. Concretely:

- **Step 1's existing requirements.md edit list** gains a fourth edit (per EXT-19): `EngineError`'s `impl-eval-throw` variant changes `readingIndex: number` to `readingIndex?: number`; the rendering map gains per-`implKind` branching (sim-prop renders "at reading {N}"; factor-variable renders "during computation over {N} readings" using the substrate-level readings count). Surrounding prose at line ~537 rewritten to honestly describe the new policy: sim-prop throws populate `readingIndex` (clear single-reading attribution); factor-variable throws omit it because the substrate cannot attribute the throw to a specific reading without re-running compute incrementally (rejected as too heavy on an error path).
- **Step 1's `error-rendering.ts`** description updated: `renderError` signature gains an optional `ctx?: { readingsLength: number }` parameter so the factor-variable rendering can substitute the readings count into the per-error message. Sim-prop rendering uses the existing `at reading ${readingIndex}` template; factor-variable rendering uses `during computation over ${ctx?.readingsLength ?? "?"} readings`. Test coverage gains two distinct rows for the per-impl-kind branches plus a context-free fallback assertion.
- **Step 4's `safelyEvaluateImpl`** description updated: per-impl-kind `readingIndex` policy explicit — populate for sim-props (the wrapper knows the bound reading's index from the WITH evaluator's call site); omit for factor variables.
- **Step 6's `<ErrorsPanel />`** description updated: context-hydration logic branches on the variant's identifying fields: `readingIndex` present → hydrate the reading and render its trigger + payload (sim-prop case); `readingIndex` absent → render just the impl-level message including the readings count (factor-variable case); `event: ConsumedEvent` present → render the event inline (ambient-validation / orphan-modifier); `tokenSpan` / `offendingToken` present → render the offending token highlight (parse-error).

Picked option B (omit) over option A (last-reading heuristic) because misleading attribution sends devs investigating the wrong reading — worse for dev debug UX than honest "we don't know which reading" framing. Picked B over option C (re-run incrementally on throw to find the offending reading) because the O(N²) error-path cost and idempotency assumption are too heavy for what Copilot rated a LOW-priority issue. Honest framing + readings-count substitution gives the dev enough context to manually investigate (impl name + count + thrown message) without a false trail.

The fix is contained — touches the EngineError variant shape, the wrapper's append logic, the rendering map, the renderer signature, and the sidebar's errors panel — but each touch is small. Largest individual touch is the renderer's optional `ctx` parameter; everything else is a one- to three-line change per location.

---
