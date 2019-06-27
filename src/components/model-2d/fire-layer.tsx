import * as PIXI from "pixi.js";
import { PixiComponent } from "@inlet/react-pixi";
import { GridCell } from "../../types";
import { BURNING, BURNT } from "../../models/simulation";

interface IProps {
  gridSize: number;
  cells: GridCell[];
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
    const { gridSize, cells } = newProps;
    instance.clear();

    instance.lineStyle(2, 0xAAAAAA);
    cells.forEach(cell => {
      if (cell.fire === BURNING) {
        instance.beginFill(0xFF0000, 0.6);
        instance.drawRect(cell.x * gridSize, cell.y * gridSize, gridSize, gridSize);
      } else if (cell.fire === BURNT) {
        instance.beginFill(0x000000, 0.6);
        instance.drawRect(cell.x * gridSize, cell.y * gridSize, gridSize, gridSize);
      }
    });
    instance.endFill();
  },
});
