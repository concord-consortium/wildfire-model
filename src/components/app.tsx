import { inject, observer } from "mobx-react";
import * as React from "react";
import { BaseComponent, IBaseProps } from "./base";

import "./app.sass";
import Model2D from "./model-2d/model-2d";

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

    return (
      <div className="app">
        <div>Model Dimensions: { config.modelWidth } ft x { config.modelHeight } ft</div>
        <div>Highest Point Possible: { config.heightmapMaxElevation } ft</div>
        <div>Wind Speed: { config.windSpeed } mph</div>
        <div>Wind Direction: { config.windDirection }°</div>
        <div>Time Elapsed: { timeInDays.toFixed(1) } days</div>
        <br />
        <Model2D />
      </div>
    );
  }
}
