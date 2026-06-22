// WM-7 — zone-boundary dashed line. Renders a white dashed line along every
// boundary between adjacent cells with differing zoneIdx, draped over the
// terrain. Gated by the `showZoneLines` config flag (default off). Dash sizing
// is a starting point; tune visually with the project owner.
import React, { useLayoutEffect, useMemo, useRef } from "react";
import { observer } from "mobx-react";
import * as THREE from "three";
import { useStores } from "../../use-stores";
import { Cell } from "../../models/cell";
import { getGridIndexForLocation } from "../../models/utils/grid-utils";
import { ftToViewUnit } from "./helpers";

// Small vertical lift (view units) so the line floats just above the terrain surface.
const Z_LIFT = 0.004;

export const ZoneLines = observer(function ZoneLines() {
  const { simulation } = useStores();
  const geomRef = useRef<THREE.BufferGeometry>(null);
  const lineRef = useRef<THREE.LineSegments>(null);

  const positions = useMemo(() => {
    if (!simulation.dataReady || !simulation.config.showZoneLines) return new Float32Array(0);
    const { gridWidth, gridHeight, cells } = simulation;
    const cs = simulation.config.cellSize;
    const ratio = ftToViewUnit(simulation);
    const pts: number[] = [];
    const cellAtGrid = (x: number, y: number) => cells[getGridIndexForLocation(x, y, gridWidth)];
    // fillTerrainEdges zeros the elevation of perimeter cells (left/right columns
    // and top row) to build the terrain's edge wall. Draping the line over those
    // zeros makes it dive to the base at the edges, so use the nearest interior
    // cell's elevation for an edge cell instead.
    const displayElevation = (cell: Cell) => {
      if (!simulation.isTerrainEdge(cell.x, cell.y)) return cell.elevation;
      const ix = cell.x === 0 ? 1 : cell.x === gridWidth - 1 ? gridWidth - 2 : cell.x;
      const iy = cell.y === 0 ? 1 : cell.y;
      return (cellAtGrid(ix, iy) ?? cell).elevation;
    };
    // Average elevation of the two cells an edge divides, in view units, lifted.
    const edgeZ = (a: Cell, b: Cell) => ((displayElevation(a) + displayElevation(b)) / 2) * ratio + Z_LIFT;
    const push = (x1: number, y1: number, z: number, x2: number, y2: number) => {
      pts.push(x1 * cs * ratio, y1 * cs * ratio, z, x2 * cs * ratio, y2 * cs * ratio, z);
    };
    for (let y = 0; y < gridHeight; y++) {
      for (let x = 0; x < gridWidth; x++) {
        const c = cellAtGrid(x, y);
        if (!c) continue;
        // Right neighbor: shared vertical edge at model-x=(x+1)*cs, y..y+1.
        if (x + 1 < gridWidth) {
          const r = cellAtGrid(x + 1, y);
          if (r && r.zoneIdx !== c.zoneIdx) push(x + 1, y, edgeZ(c, r), x + 1, y + 1);
        }
        // Bottom neighbor: shared horizontal edge at model-y=(y+1)*cs, x..x+1.
        if (y + 1 < gridHeight) {
          const d = cellAtGrid(x, y + 1);
          if (d && d.zoneIdx !== c.zoneIdx) push(x, y + 1, edgeZ(c, d), x + 1, y + 1);
        }
      }
    }
    return new Float32Array(pts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulation, simulation.dataReady, simulation.config.showZoneLines,
      simulation.cellsElevationFlag, simulation.gridWidth, simulation.gridHeight]);

  useLayoutEffect(() => {
    if (geomRef.current) {
      geomRef.current.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geomRef.current.attributes.position.needsUpdate = true;
      lineRef.current?.computeLineDistances();
    }
  }, [positions]);

  if (positions.length === 0) return null;

  return (
    /* eslint-disable react/no-unknown-property */
    // renderOrder 0 keeps the line below markers (sparks/towns/fire lines render
    // at renderOrder 1) so they draw on top of it; depthTest:false still keeps it
    // above the terrain surface (drawn in the earlier opaque pass).
    <lineSegments ref={lineRef} renderOrder={0}>
      <bufferGeometry ref={geomRef} />
      <lineDashedMaterial
        attach="material"
        color={0xffffff}
        dashSize={0.012}
        gapSize={0.008}
        linewidth={1}
        depthTest={false}
        transparent={true}
      />
    </lineSegments>
    /* eslint-enable react/no-unknown-property */
  );
});
