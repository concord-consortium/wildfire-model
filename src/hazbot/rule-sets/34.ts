// AUTO-GENERATED — DO NOT EDIT — re-run scripts/extract-hazbot-sheets.js

import { RuleSet } from "../engine";
import { WildfireDefaults } from "../wildfire/types";

export const ruleSet34: RuleSet<WildfireDefaults> = {
  id: "34",
  categories: [
    {
      id: 1,
      studentAction: "Did not run the simulation. A.k.a. Click button (before they do anything else)",
      feedback: `Hazbot: Just a friendly reminder, I will analyze your model after you run it. Scroll up to see the instructions at the top of the page!
[Okay]`,
      visualFeedback: "",
      expression: "NOT ranSimulation",
    },
    {
      id: 2,
      studentAction: "Ran the simulation(s) with default setup values only",
      feedback: `Hazbot: Looks like you haven’t changed the Setup yet. What conditions do you think will produce a high intensity fire?
[Show me]`,
      visualFeedback: `0. Arrow pointing to the Intensity scale
2. Restart button outlined; coach mark points to Restart button
3. Setup button outlined; coach mark points to Setup button
4. Setup panel outlined; coach mark points to Setup panel`,
      arrowText: `1. Hazbot: First, Restart your model. (Step 1 of 3)
2. Hazbot: Now click the Setup button. (Step 2 of 3)
3. Hazbot: Click each zone and change the conditions to create a high intensity fire. Then run the model again. (Step 3 of 3)
[Got it!]`,
      expression: "ranSimulation AND NOT setAnyVar",
    },
    {
      id: 3,
      studentAction: "Ran the simulation, with drought and wind changed but vegetation unchanged.",
      feedback: `Hazbot: Keep experimenting! What type of vegetation do you think will produce a high intensity fire?
[Show me]`,
      visualFeedback: `0. Arrow pointing to the Intensity scale
1. Restart button outlined; coach mark points to Restart button
2. Setup button outlined; coach mark points to Setup button
3. Setup panel outlined; coach mark points to Setup panel`,
      arrowText: `1. Hazbot: First, Restart your model. (Step 1 of 3)
2. Hazbot: Now click the Setup button. (Step 2 of 3)
3. Hazbot: Click each zone and change the vegetation to create a high intensity fire. Then run the model again. (Step 3 of 3)
[Got it!]`,
      expression: "setDroughtLevel AND setWind AND NOT setVegetation",
    },
    {
      id: 4,
      studentAction: "Ran the simulation two or more times, tested all four vegetation types, and changed drought and winds.",
      feedback: `Hazbot: Great job! You’re ready to answer the questions below.
[Hooray!]`,
      visualFeedback: "Confetti animation or subtle celebratory visual",
      expression: "setDroughtLevel AND setWind AND triedAllVegetations",
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
      details: "Vegetation is set per zone, in the zones data.  For the default values, read the \"SIMINIT\" sheet.",
    },
    {
      name: "setDroughtLevel",
      definition: "There is at least one \"SimulationStarted\" event for which the drought level was set distinct from the default value for any zone.",
      logEvents: ["SimulationStarted->zones.<i>.droughtLevel"],
      details: "Drought level is set per zone, in the zones data.  For the default values, read the \"SIMINIT\" sheet.",
    },
    {
      name: "setAnyZoneVar",
      definition: "setVegetation OR setDroughtLevel",
      logEvents: [],
      details: "Note that the terrainType values are fixed (see the \"SIMINIT\" sheet).",
    },
    {
      name: "setWind",
      definition: "There is at least one \"SimulationStarted\" event for which the wind value was set distinct from the default value for any zone.",
      logEvents: ["SimulationStarted->wind.speed", "wind.direction", "wind.scaleFactor"],
      details: "Wind is set globally (for all zones).  For the default values, read the \"SIMINIT\" sheet.  If the magnitude is 0, then the direction has no effect and must be ignored.  So set the direction to null, if the magnitude is 0.  Here, the \"magnitude\" means the wind speed as displayed in the simulation (like \"10\" as in \"10 MPH\").  In the log data, the magnitude data entails two fields \"wind.speed\" and \"wind.scaleFactor\".  The \"magnitude\" is computed as \"wind.speed\" / \"wind.scaleFactor\".",
    },
    {
      name: "setAnyVar",
      definition: "setAnyZoneVar OR setWind",
      logEvents: [],
      details: "",
    },
    {
      name: "triedAllVegetations",
      definition: "Over the course of all simulation runs, tried all vegetation values.",
      logEvents: ["SimulationStarted->zones.<i>.vegetation"],
      details: "The set of all vegetation values found in all zones of all simulations run thus far must be equal to the set of all possible vegetation values (\"Grass\", \"Shrub\", \"Forest\", \"Forest with Suppression\").  (The order in which these vegetation values appear is unimportant.)",
    }
  ],
};
