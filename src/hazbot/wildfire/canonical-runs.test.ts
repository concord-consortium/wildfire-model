import { canonicalRunReadings } from "./canonical-runs";
import { WildfireReading } from "./types";

let seq = 0;
function mkRead(triggeredBy: string, opts: Partial<WildfireReading> = {}): WildfireReading {
  // Distinct `at` per reading keeps chronological identity readable in failures.
  return { triggeredBy, sessionId: "test", at: seq++, temporalHistory: [], ...opts };
}
const started = (opts?: Partial<WildfireReading>) => mkRead("SimulationStarted", opts);
const stopped = () => mkRead("SimulationStopped");
const ended = () => mkRead("SimulationEnded");

describe("canonicalRunReadings", () => {
  it("returns [] for no readings", () => {
    expect(canonicalRunReadings([])).toEqual([]);
  });

  it("counts a single fresh run as one", () => {
    expect(canonicalRunReadings([started()])).toHaveLength(1);
  });

  it("ignores non-run readings between starts", () => {
    const a = started();
    const c = started();
    // ChartTabShown does not bound a run, so a and c remain two separate fresh runs.
    expect(canonicalRunReadings([a, mkRead("ChartTabShown"), c])).toEqual([a, c]);
  });

  describe("pause / resume collapses to one run (the bug)", () => {
    it("start, stop, start records ONE run, not two", () => {
      const runs = canonicalRunReadings([started(), stopped(), started()]);
      expect(runs).toHaveLength(1);
    });

    it("start, (stop, start) x3 records ONE run (Sam's four-start example)", () => {
      const runs = canonicalRunReadings([
        started(),
        stopped(), started(),
        stopped(), started(),
        stopped(), started(),
      ]);
      expect(runs).toHaveLength(1);
    });

    it("the representative keeps the FIRST start's setup (zones/sparks/wind fixed across resume)", () => {
      const first = started({
        zones: [{ index: 0, droughtLevel: "Mild" }],
        sparks: [{ x: 1, y: 2, zoneIdx: 0 }],
        wind: { speed: 5, direction: 90 },
      });
      const resume = started({
        // A resume payload would in practice repeat the fixed setup; even if it
        // somehow differed, the canonical run must reflect the original setup.
        zones: [{ index: 0, droughtLevel: "Severe" }],
        wind: { speed: 99, direction: 0 },
      });
      const [run] = canonicalRunReadings([first, stopped(), resume]);
      expect(run.zones).toEqual([{ index: 0, droughtLevel: "Mild" }]);
      expect(run.sparks).toEqual([{ x: 1, y: 2, zoneIdx: 0 }]);
      expect(run.wind).toEqual({ speed: 5, direction: 90 });
    });
  });

  describe("genuine run boundaries stay separate", () => {
    it("start, ended, start records TWO runs", () => {
      expect(canonicalRunReadings([started(), ended(), started()])).toHaveLength(2);
    });

    it("restart while paused (start, stop, ended, start) records TWO runs", () => {
      // Restart logs SimulationEnded before its reset event, so the SimulationEnded
      // reading is the boundary and the next start is fresh.
      expect(canonicalRunReadings([started(), stopped(), ended(), started()])).toHaveLength(2);
    });

    it("two back-to-back fresh starts (no pause between) are two runs", () => {
      const a = started();
      const b = started();
      expect(canonicalRunReadings([a, b])).toEqual([a, b]);
    });
  });

  describe("non-resumed pause", () => {
    it("start, stop (never resumed) is still ONE run", () => {
      const a = started();
      expect(canonicalRunReadings([a, stopped()])).toEqual([a]);
    });

    it("a stop with no preceding start does not crash or invent a run", () => {
      expect(canonicalRunReadings([stopped(), started()])).toHaveLength(1);
    });
  });

  describe("tool data merges forward onto the canonical run", () => {
    it("a fire line drawn while paused is carried onto the run", () => {
      const first = started({ fireLineMarkers: [] });
      const resume = started({ fireLineMarkers: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.2 }] });
      const [run] = canonicalRunReadings([first, stopped(), resume]);
      expect(run.fireLineMarkers).toHaveLength(2);
    });

    it("keeps the fuller marker snapshot if a later resume somehow has fewer", () => {
      const first = started({ fireLineMarkers: [{ x: 0, y: 0 }, { x: 1, y: 0 }] });
      const resume = started({ fireLineMarkers: [] });
      const [run] = canonicalRunReadings([first, stopped(), resume]);
      expect(run.fireLineMarkers).toHaveLength(2);
    });

    it("a helitack dropped after resuming flags the canonical run", () => {
      const first = started();
      const resume = started({ helitack: true }); // Helitack modifier flagged the resume reading
      const [run] = canonicalRunReadings([first, stopped(), resume]);
      expect(run.helitack).toBe(true);
    });

    it("helitack from any segment of a multi-pause run survives the fold", () => {
      const runs = canonicalRunReadings([
        started(),
        stopped(), started({ helitack: true }),
        stopped(), started(),
      ]);
      expect(runs).toHaveLength(1);
      expect(runs[0].helitack).toBe(true);
    });

    it("does not mutate the input readings while merging", () => {
      const first = started({ fireLineMarkers: [], helitack: undefined });
      const resume = started({ fireLineMarkers: [{ x: 0, y: 0 }, { x: 1, y: 0 }], helitack: true });
      canonicalRunReadings([first, stopped(), resume]);
      expect(first.fireLineMarkers).toEqual([]);
      expect(first.helitack).toBeUndefined();
    });
  });

  it("preserves object identity for runs that never resume (stable witness rows)", () => {
    const a = started();
    const b = started();
    const runs = canonicalRunReadings([a, ended(), b]);
    expect(runs[0]).toBe(a);
    expect(runs[1]).toBe(b);
  });
});
