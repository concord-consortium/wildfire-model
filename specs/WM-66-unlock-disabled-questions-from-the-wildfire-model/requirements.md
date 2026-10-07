# Unlock disabled questions from the Wildfire model

**Jira**: https://concord-consortium.atlassian.net/browse/WM-66
**Repo**: https://github.com/concord-consortium/wildfire-model
**Implementation Spec**: [implementation.md](implementation.md)
**Status**: **In Development**

## Overview

An author can set a Wildfire item in LARA so the questions after it start locked. Wildfire tells the Activity Player when the student has earned access: once the student has run the model and then clicked Hazbot Analysis, Wildfire sends the unlock message, and on a later visit it sends it again at startup from its saved state.

## Project Owner Overview

On a Hazbot page the questions after the model are meant to wait until the student has used the model and heard from Hazbot. The Activity Player and LARA side (AP-76, LARA-226) lock the questions and show the banner; they only know "locked" or "unlocked". The rule for when the student has done enough belongs to the model, and the PI set it: the student ran the model and clicked Hazbot at least once.

This story makes Wildfire announce that it can unlock questions, send the unlock when the rule is met, and remember in its saved state that it did, so a student who comes back the next day finds the questions already open, with no "now unlocked" banner.

## Background

LARA-226 adds the protocol to `@concord-consortium/lara-interactive-api` (client `1.15.0`, published as the pre-release `1.15.0-pre.0` under the `beta` tag; the final `1.15.0` follows once the LARA-226 and WM-66 reviews are done):

- `setSupportedFeatures({ questionGating: true })`: the interactive declares it can unlock questions. The host locks questions only behind an item whose interactive declared it, so an interactive that never declares it cannot lock a student out.
- `unlockQuestions(options?: { restored?: boolean })`: fire-and-forget. `restored: true` means the unlock comes from saved state at startup, so the host shows no "now unlocked" banner. Repeats are harmless, unlocking is one-way for the page visit, and the host never persists unlock state.
- `hostFeatures.questionGating = { version: "1.0.0" }` in `initInteractive` from hosts that honor the message. Hosts without it ignore the message.

The authored setting (`question_gating`: none, rest of the page, rest of the section, plus banner texts) lives on the LARA item. Only items that save learner state can gate, so the Wildfire item needs "Enable save state" in LARA. Wildfire is never told whether it is a gate; it declares the feature and sends the message regardless.

WM-64 already gave Wildfire interactive state (`src/interactive-state.ts`, `src/models/saved-state.ts`): it saves the latest run once per ended run (burn-out, Restart, Clear All, reload), restores it read-only in report mode, and in runtime mode ignores whatever state the Activity Player sends. This story is the first runtime-mode reader of that state, and only for the unlock fact.

The Hazbot Analysis button (`src/components/hazbot-button.tsx`) exists only when a rule set loaded (`?hazbotRules=` valid) and the model is not read-only. It is disabled for the whole of a run, pauses included (`simulation.runInProgress`), so a click after Start can only happen once that run has ended (burn-out, Restart or Clear All), and every one of those routes has already saved the run.

## Requirements

- **R1 (declare).** In runtime mode inside the Activity Player, when the Hazbot Analysis button is available (a rule set loaded), Wildfire declares `questionGating: true` with `setSupportedFeatures` once, after the `initInteractive` message arrives. It declares nothing else (no `aspectRatio`, `interactiveState` or `authoredState`), so the Activity Player's existing handling of Wildfire is unchanged.
- **R2 (no declaration without Hazbot or outside runtime).** Wildfire does not declare `questionGating` and never sends `unlockQuestions` when no rule set loaded, in report mode, or outside an iframe. An author who gates a Wildfire item without Hazbot therefore locks nothing.
- **R3 (the rule).** The rule is met the first time in a page visit that the student clicks Hazbot Analysis after starting a run in the same visit. "Starting a run" is a Start click that actually starts the model (`simulation.start()` passing its `ready` check). Hazbot clicks before any run in the visit do not count, and a run from an earlier visit (known only from saved state) does not count either.
- **R4 (unlock during the visit).** When the rule is first met, Wildfire sends `unlockQuestions()` with no `restored` flag. Later Hazbot clicks in the same visit send nothing more.
- **R5 (remember it).** When the rule is first met, Wildfire saves its state at once (no 2 s debounce, as WM-64's `saveRun`) with the unlock recorded: the latest run's saved state as last saved, plus `questionsUnlocked: true`. Every later run's save in that visit carries `questionsUnlocked: true` too, so the fact is never dropped by a newer run.
- **R6 (restored unlock).** At startup in runtime mode, when the saved state the Activity Player sends has `questionsUnlocked: true`, Wildfire sends `unlockQuestions({ restored: true })` once, after `initInteractive`, and treats the rule as already met for the visit: no further unlock message on a Hazbot click, and every save in the visit carries `questionsUnlocked: true`. This holds even when the saved run itself would fail WM-64's identity check (for example, the author changed the preset): the unlock is the student's, not the run's.
- **R7 (one-way).** Nothing in Wildfire clears the unlock: Restart, Clear All, a new run and the top bar's reload all keep it. The reload keeps it through R6: the reloaded Wildfire restores the unlock from the state the Activity Player re-sends, which depends on AP-145.
- **R8 (format).** `questionsUnlocked` is an optional boolean on the saved state. States saved before this story have no field and mean "not unlocked". WM-64's report-mode validation accepts the field and treats a present non-boolean value as malformed, the way it treats `view`. `SAVED_STATE_VERSION` stays 1.
- **R9 (report mode).** Report mode is unchanged: it draws the saved run as before and ignores `questionsUnlocked`.
- **R10 (logging).** No new log events. An in-visit unlock is derivable from the existing `SimulationStarted` and `HazbotButtonClicked` events; the restored unlock is a pure consequence of the saved state.
- **R11 (dependency).** Wildfire depends on `@concord-consortium/lara-interactive-api` from npm, pinned exactly to `1.15.0-pre.0` (`beta` tag) during review and to the final `1.15.0` once the LARA-226 and WM-66 reviews are done. A protocol change in review ships as a new pre-release, and the pin moves to it.

## Technical Notes

- **Where the code goes.** `src/interactive-state.ts` already awaits `getInitInteractiveMessage()` for every iframe load and returns early unless the mode is `report`; the runtime branch is where R1 and R6 hook in. `saveRun` and `logSimulationEnded` are the only save paths, and `buildSavedState` builds every saved state, so R5's "every later save carries the flag" lands in one place.
- **The click.** `HazbotButton.handleClick` is the one place a Hazbot click happens; it already logs `HazbotButtonClicked`. The button is disabled while `runInProgress`, so a click after a Start in the same visit is always after that run ended and was saved under WM-64's R2.
- **Re-saving after Restart or Clear All.** Both reset the model in the handler that saves, so by the time Hazbot is clicked the model no longer holds the run. The unlock save therefore reuses the last state actually sent (kept in memory) rather than rebuilding it from the model.
- **History.** Each `setInteractiveState` that lands is a full history entry, so the unlock adds one entry repeating the latest run with `questionsUnlocked: true`. That entry also marks, for an analyst, when the student unlocked the questions. It is not a new run: its `outcome`, `burnSamples` and `burnMap` equal the entry before it, and report mode draws it identically, so anyone counting runs from history entries must skip the entry where `questionsUnlocked` first turns true (the `SimulationEnded` log events count runs directly).
- **The client** (`1.15.0-pre.0`, built from LARA commit `3c866927` on branch `LARA-226-question-gating`) exports `unlockQuestions`, `IUnlockQuestionsMessage`, `ISupportedFeatures.questionGating` and `IHostFeatures.questionGating`. Its only peer dependencies are React and React DOM 16.9 or later (Wildfire is on 18).
- **Every route that ends a run saves first.** Burn-out (`app.tsx`), Restart and Clear All (`bottom-bar.tsx`) call `logSimulationEnded` before resetting the model, and the top bar's reload does the same before reloading the page. The only `simulation.start()` call is the bottom bar's Start handler. So whenever the Hazbot button is clickable after a Start in the visit, the run has been saved.
- **The top bar's reload and AP-145.** The reload saves, then reloads the page inside the iframe, and the Activity Player answers the reloaded Wildfire's new `hello` with a fresh `initInteractive`. Before AP-145 that message carries the state from when the Activity Player's runtime mounted, so the reloaded Wildfire would get no flag, its next save would drop it, and on a page change the Activity Player would store the stale state the client reports back. AP-145 (which blocks WM-66 in Jira) makes every re-init carry the latest state, so R6's restored unlock covers the reload with no reload-specific Wildfire code. Wildfire keeps saving with `setInteractiveState` and `flushStateUpdates` before the reload.
- **iframe-phone queues** posts made before the connection opens, but the declaration and the restored unlock are sent after `initInteractive` arrives, the normal pattern.
- **Activity Player handling of `supportedFeatures`** (`iframe-runtime.tsx`): it applies `aspectRatio` only when present, forwards the features to plugins and tells the focus manager whether `focusProtocol` is set. Declaring only `questionGating` changes none of that for Wildfire.
- **Deployment.** `wildfire.concord.org/index.html` serves `v1.6.0`; the activity's item URL has to point at the release (fix version 1.7.0) or a branch build that carries this story. Under R2 the item URL must also carry `hazbotRules=<id>` with a rule set that exists (and not `hazbotSidebar=true` alone, which constructs an engine with no rule set), or Wildfire declares nothing and the host locks nothing. The same holds for the end-to-end check against a local dev server.

## Out of Scope

- The Activity Player and LARA side: locking, banners, authored texts, the `question_gating` setting (AP-76, LARA-226).
- Other unlock rules ("two sparks", "two runs", "received feedback at a given level"), and any authored or URL configuration of the rule.
- Restoring the student's run into the editable model in runtime mode (still left for later, as WM-64 decided).
- Detecting whether the host supports gating: the message is sent regardless and hosts without support ignore it.
- Re-locking questions.
- The Activity Player's stale re-init after an interactive reloads itself (AP-145).

## Open Questions

<!-- Requirements-focused questions only (scope, acceptance criteria, business rules).
     Implementation questions go in implementation.md. -->

### RESOLVED: Judgment call: what happens when the item has no Hazbot rule set?
**Context**: Without `?hazbotRules=`, the Hazbot button is not rendered, so the PI's rule can never be met.
**Options considered**:
- A) Do not declare `questionGating`, so the host locks nothing behind that item.
- B) Declare it and fall back to "ran the model".
- C) Declare it anyway; the questions stay locked.

**Decision**: A. The PI's rule is about Hazbot; B invents a second rule nobody asked for, and C locks students out with no way forward. The declaration exists precisely so a gate that cannot unlock locks nothing.

### RESOLVED: Judgment call: how is the unlock persisted when the click comes after the run's save?
**Context**: WM-64 saves once per ended run, and the Hazbot click always comes after that save. A student who runs, clicks Hazbot and leaves would lose the unlock unless something saves it.
**Options considered**:
- A) Save again at the unlock: the last saved run plus `questionsUnlocked: true` (one extra history entry).
- B) Only carry the flag on the next run's save.

**Decision**: A. B loses the unlock in the most common path (run, Hazbot, answer the questions, leave), and the next visit would lock the questions again.

### RESOLVED: Judgment call: does the unlock need its own log event?
**Context**: WM-64 added no log events; researchers may want to see the unlock.
**Options considered**:
- A) No new event.
- B) Log `QuestionsUnlocked { restored }`, mapped to a no-op in Hazbot's `translate.ts`.

**Decision**: A. The in-visit unlock is fully derivable from `SimulationStarted` followed by `HazbotButtonClicked`, and the saved state's history entry records the moment.

### RESOLVED: Low confidence: does a run from an earlier visit count toward the rule?
**Context**: R3 requires the run and the click in the same visit. A student who ran the model yesterday but never clicked Hazbot, and today clicks Hazbot without running, would stay locked. Hazbot's readings start empty on each load, so today's feedback would be about not having run the model, which argues for same-visit. The opposite reading ("has ever run the model") is also defensible from the PI's wording.
**Options considered**:
- A) Same visit only (as R3 is written).
- B) A saved run from an earlier visit also counts.

**Decision**: A. Hazbot's readings start empty on every load, so a click before any run in the visit matches each rule set's category 1, "Did not run the simulation", whose feedback tells the student to run the model ("I will analyze your model after you run it!" in 23 to 34, "Remember, you need to run the model." in 41 to 46, and in 35 "Run it before answering the questions."). Unlocking on that click would open the questions while Hazbot tells the student to run the model first. The PI's rule is "ran the model and got Hazbot's feedback on it", which only a same-visit run satisfies.

### RESOLVED: Low confidence: should the restored unlock survive a saved state that fails the identity check?
**Context**: R6 honors `questionsUnlocked` even when the saved run belongs to another preset or grid. If an author swaps the model's preset mid-unit, the student keeps access to questions they already unlocked.
**Options considered**:
- A) Honor it regardless of the run's identity (as R6 is written).
- B) Honor it only when the whole state validates.

**Decision**: A. The identity check exists so a run is not drawn over the wrong terrain; it says nothing about whether the student met the rule. Under B, an author's preset change would re-lock questions a student had already answered, and the student would have to repeat the rule on a model they may have finished with. The flag is a plain `=== true` read, so a malformed state cannot unlock anything either.

## Self-Review

Roles: Senior Engineer, QA Engineer, Education Researcher, DevOps / Operator, Student.

### DevOps / Operator

#### RESOLVED: A gated item URL without a valid `hazbotRules` silently locks nothing
R2 ties the declaration to a loaded rule set (`hazbotEngine?.ruleSet` in `bottom-bar.tsx`; `getAnalysisEngine()` reads only the URL, so it is known synchronously at startup). An author or tester who points the item at Wildfire without `hazbotRules`, or with `hazbotSidebar=true` alone, would see no locking and could read it as a broken host. Fixed in place: the Deployment note now says the item URL must carry a valid `hazbotRules`, including for the end-to-end check.

---

### Education Researcher

#### RESOLVED: The unlock history entry looks like a second copy of the run
The unlock save repeats the last run (R5), and the Activity Player stores every changed state as a history entry (`iframe-runtime.tsx` skips only byte-identical states, and the flag makes this one differ). An analyst counting runs from history entries would count the run twice. Fixed in place: the History note says how to tell the entry apart and that `SimulationEnded` events count runs directly.

