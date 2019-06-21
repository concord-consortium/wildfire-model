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
    return (
      <div className="app">
        <Model2D
          columns={simulation.columns}
          rows={simulation.rows}
          cells={simulation.cellData}
        />
      </div>
    );
  }
}
