import { Vector2 } from "three";
import { SimulationModel, SPEEDS, DEFAULT_SPEED_INDEX, computeTimeStep } from "./simulation";
import { FireEngine } from "./engine/fire-engine";
import { Cell } from "./cell";
import { Zone } from "./zone";
import { getDefaultConfig } from "../config";

const FRAME_MIN = 16.7 / 60000;   // one 60 FPS frame, in minutes
const SLOW_RATIO = SPEEDS[0].multiplier / SPEEDS[1].multiplier;
const FAST_RATIO = SPEEDS[2].multiplier / SPEEDS[1].multiplier;

const newSim = async () => {
  const sim = new SimulationModel({
    modelWidth: 100000, modelHeight: 100000, gridWidth: 5,
    sparks: [[50000, 50000]], zoneIndex: [[0]], elevation: [[0]],
    unburntIslands: [[0]], riverData: null
  });
  await sim.dataReadyPromise;
  return sim;
};

describe("model speed", () => {
  // Everything else in this file derives its expectations from SPEEDS, which keeps the
  // suite retune-proof but also blind to a retune: reverting the array would leave the
  // rest of these tests green. This is the one assertion that pins what actually ships.
  //
  // Both halves of each pair are deliberate and neither may drift on its own. The
  // multipliers are Trudi's, and the labels are hers too: the outer ticks run at a
  // quarter and four times the authored pace while still reading "0.5x" and "2x",
  // because a student only needs to know they picked slower or faster.
  it("ships 0.25 / 1 / 4 behind the drawn labels 0.5x / 1x / 2x", () => {
    expect(SPEEDS).toEqual([
      { multiplier: 0.25, label: "0.5x" },
      { multiplier: 1, label: "1x" },
      { multiplier: 4, label: "2x" }
    ]);
    expect(SPEEDS[DEFAULT_SPEED_INDEX].label).toBe("1x");
  });

  it("scales the per-frame timestep by exactly the multiplier at 60 FPS", () => {
    const config = getDefaultConfig();
    const [slow, normal, fast] = SPEEDS.map(s => computeTimeStep(config, s.multiplier, FRAME_MIN));
    expect(slow / normal).toBeCloseTo(SLOW_RATIO, 10);
    expect(fast / normal).toBeCloseTo(FAST_RATIO, 10);
  });

  // The three-term Math.min invites the reading that a slow frame collapses the
  // speeds together. It does not: optimalTimeStep * 4 scales with the multiplier,
  // so it is the binding term at the same frame time for all three.
  it("keeps the speeds proportional on a frame slow enough to engage the clamp", () => {
    const config = getDefaultConfig();
    const slowFrame = 100 / 60000;
    const [slow, normal, fast] = SPEEDS.map(s => computeTimeStep(config, s.multiplier, slowFrame));
    expect(normal).toBeLessThan(86400 / config.modelDayInSeconds * slowFrame);   // the clamp is engaged
    expect(slow / normal).toBeCloseTo(SLOW_RATIO, 10);
    expect(fast / normal).toBeCloseTo(FAST_RATIO, 10);
  });

  it("keeps the selected speed across restart() and resets it on reload()", async () => {
    const sim = await newSim();
    sim.setSpeedIndex(0);
    sim.start();
    sim.tick(5);

    sim.restart();
    expect(sim.speedIndex).toBe(0);

    sim.setSpeedIndex(2);
    sim.reload();
    expect(sim.speedIndex).toBe(DEFAULT_SPEED_INDEX);
    expect(sim.speedMultiplier).toBe(1);
  });

  it("clamps an out-of-range index to the nearest tick", async () => {
    const sim = await newSim();

    sim.setSpeedIndex(SPEEDS.length);
    expect(sim.speedIndex).toBe(SPEEDS.length - 1);
    expect(sim.speedMultiplier).toBe(SPEEDS[SPEEDS.length - 1].multiplier);

    sim.setSpeedIndex(-1);
    expect(sim.speedIndex).toBe(0);
    expect(sim.speedMultiplier).toBe(SPEEDS[0].multiplier);
  });

  // NaN is the one value Math.min and Math.max propagate rather than order, so it
  // is the one an ordering clamp cannot fold. Stored, it would make every read of
  // speedMultiplier throw, which is the failure the clamp exists to prevent.
  it("rejects NaN rather than storing it", async () => {
    const sim = await newSim();
    sim.setSpeedIndex(2);

    sim.setSpeedIndex(NaN);
    expect(sim.speedIndex).toBe(2);
    expect(sim.speedMultiplier).toBe(SPEEDS[2].multiplier);
  });

  // A faster clock is only safe while one tick cannot carry the model across a
  // whole model day: the engine's per-day roll fires once per *observed* change of
  // Math.floor(time / 1440), so a skipped day is a skipped roll. maxTimeStep and
  // the 1440-minute day live in different files with nothing stating that one
  // bounds the other. Naming neither constant here is the point: raising
  // maxTimeStep past a model day fails this on its own.
  it("never advances the engine's day by more than one per tick, even at maxTimeStep", () => {
    const { maxTimeStep } = getDefaultConfig();
    const config = {
      cellSize: 20000, gridWidth: 5, gridHeight: 5, minCellBurnTime: 200,
      neighborsDist: 2.5, fireSurvivalProbability: 1
    };
    const zone = new Zone({});
    const cells: Cell[] = [];
    for (let x = 0; x < config.gridWidth; x++) {
      for (let y = 0; y < config.gridHeight; y++) cells.push(new Cell({ x, y, zone }));
    }
    const engine = new FireEngine(cells, { speed: 0, direction: 0 }, [new Vector2(50000, 50000)], config);

    let time = 0;
    let previousDay = engine.day;
    while (time < 1440 * 30) {
      time += maxTimeStep;
      engine.updateFire(time);
      expect(engine.day - previousDay).toBeLessThanOrEqual(1);
      previousDay = engine.day;
    }
  });

  // The tighter boundary, by a factor of 24, and the one a plausible retune can
  // cross. The graph samples once per model hour (graph.tsx, keyed on
  // simulation.timeInHours), so a tick longer than an hour drops a point from the
  // burn data and shifts every later index of the logged burnRates array against
  // its "index 0 = hour 1" contract.
  //
  // Three assertions: the shipped fastest speed holds, 5x still holds, and 6x does
  // not. The last two bracket the wall rather than restating the first, so a retune
  // has a ceiling to aim below, and the failing case pins that this test is able to
  // fail at all.
  it("bounds timeInHours to one per tick at the fastest shipped speed, and puts the wall between 5x and 6x", async () => {
    const maxHourJump = async (multiplier: number) => {
      const sim = await newSim();
      const ceiling = computeTimeStep(sim.config, multiplier, Infinity);
      sim.start();
      let previousHours = sim.timeInHours;
      let max = 0;
      for (let i = 0; i < 200; i++) {
        sim.tick(ceiling);
        max = Math.max(max, sim.timeInHours - previousHours);
        previousHours = sim.timeInHours;
      }
      return max;
    };

    const fastest = Math.max(...SPEEDS.map(speed => speed.multiplier));
    expect(await maxHourJump(fastest)).toBeLessThanOrEqual(1);
    expect(await maxHourJump(5)).toBeLessThanOrEqual(1);
    expect(await maxHourJump(6)).toBeGreaterThan(1);
  });
});
