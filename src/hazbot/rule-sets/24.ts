// AUTO-GENERATED — DO NOT EDIT — re-run scripts/extract-hazbot-sheets.js

import { RuleSet } from "../engine";
import { WildfireDefaults } from "../wildfire/types";

export const ruleSet24: RuleSet<WildfireDefaults> = {
  id: "24",
  categories: [
    {
      id: 1,
      studentAction: "Did not run the simulation",
      feedback: "Hazbot: You haven’t run the model yet. Add sparks and run the model first.",
      visualFeedback: "Arrows pointing to the spark and the Play button",
      expression: "NOT ranSimulation",
    },
    {
      id: 2,
      studentAction: "Ran the simulation but did not change any variables (used default values only)",
      feedback: "Hazbot: This investigation is about wind. Run the model after changing the wind speed and wind direction.",
      visualFeedback: "Arrow pointing to the Setup button with the label: “Click here, then ‘Next’ to change wind speed or direction.”",
      expression: "uniqueNonZeroWindValuesUsed.size == 0 AND NOT setAnyZoneVar AND ranSimulation",
    },
    {
      id: 3,
      studentAction: "Ran the simulation and changed variables, but not wind speed or wind direction",
      feedback: "Hazbot: This investigation focuses on wind. Run the model again after changing the wind speed and direction.",
      visualFeedback: "Arrow pointing to the Setup button with the label: “Click here, then ‘Next’ to change wind speed or direction.”",
      expression: "uniqueNonZeroWindValuesUsed.size == 0 AND setAnyZoneVar",
    },
    {
      id: 4,
      studentAction: "Ran the simulation one time with different wind speeds or directions",
      feedback: "Hazbot: Keep going! Try a different windspeed and direction to compare!",
      visualFeedback: "Point to the “Setup” button.",
      expression: "NOT (uniqueWindValuesUsed.size > 1) AND uniqueNonZeroWindValuesUsed.size > 0",
    },
    {
      id: 5,
      studentAction: "Ran the simulation two or more times with different wind speeds or directions",
      feedback: "Hazbot: Great job! You’ve compared different wind conditions. You’re ready to answer the questions below.",
      visualFeedback: "Confetti animation or subtle celebratory visual",
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
      details: "Terrain type is set per zone, in the zones data. Default values = \"Plains\" (zone 1), \"Plains\" (zone 2).  <i> means taking the zone index i (the index for the zones data, which is, or must be, an array), 0-based.  So i=0 means zone 1 and i=1 means zone 2.  If true, then neecessarily ranSimulation=true.",
    },
    {
      name: "setVegetation",
      definition: "There is at least one \"SimulationStarted\" event for which the vegetation type was set distinct from the default value for any zone.",
      logEvents: ["SimulationStarted->zones.<i>.vegetation"],
      details: "Vegetation is set per zone, in the zones data.  Default values = \"Shrub\" (zone 1), \"Shrub\" (zone 2).  If true, then neecessarily ranSimulation=true.",
    },
    {
      name: "setDroughtLevel",
      definition: "There is at least one \"SimulationStarted\" event for which the drought level was set distinct from the default value for any zone.",
      logEvents: ["SimulationStarted->zones.<i>.droughtLevel"],
      details: "Drought level is set per zone, in the zones data.  Default values = \"Mild Drought\" (zone 1), \"Mild Drought\" (zone 2).  If true, then neecessarily ranSimulation=true.",
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
      details: "Wind is set globally (for all zones).  Default values = 0 (magnitude), 0 (direction).  If the magnitude is 0, then the direction has no effect and must be ignored.  So set the direction to null, if the magnitude is 0.  Here, the \"magnitude\" means the wind speed as displayed in the simulation (like \"10\" in \"10 MPH\").  In the log data, the magnituide data entails two fields \"wind.speed\" and \"wind.scaleFactor\".  The \"magitude\" is computed as \"wind.speed\" / \"wind.scaleFactor\".  Collect all unique wind values {magnitude, direction} (with direction = null if magnitude = 0).",
    },
    {
      name: "uniqueNonZeroWindValuesUsed",
      definition: "uniqueWindValuesUsed with no wind (magnitude = 0) removed.",
      logEvents: ["SimulationStarted->wind.speed", "wind.direction", "wind.scaleFactor"],
      details: "",
    }
  ],
};
