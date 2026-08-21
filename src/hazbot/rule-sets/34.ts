// AUTO-GENERATED — DO NOT EDIT — re-run scripts/extract-hazbot-sheets.js

import { RuleSet } from "../engine";
import { WildfireDefaults } from "../wildfire/types";

export const ruleSet34: RuleSet<WildfireDefaults> = {
  id: "34",
  categories: [
    {
      id: 1,
      studentAction: "Did not run the simulation. A.k.a. Click button (before they do anything else)",
      feedback: `Hazbot: Just a friendly reminder, I will analyze your model after you run it. **Scroll up** to see the instructions at the top of the page!
[Okay]`,
      visualFeedback: "",
      expression: "NOT ranSimulation",
    },
    {
      id: 2,
      studentAction: "Ran the simulation(s) with default setup values only",
      feedback: `Hazbot: Looks like you haven’t changed the **Setup** yet. What conditions do you think will produce a **high intensity fire**?
[Show me]`,
      visualFeedback: `0. Arrow pointing to the Intensity scale
2. Restart button outlined; coach mark points to Restart button
3. Setup button outlined; coach mark points to Setup button
4. Setup panel outlined; coach mark points to Setup panel`,
      arrowText: `1. Hazbot: First, **Restart** your model. (Step 1 of 3)
2. Hazbot: Click the **Setup** button. (Step 2 of 3)
3. Hazbot: Click each zone and change the conditions to create a **high intensity fire**. Then run the model again. (Step 3 of 3)
[Got it!]`,
      expression: "ranSimulation WITH NOT VegetationSet AND NOT (WindSet OR DroughtLevelSet)",
    },
    {
      id: 3,
      studentAction: "Ran the simulation, with drought or wind changed but vegetation unchanged.",
      feedback: `Hazbot: Keep experimenting! Try different types of vegetation to produce an even more **high intensity fire**?
[Show me]`,
      visualFeedback: `0. Arrow pointing to the Intensity scale
1. Restart button outlined; coach mark points to Restart button
2. Setup button outlined; coach mark points to Setup button
3. Setup panel outlined; coach mark points to Setup panel`,
      arrowText: `1. Hazbot: First, **Restart** your model. (Step 1 of 3)
2. Hazbot: Click the **Setup** button. (Step 2 of 3)
3. Hazbot: Click each zone and change the vegetation to create a **high intensity fire**. Then run the model again. (Step 3 of 3)
[Got it!]`,
      expression: "ranSimulation WITH NOT VegetationSet AND (WindSet OR DroughtLevelSet)",
    },
    {
      id: 4,
      studentAction: "Ran the simulation, with vegetation changed but not wind or drought changed.",
      feedback: `Hazbot: Great job experimenting with different types of vegetation. Try changing the drought level or wind to produce an even more **high intensity fire!**
[Show me]`,
      visualFeedback: `0. Arrow pointing to the Intensity scale
1. Restart button outlined; coach mark points to Restart button
2. Setup button outlined; coach mark points to Setup button
3. Setup panel outlined; coach mark points to Setup panel`,
      arrowText: `1. Hazbot: First, **Restart** your model. (Step 1 of 3)
2. Hazbot: Click the **Setup** button. (Step 2 of 3)
3. Hazbot: Click each zone and change the drought level, or use the wind dial, to create a **high intensity fire**. Then run the model again. (Step 3 of 3)
[Got it!]`,
      expression: "ranSimulation WITH VegetationSet AND NOT (WindSet OR DroughtLevelSet)",
    },
    {
      id: 5,
      studentAction: "Ran the simulation with vegetation changed in at least one zone and either wind or drought changed in any zone.",
      feedback: `Hazbot: Great job! You’re ready to answer the questions below.
[Hooray!]`,
      visualFeedback: "Confetti animation or subtle celebratory visual",
      expression: "ranSimulation WITH VegetationSet AND (WindSet OR DroughtLevelSet)",
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
      name: "VegetationSet",
      definition: "Sim prop for vegetation set distinct from the default value for any zone.",
      logEvents: ["SimulationStarted->zones.<i>.vegetation"],
      details: "Vegetation is set per zone, in the zones data.  For the default values, read the \"SIMINIT\" sheet.",
    },
    {
      name: "DroughtLevelSet",
      definition: "Sim prop for drought level set distinct from the default value for any zone.",
      logEvents: ["SimulationStarted->zones.<i>.droughtLevel"],
      details: "Drought level is set per zone, in the zones data.  For the default values, read the \"SIMINIT\" sheet.",
    },
    {
      name: "WindSet",
      definition: "Sim prop for any wind parameter set  distinct from the default value.",
      logEvents: ["SimulationStarted->wind.speed", "wind.direction", "wind.scaleFactor"],
      details: "Wind is set globally (for all zones).  For the default values, read the \"SIMINIT\" sheet.   Allow this sim prop to evalue to true when direction is set away from the default value even if the magnitude was set to zero.  Here, the \"magnitude\" means the wind speed as displayed in the simulation (like \"10\" as in \"10 MPH\").  In the log data, the magnitude data entails two fields \"wind.speed\" and \"wind.scaleFactor\".  The \"magnitude\" is computed as \"wind.speed\" / \"wind.scaleFactor\".  Any small change should be accepted.",
    }
  ],
};
