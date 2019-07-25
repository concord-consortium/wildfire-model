import * as PIXI from "pixi.js";
import { PixiComponent } from "@inlet/react-pixi";
import { LandType } from "../../models/fire-model";
import { Cell } from "../../models/cell";

const Colors = {
  [LandType.Grass]: 0xFFD300,
  [LandType.Shrub]: 0x00FF00
};

interface IProps {
  cellSize: number;
  width: number;
  height: number;
  maxElevation: number;
  cells: Cell[];
  time: number;
  view: string;
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
    const { cellSize, width, height, cells, time, view, maxElevation } = newProps;
    instance.clear();

    instance.beginFill(0xFFFFFF);
    instance.drawRect(0, 0, width * cellSize, height * cellSize);

    cells.forEach(cell => {
      if (view === "land") {
        instance.beginFill(Colors[cell.landType], 1 - cell.elevation / maxElevation);
      } else if (view === "ignitionTime") {
        const remainingTime = cell.ignitionTime - time;
        if (remainingTime > 0) {
          instance.beginFill(0x000000, 1 - remainingTime / 1000);
        } else {
          instance.beginFill(0xffa500, 1);
        }
      }
      instance.drawRect(cell.x * cellSize, (height - 1 - cell.y) * cellSize, cellSize, cellSize);
      instance.endFill();
    });
  },
});
