import React from "react";
import { observer } from "mobx-react";
import { useStores } from "../../use-stores";
import fireLineImg from "../../assets/interactions/fire-line.png";
import fireLineHighlightImg from "../../assets/interactions/fire-line-highlight.png";
import { Marker } from "./marker";
import * as THREE from "three";

interface IProps {
  getTerrain: () => THREE.Mesh | undefined;
}

export const FireLineMarkersContainer: React.FC<IProps> = observer(function WrappedComponent({ getTerrain }) {
  const { simulation } = useStores();
  return <>
    {
      simulation.fireLineMarkers.map((fl, idx) => {
        const setPosition = (x: number, y: number) => simulation.setFireLineMarker(idx, x, y);
        return <Marker
          key={idx}
          markerImg={fireLineImg}
          markerHighlightImg={fireLineHighlightImg}
          position={fl}
          setPosition={setPosition}
          getTerrain={getTerrain}
        />;
      })
    }
  </>;
});
