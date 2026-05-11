import * as React from "react";
import { render, screen, act } from "@testing-library/react";
import { AnalysisEngineProvider, Engine, Sidebar } from "../engine";
import { ruleSets } from "../rule-sets";
import { factorVariables } from "./factor-variables";
import { simProps } from "./sim-props";
import { translate } from "./translate";
import { WildfireDefaults, WildfireReading } from "./types";

// Bridge-side sidebar test (per AC: bridge-side sidebar tests against real
// ruleSets["23"]). Verifies that the substrate's generic Sidebar renders
// correctly when wired to a real wildfire Engine + real generated rule set.

function makeEngine() {
  return new Engine<WildfireReading, WildfireDefaults>({
    ruleSet: ruleSets["23"],
    requestedRuleSetId: "23",
    factorVariables,
    simProps,
    translate,
    runStartTriggers: ["SimulationStarted"],
  });
}

describe("wildfire sidebar against ruleSets['23']", () => {
  it("renders the rule-set id and one of tab 23's category feedback strings", () => {
    const engine = makeEngine();
    expect(engine.isActive).toBe(true);
    render(
      <AnalysisEngineProvider engine={engine} appRulesVersion={1}>
        <Sidebar />
      </AnalysisEngineProvider>,
    );
    // Header includes the rule-set id.
    expect(screen.getByText(/ruleset 23/)).toBeInTheDocument();
    // Cat 1's feedback (the "scroll up" message) is rendered as part of the categories panel.
    expect(screen.getByText(/scroll up/i)).toBeInTheDocument();
  });

  it("renders wildfire payload fields (zones / sparks / wind) via JSON pretty-print on reading expand", () => {
    const engine = makeEngine();
    render(
      <AnalysisEngineProvider engine={engine} appRulesVersion={1}>
        <Sidebar />
      </AnalysisEngineProvider>,
    );
    act(() => engine.consume({
      name: "SimulationStarted",
      at: 100,
      data: {
        zones: [{ index: 0, terrainType: "Plains", vegetation: "Shrub", droughtLevel: "Mild Drought" }],
        sparks: [{ x: 0, y: 0, zone: 0 }],
        wind: { speed: 5, direction: 0 },
      },
      ambientState: {},
    }));
    // Expand the reading row to show the payload.
    const row = screen.getByText(/SimulationStarted @ 100/);
    act(() => { row.click(); });
    expect(screen.getByText(/"terrainType": "Plains"/)).toBeInTheDocument();
    expect(screen.getByText(/"speed": 5/)).toBeInTheDocument();
  });
});
