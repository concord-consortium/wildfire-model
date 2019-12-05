import React, { useEffect } from "react";
import * as THREE from "three";
import { useThree } from "../../react-three-hook";
import { observer } from "mobx-react";
import { useStores } from "../../use-stores";
import { IThreeContext } from "../../react-three-hook/threejs-manager";
import { ftToViewUnit, PLANE_WIDTH } from "./helpers";
import { useInteractions } from "./use-interactions";
import fireLineImg from "../../assets/interactions/fire-line.png";
import fireLineHighlightImg from "../../assets/interactions/fire-line-highlight.png";

const SIZE = 0.06 * PLANE_WIDTH;

const defImage = document.createElement("img");
defImage.src = fireLineImg;
defImage.onload = () =>  { defTexture.needsUpdate = true; };
const defTexture = new THREE.Texture(defImage);
const defMaterial = new THREE.SpriteMaterial({ map: defTexture });
defMaterial.depthTest = false;

const highlightImage = document.createElement("img");
highlightImage.src = fireLineHighlightImg;
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

export const FireLineMarker = observer(({ fireLineMarkerIdx, getTerrain }) => {
  const { simulation, ui } = useStores();
  const { getEntity } = useThree<THREE.Sprite>(setupMesh);
  const dragging = useInteractions({
    getObject: getEntity,
    getDragBaseObject: getTerrain,
    onDrag: (x: number, y: number) => {
      const ratio = ftToViewUnit(simulation);
      simulation.setFireLineMarker(fireLineMarkerIdx, x / ratio, y / ratio, false);
    },
    onMouseOver: () => {
      const fireLine = getEntity();
      if (fireLine) {
        fireLine.material = highlightMaterial;
      }
      return "grab"; // cursor
    },
    onMouseOut: () => {
      const fireLine = getEntity();
      if (fireLine) {
        fireLine.material = defMaterial;
      }
    }
  });

  useEffect(() => {
    if (ui.interaction === null) {
      dragging.enable();
    }
    return dragging.disable;
  }, [ui.interaction]);

  useEffect(() => {
    const sprite = getEntity();
    const fireLine = simulation.fireLineMarkers[fireLineMarkerIdx];
    if (simulation.dataReady && sprite && fireLine) {
      const ratio = ftToViewUnit(simulation);
      const z = simulation.cellAt(fireLine.x, fireLine.y).elevation * ratio;
      sprite.position.set(fireLine.x * ratio, fireLine.y * ratio, z);
    }
  }, [simulation.fireLineMarkers[fireLineMarkerIdx], simulation.dataReady]);

  return null;
});

export const FireLineMarkersContainer = observer(({ getTerrain }) => {
  const { simulation } = useStores();
  return <>
    {
      simulation.fireLineMarkers.map((fl, idx) =>
        !fl.hidden && <FireLineMarker key={idx} fireLineMarkerIdx={idx} getTerrain={getTerrain}/>)
    }
  </>;
});
