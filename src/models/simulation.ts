import { action, observable, computed, autorun } from "mobx";
import { GridCell } from "../types";

export class SimulationModel {
  @observable public columns = 5;
  @observable public rows = 5;
  @observable public elevationData = [
    3, 4, 5, 4, 3,
    2, 4, 5, 4, 2,
    1, 3, 4, 3, 1,
    0, 3, 4, 3, 0,
    0, 2, 3, 2, 0];

  @observable public fireData = [
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0,
    0, 0, 0, 1, 0,
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0];

  @computed get cellData() {
    const cells: GridCell[] = [];
    for (let x = 0; x < this.columns; x++) {
      for (let y = 0; y < this.rows; y++) {
        const index = getGridIndexForLocation(x, y, this.rows);
        cells.push({
          x,
          y,
          elevation: this.elevationData[index],
          fire: this.fireData[index]
        });
      }
    }
    return cells;
  }
}

export function getGridIndexForLocation(x: number, y: number, numColumns: number) {
  return x + y * numColumns;
}
