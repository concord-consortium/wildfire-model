import * as React from "react";
import { Stage } from "@inlet/react-pixi";
import BaseMap from "./base-map";
import FireLayer from "./fire-layer";
import {inject, observer} from "mobx-react";
import config from "../../config";
import {BaseComponent, IBaseProps} from "../base";

interface IProps extends IBaseProps {}
interface IState {}

@inject("stores")
@observer
export default class Model2D extends BaseComponent<IProps, IState> {

  public render() {
    const { cells, time } = this.stores.simulation;
    const width = config.modelWidth / config.gridCellSize;
    const height = config.modelHeight / config.gridCellSize;
    const maxDimension = Math.max(width, height);
    const gridSize = (maxDimension < 25) ? 30 : Math.max(1, 800 / maxDimension);
    return (
      <Stage width={width * gridSize} height={height * gridSize} raf={false}>
        <BaseMap
          gridSize={gridSize}
          height={height}
          width={width}
          cells={cells}
          time={time}
        />
        <FireLayer
          gridSize={gridSize}
          cells={cells}
        />
      </Stage>
    );
  }
}
