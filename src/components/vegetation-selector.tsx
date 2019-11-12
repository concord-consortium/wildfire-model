import React from "react";
import { Slider } from "@material-ui/core";
import VerticalHandle from "../assets/slider-vertical.svg";
import { TerrainType, LandType } from "../models/fire-model";

import Grass from "../assets/terrain/vegetation-grass.svg";
import Shrub from "../assets/terrain/vegetation-shrub.svg";
import ForestSmallLitter from "../assets/terrain/vegetation-fsl.svg";
import ForestLargeLitter from "../assets/terrain/vegetation-fll.svg";

import * as css from "./vertical-selectors.scss";

interface IProps {
  landType: number;
  terrainType: number;
  onChange?: any;
}
// the MaterialUI slider produced unpredictable results if the value ranges min/max changed across renders,
// so instead using two sets of marks.
const marksMountains = [
  {
    value: 0,
    label: "Shrub",
  },
  {
    value: 1,
    label: "Forest Small Litter",
  },
  {
    value: 2,
    label: "Forest Large Litter",
  }
];
const marks = [
  {
    value: 0,
    label: "Grass"
  },
  {
    value: 1,
    label: "Shrub",
  },
  {
    value: 2,
    label: "Forest Small Litter",
  }
];

const iconsMountains = [
  <div className={`${css.sliderIcon} ${css.shrub} ${css.bottom} ${css.placeholder}`} key={0}><Shrub /></div>,
  <div className={`${css.sliderIcon} ${css.fsl} ${css.mid} ${css.placeholder}`} key={1} ><ForestSmallLitter /></div>,
  <div className={`${css.sliderIcon} ${css.fll} ${css.top} ${css.placeholder}`} key={2} ><ForestLargeLitter /></div>
];
const icons = [
  <div className={`${css.sliderIcon} ${css.grass} ${css.bottom} ${css.placeholder}`} key={0}><Grass /></div>,
  <div className={`${css.sliderIcon} ${css.shrub} ${css.mid} ${css.placeholder}`} key={1} ><Shrub /></div>,
  <div className={`${css.sliderIcon} ${css.fsl} ${css.top} ${css.placeholder}`} key={2}><ForestSmallLitter /></div>
];

export const VegetationSelector = ({ landType: vegetationType, terrainType, onChange }: IProps) =>
  (
    <div className={`${css.selector} ${css.vegetation}`}>
      <div className={css.header}>Vegetation Type</div>
      <div className={css.sliderContainer}>
        <div className={css.sliderIcons}>
          { terrainType === TerrainType.Mountains ? iconsMountains : icons }
        </div>
        <Slider
          classes={{ thumb: css.thumb, track: css.track, rail: css.rail, disabled: css.disabled }}
          min={0}
          max={2}
          value={vegetationType}
          step={1}
          track={false}
          marks={terrainType === TerrainType.Mountains ? marksMountains : marks}
          onChange={onChange}
          orientation="vertical"
          ThumbComponent={VerticalHandle}
          className={css.vegetationSlider}
          data-test="vegetation-slider"
        />
      </div>
    </div>
  );
