import React from "react";
import { Slider } from "@mui/core";
import VerticalHandle from "../assets/slider-vertical.svg";
import { TerrainType, Vegetation, vegetationLabels } from "../types";
import { generateMarks, vegetationIcons } from "./vertical-selectors";
import css from "./vertical-selectors.scss";
import { Terrain } from "./view-3d/terrain";

interface IProps {
  vegetation: Vegetation;
  terrainType: TerrainType;
  forestWithSuppressionAvailable: boolean;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>, value: number) => void;
  onChangeCommitted?: (event: React.ChangeEvent<HTMLInputElement>, value: number) => void;
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
  const labelsArray = Object.values(vegetationLabels);
  if (terrainType === TerrainType.Mountains) {
    if (forestWithSuppressionAvailable) {
      // no grass
      return generateMarks(labelsArray.slice(1));
    } else {
      // no grass, no forest with suppression
      return generateMarks(labelsArray.slice(1, 3));
    }
  }
  // no forest with suppression
  return generateMarks(labelsArray.slice(0, 3));
}

export const VegetationSelector = ({ vegetation, terrainType, onChange, onChangeCommitted, forestWithSuppressionAvailable }: IProps) => {
  const marks = getMarks(terrainType, forestWithSuppressionAvailable);
  const icons = getIcons(terrainType, forestWithSuppressionAvailable);

  const adjustSliderValue = (value: number) => terrainType === TerrainType.Mountains ? value + 1 : value;
  const handleOnChange = (event: React.ChangeEvent<HTMLInputElement>, value: number) => onChange?.(event, adjustSliderValue(value));
  const handleOnChangeCommitted = (event: React.ChangeEvent<HTMLInputElement>, value: number) => onChangeCommitted?.(event, adjustSliderValue(value));

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
          onChange={handleOnChange}
          onChangeCommitted={handleOnChangeCommitted}
          orientation="vertical"
          ThumbComponent={VerticalHandle}
          className={css.vegetationSlider}
          data-testid="vegetation-slider"
        />
      </div>
    </div>
  );
};
