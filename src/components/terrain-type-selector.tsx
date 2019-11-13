import React from "react";
import { Radio, RadioGroup, FormControlLabel } from "@material-ui/core";
import { TerrainType } from "../models/fire-model";

import * as css from "./terrain-type-selector.scss";

interface IProps {
  terrainType: number;
  onChange?: any;
}

export const TerrainTypeSelector = ({ terrainType, onChange }: IProps) => (
  <div className={css.terrain}>
    <div className={css.terrainSelectorHeader}>Terrain Type</div>
    <RadioGroup
      aria-label="terrain type"
      onChange={onChange}
      className={css.terrainSelector}
      data-test="terrain-type-selector"
      value={terrainType}
    >
      <FormControlLabel
        control={<Radio color="default" className={css.radio} />}
        value={TerrainType.Plains}
        label="Plains"
        className={css.terrainOption}
        labelPlacement="end" />
      <FormControlLabel
        control={<Radio color="default" className={css.radio} />}
        value={TerrainType.Foothills}
        label="Foothills"
        className={css.terrainOption}
        labelPlacement="end" />
      <FormControlLabel
        control={<Radio color="default" className={css.radio} />}
        value={TerrainType.Mountains}
        label="Mountains"
        className={css.terrainOption}
        labelPlacement="end" />
    </RadioGroup>
  </div>
);
