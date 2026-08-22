import React, { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import Button from "@mui/material/Button";
import { useStores } from "../use-stores";
import { log } from "../log";
import { getAnalysisEngine, WildfireDefaults, WildfireReading } from "../hazbot/wildfire";
import { buildTour } from "../hazbot/wildfire/build-tour";
import { tourData } from "../hazbot/wildfire/tour-data.generated";
import { TourContext } from "../hazbot/wildfire/tour-map";
import { CategorySelection, computeCategorySelectionForEngine, Engine } from "../hazbot/engine";
import { selectFeedback } from "../hazbot/wildfire/feedback-levels";
import { createCoachmarksEngine, EngineHandle, EngineStep } from "@concord-consortium/coachmarks";
import { SimulationModel } from "../models/simulation";
import HazbotBack from "../assets/bottom-bar/hazbot-back.svg";
import HazbotEyes from "../assets/bottom-bar/hazbot-eyes.svg";
import HazbotBlinks from "../assets/bottom-bar/hazbot-blinks.svg";

import "@concord-consortium/coachmarks/styles/hazbot";
import css from "./hazbot-button.scss";

// The selection rule itself lives in the substrate, since the sidebar and the
// replay-fixture generator read it too. All this adds is the no-engine case, which the
// substrate cannot express because it takes an Engine.
const NO_ENGINE: CategorySelection = { best: null, current: null, used: null };
const readCategories = (engine: Engine<WildfireReading, WildfireDefaults> | undefined) =>
  (engine ? computeCategorySelectionForEngine(engine) : NO_ENGINE);

// Shared coach-mark arrow geometry for both the intro popover and the tour, matching
// the Zeplin design (strokeWidth 3 = the hazbot theme's 3px popover border).
const HAZBOT_ARROW = { width: 36, height: 18, strokeWidth: 3 };

// Distinct zones currently holding a spark, read at open time for the conditional
// spark tours (23/4, 33/4, 35/6). sparks are bare Vector2 positions, so map each to
// its cell's zoneIdx.
function countSparkZones(simulation: SimulationModel): number {
  const zones = new Set<number>();
  for (const s of simulation.sparks) {
    const cell = simulation.cells.length > 0 ? simulation.cellAt(s.x, s.y) : undefined;
    if (cell?.zoneIdx != null) zones.add(cell.zoneIdx);
  }
  return zones.size;
}

// Parse a category's `feedback` into the popover body + action-button label. The
// avatar is the speaker, so strip the leading "Hazbot:" prefix; the single trailing
// bracket token (e.g. `[Okay]`, `[Show me]`, `[Hooray!]`) becomes the button label.
// Rule-sets carry exactly one token, on the last line. Bold (`**…**`) is left intact
// in the body for the coachmarks library to render. Exported for unit testing.
export function parseFeedback(raw: string): { body: string; label: string } {
  let text = raw.replace(/^\s*Hazbot:\s*/, "");
  const token = text.match(/\[([^\]]+)\]\s*$/);
  const label = token ? token[1].trim() : "";
  if (token) text = text.slice(0, token.index);
  return { body: text.trim(), label };
}

// The Hazbot Analysis button (bottom bar), a MobX `observer` child of BottomBar.
// Clicking it opens the coach-mark feedback panel (the effect below) and logs the
// matched category. It reads the engine directly (getAnalysisEngine() +
// computeCategorySelectionForEngine()) rather than the reactive useAnalysisEngine()
// hook, since the category is only needed at click/open time, not live while open.
export const HazbotButton = observer(function HazbotButton() {
  const { ui, simulation } = useStores();

  // Random blink (AP-79): local presentation state, no store/engine coupling. A
  // recursive setTimeout cycle; the `mounted` ref prevents setBlink after unmount.
  const [blink, setBlink] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    let timeout: ReturnType<typeof setTimeout>;
    const loop = () => {
      if (!mounted.current) return;
      timeout = setTimeout(() => {
        if (!mounted.current) return;
        setBlink(true);                    // eyes closed
        timeout = setTimeout(() => {
          if (!mounted.current) return;
          setBlink(false);                 // eyes open, then a short pause before the next blink
          timeout = setTimeout(loop, 80);
        }, 180);
      }, 1000 + Math.random() * 2500);     // random idle before next blink
    };
    loop();
    return () => { mounted.current = false; clearTimeout(timeout); };
  }, []);

  // Ready/pulse predicate. The simulationStarted term keeps the pulse off in the
  // pre-run / terrain-setup state and auto-hides a stale arm after Restart/Reload
  // (both clear simulationStarted without routing through start()). The
  // !showHazbotFeedback term suppresses the pulse while the coach mark is open
  // (intro or tour) — a run ending mid-coach-mark re-arms the pulse, which would
  // otherwise throb under the open panel; it resumes once the panel closes.
  const pulsing =
    ui.hazbotPulseArmed && simulation.simulationStarted && !simulation.simulationRunning &&
    !ui.showHazbotFeedback;

  // Coach-mark feedback panel — a two-engine lifecycle (WM-17). When
  // ui.showHazbotFeedback flips true:
  //  1. INTRO: open the matched category's `feedback` popover anchored to the robot
  //     face (avatarRef), with the robot-avatar badge SUPPRESSED (showAvatar:false) —
  //     the intro already points at the robot, so the badge would be redundant. The
  //     action button is the parsed trailing token (`[Show me]` / `[Okay]` / `[Hooray!]`).
  //  2. TOUR: for a COACHING category (the token is `[Show me]`, so `buildTour` returns
  //     a tour), activating that button destroys the intro engine and creates a GATED
  //     tour engine (actionGated + showProgress + the avatar badge) that drives the
  //     zipped walk-through. Non-coaching categories (`[Okay]`/`[Hooray!]`, no tour)
  //     keep today's behavior: the intro popover is the whole interaction.
  //
  // `cleanup`/`introCancelled`/`tourCancelled` distinguish the real user routes
  // (Show-me activation, terminal Done, ×/Escape) from a programmatic teardown
  // (effect cleanup / unmount), since onDestroyed fires for every destroy route —
  // without them the cleanup path would spuriously launch a tour or mis-log a
  // Completed/Dismissed event.
  const avatarRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // True while the walk-through tour is running (after [Show me]). Drives the
  // "No Hazbot Default" button state (Zeplin): the button fades to 35% and the
  // robot avatar is hidden, since the robot is shown inside the coach mark instead.
  // The intro popover keeps the enlarged-robot `.coached` state (it anchors to the
  // robot); only the tour swaps to `.noHazbot`.
  const [tourActive, setTourActive] = useState(false);
  useEffect(() => {
    if (!ui.showHazbotFeedback || !avatarRef.current) return;
    setTourActive(false); // fresh open starts in the intro (enlarged-robot) state
    const engine = getAnalysisEngine();
    const { used: matched } = readCategories(engine);
    const ruleSetId = engine?.ruleSet?.id ?? null;
    // Which of the category's up-to-three strings this press shows. The level is READ
    // here (the string it names drives parseFeedback / buildTour / the tour's done label
    // below) but only COMMITTED when the popover actually opens: see openOnce.
    const shownLevel = matched != null ? (ui.hazbotFeedbackLevels.get(matched) ?? 0) : 0;
    const selected = selectFeedback(engine?.ruleSet, matched, shownLevel);
    const feedback = selected?.feedback ?? "";
    if (!feedback) {
      // Nothing to show (no engine / no matched category / empty feedback). Clear
      // the flag so the button doesn't stay stuck in its "Large" coached state and
      // a later click can re-trigger the effect.
      ui.showHazbotFeedback = false;
      return;
    }
    const { body, label } = parseFeedback(feedback);
    // The level's own action token decides whether it re-offers the walk-through, so an
    // author can say "this level coaches again" by typing [Show me] into the cell.
    const offersTour = label.trim().toLowerCase() === "show me";
    const avatar = avatarRef.current;

    // Build the tour up front (read live sim state once). null → non-coaching category.
    const ctx: TourContext = { sparkZoneCount: countSparkZones(simulation) };
    const tour = (ruleSetId && matched != null) ? buildTour(ruleSetId, matched, ctx) : null;
    const tourDoneLabel = (tour && ruleSetId && matched != null)
      ? tourData[ruleSetId][matched].doneLabel
      : "Got it!";

    let phase: "intro" | "tour" | "done" = "intro";
    let intro: EngineHandle | null = null;
    let tourEngine: EngineHandle | null = null;
    let introCancelled = false;
    let tourCancelled = false;
    let cleanup = false;

    const openTour = (steps: EngineStep[]) => {
      log("HazbotShowMeClicked", {
        ruleSetId, categoryId: matched, stepCount: steps.length, feedbackLevel: selected?.level ?? null,
      });
      setTourActive(true);
      let lastStepIndex = 0;
      tourEngine = createCoachmarksEngine({
        actionGated: true,                       // gated nav/keyboard/focus + wait-for-target
        onTargetLost: "close",                   // close the tour if a step's anchor unmounts (vs degrade-to-centered)
        showProgress: true,
        progressText: "Step {{current}} of {{total}}",
        arrow: HAZBOT_ARROW,
        // popoverOffset 27 (vs the intro's 25) yields the Zeplin ~9px arrow-tip→button
        // gap: coachmarks places the popover box at popoverOffset and the arrow protrudes
        // its height (18) toward the anchor, so visible gap = popoverOffset − arrowHeight.
        popoverOffset: 27,
        showButtons: ["next", "close"],
        doneBtnText: tourDoneLabel,
        onHighlightStarted: (_el, _step, { state }) => { lastStepIndex = state.activeIndex; },
        onCancelRequested: () => {
          tourCancelled = true;
          log("HazbotTourDismissed", {
            ruleSetId, categoryId: matched, lastStepIndex, feedbackLevel: selected?.level ?? null,
          });
          tourEngine?.destroy();
        },
        onDestroyed: () => {
          // Completed ONLY on a terminal Done click: not cancelled (×/Escape), not cleanup.
          if (!tourCancelled && !cleanup) {
            log("HazbotTourCompleted", {
              ruleSetId, categoryId: matched, lastStepIndex, feedbackLevel: selected?.level ?? null,
            });
          }
          if (!cleanup) { phase = "done"; ui.showHazbotFeedback = false; setTourActive(false); }
        },
      });
      tourEngine.drive(steps);
    };

    const openIntro = () => {
      if (cleanup) return;
      intro = createCoachmarksEngine({
        showButtons: ["next", "close"],
        doneBtnText: label || undefined,         // "Show me" / "Okay" / "Hooray!"
        showOutlineRing: false,
        showAvatar: false,                       // intro already points at the robot button
        popoverOffset: 25,                       // gap between the arrow tip and the robot
        arrow: HAZBOT_ARROW,
        onCancelRequested: () => { introCancelled = true; intro?.destroy(); },
        onDestroyed: () => {
          // Launch the tour ONLY on a real Show-me activation (not ×/Escape, not cleanup).
          if (phase === "intro" && !introCancelled && !cleanup && tour && offersTour) {
            phase = "tour";
            openTour(tour);
          } else if (!cleanup) {
            phase = "done";
            ui.showHazbotFeedback = false;
          }
        },
      });
      intro.highlight({
        element: avatar,
        ringElement: buttonRef.current ?? undefined, // ring target (inert; ring disabled)
        popover: { side: "top", align: "center", description: body },
      });
    };

    // Open the INTRO after the `.coached` scale-up transition settles: a CSS transform
    // does not fire floating-ui's ResizeObserver, so opening mid-grow would anchor to
    // the un-scaled robot. Wait for the avatar's transform transitionend (fallback
    // timeout in case it doesn't fire) so the popover offsets by the enlarged size.
    let opened = false;
    const openOnce = () => {
      if (opened) return; // whichever trigger fires first wins; the other no-ops
      opened = true;
      // Commit the level HERE, not at the top of the effect: the effect body also runs
      // for presses that never open a popover (teardown inside this 400ms window, or a
      // category with no feedback), and a level spent on nothing shown is the same defect
      // a click-site counter has.
      if (matched != null && selected) {
        ui.hazbotFeedbackLevels.set(matched, selected.level);
        ui.hazbotLastFeedbackShown = { level: selected.level, source: selected.source };
        log("HazbotFeedbackShown", {
          ruleSetId, categoryId: matched, feedbackLevel: selected.level, source: selected.source,
        });
      }
      openIntro();
    };
    const onTransitionEnd = (e: TransitionEvent) => {
      if (e.propertyName === "transform") openOnce();
    };
    avatar.addEventListener("transitionend", onTransitionEnd);
    const fallbackId = setTimeout(openOnce, 400);
    return () => {
      // Programmatic teardown: set `cleanup` BEFORE destroying so neither engine's
      // onDestroyed launches a tour or logs a Completed/Dismissed event.
      cleanup = true;
      avatar.removeEventListener("transitionend", onTransitionEnd);
      clearTimeout(fallbackId);
      intro?.destroy();
      tourEngine?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.showHazbotFeedback]);

  const handleClick = () => {
    ui.showHazbotFeedback = true;          // the effect above renders the panel off this flag
    // Acknowledge the run — stop pulsing until the next run completes.
    ui.hazbotPulseArmed = false;
    // Log the request with the matched category, consistent with the other bottom-bar
    // *ButtonClicked events. NOTE: log() routes EVERY event through engine.consume()
    // (log.ts), so HazbotButtonClicked must stay a deliberate no-op in translate.ts —
    // otherwise the click would mutate the matched category it just reported. We read
    // matchedCategory BEFORE log() so the payload reflects pre-click state.
    const engine = getAnalysisEngine();
    const { best, current, used } = readCategories(engine);
    // matchedCategory keeps meaning `best`, so the longitudinal series is unbroken;
    // categoryUsed is the category the student was actually shown.
    log("HazbotButtonClicked", { matchedCategory: best, categoryUsed: used, categoryCurrent: current });
  };

  // Wrapper state classes: `ready` (pulse halo), `coached` (intro enlarged-robot,
  // intro only), `noHazbot` (faded button while the tour runs). coached and noHazbot
  // are mutually exclusive — see the effect.
  const wrapClassName = [
    css.hazbotButtonWrap,
    pulsing ? css.ready : "",
    (ui.showHazbotFeedback && !tourActive) ? css.coached : "",
    tourActive ? css.noHazbot : "",
  ].filter(Boolean).join(" ");

  return (
    // The `ready` class on the wrapper gates the pulse — a box-shadow halo on the
    // button, matching the behavior + width of the MODA "Update Code" button's
    // pulse-shadow (question-interactives/packages/agent-simulation).
    <div
      className={wrapClassName}
      data-testid="hazbot-button-wrap"
    >
      <Button
        ref={buttonRef}
        className={css.hazbotButton}
        data-testid="hazbot-button"
        onClick={handleClick}
        // Don't take focus on mouse press: when the coach mark closes the library
        // restores focus to whatever was focused on open, and a focused button
        // would show its focus-visible ring. preventDefault on mousedown blocks the
        // focus-on-click without blocking the click itself (onClick still fires) or
        // keyboard focus/activation.
        onMouseDown={(e) => e.preventDefault()}
        disableRipple={true}
        disableTouchRipple={true}
      >
        <span className={css.inner}>
          <span className={css.avatar} ref={avatarRef}>
            <HazbotBack data-testid="hazbot-back" />
            {blink
              ? <HazbotBlinks data-testid="hazbot-blinks" />
              : <HazbotEyes data-testid="hazbot-eyes" />}
          </span>
          <span className={css.label}>Hazbot<br />Analysis</span>
        </span>
      </Button>
    </div>
  );
});
