import React, { useEffect, useState } from "react";
import { useStores } from "../use-stores";
import { Slider } from "@material-ui/core";
import { observer } from "mobx-react";
import { windDial, degToCompass } from "./wind-dial";
import { log } from "@concord-consortium/lara-interactive-api";
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

export const WindCircularControl = observer(function WrappedComponent() {
  const { simulation } = useStores();
  const windScaleFactor = simulation.config.windScaleFactor;

  const setDirectionAngle = (circularInputVal: number) => {
    simulation.setWindDirection(circularInputVal);
    log("WindUpdated", { direction: circularInputVal });
  };

  const handleWindSpeedChange = (event: any, value: number | number[]) => {
    const speed = (value as number) * windScaleFactor;
    simulation.setWindSpeed(speed);
    log("WindUpdated", { speed });
  };
  const scaledWind = simulation.wind.speed / windScaleFactor;

  return (
    <div className={css.windContainer}>
      <div className={css.controlContainer}>
        <div className={css.windSymbolContainer} style={{transform: `rotate(${simulation.wind.direction + 180}deg)`}}>
          <WindSymbol className={css.windSymbol} />
        </div>
        {windDial(simulation.wind.direction, setDirectionAngle)}
      </div>

      <div className={css.key}>Wind Direction and Speed</div>
      <div className={css.windText}>
        {`${Math.round(scaledWind)} MPH from the ${degToCompass(simulation.wind.direction)}`}
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
