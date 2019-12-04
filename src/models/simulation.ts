import { action, computed, observable } from "mobx";
import { DroughtLevel, getFireSpreadRate, IWindProps, LandType, TerrainType } from "./fire-model";
import { Cell, CellOptions, FireState } from "./cell";
import { defaultConfig, urlConfig } from "../config";
import { IPresetConfig } from "../presets";
import { getInputData } from "../utils";
import { Vector2 } from "three";
import { Zone } from "./zone";

const getGridIndexForLocation = (x: number, y: number, width: number) => {
  return x + y * width;
};

// Bresenham's line algorithm is used to check if there's any river or fire line between (x0, y0) and (x1, y1).
export const riverOrFireLineBetween = (
  cells: Cell[], width: number, x0: number, y0: number, x1: number, y1: number
) => {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = (x0 < x1) ? 1 : -1;
  const sy = (y0 < y1) ? 1 : -1;
  let err = dx - dy;

  while (true) {
    const idx = getGridIndexForLocation(x0, y0, width);
    if (cells[idx].isRiverOrFireLine) {
      return true;
    }
    if ((x0 === x1) && (y0 === y1)) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
  return false;
};

export const withinDist = (x0: number, y0: number, x1: number, y1: number, maxDist: number) => {
  return (x0 - x1) * (x0 - x1) + (y0 - y1) * (y0 - y1) <= maxDist * maxDist;
};

// Only four directions. It's important, as it makes less likely the river or fire line is accidentally crossed by the
// fire (e.g. when it's really narrow and drawn at 45* angle).
const directNeighbours = [ {x: -1, y: 0}, {x: 1, y: 0}, {x: 0, y: -1}, {x: 0, y: 1} ];

/**
 * Returns an array of indices of all cells neighboring `i`.
 * Each cell within `neighborsDist` is considered to be a neighbour if there's no river or fire line between
 * this cell and cell `i`.
 */
export const getGridCellNeighbors = (
  cells: Cell[], i: number, width: number, height: number, neighborsDist: number
) => {
  const neighbours: number[] = [];
  const queue: number[] = [];
  const processed: {[key: number]: boolean}  = {};
  const x0 = i % width;
  const y0 = Math.floor(i / width);
  // Keep this flag for performance reasons. If there's no river or fire line in current grid area, it doesn't
  // make sense to run Bresenham's algorithm for every cell (riverOrFireLineBetween).
  let anyRiverOrFireLine = false;
  // Start BFS.
  queue.push(i);
  processed[i] = true;
  while (queue.length > 0) {
    const j = queue.shift()!;
    const x1 = j % width;
    const y1 = Math.floor(j / width);
    directNeighbours.forEach(diff => {
      const nIdx = getGridIndexForLocation(x1 + diff.x, y1 + diff.y, width);
      if (x1 + diff.x >= 0 && x1 + diff.x < width && y1 + diff.y >= 0 &&  y1 + diff.y < height &&
        !processed[nIdx] &&
        withinDist(x0, y0, x1 + diff.x, y1 + diff.y, neighborsDist)
      ) {
        if (cells[nIdx].isRiverOrFireLine) {
          anyRiverOrFireLine = true;
        } else if (!anyRiverOrFireLine || !riverOrFireLineBetween(cells, width, x1 + diff.x, y1 + diff.y, x0, y0)) {
          neighbours.push(nIdx);
          queue.push(nIdx);
        }
        processed[nIdx] = true;
      }
    });
  }
  return neighbours;
};

const calculateCellNeighbors = (cells: Cell[], width: number, height: number, neighborsDist: number) => {
  // tslint:disable-next-line:no-console
  console.time("neighbours calc");
  const result = [];
  for (let i = 0; i < width * height; i++) {
    result.push(getGridCellNeighbors(cells, i, width, height, neighborsDist));
  }
  // tslint:disable-next-line:no-console
  console.timeEnd("neighbours calc");
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
  cells: Cell[], cellNeighbors: number[][], wind: IWindProps, cellSize: number, gridWidth: number, gridHeight: number
) => {
  const timeToIgniteNeighbors = [];
  for (let i = 0; i < cells.length; i++) {
    const neighbors = cellNeighbors[i];
    const timeToIgniteMyNeighbors = neighbors.map(n =>
      1 / getFireSpreadRate(cells[i], cells[n], wind, cellSize, gridWidth, gridHeight)
    );
    timeToIgniteNeighbors.push(timeToIgniteMyNeighbors);
  }
  return timeToIgniteNeighbors;
};

export class SimulationModel {
  public timeToIgniteNeighbors: number[][];
  public config: IPresetConfig;
  public cellNeighbors: number[][];
  public prevTickTime: number | null;
  @observable public dataReady = false;
  @observable public wind: IWindProps;
  @observable public sparks: Vector2[] = [];
  @observable public cellSize: number;
  @observable public gridWidth: number;
  @observable public gridHeight: number;
  @observable public time = 0;
  @observable public zones: Zone[] = [];
  @observable public cells: Cell[] = [];
  @observable public simulationStarted = false;
  @observable public simulationRunning = false;
  // These flags can be used by view to trigger appropriate rendering. Theoretically, view could/should check
  // every single cell and re-render when it detects some changes. In practice, we perform these updates in very
  // specific moments and usually for all the cells, so this approach can be way more efficient.
  @observable public cellsStateFlag = 0;
  @observable public cellsElevationFlag = 0;

  constructor(presetConfig: Partial<IPresetConfig>) {
    // Configuration are joined together. Default values can be replaced by preset, and preset values can be replaced
    // by URL parameters.
    const config: IPresetConfig = Object.assign({}, defaultConfig, presetConfig, urlConfig);

    this.config = config;
    this.cellSize = config.modelWidth / config.gridWidth;
    this.gridWidth = config.gridWidth;
    this.gridHeight = Math.ceil(config.modelHeight / this.cellSize);
    this.zones = config.zones.map(options => new Zone(options!));
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
    // If `elevation` height map is provided, it will be loaded during model initialization.
    // Otherwise, height map URL will be derived from zones `terrainType` properties.
    let heightmapUrl = this.config.elevation;
    if (!heightmapUrl) {
      const prefix = "data/";
      const zoneTypes: string[] = [];
      this.zones.forEach((z, i) => {
        if (i < this.config.zonesCount) {
          zoneTypes.push(TerrainType[z.terrainType].toLowerCase());
        }
      });
      const edgeStyle = this.config.fillTerrainEdges ? "-edge" : "";
      heightmapUrl = prefix + zoneTypes.join("-") + "-heightmap" + edgeStyle + ".png";
    }
    return getInputData(heightmapUrl, this.gridWidth, this.gridHeight, true,
      (rgba: [number, number, number, number]) => {
        // Elevation data is supposed to black & white image, where black is the lowest point and
        // white is the highest.
        return rgba[0] / 255 * this.config.heightmapMaxElevation;
      }
    );
  }

  public getRiverData(): Promise<number[] | undefined> {
    if (!this.config.riverData) {
      return Promise.resolve(undefined);
    }
    return getInputData(this.config.riverData, this.gridWidth, this.gridHeight, true,
      (rgba: [number, number, number, number]) => {
        // River texture is mostly transparent, so look for non-transparent cells to define shape
        return rgba[3] > 0 ? 1 : 0;
      }
    );
  }

  @action.bound public populateCellsData() {
    this.dataReady = false;
    Promise.all([this.getZoneIndex(), this.getElevationData(), this.getRiverData()]).then(values => {
      const zoneIndex = values[0];
      const elevation = values[1];
      const river = values[2];

      this.cells.length = 0;

      for (let y = 0; y < this.gridHeight; y++) {
        for (let x = 0; x < this.gridWidth; x++) {
          const index = getGridIndexForLocation(x, y, this.gridWidth);
          const cellOptions: CellOptions = {
            x, y,
            zone: this.zones[zoneIndex ? zoneIndex[index] : 0],
            isRiverOrFireLine: river && river[index] > 0
          };
          if (elevation) {
            cellOptions.elevation = elevation[index];
          }
          this.cells.push(new Cell(cellOptions));
        }
      }
      // It's enough to calculate this just once, as grid won't change.
      this.cellNeighbors = calculateCellNeighbors(
        this.cells, this.gridWidth, this.gridHeight, this.config.neighborsDist
      );
      this.updateCellsElevationFlag();
      this.updateCellsStateFlag();
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
      // tslint:disable-next-line:no-console
      console.time("ignition time calc");
      // It's enough to calculate this just once, as long as none of the land properties or wind speed can be changed.
      // This will change in the future when user is able to set land properties or wind speed dynamically.
      this.timeToIgniteNeighbors = calculateTimeToIgniteNeighbors(
        this.cells, this.cellNeighbors, this.wind, this.cellSize, this.gridWidth, this.gridHeight
      );
      // tslint:disable-next-line:no-console
      console.timeEnd("ignition time calc");
      // Use sparks to start the simulation.
      this.sparks.forEach(spark => {
        this.cellAt(spark.x, spark.y).ignitionTime = 0;
      });
    }
    this.simulationRunning = true;
    this.prevTickTime = null;
    requestAnimationFrame(this.tick);
  }

  @action.bound public stop() {
    this.simulationRunning = false;
  }

  @action.bound public restart() {
    this.simulationRunning = false;
    this.simulationStarted = false;
    this.time = 0;
    this.cells.forEach(cell => cell.reset());
    this.updateCellsStateFlag();
  }

  @action.bound public reload() {
    this.restart();
    // Reset user-controlled properties too.
    this.setInputParamsFromConfig();
  }

  @action.bound public tick(time: number) {
    if (!this.simulationRunning) {
      return;
    }
    requestAnimationFrame(this.tick);
    let realTimeDiffInMinutes = null;
    if (!this.prevTickTime) {
      this.prevTickTime = time;
    } else {
      realTimeDiffInMinutes = (time - this.prevTickTime) / 60000;
      this.prevTickTime = time;
    }
    if (realTimeDiffInMinutes) {
      // One day in model time (86400 seconds) should last X seconds in real time.
      const ratio = 86400 / this.config.modelDayInSeconds;
      this.time += Math.min(this.config.maxTimeStep, ratio * realTimeDiffInMinutes);
    } else {
      // We don't know performance yet, so simply increase time by some safe value and wait for the next tick.
      this.time += 1;
    }
    this.updateFire();
    this.updateCellsStateFlag();
  }

  @action.bound public updateCellsElevationFlag() {
    this.cellsElevationFlag += 1;
  }

  @action.bound public updateCellsStateFlag() {
    this.cellsStateFlag += 1;
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

  @action.bound public updateZoneTerrain(zoneIdx: number, updatedTerrainType: TerrainType) {
    this.zones[zoneIdx].terrainType = updatedTerrainType;
  }

  @action.bound public updateZoneMoisture(zoneIdx: number, droughtLevel: DroughtLevel) {
    this.zones[zoneIdx].droughtLevel = droughtLevel;
  }

  @action.bound public updateZoneVegetation(zoneIdx: number, vegetation: LandType) {
    this.zones[zoneIdx].landType = vegetation;
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
