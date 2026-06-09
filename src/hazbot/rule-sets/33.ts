// AUTO-GENERATED — DO NOT EDIT — re-run scripts/extract-hazbot-sheets.js

import { RuleSet } from "../engine";
import { WildfireDefaults } from "../wildfire/types";

export const ruleSet33: RuleSet<WildfireDefaults> = {
  id: "33",
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
3. Hazbot: Click each zone and change the vegetation to forest in one zone and forest with suppression in the other zone. Then run the model again. (Step 3 of 3)
[Got it!]`,
      expression: "ranSimulation AND NOT setAnyVar",
    },
    {
      id: 3,
      studentAction: "Ran the simulation with other zone setup variables changed but without assigning forest with and without suppression",
      feedback: `Hazbot: Don't forget to compare the two types of forest. I can help!
[Show me]`,
      visualFeedback: `1. Restart button outlined; coach mark points to Restart button
2. Setup button outlined; coach mark points to Setup button
3. Setup panel outlined; coach mark points to Setup panel`,
      arrowText: `1. Hazbot: First, Restart your model. (Step 1 of 3)
2. Hazbot: Now click the Setup button. (Step 2 of 3)
3. Hazbot: Click each zone and change the vegetation to forest in one zone and forest with suppression in the other zone. Then run the model again. (Step 3 of 3)
[Got it!]`,
      expression: "setAnyVar AND ranSimulation WITH NOT ForestWAWOSuppression",
    },
    {
      id: 4,
      studentAction: "Ran the simulation with zones with forest and forest w/ suppression, and a spark not placed in each zone",
      feedback: `Hazbot: I do not see a spark in each zone. Let’s put one in each so you can compare wildfire spread.
[Show me]`,
      visualFeedback: `1. Restart button outlined; coach mark points to Restart button
2. Coach mark (no pointer) centered top
     - If 2 sparks were placed, do not outline the Spark button.
     - If only one spark was placed, then the Spark button is outlined.`,
      arrowText: `1. Hazbot: First, Restart your model. (Step 1 of 2)
2. Hazbot: Now make sure there is a spark in each zone. Then run the model again. (Step 2 of 2)
[Got it!]`,
      expression: "ranSimulation WITH ForestWAWOSuppression AND NOT OneSparkPerZone",
    },
    {
      id: 5,
      studentAction: "Ran the simulation with zones with forest and forest w/ suppression, a spark placed in each zone, but different drought between the zones",
      feedback: `Hazbot: To compare forest types, make sure the drought level is the same in each zone!
[Show me]`,
      visualFeedback: `1. Restart button outlined; coach mark points to Restart button
2. Setup button outlined; coach mark points to Setup button
3. Setup panel outlined; coach mark points to Setup panel`,
      arrowText: `1. Hazbot: First, Restart your model. (Step 1 of 3)
2. Hazbot: Now click the Setup button. (Step 2 of 3)
3. Hazbot: Click each zone and adjust the drought level. Then run the model again. (Step 3 of 3)
[Got it!]`,
      expression: "ranSimulation WITH ForestWAWOSuppression AND OneSparkPerZone AND NOT UniformDroughtLevels",
    },
    {
      id: 6,
      studentAction: "Ran the simulation with zones with forest and forest w/ suppression, a spark in each zone, and same drought",
      feedback: `Hazbot: Great job! You’re ready to answer the questions below.
[Hooray!]`,
      visualFeedback: "Confetti animation or subtle celebratory visual",
      expression: "ranSimulation WITH ForestWAWOSuppression AND OneSparkPerZone AND UniformDroughtLevels",
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
      details: "Terrain type is set per zone, in the zones data. For the default values, read the \"SIMINIT\" sheet.  <i> means taking the zone index i (the index for the zones data, which is, or must be, an array), 0-based.  So i=0 means zone 1, etc.",
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
      definition: "setTerrainType OR setVegetation OR setDroughtLevel",
      logEvents: [],
      details: "",
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
      name: "OneSparkPerZone",
      definition: "Sim prop for whether one spark was used per each zone or not.",
      logEvents: ["SimulationStarted->sparks.<j>.zoneIdx"],
      details: "The sparks array must be of length 2, and the two zoneIdx values collected from the two sparks must cover 0 (zone 1) and 1 (zone 2).  <j> means taking the spark index (the index of the sparks data, which is, or must be, an array), 0-based.",
    },
    {
      name: "ForestWAWOSuppression",
      definition: "Sim prop for whether one zone was set for Forest with Suppression and the other for Forest.",
      logEvents: ["SimulationStarted->zones.<i>.vegetation"],
      details: "One zone (i = 0 or 1) must be set to vegetation \"Forest\" while the other zone (i = 1 or 0, respectively) must be set to \"Forest with Suppression\".",
    },
    {
      name: "UniformDroughtLevels",
      definition: "Sim prop for whether all drought levels for all zones were the same.",
      logEvents: ["SimulationStarted->zones.<i>.droughtLevel"],
      details: "The droughtLevel values for all zones (i=0, 1) must be identical.",
    }
  ],
};
