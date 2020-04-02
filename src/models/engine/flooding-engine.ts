import { Vector2 } from "three";
import { Cell } from "../cell";
import { IWindProps } from "../../types";
import { getGridIndexForLocation, directNeighbours } from "../utils/grid-utils";

export interface IFireEngineConfig {
  gridWidth: number;
  gridHeight: number;
  cellSize: number;
  minCellBurnTime: number;
  neighborsDist: number;
}

// Lightweight helper that is responsible only for math calculations. It's not bound to MobX or any UI state
// (it's role of the Simulation model). Config properties are explicitly listed, so it's clear
// which config options are responsible for simulation progress.
export class FloodingEngine {
  public cells: Cell[];
  public wind: IWindProps;
  public gridWidth: number;
  public gridHeight: number;
  public cellSize: number;
  public burnedCellsInZone: {[key: number]: number} = {};
  public waterEdge: Set<Cell>;
  public simulationDidStop = false;

  constructor(cells: Cell[], wind: IWindProps, sparks: Vector2[], config: IFireEngineConfig) {
    this.cells = cells;
    this.wind = wind;
    this.gridWidth = config.gridWidth;
    this.gridHeight = config.gridHeight;
    this.cellSize = config.cellSize;
    this.waterEdge = new Set<Cell>();

    this.cells.forEach(c => {
      if (c.isRiver && !c.isEdge) {
        this.waterEdge.add(c);
        c.isWaterEdge = true;
      }
    });
  }

  public update(waterLevel: number) {
    const newWaterEdge = new Set<Cell>();
    const processed: boolean[] = [];
    this.waterEdge.forEach(cell => {
      const x = cell.x;
      const y = cell.y;
      if (cell.elevation <= waterLevel) {
        let anyNonWaterNeighbors = false;
        directNeighbours.forEach(diff => {
          const nIdx = getGridIndexForLocation(x + diff.x, y + diff.y, this.gridWidth);
          const nCell = this.cells[nIdx];
          if (!processed[nIdx]) {
            processed[nIdx] = true;
            if (!nCell.isEdge && !nCell.isWater && nCell.elevation <= waterLevel) {
              nCell.isFlooded = true;
              nCell.isWaterEdge = true;
              newWaterEdge.add(nCell);
            } else if (!nCell.isWater) {
              anyNonWaterNeighbors = true;
            }
          }
        });
        if (anyNonWaterNeighbors) {
          newWaterEdge.add(cell);
        } else {
          cell.isWaterEdge = false;
        }
      } else if (cell.elevation > waterLevel) {
        cell.isFlooded = false;
        cell.isWaterEdge = false;
        directNeighbours.forEach(diff => {
          const nIdx = getGridIndexForLocation(x + diff.x, y + diff.y, this.gridWidth);
          const nCell = this.cells[nIdx];
          if (!processed[nIdx] && !nCell.isEdge) {
            processed[nIdx] = true;
            if (nCell.isWater) {
              nCell.isWaterEdge = true;
              newWaterEdge.add(nCell);
            }
          }
        });
      }
    });
    this.waterEdge = newWaterEdge;
  }
}
