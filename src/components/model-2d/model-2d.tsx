import * as React from "react";
import { Stage } from "@inlet/react-pixi";
import BaseMap from "./base-map";
import FireLayer from "./fire-layer";
import { GridCell } from "../../types";

interface IProps {
  columns: number;
  rows: number;
  cells: GridCell[];
}

const gridSize = 40;

export default class Model2D extends React.Component<IProps> {

  public render() {
    const { columns, rows, cells } = this.props;

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
