import React, { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import Button from "@mui/material/Button";
import { useStores } from "../use-stores";
import { log } from "../log";
import { getAnalysisEngine } from "../hazbot/wildfire";
import { computeMatchedCategoryForEngine } from "../hazbot/engine";
import { createCoachmarksEngine } from "@concord-consortium/coachmarks";
import HazbotBack from "../assets/bottom-bar/hazbot-back.svg";
import HazbotEyes from "../assets/bottom-bar/hazbot-eyes.svg";
import HazbotBlinks from "../assets/bottom-bar/hazbot-blinks.svg";

import "@concord-consortium/coachmarks/styles/hazbot";
import css from "./hazbot-button.scss";

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
// matched category. It reads the analysis engine directly via getAnalysisEngine() +
// computeMatchedCategoryForEngine() — a pure read at click/open time — rather than
// the reactive useAnalysisEngine() hook, since the matched category is only needed
// at those moments, not live while the popover is open. Run-state + the pulse flag
// come from useStores(); the layered avatar (Back + Eyes/Blinks) drives the random
// blink.
export const HazbotButton = observer(function HazbotButton() {
  const { ui, simulation } = useStores();

  // Random blink (AP-79). Local presentation state only — no store/engine coupling.
  // Recursive setTimeout cycle; the mounted ref hardens the board sketch so no
  // setBlink fires after unmount.
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
          setBlink(false);                 // eyes open
          timeout = setTimeout(loop, 80);  // small pause, then restart
        }, 180);
      }, 1000 + Math.random() * 2500);     // random idle before next blink
    };
    loop();
    return () => { mounted.current = false; clearTimeout(timeout); };
  }, []);

  // Ready/pulse predicate. The simulationStarted term keeps the pulse off in the
  // pre-run / terrain-setup state and auto-hides a stale arm after Restart/Reload
  // (both clear simulationStarted without routing through start()).
  const pulsing =
    ui.hazbotPulseArmed && simulation.simulationStarted && !simulation.simulationRunning;

  // Coach-mark feedback panel. When ui.showHazbotFeedback flips true, open the
  // styled `hazbot`-theme coach mark anchored to the robot face (avatarRef → popover
  // centered over it, arrow pointing at it). The matched category's feedback is
  // parsed into the popover body (leading "Hazbot:" stripped) and the action-button
  // label (the trailing bracket token → doneBtnText), shown alongside the close (×)
  // button. Every dismiss route (action button → onDestroyed; ×/Escape →
  // onCancelRequested → destroy() → onDestroyed) resets ui.showHazbotFeedback, so a
  // re-click reopens with the then-current category. `ringElement` targets the outer
  // button for the optional outline ring (disabled here via showOutlineRing: false).
  const avatarRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!ui.showHazbotFeedback || !avatarRef.current) return;
    const engine = getAnalysisEngine();
    const matched = engine ? computeMatchedCategoryForEngine(engine) : null;
    const feedback =
      engine?.ruleSet?.categories.find((c) => c.id === matched)?.feedback ?? "";
    if (!feedback) {
      // Nothing to show (no engine / no matched category / empty feedback). Clear
      // the flag so the button doesn't stay stuck in its "Large" coached state and
      // a later click can re-trigger the effect.
      ui.showHazbotFeedback = false;
      return;
    }
    const { body, label } = parseFeedback(feedback);
    const avatar = avatarRef.current;
    let destroyed = false;
    let cm: ReturnType<typeof createCoachmarksEngine> | null = null;
    const open = () => {
      if (destroyed) return;
      cm = createCoachmarksEngine({
        showButtons: ["next", "close"],
        doneBtnText: label || undefined, // single-step highlight renders doneBtnText
        showOutlineRing: false, // no outline ring on this panel
        popoverOffset: 25, // raise the popover for a gap between the arrow tip and the robot
        // Arrow geometry per the Hazbot coach-mark design; strokeWidth 3 matches the
        // hazbot theme's 3px popover border.
        arrow: { width: 36, height: 18, strokeWidth: 3 },
        onCancelRequested: () => { if (!destroyed) cm?.destroy(); },
        onDestroyed: () => { destroyed = true; ui.showHazbotFeedback = false; },
      });
      cm.highlight({
        element: avatar,                          // anchor: popover centered over the robot
        ringElement: buttonRef.current ?? undefined, // ring target (inert; ring disabled)
        popover: { side: "top", align: "center", description: body },
      });
    };
    // Open AFTER the `.coached` scale-up transition settles: a CSS transform does
    // not fire floating-ui's ResizeObserver, so opening mid-grow would anchor to
    // the un-scaled robot. Wait for the avatar's transform transitionend (fallback
    // timeout in case it doesn't fire) so the popover offsets by the enlarged size.
    let opened = false;
    const openOnce = () => {
      if (opened) return; // whichever trigger fires first wins; the other no-ops
      opened = true;
      open();
    };
    const onTransitionEnd = (e: TransitionEvent) => {
      if (e.propertyName === "transform") openOnce();
    };
    avatar.addEventListener("transitionend", onTransitionEnd);
    const fallbackId = setTimeout(openOnce, 400);
    return () => {
      destroyed = true;
      avatar.removeEventListener("transitionend", onTransitionEnd);
      clearTimeout(fallbackId);
      cm?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.showHazbotFeedback]);

  const handleClick = () => {
    // Open the feedback panel (the effect above renders it off this flag).
    ui.showHazbotFeedback = true;
    // Acknowledge the run — stop pulsing until the next run completes.
    ui.hazbotPulseArmed = false;
    // Log the request with the matched category, consistent with the other
    // bottom-bar *ButtonClicked events. Pure engine read (no hook/provider).
    // computeMatchedCategoryForEngine returns number | null; carry null explicitly.
    // NOTE: log() routes EVERY event through engine.consume() (log.ts). This event
    // reaches the engine like any other, but is a deliberate no-op via translate()'s
    // `default` branch — it must stay unhandled in translate.ts, otherwise the click
    // would mutate the matched category it just reported. We read matchedCategory
    // BEFORE log() regardless, so the payload reflects pre-click state.
    const engine = getAnalysisEngine();
    const matchedCategory = engine ? computeMatchedCategoryForEngine(engine) : null;
    log("HazbotButtonClicked", { matchedCategory });
  };

  return (
    // The `ready` class on the wrapper gates the pulse — a box-shadow halo on the
    // button, matching the behavior + width of the MODA "Update Code" button's
    // pulse-shadow (question-interactives/packages/agent-simulation).
    <div
      className={`${css.hazbotButtonWrap} ${pulsing ? css.ready : ""} ${ui.showHazbotFeedback ? css.coached : ""}`}
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
            <HazbotBack />
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
