import React from "react";
import {
  CircularInput,
  CircularTrack,
} from "react-circular-input";
import WindDialImage from "../assets/wind-dial.svg";
import WindArrow from "../assets/wind-arrow.svg";

import css from "./wind-dial.scss";

export const windDial = (simulationWindDirection: number, onChange?: any) => {
  const circularInputValToAngle = (circularInputVal: number) => {
    // Convert 0-1 scale of angle to the direction from which the wind is coming.
    return (circularInputVal * 360 + 180) % 360;
  };
  const circularInputValue = () => {
    return (simulationWindDirection - 180) / 360;
  };
  const setDirectionAngle = (circularInputVal: number) => {
    if (onChange) {
      onChange(circularInputValToAngle(circularInputVal));
    }
  };

  return (
    <div className={css.dialContainer}>
      <WindDialImage className={css.dial} />
      <WindArrow className={css.arrow} style={{ transform: `rotate(${simulationWindDirection + 180}deg)` }} />
      <CircularInput value={circularInputValue()} radius={35}
        className={css.windCircularControl} onChange={setDirectionAngle}>
        <CircularTrack strokeWidth={4} stroke="rgba(255,255,255,0.5)" fill="rgba(255,255,255,0)" />
      </CircularInput>
    </div>
  );
};
export const degToCompass = (direction: number) => {
  // wind comes _from_ the opposite direction
  const val = Math.floor((direction / 22.5) + 0.5);
  const arr = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return arr[(val % 16)];
};
