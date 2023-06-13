import * as React from "react";
import {Copyright} from "./copyright";

export const AboutDialogContent = () => (
  <div>
    <p>
      Scientists use models to explore the rate of spread of forestfires under different conditions. Use this model to
      investigate factors that affect the spread rate and intensity of forestfires such as the terrain, vegetation type,
      drought level, and wind conditions. The model also includes a graph showing the number of acres burned in the
      model over time.
    </p>
    <p>
      Use the Terrain Setup window to set the environmental conditions of the simulation including the vegetation type,
      drought level, wind speed, and wind direction.
    </p>
    <p>Add sparks to the model, click the play button, and watch the forestfire spread.</p>
    <p>
      Click the play button to see the fire spread over the landscape. How is the rate of fire spread influenced by the
      environmental conditions in each zone?
    </p>
    <p>
      Use firelines and helitacks to help contain the fire before it reaches the towns. Which environmental conditions
      make it hardest to put out or slow the fire?
    </p>
    <p>
      Forest Fire Explorer was created
      by <a href="https://github.com/pjanik" target="_blank" rel="noreferrer">Piotr Janik</a> from <a href="https://concord.org"
      target="_blank" rel="noreferrer">the Concord Consortium.
                                                                                                   </a> This <a
      href="https://concord.org/our-work/research-projects/geohazard/" target="_blank" rel="noreferrer">GeoHazard
                                                                                                             </a> interactive
      was developed under <a href="https://nsf.gov/" target="_blank" rel="noreferrer">National Science Foundation</a> grant
      DRL-1812362.
    </p>
    <Copyright />
  </div>
);
