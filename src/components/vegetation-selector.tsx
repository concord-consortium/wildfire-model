import React from "react";
import { VegetationType } from "../types";
import { Slider } from "@material-ui/core";
import VerticalHandle from "../assets/slider-vertical.svg";
import * as css from "./vegetation-selector.scss";

interface IProps {
  zone: string;
  vegetationType: VegetationType;
  onChange?: any;
}

export const VegetationSelector = (({ zone, vegetationType, onChange }: IProps) => {
  return (
    <div className={css.vegetationSelector}>
      <div className={css.header}>Vegetation Type</div>
      <Slider
        classes={{ thumb: css.thumb, track: css.track, rail: css.rail, disabled: css.disabled }}
        min={0}
        max={0.2}
        value={0}
        step={1}
        onChange={onChange}
        orientation="vertical"
        ThumbComponent={VerticalHandle}
        className={css.vegetationSlider}
        data-test="vegetation-slider"
      />
    </div>
  );
});
