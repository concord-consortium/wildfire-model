import { inject, observer } from "mobx-react";
import * as React from "react";
import { BaseComponent, IBaseProps } from "./base";
import config from "../config";

import "./app.sass";
import Model2D from "./model-2d/model-2d";

interface IProps extends IBaseProps {}
interface IState {}

@inject("stores")
@observer
export class AppComponent extends BaseComponent<IProps, IState> {

  public componentDidMount() {
    const {simulation} = this.stores;
    simulation.start();
  }

  public render() {
    const {simulation} = this.stores;
    return (
      <div className="app">
        <Model2D
          width={config.modelWidth / config.gridCellSize}
          height={config.modelHeight / config.gridCellSize}
          cells={simulation.cells}
        />
        <div>Time: { simulation.time }</div>
      </div>
    );
  }
}
