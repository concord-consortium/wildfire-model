import React, { useEffect } from "react";
import * as THREE from "three";
import { observer } from "mobx-react";
import { useStores } from "../../use-stores";
import { ftToViewUnit } from "./helpers";
import { useInteractions } from "./use-interactions";
import fireLineCursor from "../../assets/interactions/fire-line-cursor.png";

interface IProps {
  getTerrain: () => THREE.Mesh | undefined;
}

const MIN_DIST = 1500; // feet

export const DrawFireLineInteraction: React.FC<IProps> = observer(({ getTerrain }) => {
  const { simulation, ui } = useStores();
  let mouseDown = false;
  const addSpark = useInteractions({
    getObject: getTerrain,
    cursor: `url(${fireLineCursor}) 32 64, crosshair`,
    onMouseDown: (x, y) => {
      mouseDown = true;
      const ratio = ftToViewUnit(simulation);
      simulation.addFireLineMarker(x / ratio, y / ratio, false);
      simulation.addFireLineMarker(x / ratio, y / ratio, true);
    },
    onMouseMove: (x, y) => {
      if (mouseDown) {
        const ratio = ftToViewUnit(simulation);
        const lastIdx = simulation.fireLineMarkers.length - 1;
        simulation.setFireLineMarker(lastIdx, x / ratio, y / ratio, true);
      }
    },
    onMouseUp: (x, y) => {
      mouseDown = false;
      const ratio = ftToViewUnit(simulation);
      const lastIdx = simulation.fireLineMarkers.length - 1;
      if (
        Math.abs(simulation.fireLineMarkers[lastIdx - 1].x - simulation.fireLineMarkers[lastIdx].x) < MIN_DIST &&
        Math.abs(simulation.fireLineMarkers[lastIdx - 1].y - simulation.fireLineMarkers[lastIdx].y) < MIN_DIST
      ) {
        simulation.markFireLineUnderConstruction(
          simulation.fireLineMarkers[lastIdx - 1], simulation.fireLineMarkers[lastIdx], false
        );
        simulation.fireLineMarkers.length = simulation.fireLineMarkers.length - 2;
      } else {
        simulation.setFireLineMarker(lastIdx, x / ratio, y / ratio, false);
        ui.interaction = null;
      }
    }
  });

  useEffect(() => {
    addSpark.enable();
    return addSpark.disable;
  }, []);

  return null;
});
