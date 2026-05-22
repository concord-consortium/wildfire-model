// AUTO-GENERATED — DO NOT EDIT — re-run scripts/extract-hazbot-sheets.js

import { RuleSet } from "../engine";
import { WildfireDefaults } from "../wildfire/types";

export const ruleSet25: RuleSet<WildfireDefaults> = {
  id: "25",
  categories: [
    {
      id: 1,
      studentAction: "Did not run the simulation A.k.a. Click button (before they do anything else)",
      feedback: `Hazbot: I will analyze your model after you run it. Scroll up to see the instructions at the top of the page!
[Okay]`,
      visualFeedback: "",
      expression: "NOT ranSimulation",
    },
    {
      id: 2,
      studentAction: "Ran the simulation with only one spark",
      feedback: `Hazbot: I only see 1 spark. Make sure each zone has a spark!
[Show me]`,
      visualFeedback: `1. Restart button outlined; coach mark points to Restart button
2. Coach mark (no pointer) centered top`,
      arrowText: `1. Hazbot: Restart your model first. (Step 1 of 2)
2. Hazbot: Place one spark in Zone 1 and one spark in Zone 2, then run the model again. (Step 2 of 2)
[Got it!]`,
      expression: "ranSimulation WITH NOT TwoSparks",
    },
    {
      id: 3,
      studentAction: "Ran the simulation with two sparks in the same zone.",
      feedback: `Hazbot: I see 2 sparks in the same zone. Let's make sure that each zone has 1 spark!
[Show me]`,
      visualFeedback: `1. Restart button outlined; coach mark points to Restart button
2. Coach mark (no pointer) centered top`,
      arrowText: `1. Hazbot: Restart your model first. (Step 1 of 2)
2. Hazbot: Place one spark in Zone 1 and one spark in Zone 2, then run the model again. (Step 2 of 2)
[Got it!]`,
      expression: "ranSimulation WITH NOT OneSparkPerZone AND TwoSparks",
    },
    {
      id: 4,
      studentAction: "Ran the simulation and placed two sparks, but not at the top and bottom of the mountain",
      feedback: "Hazbot: Make sure to place one spark at the top of a mountain and one at the bottom!",
      visualFeedback: "Arrows pointing to the top and bottom of a mountain on the visual display (one in each zone)",
      expression: "ranSimulation WITH OneSparkPerZone AND NOT SparksAtTopAndBottom",
    },
    {
      id: 5,
      studentAction: "Ran the simulation with one spark at the top and one at the bottom of the mountain but with different zone setups.",
      feedback: "Hazbot: Looks like the two zones are different. Make sure they have the same vegetation and drought!",
      visualFeedback: `1. Restart button outlined; coach mark points to Restart button
2. Setup button outlined; coach mark points to Setup button
3. Setup panel outlined; coach mark points to Setup panel`,
      arrowText: `1. Hazbot: First, Restart your model. (Step 1 of 3)
2. Hazbot: Now click the Setup button. (Step 2 of 3)
3. Hazbot: Make sure the conditions are the same in each zone. (Step 3 of 3)`,
      expression: "ranSimulation WITH OneSparkPerZone AND SparksAtTopAndBottom AND NOT UniformZoneSettings",
    },
    {
      id: 6,
      studentAction: "Ran the simulation with one spark at the top and one at the bottom of the mountain with the same zone setups.",
      feedback: "Hazbot: Great job! You’re ready to answer the questions below.",
      visualFeedback: "Confetti animation or subtle celebratory visual",
      expression: "ranSimulation WITH OneSparkPerZone AND SparksAtTopAndBottom AND UniformZoneSettings",
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
      details: "The sparks array must be of length 2, and the two zoneIdx values collected from the two sparks must cover 0 (zone 1) and 1 (zone 2).  <j> means taking the spark index (the index of the sparks data, which is, or must be, an array), 0-based.",
    },
    {
      name: "SparksAtTopAndBottom",
      definition: "Simulation prop for whether or not one spark was at or near the top (ridge), while the other spark was at or near the bottom (valley).",
      logEvents: ["SimulationStarted->sparks.<j>.x", "y", "elevation"],
      details: "The sparks array must be of length 2, and the x,y,elevation values for the sparks must be such that one spark is near/at the ridge, while the other spark is near/at the valley.   The code needs to be written based on the topograhy map used and the x, y, elevaation values for the spark locations.  One way to do it would be pre-trace the ridge lines and the valley lines and determine if the spark locations are close enough to them (this work never done before; Alert: new algorithm coding required here).",
    },
    {
      name: "UniformZoneSettings",
      definition: "Simulation prop for whether all zones were set up the same way",
      logEvents: ["SimulationStarted->zones.<i>.terrainType", "SimulationStarted->zones.<i>.vegetation", "SimulationStarted->zones.<i>.droughtLevel"],
      details: "For the two zones (i=0 and i=1), the droughtLevel values must be the same, as must be the vegetation values.  The terrainType values should be the same by design (see the \"SIMINIT\" sheet).",
    }
  ],
};
