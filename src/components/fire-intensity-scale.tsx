
import React from "react";
import { BURN_INDEX_HIGH, BURN_INDEX_LOW, BURN_INDEX_MEDIUM } from "./view-3d/terrain";
import css from "./fire-intensity-scale.scss";

const colorArrayToRGBA = (colorArray: number[]) =>
  `rgba(${colorArray.map((v, idx) => idx < 4 ? Math.round(v * 255) : v).join(",")})`;

export const FireIntensityScale = () => (
  <div className={css.fireIntensityScale}>
    <div className={css.barsContainer}>
      <div className={css.bar1} style={{backgroundColor: colorArrayToRGBA(BURN_INDEX_LOW) }} />
      <div className={css.bar2} style={{backgroundColor: colorArrayToRGBA(BURN_INDEX_MEDIUM) }} />
      <div className={css.bar3} style={{backgroundColor: colorArrayToRGBA(BURN_INDEX_HIGH) }} />
    </div>
    <div className={css.labels}>
      <div>Low</div>
      <div>High</div>
    </div>
  </div>
);
