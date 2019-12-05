import { inject, observer } from "mobx-react";
import React from "react";
import { BaseComponent, IBaseProps } from "./base";
import { View3D } from "./view-3d/view-3d";
import { SimulationInfo } from "./simulation-info";

import css from "./app.scss";
import { TerrainPanel } from "./terrain-panel";
import {BottomBar} from "./bottom-bar";

interface IProps extends IBaseProps {}
interface IState {}

@inject("stores")
@observer
export class AppComponent extends BaseComponent<IProps, IState> {
  public render() {
    const {simulation} = this.stores;
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
  }
}
