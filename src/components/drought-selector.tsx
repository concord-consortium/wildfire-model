import React from "react";
import { Slider } from "@material-ui/core";
import VerticalHandle from "../assets/slider-vertical.svg";
import { generateMarks, droughtIcons, droughtLabels } from "./vertical-selectors";
import { DroughtLevel } from "../types";
import * as css from "./vertical-selectors.scss";

interface IProps {
  droughtLevel: number;
  onChange?: any;
  disabled?: boolean;
  severeDroughtAvailable?: boolean;
}

export const DroughtSelector = ({ droughtLevel, onChange, disabled, severeDroughtAvailable }: IProps) => {
  const labels = severeDroughtAvailable ? droughtLabels : droughtLabels.slice(0, 3);
  const maxLabelIdx = labels.length - 1;
  return <div className={`${css.selector} ${css.drought} ${disabled ? css.disabled : ""}`}>
    <div className={css.header}>Drought Index</div>
    <div className={css.sliderContainer}>
      <div className={css.sliderIcons}>
        {
          severeDroughtAvailable &&
          <div className={css.sliderIcon} style={{ bottom: "100%" }}>
            {droughtIcons[DroughtLevel.SevereDrought]}</div>
        }
        <div className={css.sliderIcon} style={{ bottom: severeDroughtAvailable ? "66%" : "100%" }}>
          {droughtIcons[DroughtLevel.MediumDrought]}</div>
        <div className={css.sliderIcon} style={{ bottom: severeDroughtAvailable ? "33%" : "50%" }}>
          {droughtIcons[DroughtLevel.MildDrought]}</div>
        <div className={css.sliderIcon} style={{ bottom: 0 }}>
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
        max={maxLabelIdx}
        value={droughtLevel}
        step={1}
        track={false}
        marks={generateMarks(labels)}
        onChange={onChange}
        orientation="vertical"
        ThumbComponent={VerticalHandle}
        className={css.droughtSlider}
        data-test="drought-slider"
      />
    </div>
  </div>;
};
