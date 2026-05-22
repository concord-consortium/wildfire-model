// AUTO-GENERATED — DO NOT EDIT — re-run scripts/extract-hazbot-sheets.js

import { RuleSet } from "../engine";
import { WildfireDefaults } from "../wildfire/types";

export const ruleSet35: RuleSet<WildfireDefaults> = {
  id: "35",
  categories: [
    {
      id: 1,
      studentAction: "Did not run the simulation",
      feedback: "Hazbot: You haven’t run the model yet. Run it before answering the questions.",
      visualFeedback: "",
      expression: "NOT ranSimulation",
    },
    {
      id: 2,
      studentAction: "Ran the simulation with default setup values only",
      feedback: "Hazbot: Click “Setup” and change the conditions to compare forest with and without suppression. Then run the model again.",
      visualFeedback: `1. Restart button outlined; coach mark points to Restart button
2. Setup button outlined; coach mark points to Setup button
3. Next button on the Setup panel outlined; coach mark points to Next button
4. Wind section of Setup panel outlined; coach mark points to Setup panel`,
      arrowText: `1. Hazbot: First, Restart your model. (Step 1 of 4)
2. Hazbot: Now click the Setup button. (Step 2 of 4)
3. Hazbot: Set one zone to forest and the other zone to forest with suppression. (Step 3 of 4)
4. Run the model again. (Step 4 of 4)
[Got it!]`,
      expression: "ranSimulation AND NOT setAnyVar",
    },
    {
      id: 3,
      studentAction: "Ran the simulation with terrain, drought or wind changed but without assigning forest with and without suppression to each zone",
      feedback: "Hazbot: Let’s focus on forests with and without suppression in the vegetation settings.",
      visualFeedback: `1. Restart button outlined; coach mark points to Restart button
2. Setup button outlined; coach mark points to Setup button
3. Next button on the Setup panel outlined; coach mark points to Next button
4. Wind section of Setup panel outlined; coach mark points to Setup panel`,
      arrowText: `1. Hazbot: First, Restart your model. (Step 1 of 4)
2. Hazbot: Now click the Setup button. (Step 2 of 4)
3. Hazbot: Set one zone to forest and the other zone to forest with suppression. (Step 3 of 4)
4. Run the model again. (Step 4 of 4)
[Got it!]`,
      expression: "ranSimulation WITH NOT ForestWAWOSuppression",
    },
    {
      id: 4,
      studentAction: "Ran the simulation with forest and forest with suppression assigned but with different drought levels between the zones",
      feedback: "Hazbot: To compare forest types, make sure the both zones have the same drought level!",
      visualFeedback: `1. Restart button outlined; coach mark points to Restart button
2. Setup button outlined; coach mark points to Setup button
3. Setup panel outlined; coach mark points to Setup panel`,
      arrowText: `1. Hazbot: First, Restart your model. (Step 1 of 3)
2. Hazbot: Now click the Setup button. (Step 2 of 3)
3. Hazbot: Click each zone and make sure the drought is the same. Then run the model again. (Step 3 of 3)
[Got it!]`,
      expression: "ranSimulation WITH ForestWAWOSuppression AND NOT UniformDroughtLevels",
    },
    {
      id: 5,
      studentAction: "Ran the simulation with forest with and without suppression assigned but different terrains between the zones",
      feedback: "Hazbot: To compare forest types, make sure both zones have mountains.",
      visualFeedback: `1. Restart button outlined; coach mark points to Restart button
2. Setup button outlined; coach mark points to Setup button
3. Setup panel outlined; coach mark points to Setup panel`,
      arrowText: `1. Hazbot: First, Restart your model. (Step 1 of 3)
2. Hazbot: Now click the Setup button. (Step 2 of 3)
3. Hazbot: Click each zone and make sure the terrain is the same. Then run the model again. (Step 3 of 3)
[Got it!]`,
      expression: "ranSimulation WITH ForestWAWOSuppression AND NOT UniformTerrainTypes",
    },
    {
      id: 6,
      studentAction: "Ran the simulation with forest with and without suppression, same drought and terrain types between zones, but without a spark in each zone",
      feedback: "Hazbot: I don’t see a spark in both zones. Add one spark to each so you can compare wildfire spread.",
      visualFeedback: `1. Restart button outlined; coach mark points to Restart button
2. Coach mark (no pointer) centered top
3. Spark button outlined`,
      arrowText: `1. Hazbot: First, Restart your model. (Step 1 of 2)
2. Hazbot: Place one spark in Zone 1 and one spark in Zone 2, then run the model again. (Step 2 of 2)
[Got it!]`,
      expression: "ranSimulation WITH ForestWAWOSuppression AND UniformTerrainTypes AND UniformDroughtLevels AND NOT OneSparkPerZone",
    },
    {
      id: 7,
      studentAction: "Ran the simulation with forest with and without suppression, same drought and terrain between zones, and a spark in each zone",
      feedback: "Hazbot: Great job! You’re ready to answer the questions below.",
      visualFeedback: "Confetti animation or subtle celebratory visual",
      expression: "ranSimulation WITH ForestWAWOSuppression AND UniformTerrainTypes AND UniformDroughtLevels AND OneSparkPerZone",
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
      details: "Terrain type is set per zone, in the zones data.  For the default values, read the \"SIMINIT\" sheet.  <i> means taking the zone index i (the index for the zones data, which is, or must be, an array), 0-based.  So i=0 means zone 1 and i=1 means zone 2.  If true, then neecessarily ranSimulation=true.",
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
      definition: "setTerrainType OR setVegetation OR setDroughtLevel",
      logEvents: [],
      details: "",
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
      definition: "Sim prop for whether the drought levels for all zones were the same.",
      logEvents: ["SimulationStarted->zones.<i>.droughtLevel"],
      details: "The droughtLevel values for all zones (i=0, 1) must be identical.",
    },
    {
      name: "UniformTerrainTypes",
      definition: "Sim prop for whether the terrain types for all zones were the same.",
      logEvents: ["SimulationStarted->zones.<i>.terrainType"],
      details: "The terrainType values for all zones (i=0, 1) must be identical.",
    }
  ],
};
