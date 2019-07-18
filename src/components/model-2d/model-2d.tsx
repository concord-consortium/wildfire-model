import * as React from "react";
import { Stage } from "@inlet/react-pixi";
import BaseMap from "./base-map";
import FireLayer from "./fire-layer";
import {Cell} from "../../models/cell";

interface IProps {
  columns: number;
  rows: number;
  cells: Cell[];
}

export default class Model2D extends React.Component<IProps> {

  public render() {
    const { columns, rows, cells } = this.props;
    const maxDimension = Math.max(columns, rows);
    const gridSize = (maxDimension < 25) ? 30 : Math.max(1, 800 / maxDimension);

    return (
      <Stage width={columns * gridSize} height={rows * gridSize} raf={false}>
        <BaseMap
          gridSize={gridSize}
          rows={rows}
          columns={columns}
          cells={cells} />
        <FireLayer
          gridSize={gridSize}
          cells={cells} />
      </Stage>
    );
  }

}
