import React from "react";
import { Slider } from "@material-ui/core";
import VerticalHandle from "../assets/slider-vertical.svg";
import NoDrought from "../assets/terrain/drought-no.svg";
import MildDrought from "../assets/terrain/drought-mild.svg";
import MedDrought from "../assets/terrain/drought-med.svg";
import SevereDrought from "../assets/terrain/drought-severe.svg";
import * as css from "./vertical-selectors.scss";

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
    label: "Severe Drought",
  },
];

interface IProps {
  droughtIndex: number;
  onChange?: any;
}

export const DroughtSelector = ({ droughtIndex, onChange }: IProps) => (
  <div className={`${css.selector} ${css.drought}`}>
    <div className={css.header}>Drought Index</div>
    <div className={css.sliderContainer}>
      <div className={css.sliderIcons}>
        <div className={`${css.sliderIcon} ${css.severeDrought} ${css.top}`}><SevereDrought /></div>
        <div className={`${css.sliderIcon} ${css.mediumDrought} ${css.topQuarter}`}><MedDrought /></div>
        <div className={`${css.sliderIcon} ${css.mildDrought} ${css.bottomQuarter}`} ><MildDrought /></div>
        <div className={`${css.sliderIcon} ${css.noDrought} ${css.bottom}`}><NoDrought /></div>
      </div>
      <Slider
        classes={{ thumb: css.thumb, track: css.track, rail: css.rail, disabled: css.disabled }}
        min={0}
        max={3}
        value={droughtIndex}
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
  </div>
);
