import {action, observable} from "mobx";
import {getFireSpreadRate, LandType} from "./fire-model";
import {Cell, CellOptions, FireState} from "./cell";
import config from "../config";
import {PresetData} from "../presets";

const HEIGHT = config.modelHeight / config.gridCellSize;
const WIDTH = config.modelWidth / config.gridCellSize;
const NUM_CELLS = HEIGHT * WIDTH;
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

/**
 * Returns an array of indices of all cells touching `i`, given the number of
 * `height` and `width`. For this model needs, we assume that cells are neighbours only if they share one well.
 * So, every cell will only have 4 neighbours, not 8.
 */
const getGridCellNeighbors = (i: number, height: number, width: number) => {
  const result = [];
  const x = i % width;
  const y = Math.floor(i / width);
  if (x - 1 >= 0) {
    result.push(i - 1);
  }
  if (x + 1 < width) {
    result.push(i + 1);
  }
  if (y + 1 < height) {
    result.push(i + width);
  }
  if (y - 1 >= 0) {
    result.push(i - width);
  }
  return result;
};

// cached value of getGridCellNeighbors.
const cellNeighbors = (() => {
  const result = [];
  for (let i = 0; i < NUM_CELLS; i++) {
    result.push(getGridCellNeighbors(i, HEIGHT, WIDTH));
  }
  return result;
})();

/**
 * Returns 2d array of times it takes each cell to ignite each neighbor.
 *
 * For instance, for a 5x5 array, cellNeighbors will be a 2d array:
 *     [[1, 5, 6], [0, 2, 5, 6,7], ...]
 * describing cell 0 as being neighbors with cells 1, 5, 6, etc.
 *
 * timeToIgniteNeighbors might then look something like
 *     [[0.5, 0.7, 0.5], [1.2, ...]]
 * which means that, if cell 0 is ignited, cell 1 will ignite 0.5 seconds later.
 */
const calculateTimeToIgniteNeighbors = (cells: Cell[], windSpeed: number) => {
  const timeToIgniteNeighbors = [];
  for (let i = 0; i < NUM_CELLS; i++) {
    const neighbors = cellNeighbors[i];
    const timeToIgniteMyNeighbors = neighbors.map(n =>
      SPREAD_TIME_RATIO / getFireSpreadRate(cells[i], cells[n], windSpeed)
    );
    timeToIgniteNeighbors.push(timeToIgniteMyNeighbors);
  }
  return timeToIgniteNeighbors;
};

// Very confusing, quick-'n-dirty way to populate a gird with a pseudo image.
const populateGridWithImage = (height: number, width: number, image: number[][]): number[] => {
  const arr = [];
  // Figure out the size of the image using the first row.
  const imageHeight = image.length;
  const imageWidth = image[0].length;
  const numGridCellsPerImageRowPixel = imageHeight / height;
  const numGridCellsPerImageColPixel = imageWidth / width;

  let imageRowIndex = 0;
  let imageRowAdvance = 0.0;
  for (let r = 0; r < height; r++) {
    let imageColIndex = 0;
    let imageColAdvance = 0.0;
    for (let c = 0; c < width; c++) {
      arr.push(image[imageRowIndex][imageColIndex]);  // We use baseValue to preset all the cells in the grid.
      imageColAdvance += numGridCellsPerImageColPixel;
      if (imageColAdvance > 1.0) {
        imageColIndex += 1;
        imageColAdvance -= 1.0;
      }
      if (imageColIndex >= imageWidth) {
        imageColIndex = imageWidth - 1; // prevent overflow.
      }
    }
    imageRowAdvance += numGridCellsPerImageRowPixel;
    if (imageRowAdvance > 1) {
      imageRowIndex += 1;
      imageRowAdvance -= 1.0;
    }
    if (imageRowIndex >= imageHeight) {
      imageRowIndex = imageHeight - 1;
    }
  }
  return arr;
};

const getGridIndexForLocation = (x: number, y: number, width: number) => {
  return x + y * width;
};

export class SimulationModel {
  public windSpeed = config.wind;
  public time = 0;
  public timeToIgniteNeighbors: number[][];

  @observable public cells: Cell[] = [];
  @observable public simulationRunning = false;

  constructor(preset: PresetData) {
    const landType: LandType[] | undefined = preset.landType && populateGridWithImage(HEIGHT, WIDTH, preset.landType);
    const elevation: number[] | undefined = preset.elevation && populateGridWithImage(HEIGHT, WIDTH, preset.elevation);
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const index = getGridIndexForLocation(x, y, WIDTH);
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
    // It's enough to calculate this just once, as long as none of the land properties or wind speed can be changed.
    // This will change in the future when user is able to set land properties or wind speed dynamically.
    this.timeToIgniteNeighbors = calculateTimeToIgniteNeighbors(this.cells, this.windSpeed);

    if (config.spark) {
      const sparkX = Math.round(config.spark[0] / CELL_SIZE);
      const sparkY = Math.round(config.spark[1] / CELL_SIZE);
      this.cells[sparkX * WIDTH + sparkY].ignitionTime = 1;
    }
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

    for (let i = 0; i < NUM_CELLS; i++) {
      if (this.cells[i].fireState === FireState.Burning) {
        const neighbors = cellNeighbors[i];
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

    for (let i = 0; i < NUM_CELLS; i++) {
      if (newFireStateData[i] !== undefined) {
        this.cells[i].fireState = newFireStateData[i];
      }
      if (newIgnitionData[i] !== undefined) {
        this.cells[i].ignitionTime = newIgnitionData[i];
      }
    }
  }
}
