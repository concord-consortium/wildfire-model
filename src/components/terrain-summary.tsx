import React from "react";

import { vegetationLabels, droughtLabels, vegetationIcons, droughtIcons } from "./vertical-selectors";
import * as css from "./terrain-summary.scss";

interface IProps {
  vegetationType: number;
  droughtLevel: number;
  onChange?: any;
}

export const TerrainSummary = ({ vegetationType, droughtLevel }: IProps) =>
  (
    <div className={css.terrainSummary}>
      <div className={`${css.row}`}>
        <div className={`${css.column}`}>
          <div className={css.icon}>{vegetationIcons[vegetationType]}</div>
        </div>
        <div className={`${css.column}`}>
          <div className={css.caption}>{vegetationLabels[vegetationType]}</div>
        </div>
      </div>
      <div className={`${css.row}`}>
        <div className={`${css.column}`}>
          <div className={css.icon}>{droughtIcons[droughtLevel]}</div>
        </div>
        <div className={`${css.column}`}>
          <div className={css.caption}>{droughtLabels[droughtLevel]}</div>
        </div>
      </div>
    </div>
  );
