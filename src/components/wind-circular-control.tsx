import React from "react";
import { useStores } from "../use-stores";
import { Slider } from "@mui/material";
import { observer } from "mobx-react";
import { WindDial, degToCompass } from "./wind-dial";
import { log } from "@concord-consortium/lara-interactive-api";
import WindSymbol from "../assets/wind-symbol.svg";

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
  };

  const handleDirectionAngleEnd = (angle: number) => {
    log("WindUpdated", { angle, direction: degToCompass(angle) });
  };

  const handleWindSpeedChange = (event: any, value: number | number[]) => {
    const speed = (value as number) * windScaleFactor;
    simulation.setWindSpeed(speed);
  };

  const handleWindSpeedChangeCommitted = (event: any, value: number | number[]) => {
    const speed = (value as number) * windScaleFactor;
    simulation.setWindSpeed(speed);
    log("WindUpdated", { speed: value }); // us raw value before conversion, so logs match the UI value
  };


  const scaledWind = simulation.wind.speed / windScaleFactor;

  return (
    <div className={css.windContainer}>
      <div className={css.controlContainer}>
        <div className={css.windSymbolContainer} style={{transform: `rotate(${simulation.wind.direction + 180}deg)`}}>
          <WindSymbol className={css.windSymbol} />
        </div>
        <WindDial
          windDirection={simulation.wind.direction}
          onChange={setDirectionAngle}
          onChangeEnd={handleDirectionAngleEnd}
        />
      </div>

      <div className={css.key}>Wind Direction and Speed</div>
      <div className={css.windText}>
        {`${Math.round(scaledWind)} MPH from the ${degToCompass(simulation.wind.direction)}`}
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
            disabled={simulation.simulationStarted}
            value={scaledWind}
            step={1}
            track={false}
            marks={windSpeedMarks}
            onChange={handleWindSpeedChange}
            onChangeCommitted={handleWindSpeedChangeCommitted}
          />
        </div>
      </div>
    </div>
  );
});
