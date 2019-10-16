import React from "react";
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
  public get viewCellSize() {
    const { gridWidth, gridHeight } = this.stores.simulation;
    const maxDimension = Math.max(gridWidth, gridHeight);
    return (maxDimension < 25) ? 30 : Math.max(1, 800 / maxDimension);
  }

  public render() {
    const { cells, time, gridWidth, gridHeight, config, spark } = this.stores.simulation;
    const { view } = this.stores.ui;
    const cellSize = this.viewCellSize;
    return (
      <Stage width={gridHeight * cellSize} height={gridHeight * cellSize} raf={false} onClick={this.handleClick}>
        <BaseMap
          cellSize={cellSize}
          height={gridHeight}
          width={gridWidth}
          maxElevation={config.heightmapMaxElevation}
          cells={cells}
          time={time}
          view={view}
        />
        <FireLayer
          cellSize={cellSize}
          cells={cells}
          height={gridHeight}
          // Note that spark doesn't have to be rendered once model is running.
          spark={time === 0 ? spark : null}
        />
      </Stage>
    );
  }

  public handleClick = (e: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => {
    const { sparkPositionInteraction } = this.stores.ui;
    if (!sparkPositionInteraction) {
      return;
    }
    if (!e.target) {
      return;
    }
    const { gridHeight, setSpark } = this.stores.simulation;
    const cellSize = this.viewCellSize;
    const target = e.target as HTMLCanvasElement;
    const x = Math.floor((e.pageX - target.offsetLeft) / cellSize);
    const y = gridHeight - 1 - Math.floor((e.pageY - target.offsetTop) / cellSize);
    setSpark(x, y);
    this.stores.ui.sparkPositionInteraction = false;
  }
}
