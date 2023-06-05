import React, { forwardRef, useLayoutEffect, useRef } from "react";
import { DroughtLevel } from "../../types";
import { BurnIndex, Cell, FireState } from "../../models/cell";
import { ISimulationConfig } from "../../config";
import * as THREE from "three";
import { BufferAttribute } from "three";
import { SimulationModel } from "../../models/simulation";
import { ftToViewUnit, PLANE_WIDTH, planeHeight } from "./helpers";
import { observer } from "mobx-react";
import { useStores } from "../../use-stores";
import { getEventHandlers, InteractionHandler } from "./interaction-handler";
import { usePlaceSparkInteraction } from "./use-place-spark-interaction";
import { useDrawFireLineInteraction } from "./use-draw-fire-line-interaction";
import { useShowCoordsInteraction } from "./use-show-coords-interaction";
import { useHelitackInteraction } from "./use-helitack-interaction";

const vertexIdx = (cell: Cell, gridWidth: number, gridHeight: number) => (gridHeight - 1 - cell.y) * gridWidth + cell.x;

const getTerrainColor = (droughtLevel: number) => {
  switch (droughtLevel) {
    case DroughtLevel.NoDrought:
      return [0.008, 0.831, 0.039];
    case DroughtLevel.MildDrought:
      return [0.573, 0.839, 0.216];
    case DroughtLevel.MediumDrought:
      return [0.757, 0.886, 0.271];
    default:
      return [0.784, 0.631, 0.271];
  }
};
const BURNING_COLOR = [1, 0, 0];
const BURNT_COLOR = [0.2, 0.2, 0.2];
const FIRE_LINE_UNDER_CONSTRUCTION_COLOR = [0.5, 0.5, 0];

export const BURN_INDEX_LOW = [1, 0.7, 0];
export const BURN_INDEX_MEDIUM = [1, 0.5, 0];
export const BURN_INDEX_HIGH = [1, 0, 0];

const burnIndexColor = (burnIndex: BurnIndex) => {
  if (burnIndex === BurnIndex.Low) {
    return BURN_INDEX_LOW;
  }
  if (burnIndex === BurnIndex.Medium) {
    return BURN_INDEX_MEDIUM;
  }
  return BURN_INDEX_HIGH;
};

const setVertexColor = (
  colArray: number[], cell: Cell, gridWidth: number, gridHeight: number, config: ISimulationConfig
) => {
  const idx = vertexIdx(cell, gridWidth, gridHeight) * 4;
  let color;
  if (cell.fireState === FireState.Burning) {
    color = config.showBurnIndex ? burnIndexColor(cell.burnIndex) : BURNING_COLOR;
  } else if (cell.fireState === FireState.Burnt) {
    color = cell.isFireSurvivor ? getTerrainColor(cell.droughtLevel) : BURNT_COLOR;
  } else if (cell.isRiver) {
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

const updateColors = (geometry: THREE.PlaneGeometry, simulation: SimulationModel) => {
  const colArray = geometry.attributes.color.array as number[];
  simulation.cells.forEach(cell => {
    setVertexColor(colArray, cell, simulation.gridWidth, simulation.gridHeight, simulation.config);
  });
  (geometry.attributes.color as BufferAttribute).needsUpdate = true;
};

const setupElevation = (geometry: THREE.PlaneGeometry, simulation: SimulationModel) => {
  const posArray = geometry.attributes.position.array as number[];
  const mult = ftToViewUnit(simulation);
  // Apply height map to vertices of plane.
  simulation.cells.forEach(cell => {
    const zAttrIdx = vertexIdx(cell, simulation.gridWidth, simulation.gridHeight) * 3 + 2;
    posArray[zAttrIdx] = cell.elevation * mult;
  });
  geometry.computeVertexNormals();
  (geometry.attributes.position as BufferAttribute).needsUpdate = true;
};

export const Terrain = observer(forwardRef<THREE.Mesh>(function WrappedComponent(props, ref) {
  const { simulation } = useStores();
  const height = planeHeight(simulation);
  const geometryRef = useRef<THREE.PlaneGeometry>(null);

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
      updateColors(geometryRef.current, simulation);
    }
  }, [simulation, simulation.cellsStateFlag]);

  const interactions: InteractionHandler[] = [
    usePlaceSparkInteraction(),
    useDrawFireLineInteraction(),
    useShowCoordsInteraction(),
    useHelitackInteraction()
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
      <meshPhongMaterial attach="material" vertexColors={true} />
    </mesh>
    /* eslint-enable react/no-unknown-property */
  );
}));

