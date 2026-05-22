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
