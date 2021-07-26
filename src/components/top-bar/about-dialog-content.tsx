import * as React from "react";
import {Copyright} from "./copyright";

export class AboutDialogContent extends React.Component {
  public render() {
    return (
      <div>
        <p>
          Scientists use models to explore the speed of spread and the intensity of wildfires. Use this model to explore
          factors that affect the speed and intensity of wildfires such as the terrain, vegetation type, drought level,
          and wind conditions. This model also includes a graph that can be used to visualize the number of acres burned
          in the model over time.
        </p>
        <p>
          Use the Terrain Setup window to set the environmental conditions of the simulation including the vegetation
          type, drought index, wind speed, and wind direction.
        </p>
        <p>Set the location of sparks, where the fire will start.</p>
        <p>
          Click the play button to see the fire spread over the landscape. How is the speed fire spread influenced by
          different environmental conditions in each zone?
        </p>
        <p>
          Use Helitaks and Firelines to try to slow the fire down, divert the spread, and save towns from being burned.
          Which environmental conditions make it hardest to put out or slow the fire?
        </p>
        <p>
          Wildfire Explorer was created
          by <a href="https://github.com/pjanik" target="_blank">Piotr Janik</a> from <a href="https://concord.org"
          target="_blank">the Concord Consortium.</a> This <a
          href="https://concord.org/our-work/research-projects/geohazard/" target="_blank">GeoHazard</a> interactive
          was developed under <a href="https://nsf.gov/" target="_blank">National Science Foundation</a> grant
          DRL-1812362.
        </p>
        <Copyright />
      </div>
    );
  }
}
