import { WildfireReading } from "./types";

// Folds the raw reading stream into one representative reading per *canonical*
// simulation run, collapsing pause/resume cycles into a single run.
//
// Background (Sam, 6/4/26 "Validation and more thoughts", point 1): a run that
// is paused — SimulationStopped, emitted by the Stop *and* the Fire Line button
// (bottom-bar.tsx handleStart / handleFireLine) — and then resumed by a later
// SimulationStarted currently produces two SimulationStarted readings, so
// `simulationRuns` over-counts. The disambiguating events already exist in the
// log; this fold is the missing *interpretation* layer, expressed purely over
// the logged readings so it works equally on live and replayed logs.
//
// Run-boundary model (Sam's definition):
//   - A run begins at a SimulationStarted that is not a resume.
//   - A SimulationStarted is a RESUME of the open run iff the most recent
//     terminal reading since that run's latest start was a SimulationStopped
//     (a pause) with no SimulationEnded in between.
//   - SimulationEnded is a definitive end. Restart / Reload / TopBarReload all
//     log SimulationEnded *before* their reset event (bottom-bar.tsx:259/274,
//     top-bar.tsx:21), so a reset surfaces here as an "ended" boundary and the
//     next start is fresh.
//   - A SimulationStopped that is never resumed is itself the end of its run;
//     the run is still counted (its representative is the open run's base).
//
// On resume the zone parameters, sparks, and wind are fixed (the model does not
// let you change them mid-run), but tool use can change: a fire line drawn while
// paused rides in on the resume's SimulationStarted payload, and a helitack
// dropped after resuming is flagged on the resume reading by the Helitack
// modifier. So the representative keeps the *first* start's setup but carries the
// *merged* tool data across the run.

export function canonicalRunReadings(readings: WildfireReading[]): WildfireReading[] {
  const runs: WildfireReading[] = [];
  // The representative reading for the run currently being accumulated, or null
  // before the first start.
  let current: WildfireReading | null = null;
  // Terminal seen since the current run's latest start: "stopped" = pause
  // (resumable), "ended" = definitive end (next start is fresh), null = running.
  let lastTerminal: "stopped" | "ended" | null = null;

  for (const r of readings) {
    switch (r.triggeredBy) {
      case "SimulationStarted": {
        const isResume = current !== null && lastTerminal === "stopped";
        if (isResume && current) {
          current = foldResume(current, r);
          runs[runs.length - 1] = current; // replace the run's rep with the merged one
        } else {
          current = r;
          runs.push(r);
        }
        lastTerminal = null; // running again
        break;
      }
      case "SimulationStopped":
        // A pause is only meaningful while running; ignore a stray stop after a
        // definitive end.
        if (lastTerminal === null) lastTerminal = "stopped";
        break;
      case "SimulationEnded":
        lastTerminal = "ended";
        break;
      default:
        // Non-run readings (e.g. ChartTabShown) don't bound runs. Helitack is a
        // modifier, not a reading, so it never appears here.
        break;
    }
  }
  return runs;
}

// Merge a resume start into the run representative. Setup fields (zones, sparks,
// wind, elevation) stay from `base` (the first start of the run); tool data is
// merged forward — the fuller fireLineMarkers snapshot wins and helitack ORs to
// true — so a fire line drawn while paused or a helitack dropped after resuming
// is attributed to the single canonical run. Returns a shallow clone so the
// input readings array is never mutated; the clone keeps `base.at`, so the sidebar
// can still resolve a stable "Matched on reading #N" index for the folded run by
// timestamp even though the clone is not an element of engine.readings (see
// readingIndexOf in engine/evaluator.ts).
function foldResume(base: WildfireReading, resume: WildfireReading): WildfireReading {
  const baseMarkers = base.fireLineMarkers?.length ?? 0;
  const resumeMarkers = resume.fireLineMarkers?.length ?? 0;
  return {
    ...base,
    fireLineMarkers: resumeMarkers > baseMarkers ? resume.fireLineMarkers : base.fireLineMarkers,
    helitack: base.helitack || resume.helitack || undefined,
  };
}
