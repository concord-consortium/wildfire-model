const { buildTourData, parseArrowText, countNumberedVfLines } = require("./tour-data-impl");

// A minimal rule set carrying just the fields the generator reads.
function ruleSet(id, categories) {
  return { id, categories, factorVariables: [] };
}

// A well-formed 3-step coaching category.
function coachingCat(id) {
  return {
    id,
    studentAction: "ran with defaults",
    feedback: "Hazbot: I can help!\n[Show me]",
    visualFeedback: `1. Restart button outlined; coach mark points to Restart button
2. Setup button outlined; coach mark points to Setup button
3. Setup panel outlined; coach mark points to Setup panel`,
    arrowText: `1. Hazbot: First, Restart your model. (Step 1 of 3)
2. Hazbot: Now click the Setup button. (Step 2 of 3)
3. Hazbot: Change the conditions. Then run the model again. (Step 3 of 3)
[Got it!]`,
    expression: "ranSimulation",
  };
}

describe("parseArrowText", () => {
  const noopCtx = { fail: () => undefined };

  it("strips Hazbot:/ordinal/(Step n of N) and extracts the [Got it!] done label", () => {
    const parsed = parseArrowText(coachingCat(2).arrowText, noopCtx);
    expect(parsed.stepCount).toBe(3);
    expect(parsed.doneLabel).toBe("Got it!");
    expect(parsed.steps.map(s => s.text)).toEqual([
      "First, Restart your model.",
      "Now click the Setup button.",
      "Change the conditions. Then run the model again.",
    ]);
  });

  it("parses a step line that omits the optional Hazbot: prefix (the 24-step-4 shape)", () => {
    const arrowText = `1. Hazbot: First, Restart your model. (Step 1 of 2)
2. Change the Wind Direction and Wind Speed. Then run the model again. (Step 2 of 2)
[Got it!]`;
    const parsed = parseArrowText(arrowText, noopCtx);
    expect(parsed.steps.map(s => s.text)).toEqual([
      "First, Restart your model.",
      "Change the Wind Direction and Wind Speed. Then run the model again.",
    ]);
  });
});

describe("countNumberedVfLines", () => {
  it("counts numbered lines and excludes '- If …' conditional sub-bullets", () => {
    const vf = `1. Restart button outlined; coach mark points to Restart button
2. Coach mark (no pointer) centered top
     - If 2 sparks were placed, do not outline the Spark button.
     - If only one spark was placed, then the Spark button is outlined.`;
    expect(countNumberedVfLines(vf)).toBe(2);
  });

  it("returns 0 for empty / prose-only visualFeedback", () => {
    expect(countNumberedVfLines("")).toBe(0);
    expect(countNumberedVfLines("Celebratory visual: confetti falls!")).toBe(0);
  });
});

describe("buildTourData", () => {
  const silent = { warn: () => undefined };

  it("produces clean per-step data keyed by ruleSetId then categoryId", () => {
    const { tourData } = buildTourData({ "23": ruleSet("23", [coachingCat(2)]) }, silent);
    expect(tourData["23"][2].stepCount).toBe(3);
    expect(tourData["23"][2].steps[1].text).toBe("Now click the Setup button.");
  });

  it("skips a category with no arrowText (no map entry emitted)", () => {
    const successCat = {
      id: 5, studentAction: "great", feedback: "Hazbot: Great job!\n[Hooray!]",
      visualFeedback: "Celebratory visual: Hazbot doffs his helmet and confetti falls out!",
      expression: "ranSimulation",
    };
    const { tourData } = buildTourData({ "23": ruleSet("23", [successCat]) }, silent);
    expect(tourData["23"]).toBeUndefined();
  });

  it("errors on a wrong done token", () => {
    const cat = coachingCat(2);
    cat.arrowText = cat.arrowText.replace("[Got it!]", "[Done]");
    expect(() => buildTourData({ "23": ruleSet("23", [cat]) }, silent)).toThrow(/done token is \[Done\]/);
  });

  it("errors on a step-count vs (… of N) mismatch", () => {
    const cat = coachingCat(2);
    // Declare "of 4" while only 3 step lines exist.
    cat.arrowText = cat.arrowText.replace(/of 3\)/g, "of 4)");
    expect(() => buildTourData({ "23": ruleSet("23", [cat]) }, silent)).toThrow(/of 4/);
  });

  it("errors on an out-of-order step number", () => {
    const cat = coachingCat(2);
    cat.arrowText = cat.arrowText.replace("(Step 2 of 3)", "(Step 3 of 3)");
    expect(() => buildTourData({ "23": ruleSet("23", [cat]) }, silent)).toThrow(/out of order/);
  });

  it("errors on an out-of-sequence leading ordinal even when (Step n of N) is correct", () => {
    const cat = coachingCat(2);
    // Leading ordinal 9 on step 1, but "(Step 1 of 3)" stays correct — the (Step n of N)
    // check passes, so only the leading-ordinal sequence check can catch this drift.
    cat.arrowText = cat.arrowText.replace("1. Hazbot: First", "9. Hazbot: First");
    expect(() => buildTourData({ "23": ruleSet("23", [cat]) }, silent)).toThrow(/leading ordinal 9 — out of sequence/);
  });

  it("warns (does not error) when numbered visualFeedback count exceeds arrowText steps (the 34 shape)", () => {
    const cat = coachingCat(2);
    // Add a leading "0." intensity-scale cue → 4 numbered vF lines vs 3 steps.
    cat.visualFeedback = `0. Arrow pointing to the Intensity scale\n${cat.visualFeedback}`;
    const warn = jest.fn();
    const { tourData, warnings } = buildTourData({ "34": ruleSet("34", [cat]) }, { warn });
    expect(tourData["34"][2].stepCount).toBe(3); // still emits the 3-step tour
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("4 numbered line(s) but arrowText has 3 step(s)"));
    expect(warnings.some(w => /4 numbered line/.test(w))).toBe(true);
  });

  it("warns when a category has numbered visualFeedback but no arrowText (under-authored)", () => {
    const underAuthored = {
      id: 2, studentAction: "ran", feedback: "Hazbot: help\n[Show me]",
      visualFeedback: "1. Restart button outlined; coach mark points to Restart button",
      expression: "ranSimulation",
    };
    const warn = jest.fn();
    const { tourData } = buildTourData({ "23": ruleSet("23", [underAuthored]) }, { warn });
    expect(tourData["23"]).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("no arrowText"));
  });

  it("emits a valid TS artifact with the AUTO-GENERATED header and numeric category keys", () => {
    const { artifactSource } = buildTourData({ "23": ruleSet("23", [coachingCat(2)]) }, silent);
    expect(artifactSource.startsWith("// AUTO-GENERATED")).toBe(true);
    expect(artifactSource).toContain("export const tourData");
    expect(artifactSource).toContain("2: { stepCount: 3, doneLabel: \"Got it!\"");
  });

  it("aggregates errors across categories in one pass", () => {
    const bad1 = coachingCat(2);
    bad1.arrowText = bad1.arrowText.replace("[Got it!]", "[Done]");
    const bad2 = coachingCat(3);
    bad2.arrowText = bad2.arrowText.replace("(Step 2 of 3)", "(Step 3 of 3)");
    let message = "";
    try {
      buildTourData({ "23": ruleSet("23", [bad1, bad2]) }, silent);
    } catch (err) {
      message = err.message;
    }
    expect(message).toMatch(/category 2/);
    expect(message).toMatch(/category 3/);
  });
});
