# Unlock disabled questions from the Wildfire model

**Jira**: https://concord-consortium.atlassian.net/browse/WM-66

**Status**: **Closed**

## Overview

An author can set a Wildfire item in LARA so the questions after it start locked. Wildfire tells the Activity Player when the student has earned access: once the student has run the model and then clicked Hazbot Analysis, Wildfire sends the unlock message, and on a later visit it sends it again at startup from its saved state.

The Activity Player and LARA side (AP-76, LARA-226) lock the questions and show the banner; they only know "locked" or "unlocked". The rule for when the student has done enough belongs to the model, and the PI set it: the student ran the model and clicked Hazbot at least once. Wildfire announces that it can unlock questions, sends the unlock when the rule is met, and remembers in its saved state that it did, so a student who comes back the next day finds the questions already open, with no "now unlocked" banner.

The protocol, from LARA-226's `@concord-consortium/lara-interactive-api` `1.15.0`:

- `setSupportedFeatures({ questionGating: true })`: the interactive declares it can unlock questions. The host locks questions only behind an item whose interactive declared it, so an interactive that never declares it cannot lock a student out.
- `unlockQuestions(options?: { restored?: boolean })`: fire-and-forget. `restored: true` means the unlock comes from saved state at startup, so the host shows no "now unlocked" banner. Repeats are harmless, unlocking is one-way for the page visit, and the host never persists unlock state.
- `hostFeatures.questionGating = { version: "1.0.0" }` in `initInteractive` from hosts that honor the message. Hosts without it ignore the message.

The authored setting (`question_gating`: none, rest of the page, rest of the section, plus banner texts) lives on the LARA item. Only items that save learner state can gate, so the Wildfire item needs "Enable save state" in LARA. Wildfire is never told whether it is a gate; it declares the feature and sends the message regardless.

## Requirements

- **R1 (declare).** In runtime mode inside the Activity Player, when the Hazbot Analysis button is available (a rule set loaded), Wildfire declares `questionGating: true` with `setSupportedFeatures` once, after the `initInteractive` message arrives. It declares nothing else (no `aspectRatio`, `interactiveState` or `authoredState`), so the Activity Player's existing handling of Wildfire is unchanged.
- **R2 (no declaration without Hazbot or outside runtime).** Wildfire does not declare `questionGating` and never sends `unlockQuestions` when no rule set loaded, in report mode, or outside an iframe. An author who gates a Wildfire item without Hazbot therefore locks nothing.
- **R3 (the rule).** The rule is met the first time in a page visit that the student clicks Hazbot Analysis after starting a run in the same visit. "Starting a run" is a Start click that actually starts the model (`simulation.start()` passing its `ready` check). Hazbot clicks before any run in the visit do not count, and a run from an earlier visit (known only from saved state) does not count either.
- **R4 (unlock during the visit).** When the rule is first met, Wildfire sends `unlockQuestions()` with no `restored` flag. Later Hazbot clicks in the same visit send nothing more.
- **R5 (remember it).** When the rule is first met, Wildfire saves its state at once (no 2 s debounce, as WM-64's `saveRun`) with the unlock recorded: the latest run's saved state as last saved, plus `questionsUnlocked: true`. Every later run's save in that visit carries `questionsUnlocked: true` too, so the fact is never dropped by a newer run.
- **R6 (restored unlock).** At startup in runtime mode, when the saved state the Activity Player sends has `questionsUnlocked: true`, Wildfire sends `unlockQuestions({ restored: true })` once, after `initInteractive`, and treats the rule as already met for the visit: no further unlock message on a Hazbot click, and every save in the visit carries `questionsUnlocked: true`. This holds even when the saved run itself would fail WM-64's identity check (for example, the author changed the preset): the unlock is the student's, not the run's.
- **R7 (one-way).** Nothing in Wildfire clears the unlock: Restart, Clear All, a new run and the top bar's reload all keep it. The reload keeps it through R6: the reloaded Wildfire restores the unlock from the state the Activity Player re-sends. *(The reload clause relies on AP-145, merged in Activity Player master for 2.19.0; confirmed on staging, and lost on 2.18.0, which predates it.)*
- **R8 (format).** `questionsUnlocked` is an optional boolean on the saved state. States saved before this story have no field and mean "not unlocked". WM-64's report-mode validation accepts the field and treats a present non-boolean value as malformed, the way it treats `view`. `SAVED_STATE_VERSION` stays 1.
- **R9 (report mode).** Report mode is unchanged: it draws the saved run as before and ignores `questionsUnlocked`.
- **R10 (logging).** No new log events. An in-visit unlock is derivable from the existing `SimulationStarted` and `HazbotButtonClicked` events; the restored unlock is a pure consequence of the saved state.
- **R11 (dependency).** Wildfire depends on `@concord-consortium/lara-interactive-api` from npm, pinned exactly to `1.15.0-pre.0` (`beta` tag) during review and to the final `1.15.0` once the LARA-226 and WM-66 reviews are done. A protocol change in review ships as a new pre-release, and the pin moves to it. *(Partial: pinned to `1.15.0-pre.0`; the move to `1.15.0` follows approval.)*

## Technical Notes

- **Where the code is.** `initInteractiveState` (`src/interactive-state.ts`) calls `initQuestionGating` in its runtime branch, for R1 and R6. `unlockQuestionsIfEarned` is called at the end of `HazbotButton.handleClick`, after the `HazbotButtonClicked` log, so the log event comes before the save. `buildSavedState` builds every saved state, so R5's "every later save carries the flag" lands in one place. `savedStateUnlocked` reads the flag from untrusted state without validating the run.
- **One predicate for the button and the declaration.** `hazbotAvailable(engine, readOnly)` (`src/hazbot/wildfire/hazbot-available.ts`) decides both whether the bottom bar renders the Hazbot button and whether Wildfire declares gating, so the two cannot drift apart. It takes the engine rather than calling `getAnalysisEngine()` and lives in its own module rather than the `hazbot/wildfire` barrel, because `app.test.tsx` replaces that barrel without `jest.requireActual` and `hazbot-button.test.tsx` overrides `getAnalysisEngine` only on the barrel.
- **A run this visit is a saved state in hand.** `ui.lastSavedState` is set by every save, which happens only in an iframe and outside report mode. The Hazbot button is disabled while `runInProgress`, and burn-out (`app.tsx`), Restart and Clear All (`bottom-bar.tsx`) and the top bar's reload all call `logSimulationEnded` before resetting the model, so whenever the button is clickable after a Start in the visit, the run has been saved. `ui.questionsUnlocked` is set before sending and also by the restored path, so neither a second click nor a click after a restored unlock sends or saves again. The model is interactive before `initInteractive` arrives, so `unlockQuestionsIfEarned` also waits for `ui.questionGatingDeclared`, which only the runtime declaration sets: a click before init, or in a session that turns out to be report mode, sends nothing and leaves the unlock for a later click.
- **Re-saving after Restart or Clear All.** Both reset the model in the handler that saves, so the unlock save reuses the last state actually sent rather than rebuilding it from the model, and keeps the run's `time`. `setInteractiveState` deep-freezes its argument; the spread makes a new top-level object, and the frozen nested objects are never written.
- **History.** Each `setInteractiveState` that lands is a full history entry, so the unlock adds one entry repeating the latest run with `questionsUnlocked: true`. It also marks, for an analyst, when the student unlocked the questions. It is not a new run: its `outcome`, `burnSamples` and `burnMap` equal the entry before it, so anyone counting runs from history entries must skip the entry where `questionsUnlocked` first turns true (the `SimulationEnded` log events count runs directly).
- **The top bar's reload and AP-145.** The reload saves, then reloads the page inside the iframe, and the Activity Player answers the new `hello` with a fresh `initInteractive`. Activity Player releases before 2.19.0 send the state from when the runtime mounted, so the reloaded Wildfire gets no flag, its next save drops it, and on a page change the Activity Player stores the stale state the client reports back. AP-145 (activity-player #592, in 2.19.0) makes every re-init carry the latest state, so R6 covers the reload with no reload-specific Wildfire code.
- **Installs.** Every install needs `--legacy-peer-deps`, as CI's `npm ci --legacy-peer-deps` does: `react-chartjs-2@2.11.2` has a peer range that excludes React 18. The pin is exact because a `^` range never matches a prerelease.
- **Tests.** `interactive-state.test.tsx` mocks `getAnalysisEngine` to return `undefined` by default and gives rule-set cases `mockReturnValueOnce({ ruleSet: {} })`: a persistent stand-in would reach `log.ts`, which calls `engine?.consume(...)` on every log. `beforeEach` resets the mock, so a value a case leaves unconsumed (report mode) cannot leak.
- **Deployment.** The activity's item URL has to point at the release (fix version 1.7.0) or a branch build that carries this story, and must carry `hazbotRules=<id>` with a rule set that exists (not `hazbotSidebar=true` alone, which constructs an engine with no rule set), or Wildfire declares nothing and the host locks nothing.
- **End-to-end check.** No host applied the protocol when this shipped, so the check read Wildfire's messages from the Activity Player page (`window.addEventListener("message", ...)` filtered on the Wildfire frame's `event.source`), driving Wildfire through `window.test` and `data-testid` clicks. It was run against a local Activity Player patched to follow the protocol, and every runtime case passed, including the restored unlock on a reload with the same `runKey` and the top bar's reload with AP-145 applied. The message cases, the top bar's reload included, were repeated on staging's Activity Player master after AP-145 merged, with the released 2.18.0 as the control that loses the unlock. Report mode was left to the unit tests.

## Out of Scope

- The Activity Player and LARA side: locking, banners, authored texts, the `question_gating` setting (AP-76, LARA-226).
- Other unlock rules ("two sparks", "two runs", "received feedback at a given level"), and any authored or URL configuration of the rule.
- Restoring the student's run into the editable model in runtime mode (still left for later, as WM-64 decided).
- Detecting whether the host supports gating: the message is sent regardless and hosts without support ignore it.
- Re-locking questions.
- The Activity Player's stale re-init after an interactive reloads itself (AP-145, fixed in Activity Player 2.19.0).

## Not Yet Implemented

- The pin to the final `lara-interactive-api` `1.15.0`: the branch pins `1.15.0-pre.0`, and the final version is published from the same code once the LARA-226 and WM-66 reviews are done.

## Decisions

### What happens when the item has no Hazbot rule set?
**Context**: Without `?hazbotRules=`, the Hazbot button is not rendered, so the PI's rule can never be met.
**Options considered**:
- A) Do not declare `questionGating`, so the host locks nothing behind that item.
- B) Declare it and fall back to "ran the model".
- C) Declare it anyway; the questions stay locked.

**Decision**: A. The PI's rule is about Hazbot; B invents a second rule nobody asked for, and C locks students out with no way forward. The declaration exists precisely so a gate that cannot unlock locks nothing.

---

### How is the unlock persisted when the click comes after the run's save?
**Context**: WM-64 saves once per ended run, and the Hazbot click always comes after that save. A student who runs, clicks Hazbot and leaves would lose the unlock unless something saves it.
**Options considered**:
- A) Save again at the unlock: the last saved run plus `questionsUnlocked: true` (one extra history entry).
- B) Only carry the flag on the next run's save.

**Decision**: A. B loses the unlock in the most common path (run, Hazbot, answer the questions, leave), and the next visit would lock the questions again.

---

### Does the unlock need its own log event?
**Context**: WM-64 added no log events; researchers may want to see the unlock.
**Options considered**:
- A) No new event.
- B) Log `QuestionsUnlocked { restored }`, mapped to a no-op in Hazbot's `translate.ts`.

**Decision**: A. The in-visit unlock is fully derivable from `SimulationStarted` followed by `HazbotButtonClicked`, and the saved state's history entry records the moment.

---

### Does a run from an earlier visit count toward the rule?
**Context**: A student who ran the model yesterday but never clicked Hazbot, and today clicks Hazbot without running, would stay locked under a same-visit rule. The opposite reading ("has ever run the model") is also defensible from the PI's wording.
**Options considered**:
- A) Same visit only.
- B) A saved run from an earlier visit also counts.

**Decision**: A. Hazbot's readings start empty on every load, so a click before any run in the visit matches each rule set's category 1, "Did not run the simulation", whose feedback tells the student to run the model. Unlocking on that click would open the questions while Hazbot tells the student to run the model first. The PI's rule is "ran the model and got Hazbot's feedback on it", which only a same-visit run satisfies.

---

### Should the restored unlock survive a saved state that fails the identity check?
**Context**: If an author swaps the model's preset mid-unit, the saved run no longer validates.
**Options considered**:
- A) Honor the flag regardless of the run's identity.
- B) Honor it only when the whole state validates.

**Decision**: A. The identity check exists so a run is not drawn over the wrong terrain; it says nothing about whether the student met the rule. Under B, an author's preset change would re-lock questions a student had already answered. The flag is a plain `=== true` read, so a malformed state cannot unlock anything either.

---

### A gated item URL without a valid `hazbotRules` silently locks nothing
**Context**: An author or tester who points the item at Wildfire without `hazbotRules`, or with `hazbotSidebar=true` alone, would see no locking and could read it as a broken host.
**Options considered**:
- A) Document the requirement in the Deployment note.

**Decision**: A. The Deployment note says the item URL must carry a valid `hazbotRules`, including for the end-to-end check.

---

### The unlock history entry looks like a second copy of the run
**Context**: The Activity Player stores every changed state as a history entry, and the unlock save repeats the last run with the flag added, so an analyst counting runs from history entries would count it twice.
**Options considered**:
- A) Document how to tell the entry apart.

**Decision**: A. The History note says to skip the entry where `questionsUnlocked` first turns true, and that `SimulationEnded` events count runs directly.

---

### How does Wildfire know a run happened in this visit?
**Context**: R3 needs "a run started in this visit". `simulationStarted` is cleared by Restart and Clear All.
**Options considered**:
- A) A new `ui.runStartedThisVisit` flag set by the Start handler.
- B) Use `ui.lastSavedState`: every ended run in an iframe outside report mode is saved, and the Hazbot button is disabled until the run ends.

**Decision**: B. The unlock needs the last saved state anyway, and A would be a second source of truth for the same fact. Outside an iframe or in report mode nothing is saved, and there the unlock must not be sent anyway.

---

### Where do the unlock flag and the last saved state live?
**Context**: Both are per page visit. `log.ts` keeps module-level state and warns tests about it.
**Options considered**:
- A) Module-level variables in `interactive-state.ts`.
- B) Plain fields on `UIModel`.

**Decision**: B. Each test builds fresh stores, so nothing leaks between cases, and `buildSavedState` already receives `ui`.

---

### `npm install` fails in this repo without `--legacy-peer-deps`
**Context**: A plain install stopped with `ERESOLVE` on `react-chartjs-2@2.11.2`; CI installs with `npm ci --legacy-peer-deps`.
**Options considered**:
- A) Pass `--legacy-peer-deps` on every install.

**Decision**: A, with the reason recorded beside the install commands.

---

### A persistent `{ ruleSet: {} }` engine mock breaks every later log call
**Context**: With the `getAnalysisEngine` mock returning `{ ruleSet: {} }` by default, the first `logSimulationEnded` after init threw `engine.consume is not a function` from `log.ts`.
**Options considered**:
- A) Default to `undefined` and give rule-set cases a one-shot return value.

**Decision**: A, with `beforeEach` resetting the mock so an unconsumed one-shot value cannot leak into the next case.

---

### The top bar's reload loses the unlock without an Activity Player fix
**Context**: iframe-phone calls the Activity Player's `initInteractive` on every `hello`, with a state ref set once when the runtime mounts. A reloaded Wildfire gets the page-load state without the flag, its next save drops it, and a page change stores the stale state. This also rolls back WM-64's saved run after a top-bar reload.
**Options considered**:
- A) Fix it in the Activity Player so every re-init carries the latest state.
- B) Carry the flag across Wildfire's own reload in `sessionStorage`.
- C) Accept it and narrow R7.

**Decision**: A, filed and fixed as AP-145 (Activity Player 2.19.0). B fixes only the flag, not the stale run, and adds a second store of the same fact. Wildfire has no reload-specific code; R7's reload clause relies on AP-145.

---

### No host applies the rule yet, so the end-to-end check cannot use the banners
**Context**: The only host with the protocol unlocked a gate as soon as its saved state existed and never read the declaration, so a banner check would pass with the rule broken.
**Options considered**:
- A) Check Wildfire's messages from the Activity Player page, and leave banners and return visits to the AP-76 pull request.
- B) Patch the integration worktree to follow the protocol.
- C) Hold WM-66 until AP-76 lands.

**Decision**: A. The patched-host run described under Technical Notes covered the banners as well.

---

### Whether the Hazbot button exists is decided in two places
**Context**: The declaration and the bottom bar each tested for a rule set. If the render condition gained a term and the declaration did not, Wildfire would declare a gate it can never unlock and lock every student out, the failure R2 exists to prevent.
**Options considered**:
- A) One exported predicate used by both.

**Decision**: A: `hazbotAvailable(engine, readOnly)` in its own module, used by the bottom bar and `initQuestionGating`.

---
