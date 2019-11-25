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
export const WindCircularControl = () => {
  const { simulation, ui } = useStores();
  const [directionAngle, setDirectionAngle] = useState(simulation.wind.direction / 360);
  const [windSpeed, setWindSpeed] = useState(simulation.wind.speed);

  useEffect(() => {
    simulation.setWindDirection(angleToDirection());
    simulation.setWindSpeed(windSpeed);
  }, [directionAngle, windSpeed]);

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

  const handleWindSpeedChange = (event: any, value: number | number[]) => {
    setWindSpeed(value as number);
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
          <CircularInput value={directionAngle} radius={35}
            onChange={setDirectionAngle} className={css.windCircularControl}>
            <CircularTrack strokeWidth={4} stroke="rgba(255,255,255,0.5)" fill="rgba(255,255,255,0)" />
          </CircularInput>
        </div>
      </div>

      <div className={css.key}>Wind Direction and Speed</div>
      <div className={css.windText}>{`${windSpeed} MPH from the ${degToCompass()}`}
        <div className={css.windSliderControls}>
          <Slider
            classes={{ thumb: css.thumb, markLabel: css.markLabel }}
            min={0}
            max={30}
            disabled={simulation.simulationStarted}
            value={windSpeed}
            step={1}
            marks={windSpeedMarks}
            onChange={handleWindSpeedChange}
            ThumbComponent={HorizontalHandle}
          />
        </div>
      </div>
    </div>
  );
};
