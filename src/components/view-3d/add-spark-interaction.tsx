import React, { useEffect } from "react";
import * as THREE from "three";
import { observer } from "mobx-react";
import { useStores } from "../../use-stores";
import { ftToViewUnit } from "./helpers";
import { useInteractions } from "./use-interactions";
import sparkCursor from "../../assets/interactions/spark-cursor.png";

interface IProps {
  getTerrain: () => THREE.Mesh | undefined;
}

export const AddSparkInteraction: React.FC<IProps> = observer(({ getTerrain }) => {
  const { simulation, ui } = useStores();
  const addSpark = useInteractions({
    getObject: getTerrain,
    cursor: `url(${sparkCursor}) 32 64, crosshair`,
    onClick: (x, y) => {
      const ratio = ftToViewUnit(simulation);
      simulation.addSpark(x / ratio, y / ratio);
      ui.interaction = null;
    }
  });

  useEffect(() => {
    addSpark.enable();
    return addSpark.disable;
  }, []);

  return null;
});
