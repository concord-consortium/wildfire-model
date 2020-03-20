import React from "react";
import { Slider } from "@material-ui/core";
import VerticalHandle from "../assets/slider-vertical.svg";

import { generateMarks, droughtIcons, droughtLabels } from "./vertical-selectors";
import * as css from "./vertical-selectors.scss";
import { DroughtLevel } from "../models/fire-model";

interface IProps {
  droughtLevel: number;
  onChange?: any;
  disabled?: boolean;
}

export const DroughtSelector = ({ droughtLevel, onChange, disabled }: IProps) => (
  <div className={`${css.selector} ${css.drought} ${disabled ? css.disabled : ""}`}>
    <div className={css.header}>Drought Index</div>
    <div className={css.sliderContainer}>
      <div className={css.sliderIcons}>
        <div className={`${css.sliderIcon} ${css.top}`}>
          {droughtIcons[DroughtLevel.SevereDrought]}</div>
        <div className={`${css.sliderIcon} ${css.topQuarter}`}>
          {droughtIcons[DroughtLevel.MediumDrought]}</div>
        <div className={`${css.sliderIcon} ${css.bottomQuarter}`} >
          {droughtIcons[DroughtLevel.MildDrought]}</div>
        <div className={`${css.sliderIcon} ${css.bottom}`}>
          {droughtIcons[DroughtLevel.NoDrought]}</div>
      </div>
      <Slider
        classes={{
          thumb: css.thumb,
          track: css.track,
          rail: css.rail,
          markLabel: css.markLabel,
          disabled: css.disabled
        }}
        min={0}
        max={3}
        value={droughtLevel}
        step={1}
        track={false}
        marks={generateMarks(droughtLabels)}
        onChange={onChange}
        orientation="vertical"
        ThumbComponent={VerticalHandle}
        className={css.droughtSlider}
        data-test="drought-slider"
      />
    </div>
  </div>
);
