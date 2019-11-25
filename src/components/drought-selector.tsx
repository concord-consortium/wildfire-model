import React from "react";
import { Slider } from "@material-ui/core";
import VerticalHandle from "../assets/slider-vertical.svg";

import { generateMarks, droughtIcons, droughtLabels } from "./vertical-selectors";
import * as css from "./vertical-selectors.scss";

interface IProps {
  droughtIndex: number;
  onChange?: any;
}

export const DroughtSelector = ({ droughtIndex, onChange }: IProps) => (
  <div className={`${css.selector} ${css.drought}`}>
    <div className={css.header}>Drought Index</div>
    <div className={css.sliderContainer}>
      <div className={css.sliderIcons}>
        <div className={`${css.sliderIcon} ${css.noDrought} ${css.top}`}>{droughtIcons[0]}</div>
        <div className={`${css.sliderIcon} ${css.mildDrought} ${css.topQuarter}`}>{droughtIcons[1]}</div>
        <div className={`${css.sliderIcon} ${css.mediumDrought} ${css.bottomQuarter}`} >{droughtIcons[2]}</div>
        <div className={`${css.sliderIcon} ${css.severeDrought} ${css.bottom}`}>{droughtIcons[3]}</div>
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
        value={droughtIndex}
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
