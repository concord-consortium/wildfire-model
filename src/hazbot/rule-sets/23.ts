// AUTO-GENERATED — DO NOT EDIT — re-run scripts/extract-hazbot-sheets.js

import { RuleSet } from "../engine";
import { WildfireDefaults } from "../wildfire/types";

export const ruleSet23: RuleSet<WildfireDefaults> = {
  id: "23",
  categories: [
    {
      id: 1,
      studentAction: "Did not run the simulation. A.k.a. Click button (before they do anything else)",
      feedback: `Hazbot: I will analyze your model after you run it! Did you see the instructions at the top of the page? Scroll up!
[Okay]`,
      visualFeedback: "",
      expression: "NOT ranSimulation",
    },
    {
      id: 2,
      studentAction: "Ran the simulation but did not change any conditions (used default values only)",
      feedback: `Hazbot: Looks like you haven’t changed the Setup yet. I can help!
[Show me]`,
      visualFeedback: `1. Restart button outlined; coach mark points to Restart button
2. Setup button outlined; coach mark points to Setup button
3. Setup panel outlined; coach mark points to Setup panel`,
      arrowText: `1. Hazbot: First, Restart your model. (Step 1 of 3)
2. Hazbot: Now click the Setup button. (Step 2 of 3)
3. Hazbot: Click each zone and change its drought conditions to match the instructions. Then run the model again. (Step 3 of 3)
[Got it!]`,
      expression: "NOT setAnyZoneVar AND ranSimulation",
    },
    {
      id: 3,
      studentAction: "Ran the simulation and changed conditions except the drought level",
      feedback: `Hazbot: Hmm, it looks like both zones have the same drought level. Let's change that so we can compare zones!
[Show me]`,
      visualFeedback: `1. Restart button outlined; coach mark points to Restart button
2. Setup button outlined; coach mark points to Setup button
3. Setup panel outlined; coach mark points to Setup panel`,
      arrowText: `1. Hazbot: First, Restart your model. (Step 1 of 3)
2. Hazbot: Now click the Setup button. (Step 2 of 3)
3. Hazbot: Click each zone and change its drought conditions to match the instructions. Then run the model again. (Step 3 of 3)
[Got it!]`,
      expression: "NOT setDroughtLevel AND setAnyZoneVar",
    },
    {
      id: 4,
      studentAction: "Changed the drought level but did not place two sparks (one in each zone)",
      feedback: `Hazbot: I don't see a spark in each zone. Let's make sure that both zones have one spark!
[Show me]`,
      visualFeedback: `1. Restart button outlined; coach mark points to Restart button
2. Coach mark (no pointer) centered top`,
      arrowText: `1. Hazbot: Restart your model first. (Step 1 of 2)
2. Hazbot: Place one spark in Zone 1 and one spark in Zone 2, then run the model again. (Step 2 of 2) 
[Got it!]`,
      expression: "setDroughtLevel AND NOT usedOneSparkPerZone",
    },
    {
      id: 5,
      studentAction: "Ran the simulation, changed drought level, and placed one spark in each zone",
      feedback: `Hazbot: Great job! You’re ready to answer the questions below.
[Hooray!]`,
      visualFeedback: "Celebratory visual: Hazbot doffs his helmet and confetti falls out!",
      arrowText: `If Hazbot is clicked again:
Hazbot: Great job on this simulation! Keep working through the activity and you'll see me again!`,
      expression: "setDroughtLevel AND usedOneSparkPerZone",
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
      name: "setTerrainType",
      definition: "There is at least one \"SimulationStarted\" event for which the terrain type was set distinct from the default value for any zone.",
      logEvents: ["SimulationStarted->zones.<i>.terrainType"],
      details: "Terrain type is set per zone, in the zones data. Default values (trust but verify) = \"Plains\" (zone 1), \"Plains\" (zone 2).  <i> means taking the zone index i (the index for the zones data, which is, or must be, an array), 0-based.  So i=0 means zone 1 and i=1 means zone 2.  If true, then neecessarily ranSimulation=true.",
    },
    {
      name: "setVegetation",
      definition: "There is at least one \"SimulationStarted\" event for which the vegetation type was set distinct from the default value for any zone.",
      logEvents: ["SimulationStarted->zones.<i>.vegetation"],
      details: "Vegetation is set per zone, in the zones data.  Default values (trust but verify) = \"Shrub\" (zone 1), \"Shrub\" (zone 2).  If true, then neecessarily ranSimulation=true.",
    },
    {
      name: "setDroughtLevel",
      definition: "There is at least one \"SimulationStarted\" event for which the drought level was set distinct from the default value for any zone.",
      logEvents: ["SimulationStarted->zones.<i>.droughtLevel"],
      details: "Drought level is set per zone, in the zones data.  Default values (trust but verify) = \"Mild Drought\" (zone 1), \"Mild Drought\" (zone 2).  If true, then neecessarily ranSimulation=true.",
    },
    {
      name: "setAnyZoneVar",
      definition: "setTerrainType OR setVegetation OR setDroughtLevel",
      logEvents: [],
      details: "",
    },
    {
      name: "usedOneSparkPerZone",
      definition: "There is at least one \"SimualtionStarted\" event for which two sparks were used with one spark per zone.",
      logEvents: ["SimulationStarted->sparks.<j>.zoneIdx"],
      details: "The sparks array must be of length 2, and one element should have zoneIndex = 0 (zone 1 ) and the other with zoneIdx = 1 (zone 2).   <j> means taking the spark index (the index of the sparks data, which is, or must be, an array), 0-based.",
    }
  ],
  defaults: {
    "zones": [
      {
        "terrainType": "Plains",
        "vegetation": "Shrub",
        "droughtLevel": "Mild Drought"
      },
      {
        "terrainType": "Plains",
        "vegetation": "Shrub",
        "droughtLevel": "Mild Drought"
      }
    ]
  },
};
