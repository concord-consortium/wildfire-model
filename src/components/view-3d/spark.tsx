import React, { useEffect } from "react";
import * as THREE from "three";
import { useThree } from "../../react-three-hook";
import { observer } from "mobx-react";
import { useStores } from "../../use-stores";
import { IThreeContext } from "../../react-three-hook/threejs-manager";
import sparkImg from "../../assets/interactions/spark.png";
import sparkHighlightImg from "../../assets/interactions/spark-highlight.png";
import { ftToViewUnit, PLANE_WIDTH } from "./helpers";
import { useInteractions } from "./use-interactions";

const SIZE = 0.06 * PLANE_WIDTH;

const defImage = document.createElement("img");
defImage.src = sparkImg;
defImage.onload = () =>  { defTexture.needsUpdate = true; };
const defTexture = new THREE.Texture(defImage);
const defMaterial = new THREE.SpriteMaterial({ map: defTexture });
defMaterial.depthTest = false;

const highlightImage = document.createElement("img");
highlightImage.src = sparkHighlightImg;
highlightImage.onload = () =>  { highlightTexture.needsUpdate = true; };
const highlightTexture = new THREE.Texture(highlightImage);
const highlightMaterial = new THREE.SpriteMaterial({ map: highlightTexture });
highlightMaterial.depthTest = false;

const setupMesh = ({ scene }: IThreeContext) => {
  const sprite = new THREE.Sprite(defMaterial);
  // Move anchor point to bottom.
  sprite.center.y = 0;
  sprite.scale.set(SIZE, SIZE, 1);
  // Ensure that sprite is always rendered on top of other geometry, so e.g. it doesn't disappear under a mountain.
  sprite.renderOrder = 1;
  scene.add(sprite);
  return sprite;
};

export const Spark = observer(({ sparkIdx, getTerrain }) => {
  const { simulation, ui } = useStores();
  const { getEntity } = useThree<THREE.Sprite>(setupMesh);
  const dragging = useInteractions({
    getObject: getEntity,
    getDragBaseObject: getTerrain,
    onDrag: (x: number, y: number) => {
      const ratio = ftToViewUnit(simulation);
      simulation.setSpark(sparkIdx, x / ratio, y / ratio);
    },
    onMouseOver: () => {
      const spark = getEntity();
      if (spark) {
        spark.material = highlightMaterial;
      }
      return "grab"; // cursor
    },
    onMouseOut: () => {
      const spark = getEntity();
      if (spark) {
        spark.material = defMaterial;
      }
    }
  });

  useEffect(() => {
    if (ui.interaction === null && !simulation.simulationStarted) {
      dragging.enable();
    }
    return dragging.disable;
  }, [ui.interaction, simulation.simulationStarted]);

  useEffect(() => {
    const sprite = getEntity();
    if (!sprite) {
      return;
    }
    if (simulation.simulationStarted) {
      sprite.scale.set(SIZE * 0.5, SIZE * 0.5, 1);
    } else {
      sprite.scale.set(SIZE, SIZE, 1);
    }
  }, [simulation.simulationStarted]);

  useEffect(() => {
    const sprite = getEntity();
    const spark = simulation.sparks[sparkIdx];
    if (simulation.dataReady && sprite && spark) {
      const ratio = ftToViewUnit(simulation);
      const z = simulation.cellAt(spark.x, spark.y).elevation * ratio;
      sprite.position.set(spark.x * ratio, spark.y * ratio, z);
    }
  }, [simulation.sparks[sparkIdx], simulation.dataReady]);

  return null;
});

export const SparksContainer = observer(({ getTerrain }) => {
  const { simulation } = useStores();
  return <>
    { simulation.sparks.map((s, idx) => <Spark key={idx} sparkIdx={idx} getTerrain={getTerrain}/>) }
  </>;
});
