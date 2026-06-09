import React from "react";
import { Slider } from "@mui/material";
import { WindDial, degToCompass } from "./wind-dial";
import { log } from "../log";
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

// Wind dial sizing/placement, in px within the 143×143 controlContainer.
const WIND_CONTROL_SIZE = 143;
const WIND_DIAL_BASE = 59;   // original dial size (defines the anchored top)
const WIND_DIAL_SIZE = 74;   // tweak me — Zeplin spec is 79×79, dialed back slightly per review
const WIND_SYMBOL_SIZE = 142; // windSymbolContainer (the rotation frame)
// Anchored top: keep the dial's top where the 59px dial used to sit, so enlarging
// it grows downward (its center drops by half the size increase).
const WIND_DIAL_TOP = (WIND_CONTROL_SIZE - WIND_DIAL_BASE) / 2;
const WIND_DIAL_CENTER_Y = WIND_DIAL_TOP + WIND_DIAL_SIZE / 2;
// Recenter the rotating wind symbol on the (now lower) dial center.
const WIND_SYMBOL_TOP = WIND_DIAL_CENTER_Y - WIND_SYMBOL_SIZE / 2;

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
        <div className={css.windSymbolContainer} style={{ top: WIND_SYMBOL_TOP, transform: `rotate(${direction + 180}deg)` }}>
          <WindSymbol className={css.windSymbol} />
        </div>
        <div className={css.dialAnchor} style={{ top: WIND_DIAL_TOP }}>
          <WindDial
            size={WIND_DIAL_SIZE}
            windDirection={direction}
            onChange={setDirectionAngle}
            onChangeEnd={handleDirectionAngleEnd}
          />
        </div>
      </div>

      <div className={css.windDirectionKey}>{"Wind\nDirection"}</div>
      <div className={css.windSpeedKey}>Wind Speed</div>
      <div className={css.windText}>
        {`${Math.round(scaledWind)} MPH from the ${degToCompass(direction)}`}
      </div>
      <div className={css.windSliderControls} data-testid="wind-speed-slider">
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
  );
};
