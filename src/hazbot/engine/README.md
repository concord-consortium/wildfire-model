# Analysis engine substrate

Host-app-agnostic rule-matching engine. Today it lives in-tree under
`src/hazbot/engine/`; planned for extraction into its own npm package (see
[../TBD.md §8](../TBD.md#8-extracting-the-engine-into-its-own-library)).

## Where to look

- **Public API surface** — [index.ts](index.ts). Everything not re-exported
  here is substrate-internal.
- **Core types** — [types.ts](types.ts). `BaseReading`, `ConsumedEvent`,
  `RuleSet`, `Category`, `FactorVariableImpl`, `SimPropImpl`, `EngineError`.
- **Engine class** — [engine.ts](engine.ts). Construction, load-time
  validation, `consume()`, `subscribe` / `getSnapshot`.
- **DSL grammar** — [../dsl-grammar.md](../dsl-grammar.md). Auto-generated
  from the rule-set source sheet's README tab; the hand-written parser
  under [parser/](parser/) implements it.
- **Stability contract** — Req 20 in the spec covers semver policy. The
  "API baseline note" in
  [specs/WM-10-hazbot-analysis-engine/implementation.md](../../../specs/WM-10-hazbot-analysis-engine/implementation.md)
  covers field-by-field versioning rules for `FactorVariableImpl` /
  `SimPropImpl` / `RuleSet.defaults`.
- **Full requirements** —
  [specs/WM-10-hazbot-analysis-engine/requirements.md](../../../specs/WM-10-hazbot-analysis-engine/requirements.md).
- **Wildfire bridge** as a worked example —
  [../wildfire/](../wildfire/). Shows the `translate`, factor-variable, and
  sim-prop shapes a host app needs to provide.

## Boundary rules

[.eslintrc.js](.eslintrc.js) enforces that files in this directory cannot
import from anywhere outside it (no host-app coupling), cannot import
`mobx` / `mobx-react` (substrate is MobX-free), and cannot import
`react-dom` (substrate ships no DOM-mount code).

The optional debug sidebar lives at [sidebar/](sidebar/) and is exported
from its own entry path (`from "../engine/sidebar"`), not from this
barrel — see TBD §8 for the `package.json#exports` plan.

## Versioning

Substrate version: [version.ts](version.ts) (today `0.0.1`).

Host-app rules version: [../wildfire/rules-version.ts](../wildfire/rules-version.ts)
(today `1`). Bumped per the policy in
[docs/hazbot-update-workflow.md §7](../../../docs/hazbot-update-workflow.md#7-bump-app_rules_version).

---

When this directory is extracted into its own package, this file becomes
the package README — install instructions, minimal-usage example,
`ConsumedEvent` / `BaseReading` walkthrough, `useAnalysisEngine` hook,
sidebar subpath entry, and a `CHANGELOG.md` land then.
