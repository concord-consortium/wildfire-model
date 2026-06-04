// AUTO-GENERATED — DO NOT EDIT — re-run scripts/extract-hazbot-sheets.js

import { RuleSet } from "../engine";
import { WildfireDefaults } from "../wildfire/types";

export const ruleSet32: RuleSet<WildfireDefaults> = {
  id: "32",
  categories: [
    {
      id: 1,
      studentAction: "Did not run the simulation. A.k.a. Click button (before they do anything else)",
      feedback: `Hazbot: I will analyze your model after you run it. Scroll up to see the instructions at the top of the page!
[Okay]`,
      visualFeedback: "",
      expression: "NOT ranSimulation",
    },
    {
      id: 2,
      studentAction: "Ran the simulation with default setup values only",
      feedback: `Hazbot: Looks like you haven’t changed the Setup yet. I can help!
[Show me]`,
      visualFeedback: `1. Restart button outlined; coach mark points to Restart button
2. Setup button outlined; coach mark points to Setup button
3. Setup panel outlined; coach mark points to Setup panel`,
      arrowText: `1. Hazbot: First, Restart your model. (Step 1 of 3)
2. Hazbot: Now click the Setup button. (Step 2 of 3)
3. Hazbot: Click each zone and change the vegetation. Then run the model again. (Step 3 of 3)
[Got it!]`,
      expression: "ranSimulation AND NOT setAnyZoneVar",
    },
    {
      id: 3,
      studentAction: "Ran the simulation with drought changed but without three different vegetation types assigned (one per zone)",
      feedback: `Hazbot: Hmm, I don’t see all vegetation types. Let’s set the zones to grass, shrub, and forest!
[Show me]`,
      visualFeedback: `1. Restart button outlined; coach mark points to Restart button
2. Setup button outlined; coach mark points to Setup button
3. Setup panel outlined; coach mark points to Setup panel`,
      arrowText: `1. Hazbot: First, Restart your model. (Step 1 of 3)
2. Hazbot: Now click the Setup button. (Step 2 of 3)
3. Hazbot: Click each zone and change the vegetation. Then run the model again. (Step 3 of 3)
[Got it!]`,
      expression: "setDroughtLevel AND NOT ranSimulation WITH UniqueVegetationPerZone",
    },
    {
      id: 4,
      studentAction: "Ran the simulation with 3 different vegetation types assigned (one in each zone) and different drought levels between zones",
      feedback: `Hazbot: To compare vegetation, make sure the drought level is the same for each zone!
[Show me]`,
      visualFeedback: `1. Restart button outlined; coach mark points to Restart button
2. Setup button outlined; coach mark points to Setup button
3. Setup panel outlined; coach mark points to Setup panel`,
      arrowText: `1. Hazbot: First, Restart your model. (Step 1 of 3)
2. Hazbot: Now click the Setup button. (Step 2 of 3)
3. Hazbot: Click each zone and make sure the drought level is the same. Then run the model again. (Step 3 of 3)
[Got it!]`,
      expression: "ranSimulation WITH UniqueVegetationPerZone AND NOT UniformDroughtLevels",
    },
    {
      id: 5,
      studentAction: "Ran the simulation with 3 different vegetations (one in each zone), same drought, but without one spark in each zone)",
      feedback: `Hazbot: I don’t see three sparks. Add one spark in each zone so you can compare wildfire spread!
[Show me]`,
      visualFeedback: `1. Restart button outlined; coach mark points to Restart button
2. Spark button outlined; coach mark points to spark button`,
      arrowText: `1. Hazbot: First, Restart your model. (Step 1 of 2)
2. Hazbot: Now make sure there is a Spark in each zone. Then run the model again. (Step 2 of 2)
[Got it!]`,
      expression: "ranSimulation WITH UniqueVegetationPerZone AND NOT OneSparkPerZone",
    },
    {
      id: 6,
      studentAction: "Ran the simulation with 3 different vegetations (one in each zone), same drought, and one spark in each zone",
      feedback: `Hazbot: Great job comparing three types of vegetation! You’re ready to answer the questions below.
[Hooray!]`,
      visualFeedback: "Confetti animation or subtle celebratory visual",
      expression: "ranSimulation WITH UniqueVegetationPerZone AND UniformDroughtLevels AND OneSparkPerZone",
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
      details: "Vegetation is set per zone, in the zones data.  For the default values, read the \"SIMINIT\" sheet.  If true, then necessarily ranSimulation=true.",
    },
    {
      name: "setDroughtLevel",
      definition: "There is at least one \"SimulationStarted\" event for which the drought level was set distinct from the default value for any zone.",
      logEvents: ["SimulationStarted->zones.<i>.droughtLevel"],
      details: "Drought level is set per zone, in the zones data.  For the default values, read the \"SIMINIT\" sheet.  If true, then necessarily ranSimulation=true.",
    },
    {
      name: "setAnyZoneVar",
      definition: "setVegetation OR setDroughtLevel",
      logEvents: [],
      details: "The terrainType values are fixed in this activity.",
    },
    {
      name: "OneSparkPerZone",
      definition: "Sim prop for whether one spark was used per each zone or not.",
      logEvents: ["SimulationStarted->sparks.<j>.zoneIdx"],
      details: "The sparks array must be of length 3, and the three zoneIdx values collected from the three sparks must cover 0, 1, and 2.  <j> means taking the spark index (the index of the sparks data, which is, or must be, an array), 0-based.",
    },
    {
      name: "UniqueVegetationPerZone",
      definition: "Sim prop for whether distinct vegetation per each zone was used or not.",
      logEvents: ["SimulationStarted->zones.<i>.vegetation"],
      details: "There are four vegetation types available.  The three vegetations assigned to the three zones must consist of three distinct vegetation type values selected from those four.",
    },
    {
      name: "UniformDroughtLevels",
      definition: "Sim prop for whether all drought levels for all zones were the same.",
      logEvents: ["SimulationStarted->zones.<i>.droughtLevel"],
      details: "The droughtLevel values for all zones (i=0, 1, 2) must be identical.",
    }
  ],
};
