# Implementation Plan: Unlock disabled questions from the Wildfire model

**Jira**: https://concord-consortium.atlassian.net/browse/WM-66
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **In Development**

## Implementation Plan

### Develop against the LARA-226 client

**Summary**: Wildfire needs `unlockQuestions` and the `questionGating` types, which exist only in the unpublished `1.15.0` client. Development links the local yalc build; the PR commit pins the npm release once Doug publishes it (R11).

**Files affected**:
- `package.json`, `package-lock.json`: `@concord-consortium/lara-interactive-api` to `^1.15.0` (final commit only).

**Estimated diff size**: ~10 lines.

During development, in the worktree:

```bash
npx yalc add @concord-consortium/lara-interactive-api
npm install --legacy-peer-deps
```

`yalc add` rewrites the dependency to `file:.yalc/@concord-consortium/lara-interactive-api`; `.yalc` and `yalc.lock` are already in `.gitignore`. That `package.json` change is never committed. After the publish:

```bash
npx yalc remove @concord-consortium/lara-interactive-api
npm install --legacy-peer-deps @concord-consortium/lara-interactive-api@^1.15.0
```

Every install needs `--legacy-peer-deps`, as CI's `npm ci --legacy-peer-deps` does: `react-chartjs-2@2.11.2` has a peer range that excludes React 18, so a plain `npm install` or `npm ci` stops with `ERESOLVE`.

Do not push the branch for a PR while `package.json` points at yalc: CI's `npm ci` cannot resolve it.

---

### Remember the unlock in the saved state

**Summary**: Adds the `questionsUnlocked` flag to the saved-state format and the two UI fields the unlock needs: whether the questions are unlocked in this visit, and the last state actually sent. No message is sent yet, so this step changes nothing a student sees (R5's "every later save carries the flag", R8, R9).

**Files affected**:
- `src/models/ui.ts`: `questionsUnlocked`, `lastSavedState`.
- `src/models/saved-state.ts`: the optional field, `buildSavedState` writes it, `validateSavedState` checks it, `savedStateUnlocked` reads it from untrusted state.
- `src/interactive-state.ts`: `saveRun` keeps the state it sends.
- `src/models/saved-state.test.ts`, `src/interactive-state.test.tsx`: tests.

**Estimated diff size**: ~80 lines, half tests.

`src/models/ui.ts`, beside `readOnly`:

```ts
  // True once the student has met the question-unlock rule, in this visit or a saved one.
  // Nothing clears it: an unlock is one-way.
  public questionsUnlocked = false;
  // The interactive state most recently sent to the host. Set only in an iframe and outside
  // report mode, so it exists exactly when a run ended and was saved in this visit.
  public lastSavedState: ISavedRunState | undefined = undefined;
```

Plain fields: nothing renders from them. `ISavedRunState` is a type-only import (`import type`), so no runtime cycle with `saved-state.ts`.

`src/models/saved-state.ts`:

```ts
export interface ISavedRunState {
  ...
  // The view selectors as the student left them when the run ended.
  view?: ISavedView;
  // True once the student met the question-unlock rule. Absent means not unlocked.
  questionsUnlocked?: boolean;
  ...
}
```

In `buildSavedState`, after `view`:

```ts
    ...(ui.questionsUnlocked ? { questionsUnlocked: true } : {}),
```

The field is omitted rather than written `false`, so a state saved before the unlock is byte-identical to one saved by WM-64's code.

In `validateSavedState`, beside the `view` check:

```ts
  if (value.questionsUnlocked !== undefined && typeof value.questionsUnlocked !== "boolean") {
    return fail("invalid unlock flag");
  }
```

And a reader for the runtime path, which must not depend on the run validating (R6):

```ts
// Reads only the unlock flag, so a saved run from another preset or grid still counts.
export const savedStateUnlocked = (value: unknown) => isObject(value) && value.questionsUnlocked === true;
```

`src/interactive-state.ts`:

```ts
const sendState = (ui: UIModel, state: ISavedRunState) => {
  ui.lastSavedState = state;
  setInteractiveState(state);
  flushStateUpdates();
};

// Sent at once rather than after the API's debounce, so a reload or tab close cannot lose it.
export const saveRun = (stores: IStores, endReason: string) => {
  if (!inIframe() || stores.ui.readOnly) return;
  sendState(stores.ui, buildSavedState(stores, endReason));
};
```

The "Sent at once" comment moves to `sendState`, since both callers rely on it after the next step.

Tests (`saved-state.test.ts`):
- `buildSavedState` has no `questionsUnlocked` key while `ui.questionsUnlocked` is false, and `questionsUnlocked: true` once it is set. Catches dropping the spread, and writing `false` unconditionally.
- `validateSavedState` accepts a state with `questionsUnlocked: true` and one without it, and rejects `questionsUnlocked: "yes"` with the reason `invalid unlock flag`.
- `savedStateUnlocked`: true for `{ questionsUnlocked: true }` alone (no other fields), false for `undefined`, `null`, a string, `{}` and `{ questionsUnlocked: "true" }`.

Tests (`interactive-state.test.tsx`):
- After `logSimulationEnded`, `ui.lastSavedState` is the object passed to `setInteractiveState`.
- Standalone and in report mode, `ui.lastSavedState` stays undefined after a run ends.

---

### Declare question gating and send the unlock

**Summary**: Wires the protocol: the declaration and the restored unlock at startup in runtime mode, and the in-visit unlock on the Hazbot click (R1 to R7).

**Files affected**:
- `src/hazbot/wildfire/hazbot-available.ts` (new): `hazbotAvailable`, the one test for whether the Hazbot button exists.
- `src/components/bottom-bar.tsx`: renders the button on `hazbotAvailable`.
- `src/interactive-state.ts`: runtime branch of `initInteractiveState`, `unlockQuestionsIfEarned`.
- `src/components/hazbot-button.tsx`: the click calls `unlockQuestionsIfEarned`.
- `src/interactive-state.test.tsx`, `src/components/hazbot-button.test.tsx`: tests.

**Estimated diff size**: ~170 lines, most of it tests.

`src/hazbot/wildfire/hazbot-available.ts`:

```ts
import type { Engine } from "../engine";
import type { WildfireDefaults, WildfireReading } from "./types";

// Whether the Hazbot Analysis button exists. Question gating depends on it too: Wildfire may declare
// that it can unlock questions only when the button that unlocks them is there.
export const hazbotAvailable = (engine: Engine<WildfireReading, WildfireDefaults> | undefined, readOnly: boolean) =>
  !!engine?.ruleSet && !readOnly;
```

It takes the engine rather than calling `getAnalysisEngine()`, and it is imported from its own module rather than the `hazbot/wildfire` barrel. `app.test.tsx` replaces that barrel without `jest.requireActual`, so a new barrel export would be undefined there, and `hazbot-button.test.tsx` overrides `getAnalysisEngine` only on the barrel, which a call inside the module would bypass. A throwaway build of this shape passed `tsc` and the bottom-bar, app and hazbot-button suites.

`src/components/bottom-bar.tsx`:

```tsx
          {hazbotEngine && hazbotAvailable(hazbotEngine, ui.readOnly) && (
```

`src/interactive-state.ts`:

```ts
import {
  flushStateUpdates, getInitInteractiveMessage, inIframe, setInteractiveState, setSupportedFeatures, unlockQuestions
} from "@concord-consortium/lara-interactive-api";
import { getAnalysisEngine } from "./hazbot/wildfire";
import { hazbotAvailable } from "./hazbot/wildfire/hazbot-available";
...

// The unlock rule needs the Hazbot button, so without a rule set Wildfire cannot unlock and must not
// gate: the host locks questions only behind an interactive that declares the feature.
const initQuestionGating = (ui: UIModel, interactiveState: unknown) => {
  if (!hazbotAvailable(getAnalysisEngine(), ui.readOnly)) return;
  setSupportedFeatures({ questionGating: true });
  if (savedStateUnlocked(interactiveState)) {
    ui.questionsUnlocked = true;
    unlockQuestions({ restored: true });
  }
};

export const initInteractiveState = async (stores: IStores) => {
  const { simulation, chartStore, ui } = stores;
  if (!inIframe()) return;
  const initMessage = await getInitInteractiveMessage<unknown>();
  if (initMessage?.mode === "runtime") {
    initQuestionGating(ui, initMessage.interactiveState);
    return;
  }
  if (initMessage?.mode !== "report") return;
  ...report mode unchanged...
};

// The rule: a Hazbot click after a run ended in this visit. Every ended run is saved before the
// Hazbot button can be clicked again, so a run this visit is exactly a saved state in hand, and
// the unlock re-saves that run with the flag set so a later visit can restore it.
export const unlockQuestionsIfEarned = (ui: UIModel) => {
  if (ui.questionsUnlocked || !ui.lastSavedState) return;
  ui.questionsUnlocked = true;
  unlockQuestions();
  sendState(ui, { ...ui.lastSavedState, questionsUnlocked: true });
};
```

Why each guard is enough:
- **Runtime only (R1, R2).** `initQuestionGating` runs only for `mode === "runtime"`. In report mode `ui.readOnly` keeps `lastSavedState` unset and hides the Hazbot button; standalone, `saveRun` returns before setting it. An authoring-mode preview that is run and analyzed would send an unlock to the authoring host, which has no gated questions to unlock; the declaration is never sent there.
- **No rule set (R2).** The declaration and the restored unlock check `hazbotAvailable`, the same function `bottom-bar.tsx` renders the Hazbot button on, so the two cannot drift; and the in-visit unlock is reachable only through that button. `getAnalysisEngine()` reads only the URL, so it is settled before the init message arrives.
- **Once per visit (R4, R6).** `ui.questionsUnlocked` is set before sending, and also by the restored path, so neither a second click nor a click after a restored unlock sends or saves again.
- **The saved copy.** `ui.lastSavedState` came back from `setInteractiveState`, which deep-freezes it; the spread makes a new top-level object, and the frozen nested objects are never written.

`src/components/hazbot-button.tsx`, at the end of `handleClick`, after the `HazbotButtonClicked` log so the log event precedes the save:

```ts
    unlockQuestionsIfEarned(ui);
```

Tests (`interactive-state.test.tsx`): the module mock gains `setSupportedFeatures: jest.fn()` and `unlockQuestions: jest.fn()`, and the file mocks `./hazbot/wildfire` with `getAnalysisEngine: jest.fn()` over the actual module (the pattern `hazbot-button.test.tsx` uses). The mock returns `undefined` by default; the cases that need a rule set use `mockReturnValueOnce({ ruleSet: {} })`, which `initQuestionGating`'s single call consumes. `beforeEach` calls `mockReset()` on it, so a once value a case leaves unconsumed (the report-mode case, where `initQuestionGating` never runs) cannot leak into the next case. A persistent `{ ruleSet: {} }` would reach `log.ts`, which calls `engine?.consume(...)` on every log, and the next `logSimulationEnded` would throw `engine.consume is not a function`.
- Runtime with a rule set and a saved state without the flag: `setSupportedFeatures` called once with exactly `{ questionGating: true }`; `unlockQuestions` not called.
- Runtime with a flagged saved state: `unlockQuestions` called once with `{ restored: true }`; `ui.questionsUnlocked` is true; the next ended run's save carries `questionsUnlocked: true`; a following `unlockQuestionsIfEarned` sends nothing.
- Runtime with a flagged state whose `identity.preset` is another preset (fails `validateSavedState`): still unlocks with `{ restored: true }`.
- Runtime without a rule set, flagged state: neither `setSupportedFeatures` nor `unlockQuestions` is called.
- Report mode with a flagged state: neither is called.
- `unlockQuestionsIfEarned` before any run ended: sends nothing and saves nothing.
- After a run ends and the model is reset by Restart (`BottomBar` render, as the run-end tests do): `unlockQuestionsIfEarned` calls `unlockQuestions` once with no arguments and saves once more; the new state equals the run's saved state plus `questionsUnlocked: true` (`toEqual({ ...previous, questionsUnlocked: true })`), with `time` still the run's time rather than the reset model's 0; `mockFlush` follows it (`expectFlushedAfterEachSave`). A second call adds nothing.
- Standalone: a run ends, then `unlockQuestionsIfEarned` sends nothing.
- One-way (R7): after a run ends and `unlockQuestionsIfEarned` unlocks, Clear All through `BottomBar` (which also calls `ui.resetHazbotFeedback()`), then end another run: that run's save still carries `questionsUnlocked: true`, and a further `unlockQuestionsIfEarned` sends no second `unlockQuestions`. Catches a reset of the flag added to Clear All or to `resetHazbotFeedback`.

Tests (`hazbot-button.test.tsx`):
- A click calls `unlockQuestionsIfEarned` with the store's `ui` (spy on the `interactive-state` module, as the file already spies on `log`). Catches the call being dropped from `handleClick`.

---

## Verification

The end-to-end check reads the messages Wildfire sends, not the Activity Player's banners. No host yet applies the protocol: the `LARA-226-integration` worktree still unlocks a gate as soon as its saved state exists and never reads the declaration, so a banner check there passes with the rule broken. The banners and return visits are checked when the later AP-76 pull request lands, against a Wildfire build that carries this story.

Setup: an Activity Player page whose Wildfire item URL points at the yalc dev server or the branch build, with `hazbotRules=<id>` (the `sample-disabled-questions` items carry none, so edit a local copy or use a staging activity). Record the Wildfire iframe's posts from the parent page, filtered on `event.source` (checked against the deployed demo, where it captured `hello`, `supportedFeatures` and a full `interactiveState` from a Start then Restart):

```js
window.__wf = [];
const frame = [...document.querySelectorAll("iframe")].find(f => f.src.includes("wildfire"));
window.addEventListener("message", e => {
  if (e.source === frame.contentWindow && e.data?.type !== "log") window.__wf.push(e.data);
});
```

Drive Wildfire inside the frame with `window.test` and DOM clicks (`document.querySelector('[data-testid="start-button"]').click()`), since the bottom bar can sit outside the viewport. Cases:
- With `hazbotRules`: one `supportedFeatures` with `features: { questionGating: true }` and nothing else. Without it: no `questionGating` and no `unlockQuestions`.
- A Hazbot click before any run: no `unlockQuestions`.
- A run, Restart, then Hazbot: one `unlockQuestions` with `{}`, then an `interactiveState` equal to the run's save plus `questionsUnlocked: true`. A second click sends nothing.
- A later run's save carries `questionsUnlocked: true`, after Restart and after Clear All.
- Reload the page: `unlockQuestions` with `{ restored: true }` after `initInteractive`. Run anonymously without `preview` and reload the URL with the `runKey` the Activity Player adds; under `preview` the run key is the fixed `"preview"` and the state lives only in its local offline Firestore. After the top bar's reload the same holds once AP-145 is in.
- Report mode: no `supportedFeatures` and no `unlockQuestions`.

## Open Questions

<!-- Implementation-focused questions only. Requirements questions go in requirements.md. -->

### RESOLVED: Judgment call: how does Wildfire know a run happened in this visit?
**Context**: R3 needs "a run started in this visit". `simulationStarted` is cleared by Restart and Clear All.
**Options considered**:
- A) A new `ui.runStartedThisVisit` flag set by the Start handler.
- B) Use `ui.lastSavedState`: every ended run in an iframe outside report mode is saved, and the Hazbot button is disabled until the run ends.

**Decision**: B. The unlock needs the last saved state anyway, and A would be a second source of truth for the same fact. Outside an iframe or in report mode nothing is saved, and there the unlock must not be sent anyway.

### RESOLVED: Judgment call: where do the unlock flag and the last saved state live?
**Context**: Both are per page visit. `log.ts` keeps module-level state and warns tests about it.
**Options considered**:
- A) Module-level variables in `interactive-state.ts`.
- B) Plain fields on `UIModel`.

**Decision**: B. Each test builds fresh stores, so nothing leaks between cases, and `buildSavedState` already receives `ui`.

## Self-Review

Roles: Senior Engineer, Test Writer, Commit Reviewer, Operator. The two later steps were built as throwaway code against the yalc client: `tsc` reported nothing in the touched files (the existing `line-chart.tsx` and `node_modules` errors are unchanged), `npm run lint` added no warnings, the full Jest suite passed (95 suites, 1189 tests), and throwaway tests confirmed the restored unlock from a state that fails `validateSavedState`, the unlock save after Restart equal to the run's save plus the flag (with `time` 300, not the reset 0, and with `setInteractiveState` mocked to freeze its argument as the real API does), no second send or save on a repeat call, and the `hazbot-button` spy. The throwaway code is deleted.

### Operator

#### RESOLVED: `npm install` fails in this repo without `--legacy-peer-deps`
Running the plan's `npm install` after `yalc add` stopped with `ERESOLVE` on `react-chartjs-2@2.11.2`, and a fresh `npm ci` in the worktree failed the same way. `.github/workflows/ci.yml` installs with `npm ci --legacy-peer-deps`. Fixed in place: both commands in the dependency step carry the flag, with the reason.

---

### Test Writer

#### RESOLVED: A persistent `{ ruleSet: {} }` engine mock breaks every later log call
The plan had the `getAnalysisEngine` mock return `{ ruleSet: {} }` by default. In a throwaway test, the first `logSimulationEnded` after `initInteractiveState` threw `TypeError: engine.consume is not a function` from `log.ts`. Fixed in place: the default is `undefined`, and the rule-set cases use `mockReturnValueOnce`, which passed.

---

### Commit Reviewer

Each step compiles on its own. The format-and-fields step uses no new API symbol, so it builds against `1.13.0`; the sending step imports `setSupportedFeatures`, `unlockQuestions` and the `questionGating` types, so the pin to `1.15.0` has to land before it, as the step order already has it. No finding.

---

### Second round

Roles: Activity Player host developer, QA Engineer, Senior Engineer. Each finding was checked against the Wildfire code, the Activity Player (master, `AP-76-disabled-questions-demo` and the `LARA-226-integration` worktree) and the yalc client; the first with a throwaway Activity Player test, since deleted.

### Activity Player host developer

#### RESOLVED: The top bar's reload loses the unlock, so R7 does not hold
`handleReload` saves and then calls `window.location.reload()` inside the iframe. The reloaded Wildfire says `hello` again, and iframe-phone's `ParentEndpoint` calls the Activity Player's `initInteractive` on every `hello`. That message carries `interactiveStateRef.current` (`iframe-runtime.tsx`), which is set once from `initialInteractiveState` when the runtime mounts and never updated by the states Wildfire sends, so the reloaded Wildfire receives the state from page load, without the flag. A throwaway test against `IframeRuntime` confirmed it: mounted with `{ run: 0 }`, sent `{ run: 1, questionsUnlocked: true }`, then a second connect posted `initInteractive` with `{ run: 0 }`. Two losses follow. A run after the reload saves without `questionsUnlocked` (the reloaded `ui.questionsUnlocked` is false), and when the student changes page the Activity Player's `getInteractiveState` request is answered from the client's managed state, which is the stale page-load state, and that differs from the latest so it is stored. Either way the next visit locks the questions again. The questions stay open for the rest of the current visit, since the host never re-locks. The second loss also affects WM-64 without any gating: changing page after a top-bar reload rolls the saved run back to the one from page load.

Options:
- A) Fix it in the Activity Player: the `interactiveState` listener also sets `interactiveStateRef.current`, so any re-init carries the latest state. Carried by the later AP-76 pull request (which already edits this file), and named as a dependency in this spec. R7's reload clause then holds through R6's restored path.
- B) Carry the flag across Wildfire's own reload in `sessionStorage`. Fixes only the flag, not the stale run, and adds a second store of the same fact.
- C) Accept it and narrow R7: the reload keeps the questions open for the visit but may lose the saved unlock.

Recommendation: A, with R7 and the Technical Notes saying the reload clause depends on it.

Decision: A. The AP-76 session confirmed the stale re-init (on master, for any self-reloading interactive, `loadInteractive` included) and filed AP-145, which blocks WM-66 in Jira. Its fix keeps one latest-state ref in `iframe-runtime.tsx` for every re-init. Wildfire is built against the fixed behavior with no reload-specific code; R7, the Technical Notes and Out of Scope name AP-145.

---

### QA Engineer

#### RESOLVED: No host yet applies the rule, so the end-to-end check cannot show it
R11 and the Deployment note refer to an end-to-end check, but the spec never says what it is or which Activity Player it runs against. The only host with the protocol is the uncommitted `LARA-226-integration` worktree, and it still uses the demo's stand-in: `nextGateStatus` unlocks a gate as soon as its saved state exists, and nothing reads `supportedFeatures.questionGating`. Against it, the questions unlock when Wildfire's first run ends (before any Hazbot click), a returning student with any saved run loads unlocked whatever the flag says, and a Wildfire URL without `hazbotRules` still locks. The check would pass with the rule broken. Declaration checks and `restored` handling arrive only in the later AP-76 pull request.

Suggested resolution: add a short verification section that (1) checks the messages directly, by recording the `supportedFeatures`, `unlockQuestions` and `interactiveState` posts in the Activity Player (Playwright on the parent window's `message` events), for the cases R1 to R7 name, and (2) runs the visible check (banner, return visit) only against an Activity Player build that has dropped the saved-state stand-in for declared gates, either the AP-76 follow-up or a local patch to the integration worktree.

Decision: check the messages in WM-66 and leave the banners to the AP-76 follow-up (rejected: patching the integration worktree, which duplicates that pull request, and holding WM-66 until it lands). Added as the Verification section, including the `hazbotRules` requirement on the item URL.

---

### Senior Engineer

#### RESOLVED: Whether the Hazbot button exists is decided in two places
`initQuestionGating` tests `getAnalysisEngine()?.ruleSet`, and `bottom-bar.tsx` renders the button on `hazbotEngine?.ruleSet && !ui.readOnly`. R2's whole safety argument is that Wildfire declares gating only when the button exists. If the render condition ever gains a term (a URL flag hiding Hazbot, say) and the declaration does not, Wildfire declares a gate it can never unlock and every student is locked out, the failure R2 exists to prevent. Suggested resolution: one exported predicate (for example `hazbotAvailable(ui)` beside `getAnalysisEngine`) used by both the bottom bar and `initQuestionGating`, with `readOnly` included (it is false in runtime mode anyway), so the two cannot drift.

Resolved in place: `hazbotAvailable(engine, readOnly)` in its own module, used by the bottom bar and `initQuestionGating`. Its shape is set by two test files' mocks, as the step explains.
