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
});
