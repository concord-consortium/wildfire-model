import React from "react";
import { observer } from "mobx-react";
import { useStores } from "../../use-stores";
import sparkImg from "../../assets/interactions/spark.png";
import sparkHighlightImg from "../../assets/interactions/spark-highlight.png";
import { Marker } from "./marker";

export const SparksContainer = observer(({ getTerrain }) => {
  const { simulation } = useStores();
  return <>
    {
      simulation.sparks.map((s, idx) => {
        const setPosition = (x: number, y: number) => simulation.setSpark(idx, x, y);
        return <Marker
          key={idx}
          markerImg={sparkImg}
          markerHighlightImg={sparkHighlightImg}
          position={simulation.sparks[idx]}
          setPosition={setPosition}
          getTerrain={getTerrain}
          lockOnSimStart={true}
        />;
      })
    }
  </>;
});
