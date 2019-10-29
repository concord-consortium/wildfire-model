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
    <div className={css.terrain}>
      <div className={css.terrainSelectorHeader}>Terrain Type</div>
      <RadioGroup
        aria-label="terrain type"
        onChange={onChange}
        className={`${css.terrainSelector}`}
        data-test="terrain-type-selector"
        defaultValue={terrainType}
      >
        <FormControlLabel
          control={<Radio color="default" className={css.radio} />}
          value="plains"
          label="Plains"
          className={css.terrainOption}
          labelPlacement="end" />
        <FormControlLabel
          control={<Radio color="default" className={css.radio} />}
          value="foothills"
          label="Foothills"
          className={css.terrainOption}
          labelPlacement="end" />
        <FormControlLabel
          control={<Radio color="default" className={css.radio} />}
          value="mountains"
          label="Mountains"
          className={css.terrainOption}
          labelPlacement="end" />
      </RadioGroup>
    </div>
  );
});
