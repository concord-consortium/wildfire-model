import React from "react";
import { vegetationIcons, droughtIcons } from "./vertical-selectors";
import { vegetationLabels, droughtLabels, Vegetation, DroughtLevel } from "../types";
import * as css from "./terrain-summary.scss";

interface IProps {
  vegetationType: Vegetation;
  droughtLevel: DroughtLevel;
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
          <div className={`${css.icon} ${css.drought}`}>{droughtIcons[droughtLevel]}</div>
        </div>
        <div className={`${css.column}`}>
          <div className={css.caption}>{droughtLabels[droughtLevel]}</div>
        </div>
      </div>
    </div>
  );
