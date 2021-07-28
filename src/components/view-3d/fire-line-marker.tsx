import React, { RefObject } from "react";
import { observer } from "mobx-react";
import { useStores } from "../../use-stores";
import fireLineImg from "../../assets/interactions/fire-line.png";
import fireLineHighlightImg from "../../assets/interactions/fire-line-highlight.png";
import { Marker } from "./marker";
import * as THREE from "three";
import { log } from "@concord-consortium/lara-interactive-api";

interface IProps {
  dragPlane: RefObject<THREE.Mesh>
}

export const FireLineMarkersContainer: React.FC<IProps> = observer(function WrappedComponent({ dragPlane }) {
  const { simulation } = useStores();
  return <>
    {
      simulation.fireLineMarkers.map((fl, idx) => {
        const onDrag = (x: number, y: number) => simulation.setFireLineMarker(idx, x, y);
        const onDragEnd = () => {
          const firelineStartPoint = idx % 2 === 0 ? simulation.fireLineMarkers[idx] : simulation.fireLineMarkers[idx - 1];
          const firelineEndPoint = idx % 2 === 0 ? simulation.fireLineMarkers[idx + 1] : simulation.fireLineMarkers[idx];
          log("fireline updated", {
            x1: firelineStartPoint.x / simulation.config.modelWidth,
            y1: firelineStartPoint.y / simulation.config.modelHeight,
            x2: firelineEndPoint.x / simulation.config.modelWidth,
            y2: firelineEndPoint.y / simulation.config.modelHeight
          })
        }
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
