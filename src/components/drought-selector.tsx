import React from "react";
import { DroughtIndex } from "../types";
import { Slider } from "@material-ui/core";
import VerticalHandle from "../assets/slider-vertical.svg";

import * as css from "./drought-selector.scss";

interface IProps {
  zone: string;
  droughtIndex: DroughtIndex;
  onChange?: any;
}

export const DroughtSelector = (({ zone, droughtIndex, onChange }: IProps) => {
  return (
    <div className={css.droughtSelector}>
      <div className={css.header}>Drought Index</div>
      <Slider
        classes={{ thumb: css.thumb, track: css.track, rail: css.rail, disabled: css.disabled }}
        min={0}
        max={0.2}
        value={0}
        step={1}
        onChange={onChange}
        orientation="vertical"
        ThumbComponent={VerticalHandle}
        className={css.droughtSlider}
        data-test="drought-slider"
      />
    </div>
  );
});
