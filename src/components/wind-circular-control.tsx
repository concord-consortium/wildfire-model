import React from "react";
import { Slider } from "@mui/material";
import { WindDial, degToCompass } from "./wind-dial";
import { log } from "@concord-consortium/lara-interactive-api";
import WindSymbol from "../assets/wind-symbol.svg";

import css from "./wind-circular-control.scss";

const speedMarks = [
  {
    value: 0,
    label: "0"
  },
  {
    value: 10,
    label: "10"
  },
  {
    value: 20,
    label: "20"
  },
  {
    value: 30,
    label: "30"
  }
];

interface IProps {
  speed: number;
  direction: number;
  onSpeedChange: (speed: number) => void;
  onDirectionChange: (direction: number) => void;
  windScaleFactor: number;
}

export const WindCircularControl: React.FC<IProps> = ({ speed, direction, onSpeedChange, onDirectionChange, windScaleFactor }) => {

  const setDirectionAngle = (circularInputVal: number) => {
    onDirectionChange(circularInputVal);
  };

  const handleDirectionAngleEnd = (angle: number) => {
    log("WindUpdated", { angle, direction: degToCompass(angle) });
  };

  const handleSpeedChange = (event: any, value: number | number[]) => {
    const newSpeed = (value as number) * windScaleFactor;
    onSpeedChange(newSpeed);
  };

  const handleSpeedChangeCommitted = (event: any, value: number | number[]) => {
    const newSpeed = (value as number) * windScaleFactor;
    onSpeedChange(newSpeed);
    log("WindUpdated", { speed: value }); // us raw value before conversion, so logs match the UI value
  };

  const scaledWind = speed / windScaleFactor;

  return (
    <div className={css.windContainer}>
      <div className={css.controlContainer}>
        <div className={css.windSymbolContainer} style={{transform: `rotate(${direction + 180}deg)`}}>
          <WindSymbol className={css.windSymbol} />
        </div>
        <WindDial
          windDirection={direction}
          onChange={setDirectionAngle}
          onChangeEnd={handleDirectionAngleEnd}
        />
      </div>

      <div className={css.key}>Wind Direction and Speed</div>
      <div className={css.windText}>
        {`${Math.round(scaledWind)} MPH from the ${degToCompass(direction)}`}
        <div className={css.windSliderControls}>
          <Slider
            classes={{
              rail: css.rail,
              mark: css.mark,
              thumb: css.thumb,
              markLabel: css.markLabel
            }}
            min={0}
            max={30}
            value={scaledWind}
            step={1}
            track={false}
            marks={speedMarks}
            onChange={handleSpeedChange}
            onChangeCommitted={handleSpeedChangeCommitted}
          />
        </div>
      </div>
    </div>
  );
};
