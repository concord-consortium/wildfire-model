// AUTO-GENERATED — DO NOT EDIT — re-run scripts/extract-hazbot-sheets.js

import { RuleSet } from "../engine";
import { WildfireDefaults } from "../wildfire/types";

export const ruleSet41: RuleSet<WildfireDefaults> = {
  id: "41",
  categories: [
    {
      id: 1,
      studentAction: "Did not run the simulation. A.k.a. Click button (before they do anything else)",
      feedback: `Hazbot: Remember, you need to run the model. 
[Okay]`,
      visualFeedback: "",
      expression: "NOT ranSimulation",
    },
    {
      id: 2,
      studentAction: "Ran the simulation with a changed vegetation type, drought, or wind.",
      feedback: `Hazbot: Let’s run the model using the original settings!
[Show me]`,
      feedbackRound2: `Hazbot: If you have changed the model setup, click **Clear All** to reset the model and run it again!
[Show me]`,
      feedbackRound3: `Hazbot: In this investigation, you will run the model 3 times **without** changing the setup! Scroll down to take a snapshot of your model!
[Okay]`,
      visualFeedback: `1. Clear All button outlined; coach mark points to Clear All button
2. Start button outlined; coach mark points to Start button`,
      arrowText: `1. Hazbot: First, click **Clear All** to reset your model. (Step 1 of 2)
2. Hazbot: Click **Start** to run the model! (Step 2 of 2)
[Got it!]`,
      expression: "ranSimulation WITH NOT DefaultVars",
    },
    {
      id: 3,
      studentAction: `Ran the simulation 
without changed variables.`,
      feedback: `Hazbot: Great job! You’re ready to answer the questions below.
[Hooray!]`,
      visualFeedback: "Confetti animation or subtle celebratory visual",
      expression: "ranSimulation WITH DefaultVars",
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
      name: "DefaultVars",
      definition: "Sim prop for whether all variables were held at default values.",
      logEvents: ["SimulationStarted->zones.<i>.vegetation", "SimulationStarted->zones.<i>.droughtLevel", "SimulationStarted->wind.speed", "wind.direction", "wind.scaleFactor"],
      details: "The values of all variables adjustable, namely vegetations and droughtLevels for all zones and the wind (magnitude and direction), must be equal to their default values (see the \"SIMINIT\" sheet) for this sim prop to be true.  For continous variables such as wind magnitude and wind angle, tolerance windows must be applied for the equality test (+- 2 for magnitude, and +- 20 for angle).",
    }
  ],
  repeatFeedback: {
    id: 100,
    studentAction: "Student repeats run after success and wants more feedback from Hazbot",
    feedback: `Hazbot: Great job on this investigation! Keep working through the activity!
[Got it!]`,
  },
};
