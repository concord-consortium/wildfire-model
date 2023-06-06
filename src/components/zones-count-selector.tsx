import React from "react";
import { Radio, RadioGroup, FormControlLabel } from "@mui/material";
import TwoZones from "../assets/bottom-bar/terrain-setup.svg";
import TwoZonesHighlight from "../assets/bottom-bar/terrain-setup_highlight.svg";
import ThreeZones from "../assets/bottom-bar/terrain-three.svg";
import ThreeZonesHighlight from "../assets/bottom-bar/terrain-three_highlight.svg";

import css from "./zones-count-selector.scss";

interface IProps {
  zonesCount: number;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>, value: string) => void;
}

export const ZonesCountSelector = ({ zonesCount, onChange }: IProps) => (
  <div>
    <RadioGroup
      aria-label="zones count"
      onChange={onChange}
      className={css.zonesCount}
      data-testid="zones-count-selector"
      value={zonesCount}
    >
      <FormControlLabel
        className={css.labelContainer}
        control={<Radio color="default" className={css.radio} />}
        value={3}
        label={<span className={css.label}>3 <div className={css.image}><ThreeZones /></div></span>}
      />
      <FormControlLabel
        className={css.labelContainer}
        control={<Radio color="default" className={css.radio} />}
        value={2}
        label={<span className={css.label}>2 <div className={css.image}><TwoZones /></div></span>}
      />
    </RadioGroup>
  </div>
);
