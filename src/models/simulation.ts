import { action, observable, computed, autorun } from "mobx";
import { GridCell } from "../types";
import { getFireSpreadTime } from "./fire-model";
import { simulationSize, wind, spark, spark2 } from "../utilities/url-parameters";

export const UNBURNT = 0;
export const BURNING = 1;
export const BURNT = 2;

// while units are being sorted out, the time-to-ignition reported by `fire-model` may be
// off. This is a multiplier to make the model look right until the units are correct.
const FIXME_MULTIPLIER = 3000;

// As a baby step, let's create a general purpose function to create the various
// grids, before we combine the grids into a single data structure.

type CellValue = [ number, number, number];  // Row, column, & value

function populateGrid(rows: number, cols: number, baseValue: number, setValues: CellValue[] = []): number[] {
  const arr = [];
  for (let i = 0; i < rows * cols; i++) {
    arr.push(baseValue);  // We use baseValue to preset all the cells in the grid.
  }
  setValues.forEach( ([ r, c, v ]) => {
    if ((r >= 0) && (c >= 0)) {
      arr[r * cols + c] = v;
    }
  });
  return arr;
}

// Very confusing, quick-'n-dirty way to populate a gird with a pseudo image.
function populateGridWithImage(rows: number, cols: number, image: number[][]): number[] {
  const arr = [];
  // Figure out the size of the image using the first row.
  const imageRows = image.length;
  const imageColumns = image[0].length;
  const numGridCellsPerImageRowPixel = imageRows / rows;
  const numGridCellsPerImageColPixel = imageColumns / cols;
  // 
  let imageRowIndex = 0;
  let imageRowAdvance = 0.0;
  for (let r = 0; r < rows; r++) {
    let imageColIndex = 0;
    let imageColAdvance = 0.0;
    for (let c = 0; c < cols; c++) {
      arr.push(image[imageRowIndex][imageColIndex]);  // We use baseValue to preset all the cells in the grid.
      imageColAdvance += numGridCellsPerImageColPixel;
      if (imageColAdvance > 1.0) {
        imageColIndex += 1;
        imageColAdvance -= 1.0
      }
      if (imageColIndex >= imageColumns)
        imageColIndex = imageColumns - 1; // prevent overflow.
    }
    imageRowAdvance += numGridCellsPerImageRowPixel;
    if (imageRowAdvance > 1) {
      imageRowIndex += 1;
      imageRowAdvance -= 1.0;
    }
    if (imageRowIndex >= imageRows)
      imageRowIndex = imageRows - 1;
  }
  return arr;
}

// ---------------------------------------------------------------------------
// The class to encapsulate the simulation.
// ---------------------------------------------------------------------------

export class SimulationModel {
  @observable public rows = simulationSize()[0];
  @observable public columns = simulationSize()[1];

  @observable public modelStartTime = 0;
  @observable public time = 0;

  @computed get wind() { return parseInt(wind().toString(), 10); }
  @observable public windSpeed = this.wind;

  // All the data arrays below will be brought in via image import
  @observable public elevationData = populateGrid(this.rows, this.columns, 0);

public landTypeImageData: number[][] = [
    [ 0, 0, 0, 0, 0, 0, 0, 0, 0 ],
    [ 0, 0, 0, 0, 0, 0, 0, 0, 0 ],
    [ 0, 0, 0, 0, 0, 0, 0, 0, 0 ],
    [ 1, 0, 0, 0, 0, 0, 0, 0, 0 ],
    [ 1, 1, 0, 0, 0, 0, 0, 0, 0 ],
    [ 1, 1, 1, 0, 0, 0, 0, 0, 0 ],
    [ 1, 1, 1, 1, 0, 0, 0, 0, 0 ],
    [ 1, 1, 1, 1, 0, 0, 0, 0, 0 ],
    [ 1, 1, 1, 1, 1, 0, 0, 0, 0 ],
    [ 1, 1, 1, 1, 1, 0, 0, 0, 0 ],
    [ 1, 1, 1, 0, 0, 0, 0, 0, 0 ]
  ];

  // LandType of each cell -- each of these values is an index into the
  // land type array.
  @observable public landData = populateGridWithImage(this.rows, this.columns, this.landTypeImageData);

  // Time of ignition, in ms. If -1, cell is not yet ignited. For demo purposes,
  // a cell will ignite in one second (1000 mSec).
  //
  // The following two getters are a complete hack. I couldn't force the
  // urlValues to be numbers without this messy thing -- should fix it later.
  //
  // Ugh, I double hacked it... will need a better way of specifying multiple
  // spark points.
  @computed get sparkRow() { return parseInt(spark()[0].toString(), 10); }
  @computed get sparkColumn() { return parseInt(spark()[1].toString(), 10); }
  @computed get sparkRow2() { return parseInt(spark2()[0].toString(), 10); }
  @computed get sparkColumn2() { return parseInt(spark2()[1].toString(), 10); }
  @observable public ignitionTimesData = populateGrid(this.rows, this.columns, -1,
    [
      [ this.sparkRow, this.sparkColumn, 1000],
      [ this.sparkRow2, this.sparkColumn2, 1000]
    ]);

  // UNBURNT / BURNING / BURNT states
  @observable public fireStateData = populateGrid(this.rows, this.columns, UNBURNT);

  // total time a cell should burn. This is partially a view property, but it also allows us to be
  // more efficient by only checking burning cell's neighbors, and not spent cells neighbors. However,
  // it is not intended to affect the model's actual functioning. (e.g. cell should never be burnt out
  // before its neighbors are ignited.)
  // It would be even more efficient to get the maximum `timeToIgniteNeighbors` for a model, and use that
  // as a separate flag to indicate when to stop checking a cell, which would give us a smaller number
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
   *
   * FIXEME: This is getting repeatedly called, but ought to be cacheable.
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
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.columns; x++) {
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
