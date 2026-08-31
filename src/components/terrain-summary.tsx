import React from "react";
import { vegetationIcons, droughtIcons } from "./vertical-selectors";
import { vegetationDisplayLabels, droughtLabels, Vegetation, DroughtLevel } from "../types";
import css from "./terrain-summary.scss";

interface IProps {
  vegetationType: Vegetation;
  droughtLevel: DroughtLevel;
  zonesCount?: number;
  onChange?: any;
}

export const TerrainSummary = ({ vegetationType, droughtLevel, zonesCount }: IProps) => {
  const isForestWithSuppression = vegetationType === Vegetation.ForestWithSuppression;
  // "Forest with Suppression" is the only label long enough to wrap. A
  // non-breaking space keeps it as "Forest with" / "Suppression" (not three
  // lines); .fwsCaption shrinks it to 12px to fit. The 3-zone columns are tight,
  // so there we also shift the whole column left (.fwsThreeZone) for room.
  const vegetationCaption = vegetationDisplayLabels[vegetationType].replace(" ", "\u00A0");
  const shiftColumnLeft = isForestWithSuppression && zonesCount === 3;
  return (
    <div className={`${css.terrainSummary} ${shiftColumnLeft ? css.fwsThreeZone : ""}`}>
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
