// AUTO-GENERATED — DO NOT EDIT — re-run scripts/extract-hazbot-sheets.js

import { RuleSet } from "../engine";
import { WildfireDefaults } from "../wildfire/types";

export const ruleSet23: RuleSet<WildfireDefaults> = {
  id: "23",
  categories: [
    {
      id: 1,
      studentAction: "Did not run the simulation. A.k.a. Click button (before they do anything else)",
      feedback: `Hazbot: I will analyze your model after you run it! Did you see the instructions at the top of the page? **Scroll up!**
[Okay]`,
      visualFeedback: "",
      expression: "NOT ranSimulation",
    },
    {
      id: 2,
      studentAction: "Ran the simulation with only default values.",
      feedback: `Hazbot: Looks like you haven’t changed the **Setup** yet. I can help!
[Show me]`,
      visualFeedback: `1. Restart button outlined; coach mark points to Restart button
2. Setup button outlined; coach mark points to Setup button
3. Setup panel outlined; coach mark points to Setup panel`,
      arrowText: `1. Hazbot: First, **Restart** your model. (Step 1 of 3)
2. Hazbot: Click the **Setup** button. (Step 2 of 3)
3. Hazbot: Adjust the controls so the zones match the photos. (Step 3 of 3)
[Got it!]`,
      expression: "ranSimulation AND NOT setAnyZoneVar",
    },
    {
      id: 3,
      studentAction: "Ran the simulation with incorrect zone setup values",
      feedback: `Hazbot: Hmm, it looks like your zone setups do not match the photos. Let's change that so we can compare zones!
[Show me]`,
      visualFeedback: `1. Restart button outlined; coach mark points to Restart button
2. Setup button outlined; coach mark points to Setup button
3. Setup panel outlined; coach mark points to Setup panel`,
      arrowText: `1. Hazbot: First, **Restart** your model. (Step 1 of 3)
2. Hazbot: Click the **Setup** button. (Step 2 of 3)
3. Hazbot: Adjust the controls so the zones match the photos. (Step 3 of 3)
[Got it!]`,
      expression: "setAnyZoneVar AND ranSimulation WITH NOT CorrectZoneSetup",
    },
    {
      id: 4,
      studentAction: "Ran the simulation with correct zone setups but without one spark in each zone.",
      feedback: `Hazbot: I don't see a spark in each zone. Let's make sure that **both zones** have one spark!
[Show me]`,
      visualFeedback: `1. Restart button outlined; coach mark points to Restart button
2. Coach mark (no pointer) centered top
     - If 2 sparks were placed, do not outline the Spark button.
     - If only one spark was placed, then the Spark button is outlined.`,
      arrowText: `1. Hazbot: First, **Restart** your model. (Step 1 of 2)
2. Hazbot: Place one spark in Zone 1 and one spark in Zone 2, then run the model again. (Step 2 of 2)
[Got it!]`,
      expression: "ranSimulation WITH CorrectZoneSetup AND NOT OneSparkPerZone",
    },
    {
      id: 5,
      studentAction: "Ran the simulation with correct setups and one spark in each zone",
      feedback: `Hazbot: Great job! You’re ready to answer the questions below.
[Hooray!]`,
      visualFeedback: "Celebratory visual: Hazbot doffs his helmet and confetti falls out!",
      expression: "ranSimulation WITH CorrectZoneSetup AND OneSparkPerZone",
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
      details: "Terrain type is set per zone, in the zones data. Default values (see the \"SIMINIT\" sheet) = \"Plains\" (zone 1), \"Plains\" (zone 2).  <i> means taking the zone index i (the index for the zones data, which is, or must be, an array), 0-based.  So i=0 means zone 1 and i=1 means zone 2.  If true, then necessarily ranSimulation=true.",
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
      definition: "setTerrainType OR setVegetation OR setDroughtLevel",
      logEvents: [],
      details: "",
    },
    {
      name: "OneSparkPerZone",
      definition: "Simulation prop for whether one spark was used per each zone or not.",
      logEvents: ["SimulationStarted->sparks.<j>.zoneIdx"],
      details: "The sparks array must be of length 2, and the two zoneIdx values collected from the two sparks must cover 0 (zone 1) and 1 (zone 2).  <j> means taking the spark index (the index of the sparks data, which is, or must be, an array), 0-based.",
    },
    {
      name: "CorrectZoneSetup",
      definition: "Simulation prop for whether all zones were correctly set up.",
      logEvents: ["SimulationStarted->zones.<i>.terrainType", "SimulationStarted->zones.<i>.vegetation", "SimulationStarted->zones.<i>.droughtLevel"],
      details: "The correct zone settings for this activity are as follows. For zone 1 (i=0): terrainType \"Foothills\" or \"Plains\"; vegetation \"Grass\" or \"Shrub\" and droughtLevel \"Mild Drought\" or \"Medium Drought\".  For zone 2 (i=1): terrainType same as zone 1 or \"Foothills\", vegetation same as zone 1, and droughtLevel \"No Drought\" or \"Mild Drought\" under the condition that it must be edifferent from the zone 1 drought level.  Lastly, for every allowed setting defined thus far, get a new setting by swapping zone 1 and zone 2, and the new setting is still allowed.",
    }
  ],
};
