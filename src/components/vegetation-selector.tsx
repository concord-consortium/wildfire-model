import React from "react";
import { Slider } from "@material-ui/core";
import VerticalHandle from "../assets/slider-vertical.svg";
import { TerrainType } from "../models/fire-model";

import * as css from "./vertical-selectors.scss";
import { vegetationLabels, generateMarks, vegetationIcons } from "./vertical-selectors";

interface IProps {
  landType: number;
  terrainType: number;
  onChange?: any;
}

const iconsMountains = [
  <div className={`${css.sliderIcon} ${css.shrub} ${css.bottom} ${css.placeholder}`} key={0}>{vegetationIcons[1]}</div>,
  <div className={`${css.sliderIcon} ${css.fsl} ${css.mid} ${css.placeholder}`} key={1} >{vegetationIcons[2]}</div>,
  <div className={`${css.sliderIcon} ${css.fll} ${css.top} ${css.placeholder}`} key={2} >{vegetationIcons[3]}</div>
];
const icons = [
  <div className={`${css.sliderIcon} ${css.grass} ${css.bottom} ${css.placeholder}`} key={0}>{vegetationIcons[0]}</div>,
  <div className={`${css.sliderIcon} ${css.shrub} ${css.mid} ${css.placeholder}`} key={1} >{vegetationIcons[1]}</div>,
  <div className={`${css.sliderIcon} ${css.fsl} ${css.top} ${css.placeholder}`} key={2}>{vegetationIcons[2]}</div>
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
          classes={{
            thumb: css.thumb,
            track: css.track,
            rail: css.rail,
            mark: css.mark,
            markLabel: css.markLabel,
            disabled: css.disabled
          }}
          min={0}
          max={2}
          value={vegetationType}
          step={1}
          track={false}
          marks={terrainType === TerrainType.Mountains ?
            generateMarks(vegetationLabels.slice(1)) : generateMarks(vegetationLabels.slice(0, 3))}
          onChange={onChange}
          orientation="vertical"
          ThumbComponent={VerticalHandle}
          className={css.vegetationSlider}
          data-test="vegetation-slider"
        />
      </div>
    </div>
  );
