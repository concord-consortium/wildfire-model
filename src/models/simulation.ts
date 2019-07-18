import {action, computed, observable} from "mobx";
import {getFireSpreadRate, LandType} from "./fire-model";
import {Cell, CellOptions, FireState} from "./cell";
import config from "../config";
import {PresetData} from "../presets";

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

export class SimulationModel {
  public windSpeed = config.wind;
  public time = 0;

  @observable public cells: Cell[] = [];
  @observable public simulationRunning = false;

  constructor(preset: PresetData) {
    const landType: LandType[] | undefined = preset.landType && populateGridWithImage(ROWS, COLUMNS, preset.landType);
    const elevation: number[] | undefined = preset.elevation && populateGridWithImage(ROWS, COLUMNS, preset.elevation);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLUMNS; x++) {
        const index = getGridIndexForLocation(x, y, COLUMNS);
        const cellOptions: CellOptions = { x, y };
        if (landType) {
          cellOptions.landType = landType[index];
        }
        if (elevation) {
          cellOptions.elevation = elevation[index];
        }
        this.cells.push(new Cell(cellOptions));
      }
    }

    if (config.spark) {
      const sparkX = Math.round(config.spark[0] / CELL_SIZE);
      const sparkY = Math.round(config.spark[1] / CELL_SIZE);
      this.cells[sparkX * COLUMNS + sparkY].ignitionTime = 1;
    }
  }

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
        SPREAD_TIME_RATIO / getFireSpreadRate(this.cells[i], this.cells[n], this.windSpeed)
      );
      timeToIgniteNeighbors.push(timeToIgniteMyNeighbors);
    }

    return timeToIgniteNeighbors;
  }

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
    // Explicitly update cells array. This will notify observers that cells data has been updated.
    this.cells = this.cells.slice();
    this.updateFire();
  }

  @action.bound private updateFire() {
    // Run through all cells. Check the unburnt neighbors of currently-burning cells. If the current time
    // is greater than the ignition time of the cell and the delta time for the neighbor, update
    // the neighbor's ignition time.
    // At the same time, we update the unburnt/burning/burnt states of the cells.
    const newIgnitionData: number[] = [];
    const newFireStateData: FireState[] = [];

    for (let i = 0; i < this.numCells; i++) {
      if (this.cells[i].fireState === FireState.Burning) {
        const neighbors = this.allNeighbors[i];
        const ignitionTime = this.cells[i].ignitionTime;
        const ignitionDeltas = this.timeToIgniteNeighbors[i];

        neighbors.forEach((n, j) => {
          if (this.cells[n].fireState === FireState.Unburnt && this.time >= ignitionTime + ignitionDeltas[j]) {
            // time to ignite neighbor
            newIgnitionData[n] = this.time;
            newFireStateData[n] = FireState.Burning;
          }
        });

        if (this.time - ignitionTime > CELL_BURN_TIME) {
          newFireStateData[i] = FireState.Burnt;
        }
      } else if (this.cells[i].fireState === FireState.Unburnt &&
        this.cells[i].ignitionTime > 0 && this.time > this.cells[i].ignitionTime) {
        // sets any unburnt cells to burning if we are passed their ignition time.
        // although during a simulation all cells will have their state sent to BURNING through the process
        // above, this not only allows us to pre-set ignition times for testing, but will also allow us to
        // run forward or backward through a simulation
        newFireStateData[i] = FireState.Burning;
      }
    }

    for (let i = 0; i < this.numCells; i++) {
      if (newFireStateData[i] !== undefined) {
        this.cells[i].fireState = newFireStateData[i];
      }
      if (newIgnitionData[i] !== undefined) {
        this.cells[i].ignitionTime = newIgnitionData[i];
      }
    }
  }
}
