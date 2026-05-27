// AUTO-GENERATED — DO NOT EDIT — re-run scripts/extract-hazbot-sheets.js

import { RuleSet } from "../engine";
import { WildfireDefaults } from "../wildfire/types";

export const ruleSet33: RuleSet<WildfireDefaults> = {
  id: "33",
  categories: [
    {
      id: 1,
      studentAction: "Did not run the simulation",
      feedback: "Hazbot: You haven’t run the model yet. Run it before answering the questions.",
      visualFeedback: "Arrows pointing to the spark tool and the Play button",
      expression: "NOT ranSimulation",
    },
    {
      id: 2,
      studentAction: "Ran the simulation but did not change any variables (used default values only)",
      feedback: "Hazbot: Click “Setup” and set one zone to forest and the other to forest with suppression. Then run the model again.",
      visualFeedback: "Arrow pointing to the Setup button",
      expression: "ranSimulation AND NOT setAnyVar",
    },
    {
      id: 3,
      studentAction: "Ran the simulation and changed drought, terrain, and wind variables, but did not assign forest with and without suppression",
      feedback: "Hazbot: This investigation compares forests with and without suppression. Make sure the terrain and drought levels are the same in each zone.",
      visualFeedback: "Arrow pointing to Setup Wizard with the label: “Set vegetation here.”",
      expression: "setAnyVar AND ranSimulation WITH NOT ForestWAWOSuppression",
    },
    {
      id: 4,
      studentAction: "Ran the simulation with forest with and without suppression, but did not place two sparks (one in each zone)",
      feedback: "Hazbot: This model has two zones for comparison. Add one spark in each zone so you can compare wildfire spread.",
      visualFeedback: "Arrow pointing to spark tool with label: “Add a spark to each zone.” Show box to delineate zones.",
      expression: "ranSimulation WITH ForestWAWOSuppression AND NOT OneSparkPerZone",
    },
    {
      id: 5,
      studentAction: "Ran the simulation, set zones with forest and forest w/ suppression, and placed one spark in each zone",
      feedback: "Hazbot: Great job! You’re ready to answer the questions below.",
      visualFeedback: "Confetti animation or subtle celebratory visual",
      expression: "ranSimulation WITH ForestWAWOSuppression AND OneSparkPerZone",
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
      details: "Terrain type is set per zone, in the zones data. Default values = TBD.  <i> means taking the zone index i (the index for the zones data, which is, or must be, an array), 0-based.  So i=0 means zone 1, etc.",
    },
    {
      name: "setVegetation",
      definition: "There is at least one \"SimulationStarted\" event for which the vegetation type was set distinct from the default value for any zone.",
      logEvents: ["SimulationStarted->zones.<i>.vegetation"],
      details: "Vegetation is set per zone, in the zones data.  Default values = TBD.",
    },
    {
      name: "setDroughtLevel",
      definition: "There is at least one \"SimulationStarted\" event for which the drought level was set distinct from the default value for any zone.",
      logEvents: ["SimulationStarted->zones.<i>.droughtLevel"],
      details: "Drought level is set per zone, in the zones data.  Default values = TBD.",
    },
    {
      name: "setAnyZoneVar",
      definition: "setVegetation OR setDroughtLevel",
      logEvents: [],
      details: "",
    },
    {
      name: "setWind",
      definition: "There is at least one \"SimulationStarted\" event for which the wind value was set distinct from the default value for any zone.",
      logEvents: ["SimulationStarted->wind.speed", "wind.direction", "wind.scaleFactor"],
      details: "Wind is set globally (for all zones).  Default values: magnitue = TBD and direction = TBD.  If the magnitude is 0, then the direction has no effect and must be ignored.  So set the direction to null, if the magnitude is 0.  Here, the \"magnitude\" means the wind speed as displayed in the simulation (like \"10\" as in \"10 MPH\").  In the log data, the magnituide data entails two fields \"wind.speed\" and \"wind.scaleFactor\".  The \"magitude\" is computed as \"wind.speed\" / \"wind.scaleFactor\".",
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
      details: "The sparks array must be of length 2, and the three zoneIdx values collected from the three sparks must cover 0 and 1.  <j> means taking the spark index (the index of the sparks data, which is, or must be, an array), 0-based.",
    },
    {
      name: "ForestWAWOSuppression",
      definition: "Sim prop for whether one zone was set for Forest with Suppression and the other for Forest.",
      logEvents: ["SimulationStarted->zones.<i>.vegetation"],
      details: "One zone must be set to vegetation \"Forest\" whiel the other zone must be set to \"Forest with Suppression\".",
    }
  ],
};
