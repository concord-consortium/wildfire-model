import {action, observable, computed} from "mobx";
import {getFireSpreadRate, IWindProps} from "./fire-model";
import {Cell, CellOptions, FireState} from "./cell";
import {urlConfig, defaultConfig, ISimulationConfig} from "../config";
import {IPresetConfig} from "../presets";
import { getImageData, getInputData, populateGrid } from "../utils";
import {Vector2} from "three";
import { Zone } from "./zone";

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
  cells: Cell[], cellNeighbors: number[][], wind: IWindProps, cellSize: number, moistureContent: number
) => {
  const timeToIgniteNeighbors = [];
  for (let i = 0; i < cells.length; i++) {
    const neighbors = cellNeighbors[i];
    const timeToIgniteMyNeighbors = neighbors.map(n =>
      1 / getFireSpreadRate(cells[i], cells[n], wind, cellSize)
    );
    timeToIgniteNeighbors.push(timeToIgniteMyNeighbors);
  }
  return timeToIgniteNeighbors;
};

export class SimulationModel {
  public timeToIgniteNeighbors: number[][];
  public config: IPresetConfig;
  public cellNeighbors: number[][];
  @observable public dataReady = false;
  @observable public wind: IWindProps;
  @observable public moistureContent: number;
  @observable public sparks: Vector2[] = [];
  @observable public cellSize: number;
  @observable public gridWidth: number;
  @observable public gridHeight: number;
  @observable public time = 0;
  @observable public zones: Zone[] = [];
  @observable public cells: Cell[] = [];
  @observable public simulationStarted = false;
  @observable public simulationRunning = false;

  constructor(presetConfig: Partial<IPresetConfig>) {
    // Configuration are joined together. Default values can be replaced by preset, and preset values can be replaced
    // by URL parameters.
    const config: IPresetConfig = Object.assign({}, defaultConfig, presetConfig, urlConfig);

    this.config = config;
    this.cellSize = config.modelWidth / config.gridWidth;
    this.gridWidth = config.gridWidth;
    this.gridHeight = Math.ceil(config.modelHeight / this.cellSize);
    this.zones = config.zones.map(options => new Zone(options!));

    // It's enough to calculate this just once, as grid won't change.
    this.cellNeighbors = calculateCellNeighbors(this.gridWidth, this.gridHeight, this.config.neighborsDist);

    this.populateCellsData();
    this.setInputParamsFromConfig();

    // Make simulation available in browser console for manual tests.
    (window as any).sim = this;
  }

  @computed public get ready() {
    return this.dataReady && this.sparks.length > 0;
  }

  @action.bound public setInputParamsFromConfig() {
    const config = this.config;
    this.wind = {
      speed: config.windSpeed,
      direction: config.windDirection
    };
    this.moistureContent = config.moistureContent;
    this.sparks.length = 0;
    config.sparks.forEach(s => {
      this.addSpark(s[0], s[1]);
    });
  }

  public getZoneIndex(): Promise<number[] | undefined> {
    return getInputData(this.config.zoneIndex, this.gridWidth, this.gridHeight, false,
      (rgba: [number, number, number, number]) => {
        // Red is zone 1, green is zone 2, and blue is zone 3.
        if (rgba[0] >= rgba[1] && rgba[0] >= rgba[2]) {
          return 0;
        }
        if (rgba[1] >= rgba[0] && rgba[1] >= rgba[2]) {
          return 1;
        }
        return 2;
      }
    );
  }

  public getElevationData(): Promise<number[] | undefined> {
    return getInputData(this.config.elevation, this.gridWidth, this.gridHeight, true,
      (rgba: [number, number, number, number]) => {
        // Elevation data is supposed to black & white image, where black is the lowest point and
        // white is the highest.
        return rgba[0] / 255 * this.config.heightmapMaxElevation;
      }
    );
  }

  @action.bound public populateCellsData() {
    Promise.all([this.getZoneIndex(), this.getElevationData()]).then(values => {
      const zoneIndex = values[0];
      const elevation = values[1];

      this.cells.length = 0;

      for (let y = 0; y < this.gridHeight; y++) {
        for (let x = 0; x < this.gridWidth; x++) {
          const index = getGridIndexForLocation(x, y, this.gridWidth);
          const cellOptions: CellOptions = { x, y, zone: this.zones[zoneIndex ? zoneIndex[index] : 0] };
          if (elevation) {
            cellOptions.elevation = elevation[index];
          }
          this.cells.push(new Cell(cellOptions));
        }
      }
      this.notifyCellsUpdated();
      this.dataReady = true;
    });
  }

  @action.bound public start() {
    if (!this.ready) {
      return;
    }
    if (!this.simulationStarted) {
      this.simulationStarted = true;
    }
    if (this.time === 0) {
      // It's enough to calculate this just once, as long as none of the land properties or wind speed can be changed.
      // This will change in the future when user is able to set land properties or wind speed dynamically.
      this.timeToIgniteNeighbors = calculateTimeToIgniteNeighbors(
        this.cells, this.cellNeighbors, this.wind, this.cellSize, this.moistureContent
      );
      // Use sparks to start the simulation.
      this.sparks.forEach(spark => {
        this.cellAt(spark.x, spark.y).ignitionTime = 0;
      });
    }
    this.simulationRunning = true;
    this.tick();
  }

  @action.bound public stop() {
    this.simulationRunning = false;
  }

  @action.bound public restart() {
    this.simulationRunning = false;
    this.simulationStarted = false;
    this.time = 0;
    this.populateCellsData();
  }

  @action.bound public reload() {
    this.restart();
    // Reset user-controlled properties too.
    this.setInputParamsFromConfig();
  }

  @action.bound public tick() {
    if (!this.simulationRunning) {
      return;
    }
    requestAnimationFrame(this.tick);
    this.time += this.config.timeStep;
    this.updateFire();
    this.notifyCellsUpdated();
  }

  @action.bound public notifyCellsUpdated() {
    // This is hopefully needed only temporarly. 2D view observers cells array directly instead of its content.
    // It doesn't make sense to change it, as it will be eventually replaced by 3D view.
    this.cells = this.cells.slice();
  }

  // Coords are in model units (feet).
  @action.bound public setSpark(idx: number, x: number, y: number) {
    this.sparks[idx] = new Vector2(x, y);
  }

  @action.bound public addSpark(x: number, y: number) {
    if (this.canAddSpark()) {
      this.sparks.push(new Vector2(x, y));
    }
  }

  @action.bound public setWindDirection(direction: number) {
    this.wind.direction = direction;
  }

  @action.bound public setWindSpeed(speed: number) {
    this.wind.speed = speed;
  }

  @action.bound public setMoistureContent(value: number) {
    this.moistureContent = value;
  }

  public canAddSpark() {
    // There's an assumption that number of sparks should be smaller than number of zones.
    return this.sparks.length < this.config.zonesCount;
  }

  public cellAt(x: number, y: number) {
    const gridX = Math.floor(x / this.cellSize);
    const gridY = Math.floor(y / this.cellSize);
    return this.cells[gridY * this.gridWidth + gridX];
  }

  @action.bound private updateFire() {
    const numCells = this.cells.length;
    // Run through all cells. Check the unburnt neighbors of currently-burning cells. If the current time
    // is greater than the ignition time of the cell and the delta time for the neighbor, update
    // the neighbor's ignition time.
    // At the same time, we update the unburnt/burning/burnt states of the cells.
    const newIgnitionData: number[] = [];
    const newFireStateData: FireState[] = [];

    for (let i = 0; i < numCells; i++) {
      const ignitionTime = this.cells[i].ignitionTime;
      if (this.cells[i].fireState === FireState.Burning && this.time - ignitionTime > this.config.cellBurnTime) {
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
