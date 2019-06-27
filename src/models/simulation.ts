import { action, observable, computed, autorun } from "mobx";
import { GridCell } from "../types";

export const UNBURNT = 0;
export const BURNING = 1;
export const BURNT = 2;

let lastTickTime = 0;

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

  @computed get numCells() { return this.columns * this.rows; }

  // cached value of getGridCellNeighbors. This might be eventually replaced with
  // kd-tree if it's any more efficient.
  @computed get allNeighbors() {
    const allNeighbors = [];
    for (let i = 0; i < this.numCells; i++) {
      allNeighbors.push(getGridCellNeighbors(i, this.columns, this.rows));
    }
    return allNeighbors;
  }

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

  @observable public simulationRunning = false;

  @action.bound public start() {
    this.simulationRunning = true;
    this.tick();
  }

  @action.bound public stop() {
    this.simulationRunning = false;
  }

  @action.bound public tick(timestamp = window.performance.now()) {
    if (this.simulationRunning) {
      requestAnimationFrame(this.tick);
    }

    // simple demo
    if (timestamp - lastTickTime < 500) {
      return;
    }
    lastTickTime = timestamp;
    this.updateFire();
  }

  // simple demo, not using wildfire model
  @action.bound private updateFire() {
    const newFireData = this.fireData.slice();

    for (let i = 0; i < this.numCells; i++) {
      if (this.fireData[i] === BURNING) {
        const neighbors = this.allNeighbors[i];
        for (const n of neighbors) {
          if (this.fireData[n] === UNBURNT) {
            newFireData[n] = BURNING;
          }
        }
        newFireData[i] = BURNT;
      }
    }
    this.fireData = newFireData;
  }
}

export function getGridIndexForLocation(x: number, y: number, columns: number) {
  return x + y * columns;
}

/**
 * Returns an array of indices of all cells touching `i`, given the number of
 * `columns` and `rows`
 */
function getGridCellNeighbors(i: number, columns: number, rows: number) {
  const x = i % columns;
  const y = Math.floor(i / columns);
  const x1 = Math.max(0, x - 1);
  const y1 = Math.max(0, y - 1);
  const x2 = Math.min(columns - 1, x + 1);
  const y2 = Math.min(rows - 1, y + 1);

  const neighbors = [];
  for (let xn = x1; xn <= x2; xn++) {
    for (let yn = y1; yn <= y2; yn++) {
      if (!(xn === x && yn === y)) {
        neighbors.push(xn + yn * columns);
      }
    }
  }
  return neighbors;
}
