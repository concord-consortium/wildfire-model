import React from "react";
import {
  CircularInput,
  CircularTrack,
} from "react-circular-input";
import WindDialImage from "../assets/wind-dial.svg";
import WindArrow from "../assets/wind-arrow.svg";

import css from "./wind-dial.scss";

export const degToCompass = (direction: number) => {
  // wind comes _from_ the opposite direction
  const val = Math.floor((direction / 22.5) + 0.5);
  const arr = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return arr[(val % 16)];
};

interface IProps {
  windDirection: number;
  onChange?: (angle: number) => void;
  onChangeEnd?: (angle: number) => void;
}

export const WindDial = ({ windDirection, onChange, onChangeEnd }: IProps) => {
  // Convert 0-1 scale of angle to the direction from which the wind is coming.
  const circularInputValToAngle = (circularInputVal: number) => (circularInputVal * 360 + 180) % 360;
  const circularInputValue = () => (windDirection - 180) / 360;
  const onChangeConvertedValue = (circularInputVal: number) => onChange?.(circularInputValToAngle(circularInputVal));
  const onChangeEndConvertedValue = (circularInputVal: number) => onChangeEnd?.(circularInputValToAngle(circularInputVal));

  return (
    <div className={css.dialContainer}>
      <WindDialImage className={css.dial} />
      <WindArrow className={css.arrow} style={{ transform: `rotate(${windDirection + 180}deg)` }} />
      <CircularInput
        value={circularInputValue()}
        radius={35}
        className={css.windCircularControl}
        onChange={onChangeConvertedValue}
        onChangeEnd={onChangeEndConvertedValue}
      >
        <CircularTrack strokeWidth={4} stroke="rgba(255,255,255,0.5)" fill="rgba(255,255,255,0)" />
      </CircularInput>
    </div>
  );
};
