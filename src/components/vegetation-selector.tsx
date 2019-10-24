import React from "react";
import { VegetationType } from "../types";
import { Radio, RadioGroup, FormLabel, FormControl, FormControlLabel } from "@material-ui/core";

import * as css from "./terrain-type-selector.scss";

interface IProps {
  zone: string;
  vegetationType: VegetationType;
  onChange?: any;
}

export const VegetationSelector = (({ zone, vegetationType, onChange }: IProps) => {
  return (
    <FormControl component="fieldset">
      <FormLabel component="legend">{`Vegetation Type Selector Zone ${zone}`}</FormLabel>
      <RadioGroup
        aria-label="vegetation type"
        onChange={onChange}
        className={`${css.vegetationSelector}`}
        data-test="vegetation-type-selector"
        value={vegetationType}
      >
        <FormControlLabel
          control={<Radio />}
          value="shrub"
          label="Shrub"
          labelPlacement="bottom" />
        <FormControlLabel
          control={<Radio />}
          value="smallForest"
          label="Small Forest"
          labelPlacement="bottom" />
        <FormControlLabel
          control={<Radio />}
          value="largeForest"
          label="Large Forest"
          labelPlacement="bottom" />
      </RadioGroup>
    </FormControl>
  );
});
