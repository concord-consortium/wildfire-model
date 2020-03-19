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
  // Image src or HTML Canvas that is going to be used as a texture source.
  markerImg: string | HTMLCanvasElement;
  position: {x: number, y: number};
  // Width relative to the plane/terrain width.
  width?: number;
  // Height relative to the plane/terrain width.
  height?: number;
  anchorX?: number;
  anchorY?: number;
  // setPosition enabled dragging
  setPosition?: (x: number, y: number) => void;
  // getTerrain provides a based mesh used for dragging. Necessary for dragging to work.
  getTerrain?: () => THREE.Mesh | undefined;
  // Optional highlight image that we'll be activated on hover.
  markerHighlightImg?: string | HTMLCanvasElement;
  lockOnSimStart?: boolean;
}

// const SIZE = 0.06 * PLANE_WIDTH;

const setupMesh = ({ scene }: IThreeContext) => {
  const sprite = new THREE.Sprite();
  // Ensure that sprite is always rendered on top of other geometry, so e.g. it doesn't disappear under a mountain.
  sprite.renderOrder = 1;
  scene.add(sprite);
  return sprite;
};

const getMaterial = (imgSrcOrCanvas: string | HTMLCanvasElement) => {
  let source;
  let Texture = THREE.Texture;
  if (typeof imgSrcOrCanvas === "string") {
    source = document.createElement("img");
    source.src = imgSrcOrCanvas;
    source.onload = () => texture.needsUpdate = true;
  } else {
    source = imgSrcOrCanvas; // canvas
    Texture = THREE.CanvasTexture;
  }
  const texture = new Texture(source);
  const material = new THREE.SpriteMaterial({ map: texture });
  material.depthTest = false;
  return material;
};

export const Marker: React.FC<IProps> = observer(function WrappedComponent({
  markerImg, markerHighlightImg, position, setPosition, getTerrain,
  width = 0.06, height = 0.06, anchorX = 0.5, anchorY = 0, lockOnSimStart = false
}) {
  const defMaterial = useRef<SpriteMaterial>();
  const highlightMaterial = useRef<SpriteMaterial>();
  const { simulation, ui } = useStores();

  const { getEntity } = useThree<THREE.Sprite>(setupMesh);

  const marker = getEntity();
  if (marker) {
    marker.center.x = anchorX;
    marker.center.y = anchorY;
    marker.scale.set(width * PLANE_WIDTH, height * PLANE_WIDTH, 1);
  }

  useEffect(() => {
    defMaterial.current = getMaterial(markerImg);
    if (markerHighlightImg) {
      highlightMaterial.current = getMaterial(markerHighlightImg);
    }
    const sprite = getEntity();
    if (sprite) {
      sprite.material = defMaterial.current;
    }
    return () => {
      defMaterial!.current!.map!.dispose();
      defMaterial!.current!.dispose();
      if (markerHighlightImg) {
        highlightMaterial!.current!.map!.dispose();
        highlightMaterial!.current!.dispose();
      }
    };
  }, [markerImg, markerHighlightImg]);

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
      if (setPosition) {
        const ratio = ftToViewUnit(simulation);
        setPosition(x / ratio, y / ratio);
      }
    },
    onMouseOver: () => {
      const sprite = getEntity();
      if (sprite && highlightMaterial.current) {
        sprite.material = highlightMaterial.current;
      }
      return "grab"; // cursor
    },
    onMouseOut: () => {
      const sprite = getEntity();
      if (sprite) {
        sprite.material = defMaterial.current!;
      }
    }
  });

  useEffect(() => {
    const draggable = setPosition && getTerrain;
    if (draggable) {
      if (ui.interaction === null && (!lockOnSimStart || !simulation.simulationStarted)) {
        dragging.enable();
      }
      return dragging.disable;
    }
  }, [ui.interaction, simulation.simulationStarted]);

  useEffect(() => {
    if (lockOnSimStart) {
      const sprite = getEntity();
      if (!sprite) {
        return;
      }
      if (simulation.simulationStarted) {
        sprite.scale.set(width * PLANE_WIDTH * 0.5, height * PLANE_WIDTH * 0.5, 1);
      } else {
        sprite.scale.set(width * PLANE_WIDTH, height * PLANE_WIDTH, 1);
      }
    }
  }, [simulation.simulationStarted]);

  return null;
});
