import { EngineStep } from "@concord-consortium/coachmarks";
import { AnchorTestId } from "./anchor-testids";
import { SimulationModel } from "../../models/simulation";

// What "already satisfied" means, per anchor. Each predicate references the getter that
// owns that control's enabled state rather than re-deriving it, so there is one source of
// truth. NOT the rendered `disabled` attribute: `clear-all-button` is disabled by
// `ui.showTerrainUI` too (bottom-bar.tsx), and a control the Setup panel is suppressing is
// not a step the student has done. An anchor with no entry here is never dropped.
//
// The app and the coachmarks package deliberately ask different questions. This map
// reads model state, so it answers "has the student already done this?" and the step is
// dropped before the tour is built. The package reads the anchor's rendered `disabled`
// state, so it answers "can this be done right now?" and offers Continue instead of
// blocking. A Clear All step that is only momentarily disabled therefore stays in the
// tour with a way past it, rather than being skipped as already satisfied.
export const SATISFIED_BY: Partial<Record<AnchorTestId, (sim: SimulationModel) => boolean>> = {
  "restart-button": (sim) => !sim.restartEnabled,      // nothing to restart
  "clear-all-button": (sim) => !sim.reloadEnabled,     // nothing to clear
};

// Drop leading gated steps the student has already satisfied, so a re-opened tour starts at
// the first step they have NOT done. Every tour opens with "First, Restart your model" or
// "First, click Clear All to reset your model", and both controls disable themselves once
// used, so a tour rebuilt from index 0 would gate on a dead button.
//
// Two guards, each owning a different rule:
//  - `i < steps.length - 1` is the collapse-to-zero guarantee. The terminal step is never
//    dropped, so a tour always has something to show.
//  - `!step.advanceOn` restricts dropping to click-gated steps. An ungated step (a viewport
//    bubble) is not something the student can satisfy, so it is never treated as satisfied.

export function dropSatisfiedLeadingSteps(
  steps: EngineStep[], simulation: SimulationModel,
): EngineStep[] {
  let i = 0;
  while (i < steps.length - 1) {
    const step = steps[i] as { target?: string; advanceOn?: unknown };
    if (!step.target || !step.advanceOn) break;
    const testid = step.target.match(/^\[data-testid="(.+)"\]$/)?.[1] as AnchorTestId | undefined;
    const satisfied = testid && SATISFIED_BY[testid];
    if (!satisfied?.(simulation)) break;
    i++;
  }
  return i === 0 ? steps : steps.slice(i);
}
