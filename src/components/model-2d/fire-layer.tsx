import * as PIXI from "pixi.js";
import { PixiComponent } from "@inlet/react-pixi";
import { GridCell } from "../../types";

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
    instance.beginFill(0xFF0000, 0.7);
    cells.forEach(cell => {
      if (cell.fire) {
        instance.drawRect(cell.x * gridSize, cell.y * gridSize, gridSize, gridSize);
      }
    });
    instance.endFill();
  },
});
