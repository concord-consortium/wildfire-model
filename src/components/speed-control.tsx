import React from "react";
import { observer } from "mobx-react";
import Slider from "@mui/material/Slider";
import { useStores } from "../use-stores";
import { SPEEDS } from "../models/simulation";
import css from "./speed-control.scss";

const MARKS = SPEEDS.map((speed, index) => ({ value: index, label: speed.label }));

interface IProps {
  disabled: boolean;
}

// `step={null}` makes MUI resolve a pointer position to the nearest mark rather
// than rounding, so clicks and drags land on ticks with no code of ours.
//
// `track={false}` is load-bearing: MUI counts only the selected value as an active
// mark in the trackless mode, where a visible track marks every value at or below
// it and would bold 0.5x alongside 1x.
export const SpeedControl = observer(function WrappedComponent({ disabled }: IProps) {
  const { simulation } = useStores();

  const handleChange = (event: Event, value: number | number[]) => {
    simulation.setSpeedIndex(value as number);
  };

  return (
    <div className={`${css.content} ${disabled ? css.disabled : ""}`}>
      <div className={css.header}>Speed</div>
      <Slider
        classes={{
          root: css.slider, rail: css.rail, mark: css.mark,
          thumb: css.thumb, markLabel: css.markLabel
        }}
        min={0}
        max={SPEEDS.length - 1}
        step={null}
        track={false}
        marks={MARKS}
        value={simulation.speedIndex}
        // Supplies pointer-events: none. The 0.35 fade alone leaves a faded
        // control fully draggable.
        disabled={disabled}
        onChange={handleChange}
        data-testid="speed-control"
      />
    </div>
  );
});
