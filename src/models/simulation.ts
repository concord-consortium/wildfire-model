import { action, computed, observable } from "mobx";
import { DroughtLevel, IWindProps, TerrainType, Vegetation } from "../types";
import {  Cell, CellOptions } from "./cell";
import { getDefaultConfig, ISimulationConfig, getUrlConfig } from "../config";
import { Vector2 } from "three";
import { getElevationData, getRiverData, getUnburntIslandsData, getZoneIndex } from "./utils/data-loaders";
import { Zone } from "./zone";
import { Town } from "../types";
import { FireEngine } from "./engine/fire-engine";
import { getGridIndexForLocation, forEachPointBetween, dist } from "./utils/grid-utils";

interface ICoords {
  x: number;
  y: number;
}

// This class is responsible for data loading, adding sparks and fire lines and so on. It's more focused
// on management and interactions handling. Core calculations are delegated to FireEngine.
// Also, all the observable properties should be here, so the view code can observe them.
export class SimulationModel {
  public config: ISimulationConfig;
  public prevTickTime: number | null;
  public dataReadyPromise: Promise<void>;
  public engine: FireEngine | null = null;
  // Cells are not directly observable. Changes are broadcasted using cellsStateFlag and cellsElevationFlag.
  public cells: Cell[] = [];
  @observable public time = 0;
  @observable public dataReady = false;
  @observable public wind: IWindProps;
  @observable public sparks: Vector2[] = [];
  @observable public fireLineMarkers: Vector2[] = [];
  @observable public townMarkers: Town[] = [];
  @observable public zones: Zone[] = [];
  @observable public simulationStarted = false;
  @observable public simulationRunning = false;
  @observable public lastFireLineTimestamp = -Infinity;
  @observable public totalCellCountByZone: {[key: number]: number} = {};
  @observable public burnedCellsInZone: {[key: number]: number} = {};
  // These flags can be used by view to trigger appropriate rendering. Theoretically, view could/should check
  // every single cell and re-render when it detects some changes. In practice, we perform these updates in very
  // specific moments and usually for all the cells, so this approach can be way more efficient.
  @observable public cellsStateFlag = 0;
  @observable public cellsElevationFlag = 0;

  constructor(presetConfig: Partial<ISimulationConfig>) {
    this.load(presetConfig);
  }

  @computed public get ready() {
    return this.dataReady && this.sparks.length > 0;
  }

  @computed public get gridWidth() {
    return this.config.gridWidth;
  }

  @computed public get gridHeight() {
    return this.config.gridHeight;
  }

  @computed public get simulationAreaAcres() {
    // dimensions in feet, convert sqft to acres
    return this.config.modelWidth * this.config.modelHeight / 43560;
  }

  @computed public get timeInHours() {
    return Math.floor(this.time / 60);
  }

  @computed public get canAddSpark() {
    // There's an assumption that number of sparks should be smaller than number of zones.
    return this.sparks.length < this.config.zonesCount;
  }

  @computed public get canAddFireLineMarker() {
    // Only one fire line can be added at given time.
    return this.fireLineMarkers.length < 2 && this.time - this.lastFireLineTimestamp > this.config.fireLineDelay;
  }

  public getZoneBurnPercentage(zoneIdx: number) {
    const burnedCells = this.engine?.burnedCellsInZone[zoneIdx] || 0;
    return burnedCells / this.totalCellCountByZone[zoneIdx];
  }

  public cellAt(x: number, y: number) {
    const gridX = Math.floor(x / this.config.cellSize);
    const gridY = Math.floor(y / this.config.cellSize);
    return this.cells[getGridIndexForLocation(gridX, gridY, this.config.gridWidth)];
  }

  @action.bound public setInputParamsFromConfig() {
    const config = this.config;
    this.zones = config.zones.map(options => new Zone(options!));
    this.zones.length = config.zonesCount;
    this.wind = {
      speed: config.windSpeed,
      direction: config.windDirection
    };
    this.sparks.length = 0;
    config.sparks.forEach(s => {
      this.addSpark(s[0], s[1]);
    });
  }

  @action.bound public load(presetConfig: Partial<ISimulationConfig>) {
    this.restart();
    // Configuration are joined together. Default values can be replaced by preset, and preset values can be replaced
    // by URL parameters.
    this.config = Object.assign(getDefaultConfig(), presetConfig, getUrlConfig());
    this.setInputParamsFromConfig();
    this.populateCellsData();
  }

  @action.bound public populateCellsData() {
    this.dataReady = false;
    const config = this.config;
    const zones = this.zones;
    this.totalCellCountByZone = {};
    this.dataReadyPromise = Promise.all([
      getZoneIndex(config), getElevationData(config, zones), getRiverData(config), getUnburntIslandsData(config, zones)
    ]).then(values => {
      const zoneIndex = values[0];
      const elevation = values[1];
      const river = values[2];
      const unburntIsland = values[3];

      this.cells.length = 0;

      for (let y = 0; y < this.gridHeight; y++) {
        for (let x = 0; x < this.gridWidth; x++) {
          const index = getGridIndexForLocation(x, y, this.gridWidth);
          const zi = zoneIndex ? zoneIndex[index] : 0;
          const isRiver = river && river[index] > 0;
          // When fillTerrainEdge is set to true, edges are set to elevation 0.
          const isEdge = config.fillTerrainEdges &&
            (x === 0 || x === this.gridWidth - 1 || y === 0 || y === this.gridHeight);
          // Also, edges and their neighboring cells need to be marked as nonburnable to avoid fire spreading over
          // the terrain edge. Note that in this case two cells need to be marked as nonburnable due to way how
          // rendering code is calculating colors for mesh faces.
          const isNonBurnable = config.fillTerrainEdges &&
            x <= 1 || x >= this.gridWidth - 2 || y <= 1 || y >= this.gridHeight - 2;
          const cellOptions: CellOptions = {
            x, y,
            zone: zones[zi],
            zoneIdx: zi,
            isRiver,
            isUnburntIsland: unburntIsland && unburntIsland[index] > 0 || isNonBurnable,
            baseElevation: isEdge ? 0 : elevation && elevation[index]
          };
          if (!this.totalCellCountByZone[zi]) {
            this.totalCellCountByZone[zi] = 1;
          } else {
            this.totalCellCountByZone[zi]++;
          }
          this.cells.push(new Cell(cellOptions));
        }
      }
      this.updateCellsElevationFlag();
      this.updateCellsStateFlag();
      this.updateTownMarkers();
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
    if (!this.engine) {
      this.engine = new FireEngine(this.cells, this.wind, this.sparks, this.config);
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
    this.cells.forEach(cell => cell.reset());
    this.fireLineMarkers.length = 0;
    this.lastFireLineTimestamp = -Infinity;
    this.updateCellsStateFlag();
    this.updateCellsElevationFlag();
    this.time = 0;
    this.engine = null;
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
    let timeStep;
    if (realTimeDiffInMinutes) {
      // One day in model time (86400 seconds) should last X seconds in real time.
      const ratio = 86400 / this.config.modelDayInSeconds;
      // Optimal time step assumes we have stable 60 FPS:
      // realTime = 1000ms / 60 = 16.666ms
      // timeStepInMs = ratio * realTime
      // timeStepInMinutes = timeStepInMs / 1000 / 60
      // Below, these calculations are just simplified (1000 / 60 / 1000 / 60 = 0.000277):
      const optimalTimeStep = ratio * 0.000277;
      // Final time step should be limited by:
      // - maxTimeStep that model can handle
      // - reasonable multiplication of the "optimal time step" so user doesn't see significant jumps in the simulation
      //   when one tick takes much longer time (e.g. when cell properties are recalculated after adding fire line)
      timeStep = Math.min(this.config.maxTimeStep, optimalTimeStep * 4, ratio * realTimeDiffInMinutes);
    } else {
      // We don't know performance yet, so simply increase time by some safe value and wait for the next tick.
      timeStep = 1;
    }

    if (this.engine) {
      this.time += timeStep;
      this.engine.updateFire(this.time);
      if (this.engine.fireDidStop) {
        this.simulationRunning = false;
      }
    }

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

  @action.bound public addSpark(x: number, y: number) {
    if (this.canAddSpark) {
      this.sparks.push(new Vector2(x, y));
    }
  }

  // Coords are in model units (feet).
  @action.bound public setSpark(idx: number, x: number, y: number) {
    this.sparks[idx] = new Vector2(x, y);
  }

  @action.bound public addFireLineMarker(x: number, y: number) {
    if (this.canAddFireLineMarker) {
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
    const startGridX = Math.floor(start.x / this.config.cellSize);
    const startGridY = Math.floor(start.y / this.config.cellSize);
    const endGridX = Math.floor(end.x / this.config.cellSize);
    const endGridY = Math.floor(end.y / this.config.cellSize);
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
  }

  @action.bound public buildFireLine(start: ICoords, end: ICoords) {
    const startGridX = Math.floor(start.x / this.config.cellSize);
    const startGridY = Math.floor(start.y / this.config.cellSize);
    const endGridX = Math.floor(end.x / this.config.cellSize);
    const endGridY = Math.floor(end.y / this.config.cellSize);
    forEachPointBetween(startGridX, startGridY, endGridX, endGridY, (x: number, y: number) => {
      const cell = this.cells[getGridIndexForLocation(x, y, this.gridWidth)];
      cell.isFireLine = true;
      cell.ignitionTime = Infinity;
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
}
