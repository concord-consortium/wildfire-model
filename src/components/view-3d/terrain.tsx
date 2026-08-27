import React, { forwardRef, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Cell, FireState } from "../../models/cell";
import { ISimulationConfig } from "../../config";
import * as THREE from "three";
import { BufferAttribute } from "three";
import { SimulationModel } from "../../models/simulation";
import { getGridIndexForLocation } from "../../models/utils/grid-utils";
import { ftToViewUnit, PLANE_WIDTH, planeHeight } from "./helpers";
import { observer } from "mobx-react";
import { useStores } from "../../use-stores";
import { getEventHandlers, InteractionHandler } from "./interaction-handler";
import { usePlaceSparkInteraction } from "./use-place-spark-interaction";
import { useDrawFireLineInteraction } from "./use-draw-fire-line-interaction";
import { useShowCoordsInteraction } from "./use-show-coords-interaction";
import { useHelitackInteraction } from "./use-helitack-interaction";
import { useSimulationClickedInteraction } from "./use-simulation-clicked-interaction";
import {
  BURNING_COLOR, BURNT_COLOR, FIRE_LINE_UNDER_CONSTRUCTION_COLOR, burnIndexColor, getTerrainColor
} from "./terrain-colors";
import { useTerrainTextures } from "./terrain-textures";
import { createTexturedTerrainMaterial } from "./terrain-shader";

// The palette moved to terrain-colors.ts so the textured-terrain shader can share
// it without importing this component. Re-exported here because
// fire-intensity-scale.tsx imports these from this module.
export { BURN_INDEX_LOW, BURN_INDEX_MEDIUM, BURN_INDEX_HIGH } from "./terrain-colors";

const vertexIdx = (cell: Cell, gridWidth: number, gridHeight: number) => (gridHeight - 1 - cell.y) * gridWidth + cell.x;

// tpiDebug overlay: map a band's TPI to a diverging color. Positive (ridge) warms
// toward red, negative (valley) cools toward blue, ~0 (flat) stays white. `n` is
// the band's TPI normalized to [-1, 1] against the most extreme band on screen.
const tpiBandColor = (n: number) => {
  if (n >= 0) return [1, 1 - n, 1 - n];   // white → red
  const m = -n;
  return [1 - m, 1 - m, 1];               // white → blue
};

// "neither" verdict: render the bands in greyscale (darker = stronger |TPI|) so a
// spark whose mean TPI did NOT clear the margin reads as grey, not red/blue —
// communicating the actual top/bottom/neither verdict, not just raw relief.
const tpiNeutralColor = (n: number) => {
  const shade = 1 - 0.6 * Math.abs(n); // white → grey
  return [shade, shade, shade];
};

const tpiMean = (tpi: Array<number | null>): number | null => {
  const v = tpi.filter((t): t is number => t !== null && Number.isFinite(t));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

// Dedupes the per-spark verdict console line so a running sim (which recolors every
// tick) logs only when the placement/verdict actually changes.
let lastTpiDebugLog = "";

// Build a cell-grid-index → overlay-color map for every placed spark's TPI bands.
// Each spark's bands are tinted by the SAME verdict the SparksAtTopAndBottom
// predicate computes (mean TPI vs ± margin): red/blue gradient when it counts as
// top/bottom, greyscale when it's "neither". Band intensity is normalized against
// the largest |TPI| on screen. Also logs each spark's mean TPI + verdict to the
// console (deduped) so "blue-ish rings but neither" is explainable while testing.
const computeTpiDebugColors = (simulation: SimulationModel): Map<number, number[]> => {
  const colors = new Map<number, number[]>();
  const cfg = simulation.config;
  const margin = (cfg.tpiMarginFraction ?? 0) * (cfg.heightmapMaxElevation ?? 0);
  const perSpark = simulation.sparks
    .map((s) => simulation.tpiBandsForSpark(s.x, s.y))
    .filter((r): r is { tpi: Array<number | null>; cellsByBand: number[][] } => !!r);
  let maxAbs = 0;
  perSpark.forEach((r) => r.tpi.forEach((t) => {
    if (t !== null && Number.isFinite(t)) maxAbs = Math.max(maxAbs, Math.abs(t));
  }));
  if (maxAbs === 0) return colors;
  const logParts: string[] = [];
  perSpark.forEach((r) => {
    const mean = tpiMean(r.tpi);
    const verdict = mean === null ? "neither"
      : mean >= margin ? "top" : mean <= -margin ? "bottom" : "neither";
    logParts.push(`mean ${mean === null ? "n/a" : Math.round(mean)} ft → ${verdict} ` +
      `[${r.tpi.map((t) => (t === null ? "-" : Math.round(t))).join(", ")}]`);
    r.cellsByBand.forEach((cells, band) => {
      const t = r.tpi[band];
      if (t === null || !Number.isFinite(t)) return;
      const n = Math.max(-1, Math.min(1, t / maxAbs));
      const color = verdict === "neither" ? tpiNeutralColor(n) : tpiBandColor(n);
      cells.forEach((index) => colors.set(index, color));
    });
  });
  const key = logParts.join(" | ");
  if (key && key !== lastTpiDebugLog) {
    lastTpiDebugLog = key;
    // eslint-disable-next-line no-console
    console.log(`[tpiDebug] margin ±${Math.round(margin)} ft | ${key}`);
  }
  return colors;
};

const setVertexColor = (
  colArray: number[], cell: Cell, gridWidth: number, gridHeight: number, config: ISimulationConfig,
  debugColors?: Map<number, number[]>,
  // When the terrain is textured, fire is composited in the fragment shader
  // instead, so the vertex colors carry only the base terrain color. Vertex
  // colors are interpolated across a whole 500 ft cell before they reach a
  // fragment, which is precisely what makes a vertex-colored burn edge soft.
  baseColorOnly = false,
  // The edge skirt is a near-vertical face spanning from a perimeter cell to the
  // one inward of it, so a river touching the edge interpolates its blue all the
  // way down the side of the model. Suppressing the river color across that
  // two-cell band leaves the whole face reading as ground, which is what a
  // cross-section should look like.
  nearTerrainEdge = false
) => {
  const idx = vertexIdx(cell, gridWidth, gridHeight) * 4;
  const debugColor = debugColors?.get(getGridIndexForLocation(cell.x, cell.y, gridWidth));
  let color;
  if (debugColor) {
    color = debugColor;
  } else if (!baseColorOnly && cell.fireState === FireState.Burning) {
    color = config.showBurnIndex ? burnIndexColor(cell.burnIndex) : BURNING_COLOR;
  } else if (!baseColorOnly && cell.fireState === FireState.Burnt) {
    color = cell.isFireSurvivor ? getTerrainColor(cell.droughtLevel) : BURNT_COLOR;
  } else if (cell.isRiver && !nearTerrainEdge) {
    color = config.riverColor;
  } else if (cell.isFireLineUnderConstruction) {
    color = FIRE_LINE_UNDER_CONSTRUCTION_COLOR;
  } else {
    color = getTerrainColor(cell.droughtLevel);
  }
  // Note that we're using sRGB colorspace here (default while working with web). THREE.js needs to operate in linear
  // color space, so we need to convert it first. See:
  // https://discourse.threejs.org/t/updates-to-color-management-in-three-js-r152/50791
  // https://threejs.org/docs/#manual/en/introduction/Color-management
  const threeJsColor = new THREE.Color();
  threeJsColor.setRGB(color[0], color[1], color[2], THREE.SRGBColorSpace);

  colArray[idx] = threeJsColor.r;
  colArray[idx + 1] = threeJsColor.g;
  colArray[idx + 2] = threeJsColor.b;
  colArray[idx + 3] = 1; // alpha
};

const updateColors = (
  geometry: THREE.PlaneGeometry, simulation: SimulationModel, baseColorOnly = false,
  nearEdgeMask: Uint8Array | null = null
) => {
  const colArray = geometry.attributes.color.array as number[];
  const debugColors = simulation.config.tpiDebug ? computeTpiDebugColors(simulation) : undefined;
  // gridWidth and gridHeight are @computed, and read from an effect rather than a
  // reaction they have no observers, so MobX re-evaluates them on every read.
  // Hoisting keeps two recomputes per cell off the per-tick path. `config` is a
  // plain object, grouped here only to keep the three reads together.
  const { gridWidth, gridHeight, config } = simulation;
  simulation.cells.forEach(cell => {
    setVertexColor(
      colArray, cell, gridWidth, gridHeight, config, debugColors, baseColorOnly,
      // Gated on the textured path so the untextured render stays byte-identical
      // to the unmodified app.
      baseColorOnly && !!nearEdgeMask?.[cell.y * gridWidth + cell.x]
    );
  });
  (geometry.attributes.color as BufferAttribute).needsUpdate = true;
};

// Per-cell data handed to the textured terrain shader. One texel per cell, which
// is 1/4 the bytes of the per-vertex color buffer this sits alongside. The backing
// array is kept next to the texture because three types `image.data` as a
// Uint8ClampedArray, and holding the reference avoids both a cast and a property
// lookup chain on every one of the 38,400 per-tick writes.
interface CellDataTexture {
  texture: THREE.DataTexture;
  data: Uint8Array;
}

const createCellDataTexture = (width: number, height: number): CellDataTexture => {
  const data = new Uint8Array(width * height * 4);
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  // Linear so the shader receives a smooth ramp across the cell — that ramp is
  // what the noise threshold turns into a ragged edge. Nearest would reinstate
  // visible 500 ft blocks.
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  // Data, not color: no transfer function may be applied.
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return { texture, data };
};

// Cell (x, y) lives at data row y. Unlike the vertex buffer — whose rows run top
// down, hence the flip in vertexIdx — DataTexture row 0 is at v = 0, which lines
// up with cell.y = 0 directly.
const cellDataIdx = (cell: Cell, gridWidth: number) => (cell.y * gridWidth + cell.x) * 4;

// True for the perimeter cells whose geometry forms the edge skirt, and for their
// immediate neighbors. The skirt FACE spans from a perimeter cell to the cell
// inward of it, so masking only the perimeter would leave the upper half of that
// face textured. Delegating to simulation.isTerrainEdge rather than re-deriving
// the condition keeps its deliberate off-by-one (the bottom grid row is NOT
// zeroed, so there is no skirt there) automatically correct.
//
// The mask is built once per grid because the predicate is expensive: five
// isTerrainEdge calls per cell cost 16.5ms across 38,400 cells, almost all of it
// MobX re-evaluating the two unobserved @computed dimensions each call reads. Null
// when the textures are off, the only case with no consumer.
const useNearEdgeMask = (simulation: SimulationModel, enabled: boolean) => {
  const { gridWidth, gridHeight } = simulation;
  const { fillTerrainEdges } = simulation.config;
  return useMemo(() => {
    if (!enabled) return null;
    const mask = new Uint8Array(gridWidth * gridHeight);
    // fillTerrainEdges gates isTerrainEdge entirely, so with it off no cell is an
    // edge and the all-zero mask is already the answer. Read here rather than only
    // named as a dependency, so the memo is invalidated on a value it truly uses.
    if (!fillTerrainEdges) return mask;
    const edge = (x: number, y: number) => simulation.isTerrainEdge(x, y);
    for (let y = 0; y < gridHeight; y++) {
      for (let x = 0; x < gridWidth; x++) {
        mask[y * gridWidth + x] = (edge(x, y) || edge(x - 1, y) || edge(x + 1, y) ||
          edge(x, y - 1) || edge(x, y + 1)) ? 1 : 0;
      }
    }
    return mask;
  }, [enabled, simulation, gridWidth, gridHeight, fillTerrainEdges]);
};

// One-hot vegetation weights, one channel per Vegetation enum value, matching the
// channel packing of the vegetation tile texture. Only changes when a zone's
// vegetation or the zone layout changes, so this is not part of the per-tick work.
const updateVegetationWeights = (
  { texture, data }: CellDataTexture, simulation: SimulationModel, nearEdgeMask: Uint8Array
) => {
  data.fill(0);
  const { gridWidth } = simulation;
  simulation.cells.forEach(cell => {
    // Rivers keep all-zero weights. The shader reads a missing weight as "no
    // texture here" and blends to neutral, so the river renders as flat water
    // color instead of having vegetation glyphs drawn across it. The same
    // mechanism is available for any other surface that should not carry
    // glyphs — fire lines, say — by skipping those cells here too.
    if (cell.isRiver) return;
    // The edge skirt is masked by CELL rather than by slope. Its steepness varies
    // with the terrain height there — near-vertical off the mountains, but only
    // about 60 degrees off the low flat plains, which a slope threshold tuned for
    // the former barely touches. Identifying it geometrically instead makes it
    // uniform everywhere. The slope fade still runs, covering genuinely steep
    // interior terrain.
    if (nearEdgeMask[cell.y * gridWidth + cell.x]) return;
    data[cellDataIdx(cell, gridWidth) + cell.vegetation] = 255;
  });
  texture.needsUpdate = true;
};

const updateBurnState = ({ texture, data }: CellDataTexture, simulation: SimulationModel) => {
  const showBurnIndex = simulation.config.showBurnIndex;
  const { gridWidth, time } = simulation;
  simulation.cells.forEach(cell => {
    const idx = cellDataIdx(cell, gridWidth);
    let char = 0;
    let burning = 0;
    if (cell.fireState === FireState.Burnt) {
      char = 255;
    } else if (cell.fireState === FireState.Burning) {
      burning = 255;
      // Char progressively over the cell's own burn duration, so the ground
      // darkens under the flame front rather than snapping to black behind it.
      const progress = (time - cell.ignitionTime) / cell.burnTime;
      char = Math.round(Math.max(0, Math.min(1, progress)) * 255);
    }
    data[idx] = char;
    data[idx + 1] = burning;
    // cell.burnIndex is a getter that recomputes from spread rate, so only pay
    // for it when the burn index is actually being rendered.
    data[idx + 2] = showBurnIndex ? Math.round((cell.burnIndex / 2) * 255) : 0;
    data[idx + 3] = cell.isFireSurvivor ? 255 : 0;
  });
  texture.needsUpdate = true;
};

const setupElevation = (geometry: THREE.PlaneGeometry, simulation: SimulationModel) => {
  const posArray = geometry.attributes.position.array as number[];
  const mult = ftToViewUnit(simulation);
  const { gridWidth, gridHeight } = simulation;
  // Apply height map to vertices of plane.
  simulation.cells.forEach(cell => {
    const zAttrIdx = vertexIdx(cell, gridWidth, gridHeight) * 3 + 2;
    posArray[zAttrIdx] = cell.elevation * mult;
  });
  geometry.computeVertexNormals();
  (geometry.attributes.position as BufferAttribute).needsUpdate = true;
};

export const Terrain = observer(forwardRef<THREE.Mesh>(function WrappedComponent(props, ref) {
  const { simulation, ui } = useStores();
  const height = planeHeight(simulation);
  const geometryRef = useRef<THREE.PlaneGeometry>(null);

  // The Vegetation Key drives the textured terrain. Until the tiles finish
  // loading — or if they fail to — `textured` stays false and the original
  // vertex-color path renders, so the sim is never blocked on them.
  const terrainTextures = useTerrainTextures(ui.showVegetationKey);
  const textured = ui.showVegetationKey && !!terrainTextures;
  const nearEdgeMask = useNearEdgeMask(simulation, textured);

  const cellData = useMemo(() => textured
    ? {
      vegetationWeights: createCellDataTexture(simulation.gridWidth, simulation.gridHeight),
      burnState: createCellDataTexture(simulation.gridWidth, simulation.gridHeight)
    }
    : null,
  [textured, simulation.gridWidth, simulation.gridHeight]);

  const terrainShader = useMemo(() => {
    if (!textured || !terrainTextures || !cellData) return null;
    const shader = createTexturedTerrainMaterial(
      terrainTextures, simulation.config, new THREE.Vector2(PLANE_WIDTH, height)
    );
    shader.uniforms.uVegetationWeights.value = cellData.vegetationWeights.texture;
    shader.uniforms.uBurnState.value = cellData.burnState.texture;
    return shader;
  }, [textured, terrainTextures, cellData, simulation.config, height]);

  useEffect(() => () => {
    cellData?.vegetationWeights.texture.dispose();
    cellData?.burnState.texture.dispose();
  }, [cellData]);

  useEffect(() => () => terrainShader?.material.dispose(), [terrainShader]);

  useLayoutEffect(() => {
    geometryRef.current?.setAttribute("color",
      new THREE.Float32BufferAttribute(new Array((simulation.gridWidth) * (simulation.gridHeight) * 4), 4)
    );
  }, [simulation.gridWidth, simulation.gridHeight]);


  useLayoutEffect(() => {
    if (geometryRef.current) {
      setupElevation(geometryRef.current, simulation);
    }
  }, [simulation, simulation.cellsElevationFlag]);

  useLayoutEffect(() => {
    if (geometryRef.current) {
      updateColors(geometryRef.current, simulation, textured, nearEdgeMask);
    }
    // simulation.sparks.length retriggers the tpiDebug overlay as sparks are placed.
  }, [simulation, simulation.cellsStateFlag, simulation.sparks.length, textured, nearEdgeMask]);

  // Vegetation is a property of the zone, not the cell, so this only needs to run
  // when a zone's vegetation changes or the zone layout is rebuilt — not per tick.
  const vegetationSignature = simulation.zones.map(zone => zone.vegetation).join(",");
  useLayoutEffect(() => {
    if (cellData && nearEdgeMask) {
      updateVegetationWeights(cellData.vegetationWeights, simulation, nearEdgeMask);
    }
  }, [cellData, nearEdgeMask, simulation, vegetationSignature, simulation.cellsElevationFlag]);

  useLayoutEffect(() => {
    if (cellData) {
      updateBurnState(cellData.burnState, simulation);
    }
  }, [cellData, simulation, simulation.cellsStateFlag]);

  const interactions: InteractionHandler[] = [
    usePlaceSparkInteraction(),
    useDrawFireLineInteraction(),
    useShowCoordsInteraction(),
    useHelitackInteraction(),
    useSimulationClickedInteraction()
  ];

  // Note that getEventHandlers won't return event handlers if it's not necessary. This is important,
  // as adding even an empty event handler enables raycasting machinery in @react-three/fiber and it has big
  // performance cost in case of fairly complex terrain mesh. That's why when all the interactions are disabled,
  // eventHandlers will be an empty object and nothing will be attached to the terrain mesh.
  const eventHandlers = getEventHandlers(interactions);

  return (
    /* eslint-disable react/no-unknown-property */
    // See: https://github.com/jsx-eslint/eslint-plugin-react/issues/3423
    <mesh
      ref={ref}
      position={[PLANE_WIDTH * 0.5, height * 0.5, 0]}
      {...eventHandlers}
    >
      <planeGeometry
        attach="geometry"
        ref={geometryRef}
        center-x={0} center-y={0}
        args={[PLANE_WIDTH, height, simulation.gridWidth - 1, simulation.gridHeight - 1]}
      />
      {terrainShader
        ? <primitive object={terrainShader.material} attach="material" />
        : <meshPhongMaterial attach="material" vertexColors={true} />}
    </mesh>
    /* eslint-enable react/no-unknown-property */
  );
}));

