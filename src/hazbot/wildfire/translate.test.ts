import { translate } from "./translate";
import { ConsumedEvent } from "../engine";

function ev(name: string, extra: Partial<ConsumedEvent> = {}): ConsumedEvent {
  return { name, at: 100, ...extra };
}

describe("wildfire translate", () => {
  it("maps SimulationStarted to a trigger Reading with payload + ambientState", () => {
    const result = translate(
      ev("SimulationStarted", {
        data: { zones: [{ index: 0, terrainType: "Plains" }], sparks: [], wind: { speed: 5, direction: 0 } },
        ambientState: { chartTabOpenAtStart: true },
      }),
      "session-id-1",
    );
    expect(result.kind).toBe("trigger");
    if (result.kind !== "trigger") throw new Error("expected trigger");
    expect(result.reading.triggeredBy).toBe("SimulationStarted");
    expect(result.reading.sessionId).toBe("session-id-1");
    expect(result.reading.zones).toEqual([{ index: 0, terrainType: "Plains" }]);
    expect(result.reading.ambientState).toEqual({ chartTabOpenAtStart: true });
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

  it("maps ChartTabShown / ChartTabHidden to modifier updates", () => {
    const shown = translate(ev("ChartTabShown"), "s");
    const hidden = translate(ev("ChartTabHidden"), "s");
    expect(shown.kind).toBe("modifier");
    expect(hidden.kind).toBe("modifier");
    if (shown.kind !== "modifier") throw new Error("");
    expect(shown.update).toEqual({ source: "ChartTabShown", value: true, at: 100 });
    if (hidden.kind !== "modifier") throw new Error("");
    expect(hidden.update).toEqual({ source: "ChartTabHidden", value: false, at: 100 });
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
