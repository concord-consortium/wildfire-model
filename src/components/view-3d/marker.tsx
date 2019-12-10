import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { useThree } from "../../react-three-hook";
import { observer } from "mobx-react";
import { useStores } from "../../use-stores";
import { IThreeContext } from "../../react-three-hook/threejs-manager";
import { ftToViewUnit, PLANE_WIDTH } from "./helpers";
import { useInteractions } from "./use-interactions";
import { SpriteMaterial } from "three";

interface IProps {
  markerImg: string;
  markerHighlightImg: string;
  position: {x: number, y: number};
  setPosition: (x: number, y: number) => void;
  getTerrain: () => THREE.Mesh;
  lockOnSimStart?: boolean;
}

const SIZE = 0.06 * PLANE_WIDTH;

const setupMesh = ({ scene }: IThreeContext) => {
  const sprite = new THREE.Sprite();
  // Move anchor point to bottom.
  sprite.center.y = 0;
  sprite.scale.set(SIZE, SIZE, 1);
  // Ensure that sprite is always rendered on top of other geometry, so e.g. it doesn't disappear under a mountain.
  sprite.renderOrder = 1;
  scene.add(sprite);
  return sprite;
};

const getMaterial = (imgSrc: string) => {
  const image = document.createElement("img");
  image.src = imgSrc;
  image.onload = () =>  { texture.needsUpdate = true; };
  const texture = new THREE.Texture(image);
  const material = new THREE.SpriteMaterial({ map: texture });
  material.depthTest = false;
  return material;
};

export const Marker: React.FC<IProps> = observer(({
  markerImg, markerHighlightImg, position, setPosition, getTerrain, lockOnSimStart = false
}) => {
  const defMaterial = useRef<SpriteMaterial>();
  const highlightMaterial = useRef<SpriteMaterial>();
  const { simulation, ui } = useStores();

  const { getEntity } = useThree<THREE.Sprite>(setupMesh);

  useEffect(() => {
    defMaterial.current = getMaterial(markerImg);
    highlightMaterial.current = getMaterial(markerHighlightImg);
    const marker = getEntity();
    if (marker) {
      marker.material = defMaterial.current;
    }
    return () => {
      defMaterial!.current!.map!.dispose();
      defMaterial!.current!.dispose();
      highlightMaterial!.current!.map!.dispose();
      highlightMaterial!.current!.dispose();
    };
  }, []);

  useEffect(() => {
    const sprite = getEntity();
    if (simulation.dataReady && sprite && position) {
      const ratio = ftToViewUnit(simulation);
      const z = simulation.cellAt(position.x, position.y).elevation * ratio;
      sprite.position.set(position.x * ratio, position.y * ratio, z);
    }
  }, [position, simulation.dataReady]);

  const dragging = useInteractions({
    getObject: getEntity,
    getDragBaseObject: getTerrain,
    onDrag: (x: number, y: number) => {
      const ratio = ftToViewUnit(simulation);
      setPosition(x / ratio, y / ratio);
    },
    onMouseOver: () => {
      const marker = getEntity();
      if (marker) {
        marker.material = highlightMaterial.current!;
      }
      return "grab"; // cursor
    },
    onMouseOut: () => {
      const marker = getEntity();
      if (marker) {
        marker.material = defMaterial.current!;
      }
    }
  });

  useEffect(() => {
    if (ui.interaction === null && (!lockOnSimStart || !simulation.simulationStarted)) {
      dragging.enable();
    }
    return dragging.disable;
  }, [ui.interaction, simulation.simulationStarted]);

  if (lockOnSimStart) {
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
  }

  return null;
});
