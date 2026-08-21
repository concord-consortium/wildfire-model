import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "mobx-react";
import { act } from "react-dom/test-utils";
import { Vector2 } from "three";
import { createStores } from "../../models/stores";
import { BottomBar } from "../../components/bottom-bar";
import { ruleSets } from "../rule-sets";
import { makeWildfireEngine, matchAgainst } from "../rule-sets/test-helpers";
import { deriveWildfireDefaults } from "./derive-defaults";
import { translate } from "./translate";
import { WildfireReading } from "./types";
import { Vegetation } from "../../types";

// R12. Pins the reading-side zone labels end to end: the real BottomBar payload,
// through the real translate, into the real engine, against defaults derived from
// the SAME config object that produced the payload.
//
// The failure this exists to catch is divergent label formatting between
// bottom-bar.tsx (which builds SimulationStarted.zones from vegetationLabels /
// terrainLabels / droughtLabels) and derive-defaults.ts (which builds the defaults
// from the same maps). Because anyZoneDiffers reports a difference on ANY unequal
// string, a mismatch makes VegetationSet / DroughtLevelSet permanently TRUE rather
// than false, scoring a student who touched nothing as having changed everything.
//
// Only the untouched-run assertion catches that. A test that changes a zone and
// expects a high category passes just as happily under the broken case, which is
// why the first `it` below is the load-bearing one and must not be deleted as
// redundant.

const mockLog = jest.fn();
jest.mock("../../log", () => ({
  log: (...args: unknown[]) => mockLog(...args)
}));

// Drive the real UI to Start and hand back the SimulationStarted payload the app
// actually logged, plus the config object that produced it.
async function runAndCaptureReading(mutate?: (stores: ReturnType<typeof createStores>) => void) {
  const stores = createStores();
  // Stub start() so clicking Start still builds and logs the real payload without
  // creating the fire engine, which needs loaded cells this harness has none of.
  jest.spyOn(stores.simulation, "start").mockImplementation(() => { /* noop */ });
  act(() => {
    stores.simulation.dataReady = true;
    stores.simulation.sparks.push(new Vector2(50000, 50000));
    mutate?.(stores);
  });
  render(
    <Provider stores={stores}>
      <BottomBar />
    </Provider>
  );
  await userEvent.click(screen.getByTestId("start-button"));

  const call = mockLog.mock.calls.find((c: unknown[]) => c[0] === "SimulationStarted");
  expect(call).toBeDefined();
  const result = translate({ name: "SimulationStarted", data: call![1], at: 100 }, "test");
  const reading = (result as { reading: WildfireReading }).reading;
  return { reading, config: stores.simulation.config };
}

describe("reading-side zone labels agree with derived defaults", () => {
  beforeEach(() => mockLog.mockClear());

  it("a run with nothing touched matches category 2, not a higher one", async () => {
    const { reading, config } = await runAndCaptureReading();
    const defaults = deriveWildfireDefaults(config);
    const e = makeWildfireEngine(ruleSets["34"], defaults);
    // Category 2 is `NOT VegetationSet AND NOT (WindSet OR DroughtLevelSet)`. If the
    // two label maps ever diverge, every zone reads as changed and this lands on 4 or 5.
    expect(matchAgainst(ruleSets["34"], e, [reading])).toBe(2);
  });

  it("a run with one zone's vegetation changed matches category 4", async () => {
    const { reading, config } = await runAndCaptureReading((stores) => {
      // Zone 0 defaults to Forest in this preset, so Grass is a real change.
      stores.simulation.zones[0].vegetation = Vegetation.Grass;
    });
    const defaults = deriveWildfireDefaults(config);
    const e = makeWildfireEngine(ruleSets["34"], defaults);
    expect(matchAgainst(ruleSets["34"], e, [reading])).toBe(4);
  });

  it("the payload's zone labels are string-equal to the derived defaults, field by field", async () => {
    // States the invariant directly, so a failure names the mismatching field rather
    // than only reporting a surprising category number.
    const { reading, config } = await runAndCaptureReading();
    const defaults = deriveWildfireDefaults(config);
    reading.zones?.forEach((z, i) => {
      expect(z.vegetation).toBe(defaults.zones?.[i]?.vegetation);
      expect(z.terrainType).toBe(defaults.zones?.[i]?.terrainType);
      expect(z.droughtLevel).toBe(defaults.zones?.[i]?.droughtLevel);
    });
  });
});
