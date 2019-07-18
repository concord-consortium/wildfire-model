import * as React from "react";
import { Stage } from "@inlet/react-pixi";
import BaseMap from "./base-map";
import FireLayer from "./fire-layer";
import {Cell} from "../../models/cell";

interface IProps {
  width: number;
  height: number;
  cells: Cell[];
}

export default class Model2D extends React.Component<IProps> {

  public render() {
    const { width, height, cells } = this.props;
    const maxDimension = Math.max(width, height);
    const gridSize = (maxDimension < 25) ? 30 : Math.max(1, 800 / maxDimension);

    return (
      <Stage width={width * gridSize} height={height * gridSize} raf={false}>
        <BaseMap
          gridSize={gridSize}
          height={height}
          width={width}
          cells={cells} />
        <FireLayer
          gridSize={gridSize}
          cells={cells} />
      </Stage>
    );
  }

}
