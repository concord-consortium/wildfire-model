import * as PIXI from "pixi.js";
import {PixiComponent} from "@inlet/react-pixi";
import {Cell, FireState} from "../../models/cell";

interface IProps {
  cellSize: number;
  cells: Cell[];
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
    const { cellSize, cells } = newProps;
    instance.clear();

    cells.forEach(cell => {
      if (cell.fireState === FireState.Burning) {
        instance.beginFill(0xFF0000, 1);
        instance.drawRect(cell.x * cellSize, cell.y * cellSize, cellSize, cellSize);
      } else if (cell.fireState === FireState.Burnt) {
        instance.beginFill(0x000000, 1);
        instance.drawRect(cell.x * cellSize, cell.y * cellSize, cellSize, cellSize);
      }
    });
    instance.endFill();
  },
});
