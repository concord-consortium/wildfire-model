import { Vector2 } from "three";
import { SimulationModel, SPEEDS, DEFAULT_SPEED_INDEX, computeTimeStep } from "./simulation";
import { FireEngine } from "./engine/fire-engine";
import { Cell } from "./cell";
import { Zone } from "./zone";
import { getDefaultConfig } from "../config";

const FRAME_MIN = 16.7 / 60000;   // one 60 FPS frame, in minutes

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
  it("scales the per-frame timestep by exactly the multiplier at 60 FPS", () => {
    const config = getDefaultConfig();
    const [slow, normal, fast] = SPEEDS.map(s => computeTimeStep(config, s.multiplier, FRAME_MIN));
    expect(slow / normal).toBeCloseTo(0.5, 10);
    expect(fast / normal).toBeCloseTo(2, 10);
  });

  // The three-term Math.min invites the reading that a slow frame collapses the
  // speeds together. It does not: optimalTimeStep * 4 scales with the multiplier,
  // so it is the binding term at the same frame time for all three.
  it("keeps the speeds proportional on a frame slow enough to engage the clamp", () => {
    const config = getDefaultConfig();
    const slowFrame = 100 / 60000;
    const [slow, normal, fast] = SPEEDS.map(s => computeTimeStep(config, s.multiplier, slowFrame));
    expect(normal).toBeLessThan(86400 / config.modelDayInSeconds * slowFrame);   // the clamp is engaged
    expect(slow / normal).toBeCloseTo(0.5, 10);
    expect(fast / normal).toBeCloseTo(2, 10);
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
  // The second assertion is the bound on the first, not a separate guarantee: it
  // pins that this test is able to fail, so a retune that crosses the hour is
  // caught rather than passing silently.
  it("bounds timeInHours to one per tick at the fastest shipped speed, and not above it", async () => {
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
    expect(await maxHourJump(6)).toBeGreaterThan(1);
  });
});
