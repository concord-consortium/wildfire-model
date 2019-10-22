import React, { useEffect } from "react";
import * as THREE from "three";
import { useThree } from "../../react-three-hook";
import { observer } from "mobx-react";
import { useStores } from "../../use-stores";
import { IThreeContext } from "../../react-three-hook/threejs-manager";
import sparkWhite from "../../assets/cursors/spark-white.png";

const WIDTH = 0.04;
const HEIGHT = WIDTH * 224 / 174;

const setupMesh = ({ scene }: IThreeContext) => {
  const image = document.createElement("img");
  image.src = sparkWhite;
  image.onload = () =>  { texture.needsUpdate = true; };
  const texture = new THREE.Texture(image);
  const material = new THREE.SpriteMaterial({ map: texture, color: 0xffffff });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(WIDTH, HEIGHT, 1);
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
      const x = spark.x / simulation.gridWidth - 0.5 + 0.5 / simulation.gridWidth;
      const z = -spark.y / simulation.gridHeight + 0.5 - 0.5 / simulation.gridWidth;
      const heightMult = 1 / simulation.config.modelWidth;
      const y = simulation.getElevationAt(spark.x, spark.y) * heightMult + HEIGHT * 0.5;
      sprite.position.set(x, y, z);
    }
  }, [simulation.spark, simulation.dataReady]);

  return null;
});
