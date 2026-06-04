// AUTO-GENERATED — DO NOT EDIT — re-run scripts/extract-hazbot-sheets.js

import { RuleSet } from "../engine";
import { WildfireDefaults } from "../wildfire/types";

export const ruleSet47: RuleSet<WildfireDefaults> = {
  id: "47",
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
      studentAction: "Ran the simulation with changed vegetation type, drought, or wind.",
      feedback: `Hazbot: Looks like you changed the Setup. Let’s run the model using the original settings!
[Show me]`,
      visualFeedback: `1. Reload button outlined; coach mark points to Reload button
2. Start button outlined; coach mark points to Start button`,
      arrowText: `1. Hazbot: First, Reload your model. (Step 1 of 2)
2. Hazbot: Click Start to run the model! (Step 2 of 2)
[Got it!]`,
      expression: "ranSimulation WITH NOT DefaultVars",
    },
    {
      id: 3,
      studentAction: "Ran with original settings and with neither fireline nor helitack (but did not do the next step of running with fireline or helitack yet)",
      feedback: `Hazbot: Try using firelines and helitacks to contain the fire!
[Show me]`,
      visualFeedback: `1. Restart button outlined; coach mark points to Restart button
2. Fireline and Helitack buttons outlined (both are disabled) and Start button outlined; coach mark points to Fireline/Helitack buttons`,
      arrowText: `1. Hazbot: First, Restart your model. (Step 1 of 2)
2. Hazbot: Add both a Fireline and a Helitack while the model is running. Click Start to begin! (Step 2 of 2)
[Got it!]`,
      expression: "ranSimulation WITH DefaultVars AND NOT (Fireline OR Helitack)",
    },
    {
      id: 4,
      studentAction: "Ran with original settings and with at least one fireline or helitack, but without first running with original settings with neither fireline nor helitack",
      feedback: `Hazbot: Did you try running the model without firelines and helitacks to see where the fire spread?
[Show me]`,
      visualFeedback: `1. Restart the model; coach mark points to Restart button
2. Start button outlined; coach mark points to Start button`,
      arrowText: `1. Hazbot: First, Restart your model. (Step 1 of 2)
2. Hazbot: Click Start to run the model! (Step 2 of 2)
[Got it!]`,
      expression: "NOT ranSimulation WITH DefaultVars AND NOT (Fireline OR Helitack) AND ranSimulation WITH DefaultVars AND (Fireline OR Helitack)",
    },
    {
      id: 5,
      studentAction: "Ran with original settings and with at least one fireline or helitack, after (or before) running with original settings with neither fireline nor helitack",
      feedback: `Hazbot: Great job on this investigation! Keep working through the activity!
[Hooray!]`,
      visualFeedback: "Confetti animation or subtle celebratory visual",
      expression: "ranSimulation WITH DefaultVars AND NOT (Fireline OR Helitack) AND ranSimulation WITH DefaultVars AND (Fireline OR Helitack)",
    }
  ],
  factorVariables: [
    {
      name: "ranSimulation",
      definition: "At least one \"SimulationStarted\" event was recorded.",
      logEvents: ["SimulationStarted", "SimulationStopped", "SimulationRestarted", "SimulationReloaded", "TopBarReloadButtonClicked", "SimulationEnded"],
      details: "Each simulation run is started by 'SimulationStarted', and how it is paused, is resumed, and ends is determined by various events listed here.  It is necessary for this activity to monitor the end of the simulation as well as the beginning, since turning on a sim prop (\"Helitack\") relies on knowing that a simulation is in progress, and fireline installment events occur during a simulation pause.  A \"resuming SimulationStarted\" event is one that was preceded by a SimulationStopped and then started again (SimulationStarted) without being reset/ended (SimulationEnded, SimulationRestarted, SiumulationReloaded, TopBarReloadeButtonClicked; or the simulation being restarted by an embedding unit (such as an \"Activity Player\")) in between.  All other \"SimulationStarted\" events are \"non-resuming\".",
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
};
