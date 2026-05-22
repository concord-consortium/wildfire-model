// AUTO-GENERATED — DO NOT EDIT — re-run scripts/extract-hazbot-sheets.js

import { RuleSet } from "../engine";
import { WildfireDefaults } from "../wildfire/types";

export const ruleSet25: RuleSet<WildfireDefaults> = {
  id: "25",
  categories: [
    {
      id: 1,
      studentAction: "Did not run the simulation",
      feedback: "Hazbot: You haven’t run the model yet. Add sparks and run the model first.",
      visualFeedback: "Arrows pointing to the spark tool and the Play button",
      expression: "NOT ranSimulation",
    },
    {
      id: 2,
      studentAction: "Ran the simulation and placed only one spark",
      feedback: "Hazbot: Place two sparks, one in each zone! One at the top and one at the bottom of a mountain!",
      visualFeedback: "Arrow pointing to the spark tool with the label: “Place a spark in each zone.” Point One at the top of a mountain, one at the bottom.",
      expression: "ranSimulation WITH NOT TwoSparks",
    },
    {
      id: 3,
      studentAction: "Ran the simulation and placed two sparks in the same zone.",
      feedback: "Hazbot: You placed two sparks in the same zone. To compare the graphs, place one spark in each zone.",
      visualFeedback: "Arrows pointing to somewhere in zone 1 and somewhere in zone 2.",
      expression: "ranSimulation WITH NOT OneSparkPerZone AND TwoSparks",
    },
    {
      id: 4,
      studentAction: "Ran the simulation and placed two sparks, but not at the top and bottom of the mountain",
      feedback: "Hazbot: You placed two sparks, but you need to place one spark at the top of the mountain and the other at the bottom.",
      visualFeedback: "Arrows pointing to the top and bottom of a mountain on the visual display (one in each zone)",
      expression: "ranSimulation WITH OneSparkPerZone AND NOT SparksAtTopAndBottom",
    },
    {
      id: 5,
      studentAction: "Ran the simulation at least once with 2 sparks, one on each zone. Never opened graph!",
      feedback: "Great job setting up the experiment! Now, open the graph to compare the number of acres burned.",
      visualFeedback: "Arrows pointing to the graph tab.",
      expression: "ranSimulation WITH OneSparkPerZone AND NOT GraphOpen",
    },
    {
      id: 6,
      studentAction: "Ran the simulation and placed one spark at the top and one at the bottom of the mountain, and opened the graph.",
      feedback: "Hazbot: Great job! You’re ready to answer the questions below.",
      visualFeedback: "Confetti animation or subtle celebratory visual",
      expression: "ranSimulation WITH OneSparkPerZone AND SparksAtTopAndBottom AND GraphOpen",
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
      name: "TwoSparks",
      definition: "Simulation prop for whether two sparks were used.",
      logEvents: ["SimulationStarted->sparks"],
      details: "The sparks array must be of length 2 for this variable to be true.  If false, then it means that there was exactly one spark in the simulation.",
    },
    {
      name: "OneSparkPerZone",
      definition: "Simulation prop for whether one spark was used per each zone or not.",
      logEvents: ["SimulationStarted->sparks.<j>.zoneIdx"],
      details: "The sparks array must be of length 2, and the three zoneIdx values collected from the three sparks must cover 0 (zone 1) and 1 (zone 2).  <j> means taking the spark index (the index of the sparks data, which is, or must be, an array), 0-based.",
    },
    {
      name: "SparksAtTopAndBottom",
      definition: "Simulation prop for whether or not one spark was at or near the top (ridge), while the other spark was at or near the bottom (valley).",
      logEvents: ["SimulationStarted->sparks.<j>.x", "y", "elevation"],
      details: "The sparks array must be of length 2, and the x,y,elevation values for the sparks must be such that one spark is near/at the ridge, while the other spark is near/at the valley.   The code needs to be written based on the topograhy map used and the x, y, elevaation values for the spark locations.  One way to do it would be pre-trace the ridge lines and the valley lines and determine if the spark locations are close enough to them (this work never done before; Alert: new algorithm coding required here).",
    },
    {
      name: "GraphOpen",
      definition: "Smulation prop for whether or not graph was opened from the beginning of the simulation or during the simulation.",
      logEvents: ["ChartTabShown", "ChartTabHidden", "TopBarReloadButtonClicked"],
      details: "This requires tracking of the chart tab show/hidden state throughout the activity.  The state is toggled by ChartTabShown and ChartTabHiddent events and is reset to hidden by the TopBarReloadButtonClicked event.",
    }
  ],
};
