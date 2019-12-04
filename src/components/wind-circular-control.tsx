import React, { useEffect, useState } from "react";
import { useStores } from "../use-stores";
import {
  CircularInput,
  CircularTrack,
} from "react-circular-input";
import WindDial from "../assets/wind-dial.svg";
import WindArrow from "../assets/wind-arrow.svg";
import WindSymbol from "../assets/wind-symbol.svg";
import css from "./wind-circular-control.scss";
import { Slider } from "@material-ui/core";
import HorizontalHandle from "../assets/slider-horizontal.svg";
import { observer } from "mobx-react";

const windSpeedMarks = [
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

// Note that model is very sensitive to wind. Scale wind values down for now, so changes are less dramatic.
const windScaleFactor = 0.2;

export const WindCircularControl = observer(() => {
  const { simulation } = useStores();

  const circularInputValToAngle = (circularInputVal: number) => {
    // Convert 0-1 scale of angle to the direction from which the wind is coming.
    return (circularInputVal * 360 + 180) % 360;
  };

  const circularInputValue = () => {
    return (simulation.wind.direction - 180) / 360;
  };

  const setDirectionAngle = (circularInputVal: number) => {
    simulation.setWindDirection(circularInputValToAngle(circularInputVal));
  };

  const handleWindSpeedChange = (event: any, value: number | number[]) => {
    simulation.setWindSpeed(value as number * windScaleFactor);
  };
  const scaledWind = simulation.wind.speed / windScaleFactor;

  const degToCompass = () => {
    // wind comes _from_ the opposite direction
    const val = Math.floor((simulation.wind.direction / 22.5) + 0.5);
    const arr = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    return arr[(val % 16)];
  };

  return (
    <div className={css.windContainer}>
      <div className={css.controlContainer}>
        <div className={css.windSymbolContainer} style={{transform: `rotate(${simulation.wind.direction + 180}deg)`}}>
          <WindSymbol className={css.windSymbol} />
        </div>
        <div className={css.dialContainer}>
          <WindDial className={css.dial} />
          <WindArrow className={css.arrow} style={{transform: `rotate(${simulation.wind.direction + 180}deg)`}}/>
          <CircularInput value={circularInputValue()} radius={35}
            onChange={setDirectionAngle} className={css.windCircularControl}>
            <CircularTrack strokeWidth={4} stroke="rgba(255,255,255,0.5)" fill="rgba(255,255,255,0)" />
          </CircularInput>
        </div>
      </div>

      <div className={css.key}>Wind Direction and Speed</div>
      <div className={css.windText}>{`${Math.round(scaledWind)} MPH from the ${degToCompass()}`}
        <div className={css.windSliderControls}>
          <Slider
            classes={{ thumb: css.thumb, markLabel: css.markLabel }}
            min={0}
            max={30}
            disabled={simulation.simulationStarted}
            value={scaledWind}
            step={1}
            marks={windSpeedMarks}
            onChange={handleWindSpeedChange}
            ThumbComponent={HorizontalHandle}
          />
        </div>
      </div>
    </div>
  );
});
