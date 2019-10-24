import React from "react";
import { TerrainType } from "../types";
import { Radio, RadioGroup, FormLabel, FormControl, FormControlLabel } from "@material-ui/core";

import * as css from "./terrain-type-selector.scss";

interface IProps {
  zone: string;
  terrainType: TerrainType;
  onChange?: any;
}

export const TerrainTypeSelector = (({ zone, terrainType, onChange }: IProps) => {
  return (
    <FormControl component="fieldset">
      <FormLabel component="legend">{`Terrain Type Selector Zone ${zone}`}</FormLabel>
      <RadioGroup
        aria-label="terrain type"
        onChange={onChange}
        className={`${css.terrainSelector}`}
        data-test="terrain-type-selector"
        value={terrainType}
      >
        <FormControlLabel
          control={<Radio />}
          value="plains"
          label="Plains"
          labelPlacement="bottom" />
        <FormControlLabel
          control={<Radio />}
          value="foothills"
          label="Foothills"
          labelPlacement="bottom" />
        <FormControlLabel
          control={<Radio />}
          value="mountains"
          label="Mountains"
          labelPlacement="bottom" />
      </RadioGroup>
    </FormControl>
  );
});
