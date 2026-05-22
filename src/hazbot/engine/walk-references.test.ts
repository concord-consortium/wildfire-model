import { parse } from "./parser";
import { walkReferences } from "./walk-references";

describe("walkReferences", () => {
  it("collects boolean-leaf factor variable", () => {
    const r = walkReferences(parse("ranSimulation"));
    expect(Array.from(r.factorVars)).toEqual(["ranSimulation"]);
    expect(r.simProps.size).toBe(0);
  });

  it("collects comparison operands", () => {
    const r = walkReferences(parse("uniqueWindValuesUsed.size > 1"));
    expect(Array.from(r.factorVars)).toEqual(["uniqueWindValuesUsed"]);
  });

  it("collects WITH varName + sim-prop inside", () => {
    const r = walkReferences(parse("ranSimulation WITH OneSparkPerZone"));
    expect(Array.from(r.factorVars)).toEqual(["ranSimulation"]);
    expect(Array.from(r.simProps)).toEqual(["OneSparkPerZone"]);
  });

  it("collects WITH with multiple sim-props (AND)", () => {
    const r = walkReferences(parse("ranSimulation WITH (UniqueVegetationPerZone AND TwoSparks)"));
    expect(Array.from(r.factorVars)).toEqual(["ranSimulation"]);
    expect(Array.from(r.simProps).sort()).toEqual(["TwoSparks", "UniqueVegetationPerZone"]);
  });

  it("collects across AND/OR/NOT", () => {
    const r = walkReferences(parse("setDroughtLevel AND NOT usedOneSparkPerZone OR ranSimulation"));
    expect(Array.from(r.factorVars).sort()).toEqual(["ranSimulation", "setDroughtLevel", "usedOneSparkPerZone"]);
  });

  it("deduplicates references", () => {
    const r = walkReferences(parse("ranSimulation AND ranSimulation"));
    expect(Array.from(r.factorVars)).toEqual(["ranSimulation"]);
  });
});
