import { action, computed, observable, makeObservable } from "mobx";
import { IWindProps, Town } from "../types";
import { Cell, CellOptions, FireState } from "./cell";
import { ChartStore } from "./chart-store";
import { ISimulationConfig, getResolvedConfig } from "../config";
import { Vector2 } from "three";
import { getElevationData, getRiverData, getUnburntIslandsData, getZoneIndex } from "./utils/data-loaders";
import { Zone } from "./zone";
import { FireEngine } from "./engine/fire-engine";
import { getGridIndexForLocation, forEachPointBetween, dist } from "./utils/grid-utils";

interface ICoords {
  x: number;
  y: number;
}

// When config.changeWindOnDay is defined, but config.newWindSpeed is not, the model will use random value limited
// by this constant.
const NEW_WIND_MAX_SPEED = 20; // mph

const DEFAULT_ZONE_DIVISION = {
  2: [
    [0, 1]
  ],
  3: [
    [0, 1, 2],
  ]
};

// This class is responsible for data loading, adding sparks and fire lines and so on. It's more focused
// on management and interactions handling. Core calculations are delegated to FireEngine.
// Also, all the observable properties should be here, so the view code can observe them.
export class SimulationModel {
  public config: ISimulationConfig;
  public prevTickTime: number | null;
  public dataReadyPromise: Promise<void>;
  public engine: FireEngine | null = null;
  public zoneIndex: number[][] | string = [];
  // Cells are not directly observable. Changes are broadcasted using cellsStateFlag and cellsElevationFlag.
  public cells: Cell[] = [];

  public userDefinedWind: IWindProps | undefined = undefined;
  // This property is also used by the UI to highlight wind info box.
  @observable public windDidChange = false;

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
  @observable public lastHelitackTimestamp = -Infinity;
  @observable public totalCellCountByZone: {[key: number]: number} = {};
  @observable public burnedCellsInZone: {[key: number]: number} = {};
  // These flags can be used by view to trigger appropriate rendering. Theoretically, view could/should check
  // every single cell and re-render when it detects some changes. In practice, we perform these updates in very
  // specific moments and usually for all the cells, so this approach can be way more efficient.
  @observable public cellsStateFlag = 0;
  @observable public cellsElevationFlag = 0;
  @observable public simulationEndedLogged = false;
  @observable public setupChanged = false;

  constructor(presetConfig?: Partial<ISimulationConfig>) {
    makeObservable(this);
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

  @computed public get timeInDays() {
    return this.time / 1440;
  }

  @computed public get canAddSpark() {
    return this.remainingSparks > 0;
  }

  @computed public get zonesCount(): 2 | 3 {
    return this.zones.length as 2 | 3;
  }

  @computed public get remainingSparks() {
    // There's an assumption that number of sparks should be smaller than number of zones.
    return this.zonesCount - this.sparks.length;
  }

  @computed public get canAddFireLineMarker() {
    // Only one fire line can be added at given time.
    if (!this.config.fireLineAvailable) {
      return false;
    }
    else {
      return this.fireLineMarkers.length < 2 && this.time - this.lastFireLineTimestamp > this.config.fireLineDelay;
    }
  }

  @computed public get canUseHelitack() {
    if (!this.config.helitackAvailable) {
      return false;
    }
    else {
      // Helitack has waiting period before it can be used subsequent times
      return this.time - this.lastHelitackTimestamp > this.config.helitackDelay;
    }
  }

  // True when simulationStarted && !simulationRunning && engine.fireDidStop.
  // Reactivity contract: simulationRunning carries the edge — engine?.fireDidStop
  // is a discriminator read only. The supported tick() path sets
  // simulationRunning = false when engine.fireDidStop becomes true, so the
  // computed re-evaluates when expected. Future refactorers: do not rely on
  // fireDidStop driving reactivity directly.
  @computed public get simulationEnded() {
    return this.simulationStarted && !this.simulationRunning && !!this.engine?.fireDidStop;
  }

  @computed public get setupEnabled() {
    return !this.simulationStarted;
  }

  @computed public get startEnabled() {
    return this.ready && !this.simulationEnded;
  }

  @computed public get reloadEnabled() {
    return this.setupChanged || this.sparks.length > 0;
  }

  @computed public get restartEnabled() {
    return this.simulationStarted;
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

  // Reproduces EXACTLY the cells fillTerrainEdges zeros to baseElevation: 0 in
  // populateCellsData — bug-for-bug, not true geometric edges. The `y ===
  // this.gridHeight` clause is a preserved off-by-one: the loop runs `y < gridHeight`,
  // so it is never true and the bottom grid row is intentionally NOT zeroed (and
  // therefore NOT excluded from the elevation range). Do NOT "fix" it to
  // `gridHeight - 1` — that would start zeroing the bottom row and silently shift the
  // SimulationStarted payload elevation range (see WM-15 OQ-B; range verified
  // byte-identical with and without the off-by-one on mountainTwoZoneFixedTerrain).
  // Extracted so the payload can exclude precisely these cells when computing the
  // range — a value-based or flag-based filter cannot distinguish them from real
  // 0-ft cells or real unburnt islands (requirements.md R3).
  public isTerrainEdge(x: number, y: number) {
    return !!this.config.fillTerrainEdges &&
      (x === 0 || x === this.gridWidth - 1 || y === 0 || y === this.gridHeight);
  }

  // Multi-scale Topographic Position Index (TPI) for a spark, used by the Hazbot
  // SparksAtTopAndBottom predicate to LOCALIZE whether a spark sits in a valley or
  // on a ridge/peak rather than relying on a single global elevation range. For
  // each concentric band of cells around the spark, TPI = sparkElevation -
  // meanBandElevation: negative => the spark is below its neighborhood (valley) at
  // that scale, positive => above it (ridge/peak) at that scale. The bands are
  // config.tpiBands (outer radii in cells, ascending); the returned array has one
  // entry per band, in band order, with `null` for any band that captured no
  // usable cell (off-grid / all-edge near the map border).
  //
  // The neighborhood is scanned ONCE up to the largest band radius and each cell is
  // bucketed into the first band whose outer radius covers its distance — no
  // separate pass per band. `x`/`y` are in model feet (same basis as addSpark);
  // the elevation basis is the immutable cell.baseElevation (NOT the
  // FIRE_LINE_DEPTH-adjusted cell.elevation getter), and fillTerrainEdges
  // perimeter cells are excluded via
  // the same isTerrainEdge predicate so artificial 0-ft edges never skew a band
  // average. Returns undefined (fail closed) when the grid is empty, tpiBands is
  // unset, or the spark itself is off-grid / on an edge / non-finite.
  public tpiForSpark(x: number, y: number): Array<number | null> | undefined {
    return this.tpiBandsForSpark(x, y)?.tpi;
  }

  // The single-pass scan behind tpiForSpark, additionally returning the grid
  // indices of the cells that fell in each band (cellsByBand[i] for band i). The
  // predicate path (tpiForSpark / buildStartReadingData) ignores cellsByBand; the
  // tpiDebug terrain overlay uses it to tint each band by its TPI. Sharing one
  // scan keeps the band membership the overlay draws in lockstep with the band
  // averages the predicate sees. See tpiForSpark's contract for the fail-closed
  // cases and the elevation/edge basis.
  public tpiBandsForSpark(x: number, y: number):
    { tpi: Array<number | null>; cellsByBand: number[][] } | undefined {
    const bands = this.config.tpiBands;
    if (this.cells.length === 0 || !bands || bands.length === 0) return undefined;
    const center = this.cellAt(x, y);
    if (!center || this.isTerrainEdge(center.x, center.y)) return undefined;
    const centerElevation = center.baseElevation;
    if (!Number.isFinite(centerElevation)) return undefined;

    // Compare squared distances against squared band radii to avoid a per-cell sqrt.
    const bandsSq = bands.map((r) => r * r);
    const maxR = bands[bands.length - 1];
    const maxRSq = bandsSq[bandsSq.length - 1];
    const sums = bands.map(() => 0);
    const counts = bands.map(() => 0);
    const cellsByBand: number[][] = bands.map(() => []);

    // Bound the scan to the grid. tpiBands is URL/preset-tunable, so an oversized
    // (or non-finite) outer radius would otherwise spin a (2·maxR+1)^2 loop whose
    // every extra iteration only skips an off-grid cell — at maxR = Infinity it
    // never terminates. Clamping the per-axis reach to the grid extent leaves the
    // result identical (off-grid cells are skipped below either way) while keeping
    // worst-case work bounded by the grid size. A non-finite maxR collapses to NaN
    // here, so the loop body never runs and the spark fails closed (all-null TPI).
    const scanR = Math.min(maxR, Math.max(this.gridWidth, this.gridHeight));

    // Single pass over the square neighborhood; the squared-distance test carves the
    // disk out of the square and assigns each cell to its band.
    for (let dy = -scanR; dy <= scanR; dy++) {
      const ny = center.y + dy;
      if (ny < 0 || ny >= this.gridHeight) continue;
      for (let dx = -scanR; dx <= scanR; dx++) {
        if (dx === 0 && dy === 0) continue; // the center is the reference, not a neighbor
        const nx = center.x + dx;
        if (nx < 0 || nx >= this.gridWidth) continue;
        const dSq = dx * dx + dy * dy;
        if (dSq > maxRSq) continue;
        // First band whose outer radius covers this distance (bands are ascending).
        let band = 0;
        while (dSq > bandsSq[band]) band++;
        const index = getGridIndexForLocation(nx, ny, this.gridWidth);
        const cell = this.cells[index];
        if (!cell || this.isTerrainEdge(cell.x, cell.y)) continue;
        const e = cell.baseElevation;
        if (!Number.isFinite(e)) continue;
        sums[band] += e;
        counts[band] += 1;
        cellsByBand[band].push(index);
      }
    }
    const tpi = bands.map((_, i) => (counts[i] > 0 ? centerElevation - sums[i] / counts[i] : null));
    return { tpi, cellsByBand };
  }

  // Topography-dependent SimulationStarted payload data, extracted from
  // bottom-bar.handleStart so it is unit-testable in isolation (WM-15 R9).
  // Each spark carries its localized multi-scale TPI (tpiForSpark), the basis the
  // Hazbot SparksAtTopAndBottom predicate uses; it is undefined for a spark on an
  // excluded fillTerrainEdges perimeter cell (addSpark does not reject edge cells)
  // so such a spark fails the predicate's closed guard. Fire-line markers keep the
  // dynamic cell.elevation (unchanged from the original); the predicate never reads
  // markers.
  public buildStartReadingData(): {
    sparks: Array<{ x: number; y: number; zoneIdx?: number; tpi?: Array<number | null> }>;
    fireLineMarkers: Array<{ x: number; y: number; elevation?: number }>;
  } {
    const { config } = this;
    const cellFor = (x: number, y: number) => this.cells.length > 0 ? this.cellAt(x, y) : null;
    const sparks = this.sparks.map((s) => {
      const cell = cellFor(s.x, s.y);
      const onEdge = cell ? this.isTerrainEdge(cell.x, cell.y) : false;
      return {
        x: s.x / config.modelWidth,
        y: s.y / config.modelHeight,
        zoneIdx: cell?.zoneIdx,
        // Localized multi-scale TPI for this spark; undefined on an excluded edge
        // cell so the predicate fails closed.
        tpi: onEdge ? undefined : this.tpiForSpark(s.x, s.y)
      };
    });
    const fireLineMarkers = this.fireLineMarkers.map((fl) => {
      const cell = cellFor(fl.x, fl.y);
      return { x: fl.x / config.modelWidth, y: fl.y / config.modelHeight, elevation: cell?.elevation };
    });
    return { sparks, fireLineMarkers };
  }

  @action.bound public setInputParamsFromConfig() {
    const config = this.config;
    this.zones = config.zones.map(options => new Zone(options));
    if (config.zonesCount) {
      this.zones.length = config.zonesCount;
    }
    this.zoneIndex = config.zoneIndex || DEFAULT_ZONE_DIVISION[this.zones.length as (2 | 3)];

    this.wind = {
      speed: config.windSpeed,
      direction: config.windDirection
    };
    this.sparks.length = 0;
    config.sparks.forEach(s => {
      this.addSpark(s[0], s[1]);
    });
  }

  @action.bound public load(presetConfig?: Partial<ISimulationConfig>) {
    this.restart();
    // Default values, overlaid with the preset, overlaid with URL params — see
    // getResolvedConfig(). `presetConfig` is retained only so tests can inject a
    // config; when omitted the helper resolves the preset from the URL.
    this.config = getResolvedConfig(presetConfig);
    this.setInputParamsFromConfig();
    this.populateCellsData();
  }

  @action.bound public populateCellsData() {
    this.dataReady = false;
    const config = this.config;
    const zones = this.zones;
    this.totalCellCountByZone = {};
    this.dataReadyPromise = Promise.all([
      getZoneIndex(config, this.zoneIndex), getElevationData(config, zones), getRiverData(config), getUnburntIslandsData(config, zones)
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
          // When fillTerrainEdges is set to true, edges are set to elevation 0.
          const isEdge = this.isTerrainEdge(x, y);
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
            baseElevation: isEdge ? 0 : elevation?.[index]
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
    this.simulationEndedLogged = false;
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
    this.lastHelitackTimestamp = -Infinity;
    this.updateCellsStateFlag();
    this.updateCellsElevationFlag();
    this.time = 0;
    this.engine = null;
    this.windDidChange = false;
    if (this.userDefinedWind) {
      this.wind.speed = this.userDefinedWind.speed;
      this.wind.direction = this.userDefinedWind.direction;
      // Clear the saved wind settings. Otherwise, the following scenario might fail:
      // - simulation is started, userDefinedWind is saved when the wind settings are updated during the simulation
      // - user restarts simulation, userDefinedWind props are restored (as expected)
      // - user manually updates wind properties to new values
      // - simulation started and then restarted again BEFORE the new wind settings are applied
      // If userDefinedWind value isn't cleared, the user would see wrong wind setting after the second model restart.
      // This use case is coved by one of the tests in the simulation.test.ts
      this.userDefinedWind = undefined;
    }
  }

  @action.bound public reload() {
    this.restart();
    this.setupChanged = false;
    // Reset user-controlled properties too.
    this.setInputParamsFromConfig();
    this.populateCellsData();
  }

  // Symmetric setter with three call sites: applyAndClose (terrain-panel.tsx)
  // passes true to record a user customization; reload() writes the field
  // directly as part of a larger reset that also clears sparks/engine/cells,
  // bypassing the setter; the case (h) snapshot-refresh test passes false to
  // reset the flag mid-test without going through reload() (which would wipe
  // simulation.zones and defeat the canary).
  @action.bound public setSetupChanged(value: boolean) {
    this.setupChanged = value;
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

    this.tick(timeStep);
  }

  @action.bound public tick(timeStep: number) {
    if (this.engine) {
      this.time += timeStep;
      this.engine.updateFire(this.time);
      if (this.engine.fireDidStop) {
        this.simulationRunning = false;
      }
    }

    this.updateCellsStateFlag();

    this.changeWindIfNecessary();
  }

  @action.bound public changeWindIfNecessary() {
    if (this.config.changeWindOnDay !== undefined && this.timeInDays >= this.config.changeWindOnDay && this.windDidChange === false) {
      const newDirection = this.config.newWindDirection !== undefined ? this.config.newWindDirection : Math.random() * 360;
      const newSpeed = (this.config.newWindSpeed !== undefined ? this.config.newWindSpeed : Math.random() * NEW_WIND_MAX_SPEED) * this.config.windScaleFactor;
      // Save user defined values that will be restored when model is reset or reloaded.
      this.userDefinedWind = {
        speed: this.wind.speed,
        direction: this.wind.direction
      };
      // Update UI.
      this.wind.direction = newDirection;
      this.wind.speed = newSpeed;
      // Update engine.
      if (this.engine) {
        this.engine.wind.direction = newDirection;
        this.engine.wind.speed = newSpeed;
      }
      // Mark that the change just happened.
      this.windDidChange = true;
    }
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

  public getOutcomeData(chartStore: ChartStore) {
    const durationMinutes = Math.round(this.time * 10000) / 10000;
    const durationHours = Math.round((this.time / 60) * 10000) / 10000;

    const zoneOutcomes = this.zones.map((zone, zoneIdx) => {
      const rawPercentage = this.totalCellCountByZone[zoneIdx] ? this.getZoneBurnPercentage(zoneIdx) : 0;
      const burnPercentage = Math.round(rawPercentage * 1000000) / 10000;
      const burnedCellCount = this.engine?.burnedCellsInZone[zoneIdx] || 0;
      const cellAreaAcres = (this.config.cellSize * this.config.cellSize) / 43560;
      const burnedAcres = Math.round(burnedCellCount * cellAreaAcres * 10000) / 10000;

      // Compute piecewise burn rates from raw (unrounded) burn data (thousands of acres/hour)
      const rawData = chartStore.rawBurnData[zoneIdx];
      const burnRates: number[] = [];
      let maxBurnRate = 0;
      let timeOfMaxBurnRate = 0;

      if (rawData && rawData.length >= 2) {
        for (let i = 1; i < rawData.length; i++) {
          const dt = rawData[i].time - rawData[i - 1].time;
          if (dt > 0) {
            const burnRate = Math.round(((rawData[i].acres - rawData[i - 1].acres) / dt) * 10000) / 10000;
            burnRates.push(burnRate);
            if (burnRate > maxBurnRate) {
              maxBurnRate = burnRate;
              timeOfMaxBurnRate = rawData[i].time;
            }
          }
        }
      }

      return {
        zoneIndex: zoneIdx,
        burnPercentage,
        burnedAcres,
        burnRates,
        maxBurnRate,
        timeOfMaxBurnRate
      };
    });

    const townOutcomes = this.config.towns.map(town => {
      const x = town.x * this.config.modelWidth;
      const y = town.y * this.config.modelHeight;
      const cell = this.cells.length > 0 ? this.cellAt(x, y) : null;
      return {
        name: town.name,
        burned: cell ? (cell.fireState === FireState.Burnt || cell.fireState === FireState.Burning) : false
      };
    });

    return {
      durationMinutes,
      durationHours,
      zones: zoneOutcomes,
      towns: townOutcomes
    };
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

  @action.bound public setHelitackPoint(px: number, py: number) {
    const startGridX = Math.floor(px / this.config.cellSize);
    const startGridY = Math.floor(py / this.config.cellSize);
    const cell = this.cells[getGridIndexForLocation(startGridX, startGridY, this.gridWidth)];
    const radius = Math.round(this.config.helitackDropRadius / this.config.cellSize);
    for (let x = cell.x - radius; x < cell.x + radius; x++) {
      for (let y = cell.y - radius ; y <= cell.y + radius; y++) {
        if ((x - cell.x) * (x - cell.x) + (y - cell.y) * (y - cell.y) <= radius * radius) {
          const nextCellX = cell.x - (x - cell.x);
          const nextCellY = cell.y - (y - cell.y);
          if (nextCellX < this.gridWidth && nextCellY < this.gridHeight) {
            const targetCell = this.cells[getGridIndexForLocation(nextCellX, nextCellY, this.gridWidth)];
            targetCell.helitackDropCount++;
            targetCell.ignitionTime = Infinity;
            if (targetCell.fireState === FireState.Burning) targetCell.fireState = FireState.Unburnt;
          }
        }
      }
    }
    this.lastHelitackTimestamp = this.time;
  }

  @action.bound public setWindDirection(direction: number) {
    this.wind.direction = direction;
  }

  @action.bound public setWindSpeed(speed: number) {
    this.wind.speed = speed;
  }

  @action.bound public updateZones(zones: Zone[]) {
    this.zones = zones.map(z => z.clone());
    this.zoneIndex = DEFAULT_ZONE_DIVISION[this.zones.length as (2 | 3)];
    if (this.sparks.length > this.zones.length) {
      this.sparks.length = this.zones.length;
    }
    this.populateCellsData();
  }
}
