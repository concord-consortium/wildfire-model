import { SimulationModel } from "./simulation";

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
