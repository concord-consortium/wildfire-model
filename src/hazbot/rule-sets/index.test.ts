import { ruleSets } from "./index";
import { EngineConstructionError, EngineError } from "../engine";
import { makeWildfireEngine } from "./test-helpers";

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
// stub per rule-set engine. Helitack is referenced by 45/47/54, usedHelitack by
// 45, SparksAtTopAndBottom by 25 — five stub-warning entries in total.
const expectedStubWarnings: Record<string, string[]> = {
  "23": [],
  "24": [],
  "25": ["SparksAtTopAndBottom"],
  "32": [],
  "33": [],
  "34": [],
  "35": [],
  "42": [],
  "45": ["Helitack", "usedHelitack"],
  "47": ["Helitack"],
  "54": ["Helitack"],
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
        expect(stubNames).toEqual([...expectedStubWarnings[id]].sort());
      });
    });
  }
});
