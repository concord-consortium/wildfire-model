import * as PIXI from "pixi.js";
import { PixiComponent } from "@inlet/react-pixi";
import { GridCell } from "../../types";

interface IProps {
  gridSize: number;
  columns: number;
  rows: number;
  cells: GridCell[];
}

export default PixiComponent<IProps, PIXI.Container>("BaseMap", {
  create: props => new PIXI.Graphics(),
  didMount: (instance, parent) => {
    // apply custom logic on mount
  },
  willUnmount: (instance, parent) => {
    // clean up before removal
  },
  applyProps: (instance: PIXI.Graphics, oldProps: IProps, newProps: IProps) => {
    const { gridSize, columns, rows, cells } = newProps;
    instance.clear();

    instance.beginFill(0xFFFFFF);
    instance.drawRect(0, 0, columns * gridSize, rows * gridSize);

    instance.lineStyle(2, 0xAAAAAA);
    cells.forEach(cell => {
      instance.beginFill(0x00FF00, Math.min(1 / cell.elevation, 1));
      instance.drawRect(cell.x * gridSize, cell.y * gridSize, gridSize, gridSize);
      instance.endFill();
    });
  },
});
