// AUTO-GENERATED — DO NOT EDIT — re-run scripts/extract-hazbot-sheets.js

import { RuleSet } from "../engine";
import { WildfireDefaults } from "../wildfire/types";

export const ruleSet42: RuleSet<WildfireDefaults> = {
  id: "42",
  categories: [
    {
      id: 1,
      studentAction: "Did not run the simulation. A.k.a. Click button (before they do anything else)",
      feedback: `Hazbot: Remember, you need to run the model. 
[Okay]`,
      visualFeedback: "",
      expression: "NOT ranSimulation",
    },
    {
      id: 2,
      studentAction: "Ran the simulation with a changed vegetation type, drought, or wind.",
      feedback: "Hazbot: Let’s run the model using the original settings!",
      visualFeedback: "1. Reload button outlined; coach mark points to Reload button",
      arrowText: `1. Hazbot: First, Reload your model. (Step 1 of 2)
2. Hazbot: Click to start to run the model! (Step 2 of 2)
[Got it!]`,
      expression: "setAnyVar",
    },
    {
      id: 3,
      studentAction: `Ran the simulation 
without changed variables.`,
      feedback: "Hazbot: Great job! You’re ready to answer the questions below.",
      visualFeedback: "Confetti animation or subtle celebratory visual",
      expression: "ranSimulation AND NOT setAnyVar",
    }
  ],
  factorVariables: [
    {
      name: "ranSimulation",
      definition: "At least one \"SimulationStarted\" event was recorded.",
      logEvents: ["SimulationStarted"],
      details: "",
    },
    {
      name: "setVegetation",
      definition: "There is at least one \"SimulationStarted\" event for which the vegetation type was set distinct from the default value for any zone.",
      logEvents: ["SimulationStarted->zones.<i>.vegetation"],
      details: "Vegetation is set per zone, in the zones data.  For the default values, read the \"SIMINIT\" sheet.  If true, then neecessarily ranSimulation=true.",
    },
    {
      name: "setDroughtLevel",
      definition: "There is at least one \"SimulationStarted\" event for which the drought level was set distinct from the default value for any zone.",
      logEvents: ["SimulationStarted->zones.<i>.droughtLevel"],
      details: "Drought level is set per zone, in the zones data.  For the default values, read the \"SIMINIT\" sheet.  If true, then neecessarily ranSimulation=true.",
    },
    {
      name: "setAnyZoneVar",
      definition: "setVegetation OR setDroughtLevel",
      logEvents: [],
      details: "The terrainType values are fixed in this activity.",
    },
    {
      name: "setWind",
      definition: "There is at least one \"SimulationStarted\" event for which the wind value was set distinct from the default value for any zone.",
      logEvents: ["SimulationStarted->wind.speed", "wind.direction", "wind.scaleFactor"],
      details: "Wind is set globally (for all zones).  For the default values, read the \"SIMINIT\" sheet.  If the magnitude is 0, then the direction has no effect and must be ignored.  So set the direction to null, if the magnitude is 0.  Here, the \"magnitude\" means the wind speed as displayed in the simulation (like \"10\" as in \"10 MPH\").  In the log data, the magnituide data entails two fields \"wind.speed\" and \"wind.scaleFactor\".  The \"magitude\" is computed as \"wind.speed\" / \"wind.scaleFactor\".",
    },
    {
      name: "setAnyVar",
      definition: "setAnyZoneVar OR setWind",
      logEvents: [],
      details: "",
    }
  ],
};
