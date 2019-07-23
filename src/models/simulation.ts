import {action, observable} from "mobx";
import {getFireSpreadRate, LandType} from "./fire-model";
import {Cell, CellOptions, FireState} from "./cell";
import {urlConfig, defaultConfig, ISimulationConfig} from "../config";
import {IPresetConfig} from "../presets";

const getGridIndexForLocation = (x: number, y: number, width: number) => {
  return x + y * width;
};

/**
 * Returns an array of indices of all cells touching `i`, given the number of
 * `height` and `width`. `neighborsDist` variable says how many neighbouring cells will we consider
 * (or how wide is the neighbor rectangle).
 */
const getGridCellNeighbors = (i: number, width: number, height: number, neighborsDist: number) => {
  const result = [];
  const x = i % width;
  const y = Math.floor(i / width);
  for (let nx = x - neighborsDist; nx <= x + neighborsDist; nx += 1) {
    for (let ny = y - neighborsDist; ny <= y + neighborsDist; ny += 1) {
      if ((nx !== x || ny !== y) && nx >= 0 && nx < width && ny >= 0 && ny < height) {
        result.push(getGridIndexForLocation(nx, ny, width));
      }
    }
  }
  return result;
};

const calculateCellNeighbors = (width: number, height: number, neighborsDist: number) => {
  const result = [];
  for (let i = 0; i < width * height; i++) {
    result.push(getGridCellNeighbors(i, width, height, neighborsDist));
  }
  return result;
};

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
const calculateTimeToIgniteNeighbors = (
  cells: Cell[], cellNeighbors: number[][], windSpeed: number, config: ISimulationConfig
) => {
  const timeToIgniteNeighbors = [];
  for (let i = 0; i < cells.length; i++) {
    const neighbors = cellNeighbors[i];
    const timeToIgniteMyNeighbors = neighbors.map(n =>
      // Make time to ignite proportional to size of the cell.
      // If every cell is twice as big, the spread time in the end also should be slower.
      config.fireSpreadTimeRatio * config.cellSize / getFireSpreadRate(cells[i], cells[n], windSpeed)
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

export class SimulationModel {
  public timeToIgniteNeighbors: number[][];
  public config: IPresetConfig;
  public cellNeighbors: number[][];
  @observable public gridWidth: number;
  @observable public gridHeight: number;
  @observable public windSpeed: number;
  @observable public time = 0;
  @observable public cells: Cell[] = [];
  @observable public simulationRunning = false;

  constructor(presetConfig: Partial<IPresetConfig>) {
    // Configuration are joined together. Default values can be replaced by preset, and preset values can be replaced
    // by URL parameters.
    const config: IPresetConfig = Object.assign({}, defaultConfig, presetConfig, urlConfig);

    this.config = config;
    this.gridWidth = config.modelWidth / config.cellSize;
    this.gridHeight = config.modelHeight / config.cellSize;
    this.windSpeed = config.windSpeed;

    const landType: LandType[] | undefined =
      config.landType && populateGridWithImage(this.gridHeight, this.gridWidth, config.landType);
    const elevation: number[] | undefined =
      config.elevation && populateGridWithImage(this.gridHeight, this.gridWidth, config.elevation);
    for (let y = 0; y < this.gridHeight; y++) {
      for (let x = 0; x < this.gridWidth; x++) {
        const index = getGridIndexForLocation(x, y, this.gridWidth);
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
    // It's enough to calculate this just once, as grid won't change.
    this.cellNeighbors = calculateCellNeighbors(this.gridWidth, this.gridHeight, this.config.neighborsDist);
    // It's enough to calculate this just once, as long as none of the land properties or wind speed can be changed.
    // This will change in the future when user is able to set land properties or wind speed dynamically.
    this.timeToIgniteNeighbors = calculateTimeToIgniteNeighbors(this.cells, this.cellNeighbors, this.windSpeed, config);

    if (config.spark) {
      const sparkX = Math.round(config.spark[0] / this.config.cellSize);
      const sparkY = Math.round(config.spark[1] / this.config.cellSize);
      this.cells[sparkX * this.gridWidth + sparkY].ignitionTime = 1;
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
    this.time += this.config.timeStep;
    // Explicitly update cells array. This will notify observers that cells data has been updated.
    this.cells = this.cells.slice();
    this.updateFire();
  }

  @action.bound private updateFire() {
    const numCells = this.cells.length;
    // Run through all cells. Check the unburnt neighbors of currently-burning cells. If the current time
    // is greater than the ignition time of the cell and the delta time for the neighbor, update
    // the neighbor's ignition time.
    // At the same time, we update the unburnt/burning/burnt states of the cells.
    const newIgnitionData: number[] = [];
    const newFireStateData: FireState[] = [];
    // Total time a cell should burn. This is partially a view property, but it also allows us to be
    // more efficient by only checking burning cell's neighbors, and not spent cells neighbors. However,
    // it is not intended to affect the model's actual functioning. (e.g. cell should never be burnt out
    // before its neighbors are ignited.)
    // It would be even more efficient to get the maximum `timeToIgniteNeighbors` for a model, and use that
    // as a separate flag to indicate when to stop checking a cell, which would give us a smaller number
    // of cells to check. We'd still want a separate burn time for the view.
    const cellBurnTime = this.config.fireSpreadTimeRatio * this.config.cellSize;

    for (let i = 0; i < numCells; i++) {
      const ignitionTime = this.cells[i].ignitionTime;
      if (this.cells[i].fireState === FireState.Burning && this.time - ignitionTime > cellBurnTime) {
        newFireStateData[i] = FireState.Burnt;
      } else if (this.cells[i].fireState === FireState.Unburnt && this.time > ignitionTime) {
        // Sets any unburnt cells to burning if we are passed their ignition time.
        // Although during a simulation all cells will have their state sent to BURNING through the process
        // above, this not only allows us to pre-set ignition times for testing, but will also allow us to
        // run forward or backward through a simulation.
        newFireStateData[i] = FireState.Burning;

        const neighbors = this.cellNeighbors[i];
        const ignitionDeltas = this.timeToIgniteNeighbors[i];
        neighbors.forEach((n, j) => {
          if (this.cells[n].fireState === FireState.Unburnt) {
            newIgnitionData[n] = Math.min(
              ignitionTime + ignitionDeltas[j], newIgnitionData[n] || this.cells[n].ignitionTime
            );
          }
        });
      }
    }

    for (let i = 0; i < numCells; i++) {
      if (newFireStateData[i] !== undefined) {
        this.cells[i].fireState = newFireStateData[i];
      }
      if (newIgnitionData[i] !== undefined) {
        this.cells[i].ignitionTime = newIgnitionData[i];
      }
    }
  }
}
