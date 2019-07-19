import * as PIXI from "pixi.js";
import { PixiComponent } from "@inlet/react-pixi";
import { LandType } from "../../models/fire-model";
import { Cell } from "../../models/cell";
import config from "../../config";

const Colors = {
  [LandType.Grass]: 0xFFD300,
  [LandType.Shrub]: 0x00FF00
};

interface IProps {
  gridSize: number;
  width: number;
  height: number;
  cells: Cell[];
  time: number;
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
    const { gridSize, width, height, cells, time } = newProps;
    instance.clear();

    instance.beginFill(0xFFFFFF);
    instance.drawRect(0, 0, width * gridSize, height * gridSize);

    cells.forEach(cell => {
      if (config.view === "land") {
        instance.beginFill(Colors[cell.landType], Math.min(1 / cell.elevation, 1));
      } else if (config.view === "ignitionTime") {
        const remainingTime = cell.ignitionTime - time;
        if (remainingTime > 0) {
          instance.beginFill(0x000000, 1 - remainingTime / 1000);
        } else {
          instance.beginFill(0xffa500, 1);
        }
      }
      instance.drawRect(cell.x * gridSize, cell.y * gridSize, gridSize, gridSize);
      instance.endFill();
    });
  },
});
