import { SimulationModel } from "./simulation";
import { ChartStore } from "./chart-store";

describe("SimulationModel", () => {
  it("should let user add fire line after model reset", async () => {
    const sim = new SimulationModel({
      modelWidth: 100000,
      modelHeight: 100000,
      gridWidth: 5,
      sparks: [ [50000, 50000] ],
      zoneIndex: [[0]],
      elevation: [[0]],
      unburntIslands: [[1]],
      unburntIslandProbability: 1,
      riverData: null,
    });
    await sim.dataReadyPromise;
    expect(sim.canAddFireLineMarker).toEqual(true);
    sim.buildFireLine({x: 0, y: 50000}, {x: 50000, y: 50000});
    expect(sim.canAddFireLineMarker).toEqual(false);
    sim.restart();
    expect(sim.canAddFireLineMarker).toEqual(true);
  });

  it("should report constant totalCellCountByZone values after model reload", async () => {
    const sim = new SimulationModel({
      modelWidth: 100000,
      modelHeight: 100000,
      gridWidth: 5,
      sparks: [ [50000, 50000] ],
      zoneIndex: [[0]],
      elevation: [[0]],
      unburntIslands: [[1]],
      unburntIslandProbability: 1,
      riverData: null,
    });
    await sim.dataReadyPromise;
    expect(sim.totalCellCountByZone[0]).toEqual(25);
    sim.reload();
    await sim.dataReadyPromise;
    expect(sim.totalCellCountByZone[0]).toEqual(25);
  });

  describe("getOutcomeData", () => {
    const createSimAndChartStore = () => {
      const sim = new SimulationModel({
        modelWidth: 100000,
        modelHeight: 100000,
        gridWidth: 5,
        sparks: [[50000, 50000]],
        zoneIndex: [[0]],
        elevation: [[0]],
        unburntIslands: [[1]],
        unburntIslandProbability: 1,
        riverData: null,
      });
      const chartStore = new ChartStore();
      return { sim, chartStore };
    };

    it("returns correct structure with no simulation data", async () => {
      const { sim, chartStore } = createSimAndChartStore();
      await sim.dataReadyPromise;
      const outcome = sim.getOutcomeData(chartStore);
      expect(outcome.durationMinutes).toBe(0);
      expect(outcome.durationHours).toBe(0);
      expect(outcome.zones).toHaveLength(sim.zones.length);
      outcome.zones.forEach(z => {
        expect(z.burnPercentage).toBe(0);
        expect(z.burnedAcres).toBe(0);
        expect(z.burnRates).toEqual([]);
        expect(z.maxBurnRate).toBe(0);
        expect(z.timeOfMaxBurnRate).toBe(0);
      });
      expect(outcome.towns).toEqual([]);
    });

    it("returns correct structure when cells are not loaded", () => {
      const { sim, chartStore } = createSimAndChartStore();
      // Don't await dataReadyPromise — cells not loaded
      const outcome = sim.getOutcomeData(chartStore);
      expect(outcome.durationMinutes).toBe(0);
      expect(outcome.zones).toBeDefined();
      expect(outcome.towns).toEqual([]);
    });

    it("burnRates array is empty when fewer than 2 data points", async () => {
      const { sim, chartStore } = createSimAndChartStore();
      await sim.dataReadyPromise;

      chartStore.rawBurnData[0] = [{ time: 1, acres: 10 }];

      const outcome = sim.getOutcomeData(chartStore);
      expect(outcome.zones[0].burnRates).toEqual([]);
    });

    it("computes piecewise burn rates from raw burn data using simulated time", async () => {
      const { sim, chartStore } = createSimAndChartStore();
      await sim.dataReadyPromise;

      chartStore.rawBurnData[0] = [
        { time: 1, acres: 10.5 },
        { time: 2, acres: 30.7 },
        { time: 3, acres: 35.2 }
      ];

      const outcome = sim.getOutcomeData(chartStore);
      const zone = outcome.zones[0];
      expect(zone.burnRates).toHaveLength(2);
      // burnRate1 = (30.7-10.5)/(2-1) = 20.2, rounded to 4 decimal places
      expect(zone.burnRates[0]).toBe(20.2);
      // burnRate2 = (35.2-30.7)/(3-2) = 4.5
      expect(zone.burnRates[1]).toBe(4.5);
      expect(zone.maxBurnRate).toBe(20.2);
      expect(zone.timeOfMaxBurnRate).toBe(2);
    });

    it("reports town outcomes as not burned when cells not loaded", () => {
      const sim = new SimulationModel({
        modelWidth: 100000,
        modelHeight: 100000,
        gridWidth: 5,
        sparks: [[50000, 50000]],
        zoneIndex: [[0]],
        elevation: [[0]],
        unburntIslands: [[1]],
        unburntIslandProbability: 1,
        riverData: null,
        towns: [{ name: "TestTown", x: 0.5, y: 0.5 }],
      });
      const chartStore = new ChartStore();
      // Don't await — cells not loaded
      const outcome = sim.getOutcomeData(chartStore);
      expect(outcome.towns).toHaveLength(1);
      expect(outcome.towns[0]).toEqual({ name: "TestTown", burned: false });
    });

    it("returns valid burnPercentage when totalCellCountByZone is zero", async () => {
      const { sim, chartStore } = createSimAndChartStore();
      await sim.dataReadyPromise;
      // Force totalCellCountByZone to be empty
      sim.totalCellCountByZone = {};
      const outcome = sim.getOutcomeData(chartStore);
      outcome.zones.forEach(z => {
        expect(z.burnPercentage).toBe(0);
        expect(isNaN(z.burnPercentage)).toBe(false);
      });
    });
  });

  it("resets simulationEndedLogged flag in start()", async () => {
    const sim = new SimulationModel({
      modelWidth: 100000,
      modelHeight: 100000,
      gridWidth: 5,
      sparks: [[50000, 50000]],
      zoneIndex: [[0]],
      elevation: [[0]],
      unburntIslands: [[1]],
      unburntIslandProbability: 1,
      riverData: null,
    });
    await sim.dataReadyPromise;
    sim.simulationEndedLogged = true;
    sim.start();
    expect(sim.simulationEndedLogged).toBe(false);
  });

  it("changes the wind if changeWindOnDay config is defined and then restore wind properties after reset", async () => {
    const windScaleFactor = 0.2;
    const newWindDirection = 20;
    const newWindSpeed = 20; // mph
    const sim = new SimulationModel({
      modelWidth: 100000,
      modelHeight: 100000,
      gridWidth: 5,
      sparks: [ [50000, 50000] ],
      zoneIndex: [[0]],
      elevation: [[0]],
      unburntIslands: [[0]],
      riverData: null,
      changeWindOnDay: 0.5,
      newWindDirection,
      newWindSpeed,
      windScaleFactor
    });
    await sim.dataReadyPromise;
    expect(sim.windDidChange).toBe(false);

    const userWindDirection = 10;
    const userWindSpeed = 10;
    sim.setWindDirection(userWindDirection);
    sim.setWindSpeed(userWindSpeed); // model units

    sim.start();
    expect(sim.wind.direction).toBe(userWindDirection);
    expect(sim.wind.speed).toBe(userWindSpeed);
    expect(sim.engine?.wind.direction).toBe(userWindDirection);
    expect(sim.engine?.wind.speed).toBe(userWindSpeed); // model units

    sim.tick(1440 / 2); // half of a day in minutes

    expect(sim.timeInDays).toBe(0.5);
    expect(sim.windDidChange).toBe(true);
    expect(sim.wind.direction).toBe(newWindDirection);
    expect(sim.wind.speed).toBe(newWindSpeed * windScaleFactor); // model units

    sim.restart();
    sim.start();

    expect(sim.wind.direction).toBe(userWindDirection);
    expect(sim.wind.speed).toBe(userWindSpeed);
    expect(sim.engine?.wind.direction).toBe(userWindDirection);
    expect(sim.engine?.wind.speed).toBe(userWindSpeed); // model units

    const newUserWindDirection = 15;
    const bewUserWindSpeed = 15;
    sim.setWindDirection(newUserWindDirection);
    sim.setWindSpeed(bewUserWindSpeed); // model units

    sim.restart();
    sim.start();

    expect(sim.wind.direction).toBe(newUserWindDirection);
    expect(sim.wind.speed).toBe(bewUserWindSpeed);
    expect(sim.engine?.wind.direction).toBe(newUserWindDirection);
    expect(sim.engine?.wind.speed).toBe(bewUserWindSpeed); // model units
  });

  it("restart() preserves setupChanged", async () => {
    const sim = new SimulationModel({
      modelWidth: 100000,
      modelHeight: 100000,
      gridWidth: 5,
      sparks: [[50000, 50000]],
      zoneIndex: [[0]],
      elevation: [[0]],
      unburntIslands: [[1]],
      unburntIslandProbability: 1,
      riverData: null,
    });
    await sim.dataReadyPromise;
    sim.setSetupChanged(true);
    sim.restart();
    expect(sim.setupChanged).toBe(true);
  });

  it("reload() resets setupChanged to false", async () => {
    const sim = new SimulationModel({
      modelWidth: 100000,
      modelHeight: 100000,
      gridWidth: 5,
      sparks: [[50000, 50000]],
      zoneIndex: [[0]],
      elevation: [[0]],
      unburntIslands: [[1]],
      unburntIslandProbability: 1,
      riverData: null,
    });
    await sim.dataReadyPromise;
    sim.setSetupChanged(true);
    sim.reload();
    await sim.dataReadyPromise;
    expect(sim.setupChanged).toBe(false);
  });

  describe("simulationEnded", () => {
    const createSim = () => new SimulationModel({
      modelWidth: 100000,
      modelHeight: 100000,
      gridWidth: 5,
      sparks: [[50000, 50000]],
      zoneIndex: [[0]],
      elevation: [[0]],
      unburntIslands: [[1]],
      unburntIslandProbability: 1,
      riverData: null,
    });

    it("is false pre-start (simulationStarted=false)", async () => {
      const sim = createSim();
      await sim.dataReadyPromise;
      expect(sim.simulationEnded).toBe(false);
    });

    it("is false while Running", async () => {
      const sim = createSim();
      await sim.dataReadyPromise;
      sim.start();
      try {
        expect(sim.simulationStarted).toBe(true);
        expect(sim.simulationRunning).toBe(true);
        expect(sim.simulationEnded).toBe(false);
      } finally {
        // start() schedules a real rAF loop (simulation.ts:235). Tests #3-5
        // below call tick() which flips simulationRunning=false and lets
        // the loop self-terminate; this test asserts mid-Running and would
        // otherwise leave the rAF loop scheduling itself across tests.
        // Stop the sim to flip simulationRunning=false so the next rAF
        // callback no-ops. Any new test added here that calls start()
        // without an organic stop/tick path should do the same.
        sim.stop();
      }
    });

    it("is false in user-Pause sub-state (Stop pressed, engine not finished)", async () => {
      const sim = createSim();
      await sim.dataReadyPromise;
      sim.start();
      sim.stop();
      // engine kept around, fireDidStop is still false
      expect(sim.simulationStarted).toBe(true);
      expect(sim.simulationRunning).toBe(false);
      expect(sim.engine?.fireDidStop).toBe(false);
      expect(sim.simulationEnded).toBe(false);
    });

    it("is true when fire finishes naturally (fireDidStop flips inside tick)", async () => {
      const sim = createSim();
      await sim.dataReadyPromise;
      sim.start();
      // Drive the supported tick() path that flips both simulationRunning=false
      // and engine.fireDidStop=true. The real FireEngine.updateFire() unconditionally
      // resets fireDidStop=true at line 162 then flips it back to false for any
      // burning cell (line 167) — so a manually-set fireDidStop is overwritten
      // before tick()'s post-updateFire check reads it. Stub updateFire to a no-op
      // that preserves the manual flip; tick() then sees fireDidStop===true and
      // flips simulationRunning=false (simulation.ts:315-316), producing the
      // simulationEnded=true edge.
      (sim.engine as any).updateFire = function () { this.fireDidStop = true; };
      sim.tick(1);
      expect(sim.simulationEnded).toBe(true);
    });

    it("is false after Restart (engine nulled, simulationStarted=false)", async () => {
      const sim = createSim();
      await sim.dataReadyPromise;
      sim.start();
      // Same updateFire stub as above — preserves the manual fireDidStop flip
      // through tick(), since the real updateFire would otherwise overwrite it.
      (sim.engine as any).updateFire = function () { this.fireDidStop = true; };
      sim.tick(1);
      expect(sim.simulationEnded).toBe(true);
      sim.restart();
      expect(sim.engine).toBeNull();
      expect(sim.simulationStarted).toBe(false);
      expect(sim.simulationEnded).toBe(false);
    });

    it("reactivity contract: observers re-fire when simulationEnded flips on natural fire completion", async () => {
      const { reaction } = await import("mobx");
      const sim = createSim();
      await sim.dataReadyPromise;
      // Do NOT insert awaits between sim.start() and the updateFire stub below.
      // start() schedules a real rAF callback; in jsdom rAF is async, so the
      // callback can't fire before this synchronous block completes — but an
      // await would yield to the rAF callback and could call the real
      // updateFire. Escape hatch: replace start() with a manual engine +
      // observable setup that doesn't schedule rAF if an await is unavoidable.
      sim.start();

      const seen: boolean[] = [];
      const dispose = reaction(
        () => sim.simulationEnded,
        (value) => { seen.push(value); }
      );

      // Drive the supported tick() path: stub updateFire so the manual
      // fireDidStop flip survives (real updateFire resets fireDidStop at
      // fire-engine.ts:162 and recomputes it from cell state), then call
      // tick() to flip simulationRunning=false. The reaction must observe
      // the resulting simulationEnded=true.
      (sim.engine as any).updateFire = function () { this.fireDidStop = true; };
      sim.tick(1);

      expect(seen).toContain(true);
      dispose();
    });
  });

  describe("reloadEnabled", () => {
    const createSim = () => new SimulationModel({
      modelWidth: 100000,
      modelHeight: 100000,
      gridWidth: 5,
      sparks: [],
      zoneIndex: [[0]],
      elevation: [[0]],
      unburntIslands: [[1]],
      unburntIslandProbability: 1,
      riverData: null,
    });

    it("is false when setupChanged=false and no sparks (Default)", async () => {
      const sim = createSim();
      await sim.dataReadyPromise;
      expect(sim.setupChanged).toBe(false);
      expect(sim.sparks.length).toBe(0);
      expect(sim.reloadEnabled).toBe(false);
    });

    it("is true when setupChanged=true and no sparks", async () => {
      const sim = createSim();
      await sim.dataReadyPromise;
      sim.setSetupChanged(true);
      expect(sim.sparks.length).toBe(0);
      expect(sim.reloadEnabled).toBe(true);
    });

    it("is true when setupChanged=false and at least one spark", async () => {
      const sim = createSim();
      await sim.dataReadyPromise;
      sim.addSpark(50000, 50000);
      expect(sim.setupChanged).toBe(false);
      expect(sim.sparks.length).toBeGreaterThan(0);
      expect(sim.reloadEnabled).toBe(true);
    });
  });
});
