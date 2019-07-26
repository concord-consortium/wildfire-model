import * as PIXI from "pixi.js";
import {PixiComponent} from "@inlet/react-pixi";
import {Cell, FireState} from "../../models/cell";
import {Vector2} from "three";

interface IProps {
  cellSize: number;
  height: number;
  cells: Cell[];
  spark: Vector2 | null;
}

export default PixiComponent<IProps, PIXI.Container>("FireLayer", {
  create: props => new PIXI.Graphics(),
  didMount: (instance, parent) => {
    // apply custom logic on mount
  },
  willUnmount: (instance, parent) => {
    // clean up before removal
  },
  applyProps: (instance: PIXI.Graphics, oldProps: IProps, newProps: IProps) => {
    const { cellSize, cells, height, spark } = newProps;
    instance.clear();

    cells.forEach(cell => {
      if (cell.fireState === FireState.Burning || spark && cell.x === spark.x && cell.y === spark.y) {
        instance.beginFill(0xFF0000, 1);
        instance.drawRect(cell.x * cellSize, (height - 1 - cell.y) * cellSize, cellSize, cellSize);
      } else if (cell.fireState === FireState.Burnt) {
        instance.beginFill(0x000000, 1);
        instance.drawRect(cell.x * cellSize, (height - 1 - cell.y) * cellSize, cellSize, cellSize);
      }
    });
    instance.endFill();
  },
});
