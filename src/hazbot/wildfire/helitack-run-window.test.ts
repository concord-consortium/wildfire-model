// Event-driven substrate coverage for helitack run-window detection (WM-28 R7,
// surface 2). Unlike the per-category reachability tests in
// rule-sets/{45,47,54}.test.ts (which construct readings directly), these feed
// event sequences through `engine.consume` so attribution is *produced* by the
// translate-modifier path, then read back `engine.readings` and the real
// Helitack / usedHelitack impls. This file is the authoritative guard for the
// R2 exclusions, the three no-op-terminator window closes (not UI-reachable, so
// not in the R8 Playwright walk), and cross-run non-stickiness.

import { ruleSet45 } from "../rule-sets/45";
import { makeWildfireEngine } from "../rule-sets/test-helpers";
import { factorVariables } from "./factor-variables";
import { simProps } from "./sim-props";
import { ConsumedEvent } from "../engine";
import { WildfireDefaults } from "./types";

// Minimal defaults — these substrate tests assert on reading flags and the
// Helitack / usedHelitack impls (neither consumes `defaults`), not on DefaultVars
// classification, so the values need only let ruleSet45 load active.
const defaults: WildfireDefaults = {
  zones: [{ vegetation: "Shrub", droughtLevel: "No Drought" }],
  wind: { speed: 20, direction: 100 },
};

const start = (at: number): ConsumedEvent => ({ name: "SimulationStarted", at, data: {} });
const helitack = (at: number): ConsumedEvent => ({ name: "Helitack", at });
const ended = (at: number): ConsumedEvent => ({ name: "SimulationEnded", at });
const stopped = (at: number): ConsumedEvent => ({ name: "SimulationStopped", at });

function feed(events: ConsumedEvent[]) {
  const e = makeWildfireEngine(ruleSet45, defaults);
  for (const ev of events) e.consume(ev);
  return e;
}

const runStartReadings = (e: ReturnType<typeof feed>) =>
  e.readings.filter((r) => r.triggeredBy === "SimulationStarted");

describe("helitack run-window detection — event-driven substrate", () => {
  it("positive (R1/R3/R4): SimulationStarted → Helitack flags the run-start reading", () => {
    const e = feed([start(100), helitack(110)]);
    expect(e.readings).toHaveLength(1);
    expect(e.readings[0].triggeredBy).toBe("SimulationStarted");
    expect(e.readings[0].helitack).toBe(true);
    expect(simProps.Helitack.evaluate(e.readings[0], defaults)).toBe(true);
    expect(factorVariables.usedHelitack.compute(e.readings, defaults).value).toBe(true);
  });

  describe("R2 exclusions", () => {
    it("a pre-run helitack (before any SimulationStarted) is excluded", () => {
      const e = feed([helitack(50), start(100)]);
      const [runStart] = runStartReadings(e);
      expect(runStart.helitack).toBeUndefined();
      expect(simProps.Helitack.evaluate(runStart, defaults)).toBe(false);
      expect(factorVariables.usedHelitack.compute(e.readings, defaults).value).toBe(false);
    });

    it.each([
      ["SimulationEnded", ended],
      ["SimulationStopped", stopped],
    ])("a between-runs helitack after %s (reading-pushing terminator) is excluded — the modifier declines", (_name, term) => {
      const e = feed([start(100), term(200), helitack(210)]);
      // The Helitack modifier declines: lastReading is the terminating reading,
      // not an open run-start, so neither reading is flagged.
      const [runStart] = runStartReadings(e);
      expect(runStart.helitack).toBeUndefined();
      const terminating = e.readings[e.readings.length - 1];
      expect(terminating.helitack).toBeUndefined();
      expect(simProps.Helitack.evaluate(runStart, defaults)).toBe(false);
      expect(factorVariables.usedHelitack.compute(e.readings, defaults).value).toBe(false);
    });

    it.each(["SimulationRestarted", "SimulationReloaded", "TopBarReloadButtonClicked"])(
      "a between-runs helitack after the no-op terminator %s (no preceding SimulationEnded) is excluded via runWindowClosed",
      (terminator) => {
        // The no-op terminator pushes no reading, so the prior run-start stays the
        // engine's last reading; the terminator's modifier sets runWindowClosed on
        // it, so the following Helitack modifier declines (R7 no-op-terminator case).
        const e = feed([start(100), { name: terminator, at: 200 }, helitack(210)]);
        const [runStart] = runStartReadings(e);
        expect(runStart.runWindowClosed).toBe(true);
        expect(runStart.helitack).toBeUndefined();
        expect(factorVariables.usedHelitack.compute(e.readings, defaults).value).toBe(false);
      },
    );
  });

  it("cross-run non-stickiness: a helitack in run A does not flag run B's run-start reading", () => {
    const e = feed([start(100), helitack(110), ended(200), start(300)]);
    const [runA, runB] = runStartReadings(e);
    expect(runA.helitack).toBe(true);
    expect(runB.helitack).toBeUndefined();
    expect(simProps.Helitack.evaluate(runB, defaults)).toBe(false);
  });
});
