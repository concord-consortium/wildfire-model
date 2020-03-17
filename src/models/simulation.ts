import { action, computed, observable } from "mobx";
import { DroughtLevel, getFireSpreadRate, IWindProps, TerrainType, Vegetation } from "./fire-model";
import { BurnIndex, Cell, CellOptions, FireState } from "./cell";
import { defaultConfig, urlConfig } from "../config";
import { IPresetConfig } from "../presets";
import { getInputData } from "../utils";
import { Vector2 } from "three";
import { Zone } from "./zone";
import { Town } from "../types";

interface ICoords {
  x: number;
  y: number;
}

const getGridIndexForLocation = (x: number, y: number, width: number) => {
  return x + y * width;
};

const modelDay = 1440; // minutes

const endOfLowIntensityFireProbability: {[key: number]: number} = {
  0: 0.0,
  1: 0.6,
  2: 0.6,
  3: 0.7,
  4: 0.8,
  5: 1.0
};

// Bresenham's line algorithm.
export const forEachPointBetween = (
  x0: number, y0: number, x1: number, y1: number, callback: (x: number, y: number, idx: number) => void
) => {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = (x0 < x1) ? 1 : -1;
  const sy = (y0 < y1) ? 1 : -1;
  let err = dx - dy;
  let idx = 0;
  while (true) {
    callback(x0, y0, idx);
    idx += 1;
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
};

export const nonburnableCellBetween = (
  cells: Cell[], width: number, x0: number, y0: number, x1: number, y1: number
) => {
  let result = false;
  forEachPointBetween(x0, y0, x1, y1, (x: number, y: number) => {
    const idx = getGridIndexForLocation(x, y, width);
    if (!cells[idx].isBurnable) {
      result = true;
    }
  });
  return result;
};

export const dist = (x0: number, y0: number, x1: number, y1: number) => {
  return Math.sqrt((x0 - x1) * (x0 - x1) + (y0 - y1) * (y0 - y1));
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
  // Keep this flag for performance reasons. If there's no nonburnable ceels in current grid area, it doesn't
  // make sense to run Bresenham's algorithm for every cell (nonburnableCellBetween).
  let anyNonburnableCells = false;
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
        if (!cells[nIdx].isBurnable) {
          anyNonburnableCells = true;
        } else if (!anyNonburnableCells || !nonburnableCellBetween(cells, width, x1 + diff.x, y1 + diff.y, x0, y0)) {
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
  const result = [];
  for (let i = 0; i < width * height; i++) {
    result.push(getGridCellNeighbors(cells, i, width, height, neighborsDist));
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
  public config: IPresetConfig;
  // initialCellNeighbors list doesn't include user-defined fire lines (and other modifications of the original
  // simulation state that we might add in the future).
  public initialCellNeighbors: number[][];
  public cellNeighbors: number[][];
  // initialTimeToIgniteNeighbors list doesn't include user-defined fire lines (and other modifications of the original
  // simulation state that we might add in the future).
  public initialTimeToIgniteNeighbors: number[][];
  public timeToIgniteNeighbors: number[][];
  public prevTickTime: number | null;
  public recalculateCellProps: boolean = true;
  public endOfLowIntensityFire = false;
  public dataReadyPromise: Promise<void>;
  @observable public dataReady = false;
  @observable public wind: IWindProps;
  @observable public sparks: Vector2[] = [];
  @observable public fireLineMarkers: Vector2[] = [];
  @observable public townMarkers: Town[] = [];
  @observable public cellSize: number;
  @observable public gridWidth: number;
  @observable public gridHeight: number;
  @observable public time = 0; // in minutes
  @observable public zones: Zone[] = [];
  @observable public cells: Cell[] = [];
  @observable public simulationStarted = false;
  @observable public simulationRunning = false;
  @observable public lastFireLineTimestamp = -Infinity;
  // These flags can be used by view to trigger appropriate rendering. Theoretically, view could/should check
  // every single cell and re-render when it detects some changes. In practice, we perform these updates in very
  // specific moments and usually for all the cells, so this approach can be way more efficient.
  @observable public cellsStateFlag = 0;
  @observable public cellsElevationFlag = 0;

  constructor(presetConfig: Partial<IPresetConfig>) {
    this.load(presetConfig);
  }

  @computed public get ready() {
    return this.dataReady && this.sparks.length > 0;
  }

  @action.bound public setInputParamsFromConfig() {
    const config = this.config;
    this.zones = config.zones.map(options => new Zone(options!));
    this.wind = {
      speed: config.windSpeed,
      direction: config.windDirection
    };
    this.sparks.length = 0;
    config.sparks.forEach(s => {
      this.addSpark(s[0], s[1]);
    });
  }

  public load(presetConfig: Partial<IPresetConfig>) {
    this.restart();
    // Configuration are joined together. Default values can be replaced by preset, and preset values can be replaced
    // by URL parameters.
    const config: IPresetConfig = Object.assign({}, defaultConfig, presetConfig, urlConfig);

    this.config = config;
    this.cellSize = config.modelWidth / config.gridWidth;
    this.gridWidth = config.gridWidth;
    this.gridHeight = Math.ceil(config.modelHeight / this.cellSize);
    this.setInputParamsFromConfig();
    this.populateCellsData();
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

  public getUnburntIslandsData(): Promise<number[] | undefined> {
    // Unburnt islands can be specified directly using unburntIslands property or they'll be generated automatically
    // using zones terrain type.
    let unburntIslands: number[][] | string | undefined = this.config.unburntIslands;
    if (!unburntIslands) {
      const prefix = "data/";
      const zoneTypes: string[] = [];
      this.zones.forEach((z, i) => {
        if (i < this.config.zonesCount) {
          zoneTypes.push(TerrainType[z.terrainType].toLowerCase());
        }
      });
      unburntIslands = prefix + zoneTypes.join("-") + "-islands.png";
    }
    const islandActive: {[key: number]: number} = {};
    return getInputData(unburntIslands, this.gridWidth, this.gridHeight, true,
      (rgba: [number, number, number, number]) => {
        // White areas are regular cells. Islands use gray scale colors, every island is supposed to have different
        // shade. It's enough to look just at R value, as G and B will be equal.
        const r = rgba[0];
        if (r < 255) {
          if (islandActive[r] === undefined) {
            if (Math.random() < this.config.unburntIslandProbability) {
              islandActive[r] = 1;
            } else {
              islandActive[r] = 0;
            }
          }
          return islandActive[r]; // island activity, 0 or 1
        } else {
          return 0; // white color means we're dealing with regular cell, return 0 (inactive island)
        }
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
    this.dataReadyPromise = Promise.all([
      this.getZoneIndex(), this.getElevationData(), this.getRiverData(), this.getUnburntIslandsData()
    ]).then(values => {
      const zoneIndex = values[0];
      const elevation = values[1];
      const river = values[2];
      const unburntIsland = values[3];

      this.cells.length = 0;

      for (let y = 0; y < this.gridHeight; y++) {
        for (let x = 0; x < this.gridWidth; x++) {
          const index = getGridIndexForLocation(x, y, this.gridWidth);
          const cellOptions: CellOptions = {
            x, y,
            zone: this.zones[zoneIndex ? zoneIndex[index] : 0],
            isRiver: river && river[index] > 0,
            isUnburntIsland: unburntIsland && unburntIsland[index] > 0
          };
          if (elevation) {
            cellOptions.baseElevation = elevation[index];
          }
          this.cells.push(new Cell(cellOptions));
        }
      }
      this.updateCellsElevationFlag();
      this.updateCellsStateFlag();
      this.updateTownMarkers();
      this.dataReady = true;
      this.recalculateCellProps = true;
    });
  }

  @action.bound public calculateCellProps() {
    if (this.recalculateCellProps) {
      // tslint:disable-next-line:no-console
      console.time("neighbors calc");
      this.cellNeighbors = calculateCellNeighbors(
        this.cells, this.gridWidth, this.gridHeight, this.config.neighborsDist
      );
      if (this.time === 0) {
        // Copy 2d array.
        this.initialCellNeighbors = this.cellNeighbors.map(row => row.slice());
      }
      // tslint:disable-next-line:no-console
      console.timeEnd("neighbors calc");
      // tslint:disable-next-line:no-console
      console.time("ignition time calc");
      this.timeToIgniteNeighbors = calculateTimeToIgniteNeighbors(
        this.cells, this.cellNeighbors, this.wind, this.cellSize, this.gridWidth, this.gridHeight
      );
      if (this.time === 0) {
        // Copy 2d array.
        this.initialTimeToIgniteNeighbors = this.timeToIgniteNeighbors.map(row => row.slice());
      }
      // tslint:disable-next-line:no-console
      console.timeEnd("ignition time calc");
      this.recalculateCellProps = false;
    }
  }

  @action.bound public start() {
    if (!this.ready) {
      return;
    }
    if (!this.simulationStarted) {
      this.simulationStarted = true;
    }

    this.applyFireLineMarkers();

    this.simulationRunning = true;
    this.prevTickTime = null;
    requestAnimationFrame(this.rafCallback);
  }

  @action.bound public stop() {
    this.simulationRunning = false;
  }

  @action.bound public restart() {
    this.simulationRunning = false;
    this.simulationStarted = false;
    this.time = 0;
    this.endOfLowIntensityFire = false;
    this.cells.forEach(cell => cell.reset());
    this.fireLineMarkers.length = 0;
    this.updateCellsStateFlag();
    this.updateCellsElevationFlag();
    // That's necessary because of the fire lines that have been removed.
    this.recalculateCellProps = true;
  }

  @action.bound public reload() {
    this.restart();
    // Reset user-controlled properties too.
    this.setInputParamsFromConfig();
    this.populateCellsData();
  }

  @action.bound public rafCallback(time: number) {
    if (!this.simulationRunning) {
      return;
    }
    requestAnimationFrame(this.rafCallback);

    let realTimeDiffInMinutes = null;
    if (!this.prevTickTime) {
      this.prevTickTime = time;
    } else {
      realTimeDiffInMinutes = (time - this.prevTickTime) / 60000;
      this.prevTickTime = time;
    }
    let timeDiff;
    if (realTimeDiffInMinutes) {
      // One day in model time (86400 seconds) should last X seconds in real time.
      const ratio = 86400 / this.config.modelDayInSeconds;
      timeDiff = Math.min(this.config.maxTimeStep, ratio * realTimeDiffInMinutes);
    } else {
      // We don't know performance yet, so simply increase time by some safe value and wait for the next tick.
      timeDiff = 1;
    }

    this.tick(timeDiff);
  }

  @action.bound public tick(modelTimeDiff: number) {
    if (this.time === 0) {
      // Use sparks to start the simulation.
      this.sparks.forEach(spark => {
        const sparkCell = this.cellAt(spark.x, spark.y);
        sparkCell.ignitionTime = 0;
        if (sparkCell.isUnburntIsland) {
          // If spark is placed inside unburnt island, remove this island as otherwise the fire won't pick up.
          this.removeUnburntIsland(sparkCell);
        }
      });
    }

    // Note that in most cases this function will immediately return. It's only necessary once when model starts
    // or when fire line is added. It's necessary for this function to be executed while time is still equal to 0
    // at least once, so the copies of neighbor list and ignition times are created.
    this.calculateCellProps();

    const dayChange = Math.floor(this.time / modelDay) !== Math.floor((this.time + modelTimeDiff) / modelDay);
    this.time += modelTimeDiff;

    if (dayChange) {
      const day = Math.floor(this.time / modelDay);
      if (Math.random() <= endOfLowIntensityFireProbability[day]) {
        this.endOfLowIntensityFire = true;
      }
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

  @action.bound public updateTownMarkers() {
    this.townMarkers.length = 0;
    this.config.towns.forEach(town => {
      const x = town.x * this.config.modelWidth;
      const y = town.y * this.config.modelHeight;
      const cell = this.cellAt(x, y);
      if (town.terrainType === undefined || town.terrainType === cell.zone.terrainType) {
        this.townMarkers.push({ name: town.name, position: new Vector2(x, y) });
      }
    });
  }

  @action.bound public removeUnburntIsland(startingCell: Cell) {
    const queue: Cell[] = [];
    startingCell.isUnburntIsland = false;
    queue.push(startingCell);
    while (queue.length > 0) {
      const c = queue.shift()!;
      directNeighbours.forEach(diff => {
        const x1 = c.x + diff.x;
        const y1 = c.y + diff.y;
        const nIdx = getGridIndexForLocation(x1, y1, this.gridWidth);
        if (x1 >= 0 && x1 < this.gridWidth && y1 >= 0 && y1 < this.gridHeight && this.cells[nIdx].isUnburntIsland) {
          this.cells[nIdx].isUnburntIsland = false;
          queue.push(this.cells[nIdx]);
        }
      });
    }
  }

  @action.bound public addSpark(x: number, y: number) {
    if (this.canAddSpark()) {
      this.sparks.push(new Vector2(x, y));
    }
  }

  // Coords are in model units (feet).
  @action.bound public setSpark(idx: number, x: number, y: number) {
    this.sparks[idx] = new Vector2(x, y);
  }

  @action.bound public addFireLineMarker(x: number, y: number) {
    if (this.canAddFireLineMarker()) {
      this.fireLineMarkers.push(new Vector2(x, y));
      const count = this.fireLineMarkers.length;
      if (count % 2 === 0) {
        this.markFireLineUnderConstruction(this.fireLineMarkers[count - 2], this.fireLineMarkers[count - 1], true);
      }
    }
  }

  @action.bound public setFireLineMarker(idx: number, x: number, y: number) {
    if (idx % 2 === 1 && idx - 1 >= 0) {
      // Erase old line.
      this.markFireLineUnderConstruction(this.fireLineMarkers[idx - 1], this.fireLineMarkers[idx], false);
      // Update point.
      this.fireLineMarkers[idx] = new Vector2(x, y);
      this.limitFireLineLength(this.fireLineMarkers[idx - 1], this.fireLineMarkers[idx]);
      // Draw a new line.
      this.markFireLineUnderConstruction(this.fireLineMarkers[idx - 1], this.fireLineMarkers[idx], true);
    }
    if (idx % 2 === 0 && idx + 1 < this.fireLineMarkers.length) {
      this.markFireLineUnderConstruction(this.fireLineMarkers[idx], this.fireLineMarkers[idx + 1], false);
      this.fireLineMarkers[idx] = new Vector2(x, y);
      this.limitFireLineLength(this.fireLineMarkers[idx + 1], this.fireLineMarkers[idx]);
      this.markFireLineUnderConstruction(this.fireLineMarkers[idx], this.fireLineMarkers[idx + 1], true);
    }
  }

  @action.bound public markFireLineUnderConstruction(start: ICoords, end: ICoords, value: boolean) {
    const startGridX = Math.floor(start.x / this.cellSize);
    const startGridY = Math.floor(start.y / this.cellSize);
    const endGridX = Math.floor(end.x / this.cellSize);
    const endGridY = Math.floor(end.y / this.cellSize);
    forEachPointBetween(startGridX, startGridY, endGridX, endGridY, (x: number, y: number, idx: number) => {
      if (idx % 2 === 0) {
        // idx % 2 === 0 to make dashed line.
        this.cells[getGridIndexForLocation(x, y, this.gridWidth)].isFireLineUnderConstruction = value;
      }
    });
    this.updateCellsStateFlag();
  }

  // Note that this function modifies "end" point coordinates.
  @action.bound public limitFireLineLength(start: ICoords, end: ICoords) {
    const dRatio = dist(start.x, start.y, end.x, end.y) / this.config.maxFireLineLength;
    if (dRatio > 1) {
      end.x = start.x + (end.x - start.x) / dRatio;
      end.y = start.y + (end.y - start.y) / dRatio;
    }
  }

  @action.bound public applyFireLineMarkers() {
    if (this.fireLineMarkers.length === 0) {
      return;
    }
    for (let i = 0; i < this.fireLineMarkers.length; i += 2) {
      if (i + 1 < this.fireLineMarkers.length) {
        this.markFireLineUnderConstruction(this.fireLineMarkers[i], this.fireLineMarkers[i + 1], false);
        this.buildFireLine(this.fireLineMarkers[i], this.fireLineMarkers[i + 1]);
      }
    }
    this.fireLineMarkers.length = 0;
    this.updateCellsStateFlag();
    this.updateCellsElevationFlag();
    // Neighbours will be affected, so it's necessary to recalulate neighbours list and ignition times.
    this.recalculateCellProps = true;
  }

  @action.bound public buildFireLine(start: ICoords, end: ICoords) {
    const startGridX = Math.floor(start.x / this.cellSize);
    const startGridY = Math.floor(start.y / this.cellSize);
    const endGridX = Math.floor(end.x / this.cellSize);
    const endGridY = Math.floor(end.y / this.cellSize);
    forEachPointBetween(startGridX, startGridY, endGridX, endGridY, (x: number, y: number) => {
      const cell = this.cells[getGridIndexForLocation(x, y, this.gridWidth)];
      cell.isFireLine = true;
    });
    this.lastFireLineTimestamp = this.time;
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

  @action.bound public updateZoneVegetation(zoneIdx: number, vegetation: Vegetation) {
    this.zones[zoneIdx].vegetation = vegetation;
  }

  public canAddSpark() {
    // There's an assumption that number of sparks should be smaller than number of zones.
    return this.sparks.length < this.config.zonesCount;
  }

  public canAddFireLineMarker() {
    // Only one fire line can be added at given time.
    return this.fireLineMarkers.length < 2 && this.time - this.lastFireLineTimestamp > this.config.fireLineDelay;
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
    let fireDidStop = true;

    for (let i = 0; i < numCells; i++) {
      const cell = this.cells[i];
      if (cell.isBurningOrWillBurn) {
        fireDidStop = false; // fire still going on
      }
      const ignitionTime = cell.ignitionTime;
      if (cell.fireState === FireState.Burning && this.time - ignitionTime > cell.burnTime) {
        newFireStateData[i] = FireState.Burnt;
      } else if (cell.fireState === FireState.Unburnt && this.time > ignitionTime ) {
        // Sets any unburnt cells to burning if we are passed their ignition time.
        // Although during a simulation all cells will have their state sent to BURNING through the process
        // above, this not only allows us to pre-set ignition times for testing, but will also allow us to
        // run forward or backward through a simulation.
        newFireStateData[i] = FireState.Burning;
        // Fire should spread if endOfLowIntensityFire flag is false or burn index is high enough.
        const fireShouldSpread = !this.endOfLowIntensityFire || cell.burnIndex !== BurnIndex.Low;
        if (fireShouldSpread) {
          // Fire lines and other fire control methods will work only if burn index is low or medium.
          // If it's high, fire cannot be controlled.
          const controlMethodsWork = cell.burnIndex !== BurnIndex.High;
          const neighbors = controlMethodsWork ? this.cellNeighbors[i] : this.initialCellNeighbors[i];
          const ignitionDeltas = controlMethodsWork ?
            this.timeToIgniteNeighbors[i] : this.initialTimeToIgniteNeighbors[i];
          neighbors.forEach((n, j) => {
            const neighCell = this.cells[n];
            if (neighCell.fireState === FireState.Unburnt) {
              newIgnitionData[n] = Math.min(
                ignitionTime + ignitionDeltas[j], newIgnitionData[n] || neighCell.ignitionTime
              );
              // Make cell burn time proportional to fire spread rate.
              const newBurnTime = (newIgnitionData[n] - ignitionTime) + this.config.minCellBurnTime;
              if (newBurnTime < neighCell.burnTime) {
                neighCell.burnTime = newBurnTime;
              }
              // Calculate distance-independent spread rate using ignition delta. Note that ignition delta is just
              // inverted spread rate. See `calculateTimeToIgniteNeighbors` function. This value is later used to
              // calculate burn index.
              const distInFt = dist(cell.x, cell.y, neighCell.x, neighCell.y) * this.cellSize;
              const newSpreadRate = distInFt / ignitionDeltas[j];
              if (newSpreadRate > neighCell.spreadRate) {
                neighCell.spreadRate = newSpreadRate;
              }
            }
          });
        }
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

    if (fireDidStop) {
      this.simulationRunning = false;
    }
  }
}
