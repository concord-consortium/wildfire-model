import { action, observable, computed, autorun } from "mobx";
import { GridCell } from "../types";
import { getFireSpreadTime } from "./fire-model";

export const UNBURNT = 0;
export const BURNING = 1;
export const BURNT = 2;

// while units are being sorted out, the time-to-ignition reported by `fire-model` may be
// off. This is a multiplier to make the model look right until the units are correct.
const FIXME_MULTIPLIER = 2000;

export class SimulationModel {
  @observable public columns = 5;
  @observable public rows = 5;

  @observable public modelStartTime = 0;
  @observable public time = 0;

  @observable public windSpeed = 88;

  @observable public elevationData = [
    3, 4, 5, 4, 3,
    2, 4, 5, 4, 2,
    1, 3, 4, 3, 1,
    0, 3, 4, 3, 0,
    0, 2, 3, 2, 0];

  // LandType of each cell
  @observable public landData = [
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0];

  // time of ignition, in ms. If -1, cell is not yet ignited
  // for demo, one cell will ignite in one second
  @observable public ignitionTimesData = [
    -1, -1, -1, -1, -1,
    -1, -1, -1, -1, -1,
    -1, -1, -1, 1000, -1,
    -1, -1, -1, -1, -1,
    -1, -1, -1, -1, -1];

  // UNBURNT / BURNING / BURNT states
  @observable public fireStateData = [
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0];

  // total time a cell should burn. This is partially a view property, but it also allows us to be
  // more efficient by only checking burning cell's neighbors, and not spent cells neighbors. However,
  // it is not intended to affect the model's actual functioning. (e.g. cell should never be burnt out
  // before its neighbors are ignited.)
  // It would be even more efficient to get the maximum `timeToIgniteNeighbors` for a model, and use that
  // as a seperate flag to indicate when to stop checking a cell, which would give us a smaller number
  // of cells to check. We'd still want a separate burn time for the view.
  public cellBurnTime = 2000;

  @computed get numCells() { return this.columns * this.rows; }

  // cached value of getGridCellNeighbors. This could be eventually replaced with
  // kd-tree if it's any more efficient.
  @computed get allNeighbors() {
    const allNeighbors = [];
    for (let i = 0; i < this.numCells; i++) {
      allNeighbors.push(getGridCellNeighbors(i, this.columns, this.rows));
    }
    return allNeighbors;
  }

  /**
   * 2d array of times it takes each cell to ignite each neighbor.
   *
   * For instance, for a 5x5 array, this.allNeighbors will be a 2d array:
   *     [[1, 5, 6], [0, 2, 5, 6,7], ...]
   * describing cell 0 as being neighbors with cells 1, 5, 6, etc.
   *
   * this.timeToIgniteNeighbors might then look something like
   *     [[0.5, 0.7, 0.5], [1.2, ...]]
   * which means that, if cell 0 is ignited, cell 1 will ignite 0.5 seconds later.
   */
  @computed get timeToIgniteNeighbors() {
    const timeToIgniteNeighbors = [];

    for (let i = 0; i < this.numCells; i++) {
      const neighbors = this.allNeighbors[i];
      const timeToIgniteMyNeighbors = neighbors.map(n =>
        getFireSpreadTime(this.cellData[i], this.cellData[n], this.windSpeed)
      );
      timeToIgniteNeighbors.push(timeToIgniteMyNeighbors);
    }

    return timeToIgniteNeighbors;
  }

  @computed get cellData() {
    const cells: GridCell[] = [];
    for (let x = 0; x < this.columns; x++) {
      for (let y = 0; y < this.rows; y++) {
        const index = getGridIndexForLocation(x, y, this.rows);
        cells.push({
          x,
          y,
          landType: this.landData[index],
          elevation: this.elevationData[index],
          timeOfIgnition: this.ignitionTimesData[index],
          fireState: this.fireStateData[index]
        });
      }
    }
    return cells;
  }

  @observable public simulationRunning = false;

  @action.bound public start() {
    this.modelStartTime = window.performance.now();
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

    this.time = timestamp - this.modelStartTime;

    this.updateFire(timestamp);
  }

  @action.bound private updateFire(timestamp: number) {
    // Run through all cells. Check the unburnt neighbors of currently-burning cells. If the current time
    // is greater than the ignition time of the cell and the delta time for the neighbor, update
    // the neighbor's ignition time.
    // At the same time, we update the unburnt/burning/burnt states of the cells
    const newIgnitionData = this.ignitionTimesData.slice();
    const newFireStateData = this.fireStateData.slice();

    for (let i = 0; i < this.numCells; i++) {
      if (this.fireStateData[i] === BURNING) {
        const neighbors = this.allNeighbors[i];
        const ignitionTime = this.ignitionTimesData[i];
        const ignitionDeltas = this.timeToIgniteNeighbors[i];

        neighbors.forEach((n, j) => {
          if (this.fireStateData[n] === UNBURNT && timestamp >= ignitionTime + (ignitionDeltas[j] * FIXME_MULTIPLIER)) {
            // time to ignite neighbor
            newIgnitionData[n] = timestamp;
            newFireStateData[n] = BURNING;
          }
        });

        if (timestamp - ignitionTime > this.cellBurnTime) {
          newFireStateData[i] = BURNT;
        }
      } else if (this.fireStateData[i] === UNBURNT
          && this.ignitionTimesData[i] > 0 && timestamp > this.ignitionTimesData[i]) {
        // sets any unburnt cells to burning if we are passed their ignition time.
        // although during a simulation all cells will have their state sent to BURNING through the process
        // above, this not only allows us to pre-set ignition times for testing, but will also allow us to
        // run forward or backward through a simulation
        newFireStateData[i] = BURNING;
      }
    }

    this.ignitionTimesData = newIgnitionData;
    this.fireStateData = newFireStateData;
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
