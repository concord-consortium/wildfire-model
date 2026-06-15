import React from "react";
import { vegetationIcons, droughtIcons } from "./vertical-selectors";
import { vegetationLabels, droughtLabels, Vegetation, DroughtLevel } from "../types";
import css from "./terrain-summary.scss";

interface IProps {
  vegetationType: Vegetation;
  droughtLevel: DroughtLevel;
  onChange?: any;
}

export const TerrainSummary = ({ vegetationType, droughtLevel }: IProps) => {
  // Display-only lowercasing of "With" per designer review; the canonical
  // vegetationLabels value stays "Forest With Suppression" since the Hazbot
  // engine matches readings against it (see hazbot/wildfire/sim-props.ts).
  const vegetationCaption = vegetationLabels[vegetationType].replace("With Suppression", "with Suppression");
  // "Forest with Suppression" is the only label long enough to wrap; a smaller
  // font (see .fwsCaption) lets it fit the caption as "Forest with" /
  // "Suppression" instead of three lines, without shifting the layout.
  const isForestWithSuppression = vegetationType === Vegetation.ForestWithSuppression;
  return (
    <div className={css.terrainSummary}>
      <div className={`${css.row}`}>
        <div className={`${css.column}`}>
          <div className={css.icon}>{vegetationIcons[vegetationType]}</div>
        </div>
        <div className={`${css.column}`}>
          <div className={`${css.caption} ${isForestWithSuppression ? css.fwsCaption : ""}`}>{vegetationCaption}</div>
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
};
