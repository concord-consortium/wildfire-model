import { currentTemporal } from "./temporal";
import { BaseReading, TemporalVariableChange } from "./types";

function mkReading(history: TemporalVariableChange[]): BaseReading {
  return { triggeredBy: "X", at: 0, sessionId: "s", temporalHistory: history };
}

describe("currentTemporal", () => {
  it("returns the last value for the named variable", () => {
    const r = mkReading([
      { at: 1, name: "chartTabOpen", value: false, eventName: "X" },
      { at: 2, name: "chartTabOpen", value: true, eventName: "ChartTabShown" },
    ]);
    expect(currentTemporal<boolean>(r, "chartTabOpen")).toBe(true);
  });

  it("returns undefined when the name is not in the trail", () => {
    const r = mkReading([{ at: 1, name: "other", value: 1, eventName: "X" }]);
    expect(currentTemporal<boolean>(r, "missing")).toBeUndefined();
  });

  it("returns the latest entry when multiple entries for the same name exist", () => {
    const r = mkReading([
      { at: 1, name: "v", value: 1, eventName: "Seed" },
      { at: 2, name: "v", value: 2, eventName: "A" },
      { at: 3, name: "v", value: 3, eventName: "B" },
    ]);
    expect(currentTemporal<number>(r, "v")).toBe(3);
  });

  it("honors order: seed first, append last", () => {
    const r = mkReading([
      { at: 1, name: "v", value: "seed", eventName: "Trigger" },
      { at: 2, name: "v", value: "appended", eventName: "Append" },
    ]);
    expect(currentTemporal<string>(r, "v")).toBe("appended");
  });
});
