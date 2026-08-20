import { ruleSets } from "./index";
import { EngineConstructionError, EngineError } from "../engine";
import { makeWildfireEngine } from "./test-helpers";
import { factorVariables } from "../wildfire/factor-variables";
import { simProps } from "../wildfire/sim-props";

// R5 load gate: construct the engine for every regenerated rule-set and assert
// the collected load errors are exactly — zero missing-impl, zero parse-error,
// and the expected per-rule-set stub-warning distribution. A regenerated module
// that references an impl the requirements-phase scan missed fails this test
// loudly and by name, rather than surfacing later as an opaque per-rule-set R9
// failure.
//
// The engine's construction-error model is asymmetric (see engine.ts): a
// missing-impl / parse-error is pushed to engine.errors and the engine still
// constructs, while the temporal-error variants throw EngineConstructionError.
// So each construction is wrapped in try/catch and a caught error's `.errors`
// is folded into the inspected set — a temporal misconfiguration in a future
// re-extraction is then reported by kind and rule-set id, not as an uncaught
// throw. Load errors resolve at construction independent of `defaults`, so the
// gate constructs each engine without one.
//
// Stub-warning distribution: the engine emits one stub-warning per *referenced*
// stub per rule-set engine. Helitack / usedHelitack (referenced by 45/47/54 and
// 45 respectively) were implemented in WM-28, and SparksAtTopAndBottom (ruleset
// 25) in WM-15, so no rule set emits a stub-warning today.
const expectedStubWarnings: Record<string, string[]> = {
  "23": [],
  "24": [],
  "25": [],
  "32": [],
  "33": [],
  "34": [],
  "35": [],
  "42": [],
  "45": [],
  "47": [],
  "54": [],
};

function collectErrors(ruleSetId: string): EngineError[] {
  try {
    return makeWildfireEngine(ruleSets[ruleSetId]).errors;
  } catch (e) {
    if (e instanceof EngineConstructionError) return e.errors;
    throw e;
  }
}

describe("rule-sets/index — R5 load gate", () => {
  it("exports all 11 rule-sets (R4)", () => {
    expect(Object.keys(ruleSets).sort()).toEqual(
      ["23", "24", "25", "32", "33", "34", "35", "42", "45", "47", "54"],
    );
  });

  it("expectedStubWarnings covers every exported rule-set", () => {
    expect(Object.keys(expectedStubWarnings).sort()).toEqual(Object.keys(ruleSets).sort());
  });

  // Which implementations no expression references any more. Deliberately a
  // pinned list rather than a "should be empty" assertion: nothing is deleted
  // when a re-extract orphans an impl (some are expected back when the analysis
  // window lands), so the value of this test is that an unplanned change to the
  // set fails loudly. A name appearing here after a re-extract means some tab
  // stopped using it; a name disappearing means a tab started.
  const expectedUnreferenced = [
    "GraphOpen", "setDroughtLevel", "setTerrainType", "setVegetation", "setWind",
    "simulationRuns", "triedAllVegetations", "usedOneSparkPerZone",
  ];

  it("references exactly the expected set of factor variables and sim-props", () => {
    const parts: string[] = [];
    Object.values(ruleSets).forEach((rs) => rs.categories.forEach((c) => parts.push(c.expression)));
    const expressions = parts.join(" ");
    const allNames = [...Object.keys(factorVariables), ...Object.keys(simProps)];
    const unreferenced = allNames
      .filter((n) => !new RegExp(`\\b${n}\\b`).test(expressions)).sort();
    expect(unreferenced).toEqual([...expectedUnreferenced].sort());
  });

  for (const id of Object.keys(ruleSets)) {
    describe(`rule-set ${id}`, () => {
      const errors = collectErrors(id);

      it("loads with no missing-impl failure", () => {
        const missing = errors
          .filter((e): e is Extract<EngineError, { kind: "load-failure" }> => e.kind === "load-failure")
          .filter((e) => e.reason === "missing-impl")
          .map((e) => e.detail);
        expect(missing).toEqual([]);
      });

      it("loads with no parse-error", () => {
        const parseErrors = errors
          .filter((e): e is Extract<EngineError, { kind: "parse-error" }> => e.kind === "parse-error")
          .map((e) => `cat ${e.categoryId}: ${e.detail}`);
        expect(parseErrors).toEqual([]);
      });

      it("emits exactly the expected stub-warnings", () => {
        const stubNames = errors
          .filter((e): e is Extract<EngineError, { kind: "stub-warning" }> => e.kind === "stub-warning")
          .map((e) => e.stubName)
          .sort();
        expect(stubNames).toEqual([...(expectedStubWarnings[id] ?? [])].sort());
      });
    });
  }
});
