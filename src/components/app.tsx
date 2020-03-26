import React, { useEffect } from "react";
import { observer } from "mobx-react";
import { View3d } from "./view-3d/view-3d";
import { SimulationInfo } from "./simulation-info";
import { TerrainPanel } from "./terrain-panel";
import { RightPanel } from "./right-panel";
import { BottomBar } from "./bottom-bar";
import { useStores } from "../use-stores";
import Shutterbug from "shutterbug";

import css from "./app.scss";
import { useCustomCursor } from "./use-custom-cursors";

export const AppComponent = observer(function WrappedComponent() {
  const { simulation, ui } = useStores();

  useEffect(() => {
    Shutterbug.enable("." + css.app);
    return () => {
      Shutterbug.disable();
    };
  }, []);

  // This will setup document cursor based on various states of UI store (interactions).
  useCustomCursor();

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
      <div className={css.timeDisplay}>{timeInDays.toFixed(1)} days</div>
      <div className={`${css.mainContent} ${ui.showChart && css.shrink}`}>
        <SimulationInfo />
        <View3d />
        <TerrainPanel />
      </div>
      <div className={`${css.rightContent} ${ui.showChart && css.grow}`}>
        <RightPanel />
      </div>
      <BottomBar />
    </div>
  );
});
