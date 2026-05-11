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
      visualFeedback: "Arrows pointing to the spark tool and the Play button",
      expression: "NOT ranSimulation",
    },
    {
      id: 2,
      studentAction: "Ran the simulation but did not change any variables (used default values only)",
      feedback: "Hazbot: Click “Setup” and change the conditions to compare forest with and without suppression. Then run the model again.",
      visualFeedback: "Arrow pointing to the Setup button, open setup and point to forest with suppression",
      expression: "ranSimulation AND NOT setAnyVar",
    },
    {
      id: 3,
      studentAction: "Ran the simulation but did not assign forest with and without suppression to each zone",
      feedback: "Hazbot: This investigation compares forests with and without suppression. Set one zone to forest and the other to forest with suppression.",
      visualFeedback: "Arrow pointing to Setup Wizard with the label: “Set vegetation here.”",
      expression: "ranSimulation WITH NOT ForestWAWOSuppression",
    },
    {
      id: 4,
      studentAction: "Ran the simulation with 2 vegetations but varied drought between the zones",
      feedback: "Hazbot: This investigation compares forest types. Make sure the drought is the same for each zone. Then run the model again.",
      visualFeedback: "Arrow pointing to Setup with the label: “Set vegetation here.”",
      expression: "ranSimulation WITH ForestWAWOSuppression AND NOT UniformDroughtLevels",
    },
    {
      id: 4,
      studentAction: "Ran the simulation with 2 vegetations but varied terrain between the zones",
      feedback: "Hazbot: This investigation compares forest types in the same terrain! Make sure both zones are mountains. Then run the model again.",
      visualFeedback: "Arrow pointing to Setup with the label: “Set terrain here.”",
      expression: "ranSimulation WITH ForestWAWOSuppression AND NOT UniformTerrainTypes",
    },
    {
      id: 5,
      studentAction: "Ran the simulation with forest with and without suppression, but did not place two sparks (one in each zone)",
      feedback: "Hazbot: This model has two zones for comparison. Add one spark in each zone so you can compare wildfire spread.",
      visualFeedback: "Arrow pointing to spark tool with label: “Add a spark to each zone.” Use the box overlay.",
      expression: "ranSimulation WITH ForestWAWOSuppression AND UniformTerrainTypes AND UniformDroughtLevels AND NOT OneSparkPerZone",
    },
    {
      id: 6,
      studentAction: "Ran the simulation, set zones with forest and forest w/ suppression,, and placed one spark in each zone",
      feedback: "Hazbot: Great job! You set up the model to compare two types of forest. You’re ready to answer the questions below.",
      visualFeedback: "Confetti animation or subtle celebratory visual",
      expression: "ranSimulation WITH ForestWAWOSuppression AND UniformTerrainTypes AND UniformDroughtLevels AND OneSparkPerZone",
    }
  ],
  factorVariables: [
    {
      name: "All factor variables and sim props used here already appeared in previvous pages, with the single exception being UniformTerrainTypes.  However, its definition is totally analogous to that of UniformDroughtLevels (see 32).",
      definition: "",
      logEvents: [],
      details: "",
    }
  ],
  defaults: {},
};
