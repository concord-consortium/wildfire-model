import React, { useEffect, useState } from "react";
import { useStores } from "../use-stores";
import { Slider } from "@material-ui/core";
import { observer } from "mobx-react";
import { WindDial } from "./wind-dial";

import WindSymbol from "../assets/wind-symbol.svg";
import HorizontalHandle from "../assets/slider-horizontal.svg";

import css from "./wind-circular-control.scss";

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

  const setDirectionAngle = (circularInputVal: number) => {
    simulation.setWindDirection(circularInputVal);
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
        {WindDial(simulation.wind.direction, setDirectionAngle)}
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
