import React from "react";
import { DroughtIndex } from "../types";
import { Slider, Theme } from "@material-ui/core";
import VerticalHandle from "../assets/slider-vertical.svg";

import * as css from "./vertical-selectors.scss";
import { makeStyles, createStyles } from "@material-ui/styles";

const marks = [
  {
    value: 0,
    label: "No Drought",
  },
  {
    value: 1,
    label: "Mild",
  },
  {
    value: 2,
    label: "Medium",
  },
  {
    value: 3,
    label: "Severe",
  },
];

interface IProps {
  zone: string;
  droughtIndex: DroughtIndex;
  onChange?: any;
}

export const DroughtSelector = (({ zone, droughtIndex, onChange }: IProps) => {
  return (
    <div className={`${css.selector} ${css.drought}`}>
      <div className={css.header}>Drought Index</div>
      <Slider
        classes={{ thumb: css.thumb, track: css.track, rail: css.rail, disabled: css.disabled }}
        min={0}
        max={3}
        defaultValue={0}
        step={1}
        track={false}
        marks={marks}
        onChange={onChange}
        orientation="vertical"
        ThumbComponent={VerticalHandle}
        className={css.droughtSlider}
        data-test="drought-slider"
      />
    </div>
  );
});
