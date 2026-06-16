import React, { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import Button from "@mui/material/Button";
import { useStores } from "../use-stores";
import { log } from "../log";
import { getAnalysisEngine } from "../hazbot/wildfire";
import { computeMatchedCategoryForEngine } from "../hazbot/engine";
import HazbotBack from "../assets/bottom-bar/hazbot-back.svg";
import HazbotEyes from "../assets/bottom-bar/hazbot-eyes.svg";
import HazbotBlinks from "../assets/bottom-bar/hazbot-blinks.svg";

import css from "./hazbot-button.scss";

// WM-6 Hazbot Analysis button. Presentational `observer` child of the class
// BottomBar. It does NOT consume useAnalysisEngine(); its only engine touch is
// the pure computeMatchedCategoryForEngine() call at click time for the log
// payload. Run-state + the pulse flag come from useStores(); the AP-79 layered
// avatar (Back + Eyes/Blinks) drives the random blink.
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

  const handleClick = () => {
    // Sibling-panel contract (WM-11 reads this); WM-6 does not render the panel.
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
    <div className={`${css.hazbotButtonWrap} ${pulsing ? css.ready : ""}`} data-testid="hazbot-button-wrap">
      <Button
        className={css.hazbotButton}
        data-testid="hazbot-button"
        onClick={handleClick}
        disableRipple={true}
        disableTouchRipple={true}
      >
        <span className={css.inner}>
          <span className={css.avatar}>
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
