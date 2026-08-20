import React, { RefObject } from "react";
import { observer } from "mobx-react";
import { useStores } from "../../use-stores";
import fireLineImg from "../../assets/interactions/fire-line.png";
import fireLineHighlightImg from "../../assets/interactions/fire-line-highlight.png";
import { Marker } from "./marker";
import * as THREE from "three";
import { logFireLineUpdate } from "../../models/fire-line-placement";

interface IProps {
  dragPlane: RefObject<THREE.Mesh>
}

export const FireLineMarkersContainer: React.FC<IProps> = observer(function WrappedComponent({ dragPlane }) {
  const { simulation } = useStores();
  return <>
    {
      simulation.fireLineMarkers.map((fl, idx) => {
        const onDrag = (x: number, y: number) => simulation.setFireLineMarker(idx, x, y);
        const onDragEnd = () => logFireLineUpdate(simulation, idx);
        return <Marker
          key={idx}
          markerImg={fireLineImg}
          markerHighlightImg={fireLineHighlightImg}
          position={fl}
          onDrag={onDrag}
          onDragEnd={onDragEnd}
          dragPlane={dragPlane}
        />;
      })
    }
         </>;
});
