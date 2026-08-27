import { buildNearEdgeMask, NearEdgeGrid } from "./near-edge-mask";
import { SimulationModel } from "../../models/simulation";

// A 5x5 grid: modelWidth / gridWidth gives a 20,000 ft cell, and gridHeight is
// derived as modelHeight / cellSize. Assembled exactly as useNearEdgeMask does,
// so the test runs against the simulation's real isTerrainEdge and its
// deliberate off-by-one rather than against a reimplementation of it.
const createGrid = (fillTerrainEdges: boolean): NearEdgeGrid => {
  const simulation = new SimulationModel({
    modelWidth: 100000,
    modelHeight: 100000,
    gridWidth: 5,
    fillTerrainEdges,
    sparks: [[50000, 50000]],
    zoneIndex: [[0]],
    elevation: [[0]],
    unburntIslands: [[1]],
    unburntIslandProbability: 1,
    riverData: null
  });
  return {
    gridWidth: simulation.gridWidth,
    gridHeight: simulation.gridHeight,
    fillTerrainEdges: simulation.config.fillTerrainEdges,
    isTerrainEdge: (x, y) => simulation.isTerrainEdge(x, y)
  };
};

const maskedCells = (mask: Uint8Array) => mask.reduce((sum: number, v) => sum + v, 0);

describe("buildNearEdgeMask", () => {
  it("masks the skirt perimeter and the ring of cells inward of it", () => {
    const mask = buildNearEdgeMask(createGrid(true));
    const at = (x: number, y: number) => mask[y * 5 + x];

    // isTerrainEdge is true for x === 0, x === gridWidth - 1 and y === 0, so on a
    // 5x5 grid only the x === 2 column is far enough from a left/right edge to
    // escape, and only y >= 2 is far enough from the top one.
    expect(maskedCells(mask)).toEqual(22);
    expect(at(0, 2)).toEqual(1); // perimeter itself
    expect(at(1, 2)).toEqual(1); // inward of the perimeter: the skirt face's top half
    expect(at(2, 0)).toEqual(1);
    expect(at(2, 1)).toEqual(1);
    expect(at(2, 2)).toEqual(0); // interior
  });

  it("leaves the gridHeight - 1 row unmasked, since it carries no skirt", () => {
    // isTerrainEdge answers true for y === gridHeight, a coordinate no cell has,
    // so an unbounded downward probe would report this whole row as near-edge,
    // stripping glyphs and river color from flat interior ground. populateCellsData
    // uses the same predicate, so this row genuinely has no skirt to hide.
    const mask = buildNearEdgeMask(createGrid(true));
    expect(mask[4 * 5 + 2]).toEqual(0);
    // The corresponding cell against the TOP edge, which does carry a skirt, is
    // masked, so this is the off-by-one and not the probe failing altogether.
    expect(mask[0 * 5 + 2]).toEqual(1);
  });

  it("masks nothing when fillTerrainEdges is off, since then there is no skirt", () => {
    expect(maskedCells(buildNearEdgeMask(createGrid(false)))).toEqual(0);
  });
});
