// The grid facts the mask is derived from. Narrower than SimulationModel so the
// mask is testable without one, and so the hook that calls this reads every value
// the memo depends on at the call site rather than hiding them behind the model.
export interface NearEdgeGrid {
  gridWidth: number;
  gridHeight: number;
  fillTerrainEdges: boolean;
  isTerrainEdge(x: number, y: number): boolean;
}

/**
 * Marks the perimeter cells whose geometry forms the edge skirt, and their
 * immediate neighbors, as one byte per cell (1 = near an edge). The skirt FACE
 * spans from a perimeter cell to the cell inward of it, so masking only the
 * perimeter would leave the upper half of that face textured.
 *
 * Delegating to the simulation's own isTerrainEdge rather than re-deriving the
 * condition keeps its deliberate off-by-one (the row at gridHeight - 1 is NOT
 * zeroed, so there is no skirt there) automatically correct.
 *
 * Built once per grid because the predicate is expensive: five isTerrainEdge
 * calls per cell cost 16.5ms across 38,400 cells, almost all of it MobX
 * re-evaluating the two unobserved @computed dimensions each call reads.
 */
export const buildNearEdgeMask = (
  { gridWidth, gridHeight, fillTerrainEdges, isTerrainEdge }: NearEdgeGrid
): Uint8Array => {
  const mask = new Uint8Array(gridWidth * gridHeight);
  // fillTerrainEdges gates isTerrainEdge entirely, so with it off no cell is an
  // edge and the all-zero mask is already the answer.
  if (!fillTerrainEdges) return mask;
  // Bounded to real cells. isTerrainEdge answers true for y === gridHeight, a
  // coordinate no cell has, so an unbounded neighbor probe reports the whole
  // gridHeight - 1 row as near-edge. That row carries no skirt, so masking it
  // strips its glyphs and suppresses its river color for nothing.
  const edge = (x: number, y: number) =>
    x >= 0 && x < gridWidth && y >= 0 && y < gridHeight && isTerrainEdge(x, y);
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      mask[y * gridWidth + x] = (edge(x, y) || edge(x - 1, y) || edge(x + 1, y) ||
        edge(x, y - 1) || edge(x, y + 1)) ? 1 : 0;
    }
  }
  return mask;
};
