import * as PIXI from "pixi.js";
import { PixiComponent } from "@inlet/react-pixi";
import { LandType } from "../../models/fire-model";
import { Cell } from "../../models/cell";

const Colors = {
  [LandType.Grass]: 0xFFD300,
  [LandType.Shrub]: 0x00FF00
};

interface IProps {
  gridSize: number;
  columns: number;
  rows: number;
  cells: Cell[];
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

    cells.forEach(cell => {
      instance.beginFill(Colors[cell.landType], Math.min(1 / cell.elevation, 1));
      instance.drawRect(cell.x * gridSize, cell.y * gridSize, gridSize, gridSize);
      instance.endFill();
    });
  },
});
