import React, { useContext, useEffect } from "react";
import * as THREE from "three";
import { useThree } from "../../react-three-hook";
import { observer } from "mobx-react";
import { useStores } from "../../use-stores";
import { IThreeContext, ThreeJSContext } from "../../react-three-hook/threejs-manager";
import sparkImg from "../../assets/interactions/spark.png";
import sparkHighlightImg from "../../assets/interactions/spark-highlight.png";
import { ftToViewUnit, intersects, PLANE_WIDTH } from "./helpers";
import { Draggable, Interaction } from "../../models/ui";

const SIZE = 0.06 * PLANE_WIDTH;

const defImage = document.createElement("img");
defImage.src = sparkImg;
defImage.onload = () =>  { defTexture.needsUpdate = true; };
const defTexture = new THREE.Texture(defImage);
const defMaterial = new THREE.SpriteMaterial({ map: defTexture });

const highlightImage = document.createElement("img");
highlightImage.src = sparkHighlightImg;
highlightImage.onload = () =>  { highlightTexture.needsUpdate = true; };
const highlightTexture = new THREE.Texture(highlightImage);
const highlightMaterial = new THREE.SpriteMaterial({ map: highlightTexture });

const setupMesh = ({ scene }: IThreeContext) => {
  const sprite = new THREE.Sprite(defMaterial);
  sprite.scale.set(SIZE, SIZE, 1);
  scene.add(sprite);
  return sprite;
};

export const Spark = observer(({ sparkIdx }) => {
  const { simulation, ui } = useStores();
  const { canvas, camera } = useContext(ThreeJSContext);

  const { getEntity } = useThree<THREE.Sprite>(setupMesh);

  useEffect(() => {
    const sprite = getEntity();
    const spark = simulation.sparks[sparkIdx];
    if (simulation.dataReady && sprite && spark) {
      const ratio = ftToViewUnit(simulation);
      const z = simulation.cellAt(spark.x, spark.y).elevation * ratio + SIZE * 0.5;
      sprite.position.set(spark.x * ratio, spark.y * ratio, z);
    }
  }, [simulation.sparks[sparkIdx], simulation.dataReady]);

  useEffect(() => {
    const spark = getEntity();
    if (spark) {
      const mouseMove = (event: MouseEvent) => {
        const result = intersects({ event, camera, canvas, object: spark });
        if (result) {
          spark.material = highlightMaterial;
          ui.setDraggableObject(Draggable.Spark, sparkIdx);
        } else if (ui.interaction !== Interaction.Dragging
          && ui.draggableObject === Draggable.Spark && ui.draggableObjectIdx === sparkIdx) {
          // Why do we check (ui.interaction !== Interaction.Dragging)? If object is being dragged, cursor can
          // temporarily leave object area. We don't want to interrupt dragging then.
          // Also, note that it's super important to check if draggableObject is equal to currently processed object.
          // Otherwise, this handler could "unselect" some other object when mouse pointer is leaving it.
          spark.material = defMaterial;
          ui.setDraggableObject(null);
        }
      };
      canvas.addEventListener("mousemove", mouseMove);
      // Cleanup function.
      return () => {
        canvas.removeEventListener("mousemove", mouseMove);
      };
    }
  }, []);

  return null;
});

export const SparksContainer = observer(() => {
  const { simulation } = useStores();
  return <>
    { simulation.sparks.map((s, idx) => <Spark key={idx} sparkIdx={idx} />) }
  </>;
});
