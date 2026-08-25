// AUTO-GENERATED — DO NOT EDIT — re-run scripts/extract-hazbot-sheets.js

import { RuleSet } from "../engine";
import { WildfireDefaults } from "../wildfire/types";

export const ruleSet44: RuleSet<WildfireDefaults> = {
  id: "44",
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
      feedback: `Hazbot: Looks like you changed the Setup. Let’s run the model using the original settings!
[Show me]`,
      feedbackRound2: `Hazbot: If you have changed the model setup, click **Clear All** to reset the model and run it again!
[Show me]`,
      feedbackRound3: `Hazbot: In this investigation, you will run the model **without** changing the setup! Scroll down and look at the questions!
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
      studentAction: `Ran the model with no setup changes and with no fireline and helitacks

OR 
With firelines only
 
OR 
with helitacks only 
 
in a single or multiple trials.`,
      feedback: `Hazbot: Try using both the **firelines and helitacks!**
[Show me]`,
      feedbackRound2: `Hazbot: Go up and look at the instructions under "Fire Containment Investigation" again. Try using **helitacks** and **firelines** to contain the fire!
[Show me]`,
      feedbackRound3: `Hazbot: In this investigation, you must try to contain the fire with **helitacks** and **firelines**! Scroll down and see if you can answer the questions!
[Okay]`,
      visualFeedback: `1. Restart button outlined; coach mark points to Restart button
2. Fireline and Helitack buttons outlined (both are disabled) and Start button outlined; coach mark points to Fireline/Helitack buttons`,
      arrowText: `1. Hazbot: First, **Restart** your model. (Step 1 of 2)
2. Hazbot: Add both a **Fireline** and a **Helitack** while the model is running. Click **Start** to begin! (Step 2 of 2)
[Got it!]`,
      expression: "NOT (usedFireline AND usedHelitack) AND ranSimulation WITH DefaultVars",
    },
    {
      id: 4,
      studentAction: "Ran the model with no setup changes and with both firelines and helitacks used in a single or multiple trials.",
      feedback: `Hazbot: Great job! You’re ready to answer the questions below.
[Hooray!]`,
      visualFeedback: "Confetti animation or subtle celebratory visual",
      expression: "ranSimulation WITH DefaultVars AND Fireline AND ranSimulation WITH DefaultVars AND Helitack",
    }
  ],
  factorVariables: [
    {
      name: "ranSimulation",
      definition: "At least one \"non-resuming SimulationStarted\" event was recorded.",
      logEvents: ["SimulationStarted", "SimulationStopped", "SimulationRestarted", "SimulationReloaded", "TopBarReloadButtonClicked", "SimulationEnded"],
      details: "Each simulation run is started by 'SimulationStarted', and how it is paused, is resumed, and ends is determined by various events listed here.  It is necessary for this activity to monitor the end of the simulation as well as the beginning, since turning on a sim prop (\"Helitack\") relies on knowing that a simulation is in progress, and fireline installation events occur during a simulation pause.  A \"resuming SimulationStarted\" event is one that was preceded by a SimulationStopped and then started again (SimulationStarted) without being reset/ended (SimulationEnded, SimulationRestarted, SimulationReloaded, TopBarReloadButtonClicked; or the simulation being restarted by an embedding unit (such as an \"Activity Player\")) in between.  All other \"SimulationStarted\" events are \"non-resuming\".",
    },
    {
      name: "usedFireline",
      definition: "There is at least one \"SimulationStarted\" event for which firelines were set up.",
      logEvents: ["SimulationStarted->fireLineMarkers"],
      details: "If there were any firelines set up for the simulation run, then the value of \"fireLineMarkers\" should be an array of length 2 (or more?).  If there were no firelines set up, then the value of \"fireLineMarkers\" would be an empty array.",
    },
    {
      name: "usedHelitack",
      definition: "There is at least one simulation run, during which helitack was used.",
      logEvents: ["Helitack"],
      details: "A \"Helitack\" event is associated with a simulation run if it is triggered during a simulation run, but a Helitack event can also occur outside a simulation run.  Only the first kind is meaningful here.  So, it must be verified that a Helitack event occurs after a simulation started but before it ended (see \"ranSimulation\" above).",
    },
    {
      name: "Fireline",
      definition: "Sim prop for whether any firelines were set up for the simulation run.",
      logEvents: ["SimulationStarted->fireLineMarkers"],
      details: "If there were any firelines set up for the simulation run, then the value of \"fireLineMarkers\" should be an array of length 2 (or more?).  If there were no firelines set up, then the value of \"fireLineMarkers\" would be an empty array.   Here, both resuming and non-resuming \"SimulationStarted\" events must be examined, with the non-resuming SimulationStarted event marking a true start of a simulation run, to which this sim prop should apply as an initial value (non-resuming) and an updated value (resuming).",
    },
    {
      name: "Helitack",
      definition: "Sim prop for whether helitack was used during the simulation run.",
      logEvents: ["Helitack"],
      details: "A \"Helitack\" event is associated with a simulation run if it is triggered during a simulation run, but a Helitack event can also occur outside a simulation run.  Only the first kind is meaningful here.  So, it must be verified that a Helitack event occurs after a simulation started but before it ended (see \"ranSimulation\" above).",
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
