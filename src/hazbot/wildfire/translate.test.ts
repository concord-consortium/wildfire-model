import { translate } from "./translate";
import { ConsumedEvent } from "../engine";

function ev(name: string, extra: Partial<ConsumedEvent> = {}): ConsumedEvent {
  return { name, at: 100, ...extra };
}

describe("wildfire translate", () => {
  it("maps SimulationStarted to a trigger Reading with payload", () => {
    const result = translate(
      ev("SimulationStarted", {
        data: { zones: [{ index: 0, terrainType: "Plains" }], sparks: [], wind: { speed: 5, direction: 0 } },
      }),
      "session-id-1",
    );
    expect(result.kind).toBe("trigger");
    if (result.kind !== "trigger") throw new Error("expected trigger");
    expect(result.reading.triggeredBy).toBe("SimulationStarted");
    expect(result.reading.sessionId).toBe("session-id-1");
    expect(result.reading.zones).toEqual([{ index: 0, terrainType: "Plains" }]);
  });

  it("carries fireLineMarkers from the SimulationStarted payload", () => {
    const result = translate(
      ev("SimulationStarted", {
        data: { fireLineMarkers: [{ x: 0.1, y: 0.2, elevation: 5 }, { x: 0.3, y: 0.2, elevation: 6 }] },
      }),
      "s",
    );
    if (result.kind !== "trigger") throw new Error("expected trigger");
    expect(result.reading.fireLineMarkers).toHaveLength(2);
  });

  it("forwards elevationRange and heightmapMaxElevation from the SimulationStarted payload (R9)", () => {
    const result = translate(
      ev("SimulationStarted", {
        data: { elevationRange: { min: 100, max: 9000 }, heightmapMaxElevation: 20000 },
      }),
      "s",
    );
    if (result.kind !== "trigger") throw new Error("expected trigger");
    expect(result.reading.elevationRange).toEqual({ min: 100, max: 9000 });
    expect(result.reading.heightmapMaxElevation).toBe(20000);
  });

  it("does not carry elevation fields on SimulationEnded / SimulationStopped (R9)", () => {
    const ended = translate(ev("SimulationEnded", { data: { outcome: {} } }), "s");
    const stopped = translate(ev("SimulationStopped"), "s");
    if (ended.kind !== "trigger" || stopped.kind !== "trigger") throw new Error("expected triggers");
    expect(ended.reading.elevationRange).toBeUndefined();
    expect(ended.reading.heightmapMaxElevation).toBeUndefined();
    expect(stopped.reading.elevationRange).toBeUndefined();
    expect(stopped.reading.heightmapMaxElevation).toBeUndefined();
  });

  it("maps SimulationEnded to a trigger Reading carrying outcome", () => {
    const result = translate(ev("SimulationEnded", { data: { outcome: { burned: 50 } } }), "s");
    expect(result.kind).toBe("trigger");
    if (result.kind !== "trigger") throw new Error("expected trigger");
    expect(result.reading.triggeredBy).toBe("SimulationEnded");
    expect(result.reading.outcome).toEqual({ burned: 50 });
  });

  it("maps SimulationStopped to a trigger Reading", () => {
    const result = translate(ev("SimulationStopped"), "s");
    expect(result.kind).toBe("trigger");
  });

  it("maps ChartTabShown / ChartTabHidden to no-op (handled by chartTabOpen temporal variable)", () => {
    // Pure state changes — no longer produce modifier updates; the engine's
    // temporal-variable phase folds them into the chartTabOpen projection.
    expect(translate(ev("ChartTabShown"), "s").kind).toBe("no-op");
    expect(translate(ev("ChartTabHidden"), "s").kind).toBe("no-op");
  });

  it("maps SimulationRestarted / SimulationReloaded / TopBarReloadButtonClicked / AnalysisEngineActivated to no-op", () => {
    expect(translate(ev("SimulationRestarted"), "s").kind).toBe("no-op");
    expect(translate(ev("SimulationReloaded"), "s").kind).toBe("no-op");
    expect(translate(ev("TopBarReloadButtonClicked"), "s").kind).toBe("no-op");
    expect(translate(ev("AnalysisEngineActivated"), "s").kind).toBe("no-op");
  });

  it("returns no-op for unknown event names rather than throwing", () => {
    expect(translate(ev("UnknownEvent"), "s").kind).toBe("no-op");
  });
});
