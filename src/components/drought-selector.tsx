import React from "react";
import { Slider } from "@mui/material";
import { generateMarks, droughtIcons } from "./vertical-selectors";
import { DroughtLevel, droughtLabels } from "../types";

import css from "./vertical-selectors.scss";

interface IProps {
  droughtLevel: number;
  disabled?: boolean;
  severeDroughtAvailable?: boolean;
  onChange?: (event: Event, value: number) => void;
  onChangeCommitted?: (event: Event, value: number) => void;
}

export const DroughtSelector = ({ droughtLevel, onChange, onChangeCommitted, disabled, severeDroughtAvailable }: IProps) => {
  const labelsArray = Object.values(droughtLabels);
  const labels = severeDroughtAvailable ? labelsArray : labelsArray.slice(0, 3);
  const maxLabelIdx = labels.length - 1;

  return <div className={`${css.selector} ${css.drought} ${disabled ? css.disabled : ""}`}>
    <div className={css.header}>Drought Index</div>
    <div className={css.sliderContainer}>
      <div className={css.sliderIcons}>
        {
          severeDroughtAvailable &&
          <div className={css.sliderIcon} style={{ bottom: "100%" }}>
            {droughtIcons[DroughtLevel.SevereDrought]}
          </div>
        }
        <div className={css.sliderIcon} style={{ bottom: severeDroughtAvailable ? "66%" : "100%" }}>
          {droughtIcons[DroughtLevel.MediumDrought]}
        </div>
        <div className={css.sliderIcon} style={{ bottom: severeDroughtAvailable ? "33%" : "50%" }}>
          {droughtIcons[DroughtLevel.MildDrought]}
        </div>
        <div className={css.sliderIcon} style={{ bottom: 0 }}>
          {droughtIcons[DroughtLevel.NoDrought]}
        </div>
      </div>
      <Slider
        className={css.slider}
        classes={{
          thumb: css.thumb,
          rail: css.rail,
          mark: css.mark,
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
        onChangeCommitted={onChangeCommitted}
        orientation="vertical"
        data-testid="drought-slider"
      />
    </div>
         </div>;
};
