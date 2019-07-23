import * as React from "react";
import { Stage } from "@inlet/react-pixi";
import BaseMap from "./base-map";
import FireLayer from "./fire-layer";
import {inject, observer} from "mobx-react";
import {BaseComponent, IBaseProps} from "../base";

interface IProps extends IBaseProps {}
interface IState {}

@inject("stores")
@observer
export default class Model2D extends BaseComponent<IProps, IState> {

  public render() {
    const { cells, time, gridWidth, gridHeight } = this.stores.simulation;
    const { view } = this.stores.ui;
    const maxDimension = Math.max(gridWidth, gridHeight);
    const cellSize = (maxDimension < 25) ? 30 : Math.max(1, 800 / maxDimension);
    return (
      <Stage width={gridHeight * cellSize} height={gridHeight * cellSize} raf={false}>
        <BaseMap
          cellSize={cellSize}
          height={gridHeight}
          width={gridWidth}
          cells={cells}
          time={time}
          view={view}
        />
        <FireLayer
          cellSize={cellSize}
          cells={cells}
        />
      </Stage>
    );
  }
}
