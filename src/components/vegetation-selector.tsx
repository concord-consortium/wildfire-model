import React from "react";
import { Slider } from "@material-ui/core";
import VerticalHandle from "../assets/slider-vertical.svg";
import { TerrainType, Vegetation } from "../types";
import { vegetationLabels, generateMarks, vegetationIcons } from "./vertical-selectors";
import * as css from "./vertical-selectors.scss";

interface IProps {
  vegetation: Vegetation;
  terrainType: TerrainType;
  onChange?: any;
  forestWithSuppressionAvailable: boolean;
}

const getIcons = (terrainType: TerrainType, forestWithSuppressionAvailable: boolean) => {
  if (terrainType === TerrainType.Mountains) {
    if (forestWithSuppressionAvailable) {
      // no grass
      return vegetationIcons.slice(1);
    } else {
      // no grass, no forest with suppression
      return vegetationIcons.slice(1, 3);
    }
  }
  // no forest with suppression
  return vegetationIcons.slice(0, 3);
}

const getMarks = (terrainType: TerrainType, forestWithSuppressionAvailable: boolean) => {
  if (terrainType === TerrainType.Mountains) {
    if (forestWithSuppressionAvailable) {
      // no grass
      return generateMarks(vegetationLabels.slice(1));
    } else {
      // no grass, no forest with suppression
      return generateMarks(vegetationLabels.slice(1, 3));
    }
  }
  // no forest with suppression
  return generateMarks(vegetationLabels.slice(0, 3));
}

export const VegetationSelector = ({ vegetation, terrainType, onChange, forestWithSuppressionAvailable }: IProps) => {
  const marks = getMarks(terrainType, forestWithSuppressionAvailable);
  const icons = getIcons(terrainType, forestWithSuppressionAvailable);
  return (
    <div className={`${css.selector} ${css.vegetation}`}>
      <div className={css.header}>Vegetation Type</div>
      <div className={css.sliderContainer}>
        <div className={css.sliderIcons}>
          {
            icons.map((icon, idx) =>
              <div key={idx} className={`${css.sliderIcon} ${css.placeholder} ${idx === 0 ? css.bottom : (idx === icons.length - 1 ? css.top : css.mid)}`}>
                { icon }
              </div>
            )
          }
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
          max={marks.length - 1}
          value={vegetation}
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
};
