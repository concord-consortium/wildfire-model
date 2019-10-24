import React from "react";
import { DroughtIndex } from "../types";
import { Radio, RadioGroup, FormLabel, FormControl, FormControlLabel } from "@material-ui/core";

import * as css from "./terrain-type-selector.scss";

interface IProps {
  zone: string;
  droughtIndex: DroughtIndex;
  onChange?: any;
}

export const DroughtSelector = (({ zone, droughtIndex, onChange }: IProps) => {
  return (
    <FormControl component="fieldset">
      <FormLabel component="legend">{`Drought Type Selector Zone ${zone}`}</FormLabel>
      <RadioGroup
        aria-label="drought type"
        onChange={onChange}
        className={`${css.droughtSelector}`}
        data-test="drought-type-selector"
        value={droughtIndex}
      >
        <FormControlLabel
          control={<Radio />}
          value="none"
          label="None"
          labelPlacement="bottom" />
        <FormControlLabel
          control={<Radio />}
          value="mild"
          label="Mild"
          labelPlacement="bottom" />
        <FormControlLabel
          control={<Radio />}
          value="sedium"
          label="Medium"
          labelPlacement="bottom" />
         <FormControlLabel
          control={<Radio />}
          value="severe"
          label="Severe"
          labelPlacement="bottom" />
      </RadioGroup>
    </FormControl>
  );
});
