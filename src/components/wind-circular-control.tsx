import React, { useEffect, useState, useRef } from "react";
import { observer } from "mobx-react";
import { useStores } from "../use-stores";
import {
  CircularInput,
  CircularTrack,
  CircularProgress,
  CircularThumb,
  useCircularInputContext,
  useCircularDrag
} from "react-circular-input";
import WindDial from "../assets/wind-dial.svg";
import WindArrow from "../assets/wind-arrow.svg";
import WindSymbol from "../assets/wind-symbol.svg";
import css from "./wind-circular-control.scss";
import { CircularInputContext } from "react-circular-input/dist/CircularInputContext";

// const handleMouse = (evt: MouseEvent) => {
//   console.log(evt);
// };

export const WindCircularControl = () => {
  const { simulation, ui } = useStores();
  const [directionAngle, setValue] = useState(simulation.wind.direction / 360);

  useEffect(() => {
    simulation.setWindDirection(angleToDirection());
    simulation.setWindSpeed(10);
  }, [directionAngle]);

  const angleToDirection = () => {
    // convert 0-1 scale of angle to the direction from which the wind is coming
    // which is the inverse of this current direction
    const fromAngle = (directionAngle * 360) + 180;
    return fromAngle < 360 ? fromAngle : fromAngle - 360;
  };

  const degToCompass = () => {
    // wind comes _from_ the opposite direction
    const fromAngle = angleToDirection();
    const val = Math.floor((fromAngle / 22.5) + 0.5);
    const arr = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",  ];
    return arr[(val % 16)];
  };

  return (
    <div className={css.windContainer}>
      <div className={css.controlContainer}>
        <div className={css.windSymbolContainer} style={{transform: `rotate(${360 * directionAngle}deg)`}}>
          <WindSymbol className={css.windSymbol} />
        </div>
        <div className={css.dialContainer}>
          <WindDial className={css.dial} />
          <WindArrow className={css.arrow} style={{transform: `rotate(${360 * directionAngle}deg)`}}/>
          <CircularInput value={directionAngle} radius={35} onChange={setValue} className={css.windCircularControl}>
            <CircularTrack strokeWidth={4} stroke="rgba(255,255,255,0.5)" fill="rgba(255,255,255,0)" />
          </CircularInput>
        </div>
      </div>
      <div className={css.key}>Wind Direction and Speed</div>
      <div className={css.windText}>{`30 MPH from the ${degToCompass()}`}</div>
    </div>
  );
};
