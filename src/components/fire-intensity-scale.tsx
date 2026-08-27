
import React from "react";
import { BURN_INDEX_HIGH, BURN_INDEX_LOW, BURN_INDEX_MEDIUM } from "./view-3d/terrain-colors";
import css from "./fire-intensity-scale.scss";

const colorArrayToRGB = (colorArray: number[]) =>
  `rgb(${colorArray.map(v => Math.round(v * 255)).join(",")})`;

const swatchColors = [BURN_INDEX_LOW, BURN_INDEX_MEDIUM, BURN_INDEX_HIGH];

export const FireIntensityScale = () => (
  <div className={css.fireIntensityScale} data-testid="fire-intensity-scale">
    <div className={css.title} data-testid="fire-intensity-scale-title">{"Fire Intensity\nScale"}</div>
    <div className={css.barsContainer}>
      {swatchColors.map((color, idx) => (
        <div
          key={idx}
          className={css.swatch}
          data-testid="fire-intensity-scale-swatch"
          style={{backgroundColor: colorArrayToRGB(color) }}
        />
      ))}
    </div>
    <div className={css.labels}>
      <div className={css.label}>Low</div>
      <div className={css.label}>High</div>
    </div>
  </div>
);
