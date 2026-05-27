// AUTO-GENERATED — DO NOT EDIT — re-run scripts/extract-hazbot-sheets.js

import { RuleSet } from "../engine";
import { WildfireDefaults } from "../wildfire/types";

export const ruleSet32: RuleSet<WildfireDefaults> = {
  id: "32",
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
      feedback: "Hazbot: Click “Setup” and change the vegetation type so one zone is grass, one is shrub, and the other is forest. Then run the model again.",
      visualFeedback: "Arrow pointing to the Setup button and a 3 box overlay.",
      expression: "ranSimulation AND NOT setAnyZoneVar",
    },
    {
      id: 3,
      studentAction: "Ran the simulation and changed drought (terrain cannot be changed), but did not assign three different vegetation types (one per zone)",
      feedback: "Hazbot: This investigation compares vegetation types. Set each zone to a different vegetation type—grass, shrub, and forest—then run the model again.",
      visualFeedback: "Arrow pointing to Setup Wizard with the label: “Set vegetation here.”",
      expression: "setDroughtLevel AND NOT ranSimulation WITH UniqueVegetationPerZone",
    },
    {
      id: 4,
      studentAction: "Ran the simulation with 3 vegetations (one per zone) but ALSO changed drought",
      feedback: "Hazbot: This investigation compares vegetation types not drought. Make sure the drought is the same for each zone. Then run the model again.",
      visualFeedback: "Arrow pointing to Setup with the label: “Set vegetation here.”",
      expression: "ranSimulation WITH UniqueVegetationPerZone AND NOT UniformDroughtLevels",
    },
    {
      id: 5,
      studentAction: "Ran the simulation with three vegetation types, but did not place three sparks (one in each zone)",
      feedback: "Hazbot: This model has three zones for comparison. Add one spark in each zone so you can compare wildfire spread.",
      visualFeedback: "Arrow pointing to spark tool with label: “Add a spark to each zone.” Add boxes to show 3 zones.",
      expression: "ranSimulation WITH UniqueVegetationPerZone AND NOT OneSparkPerZone",
    },
    {
      id: 6,
      studentAction: "Ran the simulation, set each zone to a different vegetation type, and placed one spark in each zone",
      feedback: "Hazbot: Great job! You’re ready to answer the questions below.",
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
      details: "Vegetation is set per zone, in the zones data.  Default values = TBD (activity revision).  If true, then neecessarily ranSimulation=true.",
    },
    {
      name: "setDroughtLevel",
      definition: "There is at least one \"SimulationStarted\" event for which the drought level was set distinct from the default value for any zone.",
      logEvents: ["SimulationStarted->zones.<i>.droughtLevel"],
      details: "Drought level is set per zone, in the zones data.  Default values = TBD (activity revision).  If true, then neecessarily ranSimulation=true.",
    },
    {
      name: "setAnyZoneVar",
      definition: "setVegetation OR setDroughtLevel",
      logEvents: [],
      details: "Terrain types are fixed in this activity.",
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
      details: "There are four vegetation types available.  The three vegetations assigned to the three zones must be a subset of three distinct vegetations.",
    },
    {
      name: "UniformDroughtLevels",
      definition: "Sim prop for whether all drought levels for all zones were the same.",
      logEvents: ["SimulationStarted->zones.<i>.droughtLevel"],
      details: "",
    }
  ],
};
