// AUTO-GENERATED — DO NOT EDIT — re-run scripts/extract-hazbot-sheets.js

import { RuleSet } from "../engine";
import { WildfireDefaults } from "../wildfire/types";

export const ruleSet24: RuleSet<WildfireDefaults> = {
  id: "24",
  categories: [
    {
      id: 1,
      studentAction: "Did not run the simulation. A.k.a. Click button (before they do anything else)",
      feedback: `Hazbot: Hello, again! I will analyze your model after you run it. Scroll up and follow the instructions at the top of the page!
[Okay]`,
      visualFeedback: "",
      expression: "NOT ranSimulation",
    },
    {
      id: 2,
      studentAction: "Ran the simulation with only default values.",
      feedback: `Hazbot: Looks like you haven’t changed the Setup yet. I can help!
[Show me]`,
      visualFeedback: `1. Restart button outlined; coach mark points to Restart button
2. Setup button outlined; coach mark points to Setup button
3. Next button on the Setup panel outlined; coach mark points to Next button
4. Wind section of Setup panel outlined; coach mark points to Setup panel`,
      arrowText: `1. Hazbot: First, Restart your model. (Step 1 of 4)
2. Hazbot: Now click the Setup button. (Step 2 of 4)
3. Hazbot: Click the Next button. (Step 3 of 4)
4. Change the Wind Direction and Wind Speed. Then run the model again. (Step 4 of 4)
[Got it!]`,
      expression: "uniqueNonZeroWindValuesUsed.size == 0 AND NOT setAnyZoneVar AND ranSimulation",
    },
    {
      id: 3,
      studentAction: "Ran the simulation with zone setups changed but without wind speed or wind direction changed.",
      feedback: `Hazbot: Let’s focus on wind. You can change the wind in the model Setup!
[Show me]`,
      visualFeedback: `1. Restart button outlined; coach mark points to Restart button
2. Setup button outlined; coach mark points to Setup button
3. Next button on the Setup panel outlined; coach mark points to Next button
4. Wind section of Setup panel outlined; coach mark points to Setup panel`,
      arrowText: `1. Hazbot: First, Restart your model. (Step 1 of 4)
2. Hazbot: Now click the Setup button. (Step 2 of 4)
3. Hazbot: Click the Next button. (Step 3 of 4)
4. Change the Wind Direction and Wind Speed. Then run the model again. (Step 4 of 4)
[Got it!]`,
      expression: "uniqueNonZeroWindValuesUsed.size == 0 AND setAnyZoneVar",
    },
    {
      id: 4,
      studentAction: "Ran the simulation once with a different wind speed or a direction",
      feedback: `Hazbot: Keep going! Set up the model with different wind settings to compare!
[Show me]`,
      visualFeedback: `1. Restart button outlined; coach mark points to Restart button
2. Setup button outlined; coach mark points to Setup button
3. Next button on the Setup panel outlined; coach mark points to Next button
4. Wind section of Setup panel outlined; coach mark points to Setup panel`,
      arrowText: `1. Hazbot: First, Restart your model. (Step 1 of 4)
2. Hazbot: Now click the Setup button. (Step 2 of 4)
3. Hazbot: Click the Next button. (Step 3 of 4)
4. Change the Wind Direction and Wind Speed. Then run the model again. (Step 4 of 4)
[Got it!]`,
      expression: "NOT (uniqueWindValuesUsed.size > 1) AND uniqueNonZeroWindValuesUsed.size > 0",
    },
    {
      id: 5,
      studentAction: "Ran the simulation two or more times with different wind speeds or directions",
      feedback: `Hazbot: Great job! You’re ready to answer the questions below.
[Hooray!]`,
      visualFeedback: "Celebratory visual: Hazbot doffs his helmet and confetti falls out!",
      expression: "uniqueWindValuesUsed.size > 1",
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
      details: "Terrain type is set per zone, in the zones data. Default values (see the \"SIMINIT\" sheet) = \"Plains\" (zone 1), \"Plains\" (zone 2).  <i> means taking the zone index i (the index for the zones data, which is, or must be, an array), 0-based.  So i=0 means zone 1 and i=1 means zone 2.  If true, then neecessarily ranSimulation=true.",
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
      name: "uniqueWindValuesUsed",
      definition: "The set of unique wind values used for all \"SimulationStarted\" events.",
      logEvents: ["SimulationStarted->wind.speed", "wind.direction", "wind.scaleFactor"],
      details: "Wind is set globally (for all zones).  Default values = 0 (magnitude), 0 (direction) (see the \"SIMINIT\" sheet).  If the magnitude is 0, then the direction has no effect and must be ignored.  So set the direction to null, if the magnitude is 0.  Here, the \"magnitude\" means the wind speed as displayed in the simulation (like \"10\" in \"10 MPH\").  In the log data, the magnituide data entails two fields \"wind.speed\" and \"wind.scaleFactor\".  The \"magitude\" is computed as \"wind.speed\" / \"wind.scaleFactor\".  Collect all unique wind values {magnitude, direction} (with direction = null if magnitude = 0).",
    },
    {
      name: "uniqueNonZeroWindValuesUsed",
      definition: "uniqueWindValuesUsed with no wind (magnitude = 0) removed.",
      logEvents: ["SimulationStarted->wind.speed", "wind.direction", "wind.scaleFactor"],
      details: "",
    }
  ],
};
