import React, { useEffect } from "react";
import * as THREE from "three";
import { useThree } from "../../react-three-hook";
import { observer } from "mobx-react";
import { useStores } from "../../use-stores";
import { IThreeContext } from "../../react-three-hook/threejs-manager";
import sparkImg from "../../assets/interactions/spark.png";
import { ftToViewUnit, PLANE_WIDTH } from "./helpers";

const SIZE = 0.06 * PLANE_WIDTH;

const setupMesh = ({ scene }: IThreeContext) => {
  const image = document.createElement("img");
  image.src = sparkImg;
  image.onload = () =>  { texture.needsUpdate = true; };
  const texture = new THREE.Texture(image);
  const material = new THREE.SpriteMaterial({ map: texture, color: 0xffffff });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(SIZE, SIZE, 1);
  scene.add(sprite);
  return sprite;
};

export const Spark = observer(() => {
  const { simulation } = useStores();

  const { getEntity } = useThree<THREE.Sprite>(setupMesh);

  useEffect(() => {
    const sprite = getEntity();
    const spark = simulation.spark;
    if (simulation.dataReady && sprite && spark) {
      const ratio = ftToViewUnit(simulation);
      const z = simulation.cellAt(spark.x, spark.y).elevation * ratio + SIZE * 0.5;
      sprite.position.set(spark.x * ratio, spark.y * ratio, z);
    }
  }, [simulation.spark, simulation.dataReady]);

  return null;
});
