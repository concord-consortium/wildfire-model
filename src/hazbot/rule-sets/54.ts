// AUTO-GENERATED — DO NOT EDIT — re-run scripts/extract-hazbot-sheets.js

import { RuleSet } from "../engine";
import { WildfireDefaults } from "../wildfire/types";

export const ruleSet54: RuleSet<WildfireDefaults> = {
  id: "54",
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
      studentAction: "Ran the simulation with changed vegetation but without severe drought assigned to all three zones.",
      feedback: `Hazbot: Let’s focus on severe drought conditions.
[Show me]`,
      visualFeedback: `1. Restart button outlined; coach mark points to Restart button
2. Setup button outlined; coach mark points to Setup button
3. Setup panel outlined; coach mark points to Setup panel`,
      arrowText: `1. Hazbot: First, Restart your model. (Step 1 of 3)
2. Hazbot: Now click the Setup button. (Step 2 of 3)
3. Hazbot: Change the drought in each zone to severe! Then run the model again. (Step 3 of 3)
[Got it!]`,
      expression: "ranSimulation WITH NOT DefaultVegetations OR NOT SevereDroughts",
    },
    {
      id: 3,
      studentAction: "Ran with original vegetation setting and severe drought across all three zones but without fireline or helitack",
      feedback: "Hazbot: Try using firelines and helitacks to contain the fire! [Show me]",
      visualFeedback: `1. Restart button outlined; coach mark points to Restart button
2. Fireline and Helitack buttons outlined (both are disabled) and Start button outlined; coach mark points to Fireline/Helitack buttons`,
      arrowText: `1. Hazbot: First, Restart your model. (Step 1 of 2)
2. Hazbot: Add both a Fireline and a Helitack while the model is running. Click Start to begin! (Step 2 of 2)
[Got it!]`,
      expression: "ranSimulation WITH DefaultVegetations AND SevereDroughts AND NOT (Fireline OR Helitack)",
    },
    {
      id: 4,
      studentAction: "Ran with original vegetation setting and severe drought across all three zones and with at least one fireline or helitack in one or more trials",
      feedback: `Hazbot: Great job on this investigation! Keep working through the activity!
[Hooray!]`,
      visualFeedback: "Confetti animation or subtle celebratory visual",
      expression: "ranSimulation WITH DefaultVegetations AND SevereDroughts AND (Fireline OR Helitack)",
    }
  ],
  factorVariables: [
    {
      name: "ranSimulation",
      definition: "At least one \"SimulationStarted\" event was recorded.",
      logEvents: ["SimulationStarted", "SimulationStopped", "SimulationRestarted", "SimulationReloaded", "TopBarReloadButtonClicked", "SimulationEnded"],
      details: "Each simulation run is started by 'SimulationStarted', and how it is paused, is resumed, and ends is determined by various events listed here.  It is necessary for this activity to monitor the end of the simulation as well as the beginning, since turning on a sim prop (\"Helitack\") relies on knowing that a simulation is in progress, and fireline installation events occur during a simulation pause.  A \"resuming SimulationStarted\" event is one that was preceded by a SimulationStopped and then started again (SimulationStarted) without being reset/ended (SimulationEnded, SimulationRestarted, SimulationReloaded, TopBarReloadButtonClicked; or the simulation being restarted by an embedding unit (such as an \"Activity Player\")) in between.  All other \"SimulationStarted\" events are \"non-resuming\".",
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
      name: "DefaultVegetations",
      definition: "Sim prop for whether all variables were held at default values.",
      logEvents: ["SimulationStarted->zones.<i>.vegetation"],
      details: "The values of vegetation for all three zones must be equal to their default values (see the \"SIMINIT\" sheet) for this sim prop to be true.  Here, only non-resuming SimulationStarted events need be considered as resuming Simulation events do not change vegetations.",
    },
    {
      name: "SevereDroughts",
      definition: "Sim prop for whether the drought levels for all zones were set to severe.",
      logEvents: ["SimulationStarted->zones.<i>.droughtLevel"],
      details: "The values of droughtLevel for all three zones must be set to \"Severe Drought\".  Here, only non-resuming SimulationStarted events need be considered as resuming Simulation events do not change drought levels.",
    }
  ],
};
