import { WindowSelection } from "../engine";
import { canonicalRunStartIndices } from "./canonical-runs";
import { WildfireReading } from "./types";

// Index of the first reading belonging to the `rangeCc`-th canonical run from the end,
// or 0 when the session holds fewer runs than that (evaluate over the runs that exist
// rather than treating a short session as insufficient data).
//
// Reads the index straight off the canonical-run walk rather than recovering it from a
// run object; see canonicalRunStartIndices for why neither recovery route is sound.
export function canonicalRunWindowStart(readings: WildfireReading[], rangeCc: number): number {
  if (rangeCc <= 0) return 0;
  return windowStart(canonicalRunStartIndices(readings), rangeCc);
}

function windowStart(starts: number[], rangeCc: number): number {
  return starts.length <= rangeCc ? 0 : starts[starts.length - rangeCc];
}

// Builds the EngineOpts.readingsWindow selector. `rangeCcFn` is a thunk because the
// derivation reads engine.parsedExpressions, which does not exist until the Engine
// constructor has returned (see engine-singleton.ts).
//
// The newest canonical run counts even when it has not finished: the canonical-run walk
// opens a run at its SimulationStarted and applies no completeness test, so a student
// who pauses mid-run and asks for analysis is told about the run they are watching.
export function makeReadingsWindow(
  rangeCcFn: () => number,
): (readings: WildfireReading[]) => WindowSelection<WildfireReading> | null {
  return (readings) => {
    const rangeCc = rangeCcFn();
    // range_cc 0 means `current` is undefined for this activity, and null is how the
    // substrate is told so. It has to be decided here rather than by declining to
    // install the selector, because rangeCcFn cannot be called until the Engine
    // constructor has returned. Returning an EMPTY window instead would evaluate the
    // empty-prefix state, which matches `NOT ranSimulation` on every tab, so a
    // `current ?? best` consumer would tell a student who has run the model twice to
    // scroll up and run it.
    if (rangeCc === 0) return null;
    const starts = canonicalRunStartIndices(readings);
    return {
      readings: readings.slice(windowStart(starts, rangeCc)),
      // e.g. "range_cc 2 · 2 of 3 runs". The trim keeps exactly the last
      // min(rangeCc, total) runs, so the number a walker cannot otherwise recover is
      // the TOTAL, which says how many runs the window is ignoring.
      label: `range_cc ${rangeCc} · ${Math.min(rangeCc, starts.length)} of ${starts.length} runs`,
    };
  };
}
