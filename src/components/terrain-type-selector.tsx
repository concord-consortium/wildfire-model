import { observer } from "mobx-react";
import React from "react";
import { useStores } from "../use-stores";

import { Radio, RadioGroup, FormControlLabel } from "@material-ui/core";

import * as css from "./terrain-type-selector.scss";

interface IProps {
  zone: number;
  onChange?: any;
}

export const TerrainTypeSelector = observer(({ zone, onChange }: IProps) => {
  const { simulation, ui } = useStores();
  return (
    <div className={css.terrain}>
      <div className={css.terrainSelectorHeader}>Terrain Type</div>
      <RadioGroup
        aria-label="terrain type"
        onChange={onChange}
        className={`${css.terrainSelector}`}
        data-test="terrain-type-selector"
        defaultValue={simulation.zones[zone].terrainType}
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
