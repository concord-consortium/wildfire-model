import React from "react";
import { observer } from "mobx-react";
import { useStores } from "../../use-stores";
import fireLineImg from "../../assets/interactions/fire-line.png";
import fireLineHighlightImg from "../../assets/interactions/fire-line-highlight.png";
import { Marker } from "./marker";

export const FireLineMarkersContainer = observer(({ getTerrain }) => {
  const { simulation } = useStores();
  const getPosition = (idx: number) => () => simulation.fireLineMarkers[idx];
  const setPosition = (idx: number) => (x: number, y: number) => simulation.setFireLineMarker(idx, x, y);
  return <>
    {
      simulation.fireLineMarkers.map((fl, idx) =>
        <Marker
          key={idx}
          markerImg={fireLineImg}
          markerHighlightImg={fireLineHighlightImg}
          getPosition={getPosition(idx)}
          setPosition={setPosition(idx)}
          getTerrain={getTerrain}
        />
      )
    }
  </>;
});
