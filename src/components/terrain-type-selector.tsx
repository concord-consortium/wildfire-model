import React from "react";
import { Radio, RadioGroup, FormControlLabel } from "@mui/material";
import { TerrainType } from "../types";

import css from "./terrain-type-selector.scss";

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
      data-testid="terrain-type-selector"
      value={terrainType}
    >
      <FormControlLabel
        control={<Radio color="default" className={css.radio} />}
        value={TerrainType.Plains}
        label={<span className={css.label} data-text="Plains">Plains</span>}
        className={css.terrainOption}
        labelPlacement="end" />
      <FormControlLabel
        control={<Radio color="default" className={css.radio} />}
        value={TerrainType.Foothills}
        label={<span className={css.label} data-text="Foothills">Foothills</span>}
        className={css.terrainOption}
        labelPlacement="end" />
      <FormControlLabel
        control={<Radio color="default" className={css.radio} />}
        value={TerrainType.Mountains}
        label={<span className={css.label} data-text="Mountains">Mountains</span>}
        className={css.terrainOption}
        labelPlacement="end" />
    </RadioGroup>
  </div>
);
