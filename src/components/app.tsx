import React, { useEffect } from "react";
import { observer } from "mobx-react";
import { View3D } from "./view-3d/view-3d";
import { SimulationInfo } from "./simulation-info";
import { TerrainPanel } from "./terrain-panel";
import { BottomBar } from "./bottom-bar";
import { useStores } from "../use-stores";
import Shutterbug from "shutterbug";

import css from "./app.scss";

export const AppComponent = observer(function WrappedComponent() {
  const { simulation } = useStores();

  useEffect(() => {
    Shutterbug.enable("." + css.app);
    return () => {
      Shutterbug.disable();
    };
  }, []);

  const config = simulation.config;
  // Convert time from minutes to days.
  const timeInDays = simulation.time / 1440;
  const showModelScale = config.showModelDimensions;
  return (
    <div className={css.app}>
      { showModelScale &&
        <div className={css.modelInfo}>
          <div>Model Dimensions: { config.modelWidth } ft x { config.modelHeight } ft</div>
          <div>Highest Point Possible: {config.heightmapMaxElevation} ft</div>
        </div>
      }
      <div className={css.timeDisplay}>{ timeInDays.toFixed(1) } days</div>

      <SimulationInfo />
      <View3D />
      <TerrainPanel />
      <BottomBar />
    </div>
  );
});
