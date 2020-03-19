import React, { useEffect } from "react";
import * as THREE from "three";
import { observer } from "mobx-react";
import { useStores } from "../../use-stores";
import { ftToViewUnit } from "./helpers";
import { useInteractions } from "./use-interactions";

interface IProps {
  getTerrain: () => THREE.Mesh | undefined;
}

export const ShowCoordsInteraction: React.FC<IProps> = observer(function WrappedComponent({ getTerrain }) {
  const { simulation } = useStores();
  const showCoords = useInteractions({
    getObject: getTerrain,
    onClick: (x, y) => {
      const ratio = ftToViewUnit(simulation);
      const xFt = x / ratio;
      const yFt = y / ratio;
      const xRel = xFt / simulation.config.modelWidth;
      const yRel = yFt / simulation.config.modelHeight;
      window.alert(
        `x: ${xFt.toFixed(3)} ft, y: ${yFt.toFixed(3)} ft\n` +
        `x relative: ${xRel.toFixed(3)}, y relative: ${yRel.toFixed(3)}`
      );
    }
  });

  useEffect(() => {
    showCoords.enable();
    return showCoords.disable;
  }, []);

  return null;
});
