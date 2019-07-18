import { action, observable, computed } from "mobx";
import { GridCell } from "../types";
import { getFireSpreadRate } from "./fire-model";
import config from "../config";

export const UNBURNT = 0;
export const BURNING = 1;
export const BURNT = 2;

const ROWS = config.modelHeight / config.gridCellSize;
const COLUMNS = config.modelWidth / config.gridCellSize;
const CELL_SIZE = config.gridCellSize;
const TIME_STEP = 16;
// Total time a cell should burn. This is partially a view property, but it also allows us to be
// more efficient by only checking burning cell's neighbors, and not spent cells neighbors. However,
// it is not intended to affect the model's actual functioning. (e.g. cell should never be burnt out
// before its neighbors are ignited.)
// It would be even more efficient to get the maximum `timeToIgniteNeighbors` for a model, and use that
// as a separate flag to indicate when to stop checking a cell, which would give us a smaller number
// of cells to check. We'd still want a separate burn time for the view.
const CELL_BURN_TIME = 200 * CELL_SIZE;
// Make time to ignite proportional to size of the cell.
// If every cell is twice as big, the spread time in the end also should be slower.
const SPREAD_TIME_RATIO = 200 * CELL_SIZE;

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
        imageColAdvance -= 1.0;
      }
      if (imageColIndex >= imageColumns) {
        imageColIndex = imageColumns - 1; // prevent overflow.
      }
    }
    imageRowAdvance += numGridCellsPerImageRowPixel;
    if (imageRowAdvance > 1) {
      imageRowIndex += 1;
      imageRowAdvance -= 1.0;
    }
    if (imageRowIndex >= imageRows) {
      imageRowIndex = imageRows - 1;
    }
  }
  return arr;
}

function getGridIndexForLocation(x: number, y: number, columns: number) {
  return x + y * columns;
}

/**
 * Returns an array of indices of all cells touching `i`, given the number of
 * `rows` and `columns`. For this model needs, we assume that cells are neighbours only if they share one well.
 * So, every cell will only have 4 neighbours, not 8.
 */
function getGridCellNeighbors(i: number, rows: number, columns: number) {
  const result = [];
  const x = i % columns;
  const y = Math.floor(i / columns);
  if (x - 1 >= 0) {
    result.push(i - 1);
  }
  if (x + 1 < columns) {
    result.push(i + 1);
  }
  if (y + 1 < rows) {
    result.push(i + columns);
  }
  if (y - 1 >= 0) {
    result.push(i - columns);
  }
  return result;
}

// ---------------------------------------------------------------------------
// The class to encapsulate the simulation.
// ---------------------------------------------------------------------------

export class SimulationModel {
  public windSpeed = config.wind;
  public time = 0;

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

  // All the data arrays below will be brought in via image import
  @observable public elevationData = populateGrid(ROWS, COLUMNS, 0);

  // LandType of each cell -- each of these values is an index into the
  // land type array.
  @observable public landData = populateGridWithImage(ROWS, COLUMNS, this.landTypeImageData);

  // Time of ignition, in ms. If -1, cell is not yet ignited. For demo purposes,
  // a cell will ignite in one second (1000 mSec).
  @observable public ignitionTimesData = populateGrid(ROWS, COLUMNS, -1,
    [
      [ Math.round(config.spark[0] / CELL_SIZE), Math.round(config.spark[1] / CELL_SIZE), 1]
    ]);
  // UNBURNT / BURNING / BURNT states
  @observable public fireStateData = populateGrid(ROWS, COLUMNS, UNBURNT);

  @computed get numCells() { return ROWS * COLUMNS; }

  // cached value of getGridCellNeighbors. This could be eventually replaced with
  // kd-tree if it's any more efficient.
  @computed get allNeighbors() {
    const allNeighbors = [];
    for (let i = 0; i < this.numCells; i++) {
      allNeighbors.push(getGridCellNeighbors(i, ROWS, COLUMNS));
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
        SPREAD_TIME_RATIO / getFireSpreadRate(this.cellData[i], this.cellData[n], this.windSpeed)
      );
      timeToIgniteNeighbors.push(timeToIgniteMyNeighbors);
    }

    return timeToIgniteNeighbors;
  }

  @computed get cellData() {
    const cells: GridCell[] = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLUMNS; x++) {
        const index = getGridIndexForLocation(x, y, COLUMNS);
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
    this.simulationRunning = true;
    this.time = 0;
    this.tick();
  }

  @action.bound public stop() {
    this.simulationRunning = false;
  }

  @action.bound public tick() {
    if (this.simulationRunning) {
      requestAnimationFrame(this.tick);
    }
    this.time += TIME_STEP;
    this.updateFire();
  }

  @action.bound private updateFire() {
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
          if (this.fireStateData[n] === UNBURNT && this.time >= ignitionTime + ignitionDeltas[j]) {
            // time to ignite neighbor
            newIgnitionData[n] = this.time;
            newFireStateData[n] = BURNING;
          }
        });

        if (this.time - ignitionTime > CELL_BURN_TIME) {
          newFireStateData[i] = BURNT;
        }
      } else if (this.fireStateData[i] === UNBURNT &&
        this.ignitionTimesData[i] > 0 && this.time > this.ignitionTimesData[i]) {
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
