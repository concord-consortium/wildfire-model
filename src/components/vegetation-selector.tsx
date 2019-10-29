import React from "react";
import { VegetationType } from "../types";
import { Slider } from "@material-ui/core";
import VerticalHandle from "../assets/slider-vertical.svg";
import * as css from "./vertical-selectors.scss";

interface IProps {
  zone: string;
  vegetationType: VegetationType;
  onChange?: any;
}

const marks = [
  {
    value: 0,
    label: "Forest Large Litter",
  },
  {
    value: 1,
    label: "Forest Small Litter",
  },
  {
    value: 2,
    label: "Shrub",
  }
];

export const VegetationSelector = (({ zone, vegetationType, onChange }: IProps) => {
  return (
    <div className={`${css.selector} ${css.vegetation}`}>
      <div className={css.header}>Vegetation Type</div>
      <div className={css.sliderContainer}>
        <div className={css.sliderIcons}>
          <div className={`${css.sliderIcon} ${css.shrub} ${css.top} ${css.placeholder}`} />
          <div className={`${css.sliderIcon} ${css.fsl} ${css.mid} ${css.placeholder}`} />
          <div className={`${css.sliderIcon} ${css.fll} ${css.bottom} ${css.placeholder}`}/>
        </div>
        <Slider
          classes={{ thumb: css.thumb, track: css.track, rail: css.rail, disabled: css.disabled }}
          min={0}
          max={2}
          defaultValue={0}
          step={1}
          track={false}
          marks={marks}
          onChange={onChange}
          orientation="vertical"
          ThumbComponent={VerticalHandle}
          className={css.vegetationSlider}
          data-test="vegetation-slider"
        />
      </div>
    </div>
  );
});
