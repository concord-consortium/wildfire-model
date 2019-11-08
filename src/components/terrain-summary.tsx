import React from "react";

import Grass from "../assets/terrain/vegetation-grass.svg";
import Shrub from "../assets/terrain/vegetation-shrub.svg";
import ForestSmallLitter from "../assets/terrain/vegetation-fsl.svg";
import ForestLargeLitter from "../assets/terrain/vegetation-fll.svg";

import NoDrought from "../assets/terrain/drought-no.svg";
import MildDrought from "../assets/terrain/drought-mild.svg";
import MedDrought from "../assets/terrain/drought-med.svg";
import SevereDrought from "../assets/terrain/drought-severe.svg";

import * as css from "./terrain-summary.scss";

interface IProps {
  vegetationType: number;
  droughtLevel: number;
  onChange?: any;
}

const vegetationLabels = [
  "Forest Large Litter",
  "Forest Small Litter",
  "Shrub",
  "Grass"
];

const droughtLabels = [
  "No Drought",
  "Mild Drought",
  "Medium Drought",
  "Severe Drought"
];

const vegetationIcons = [
  <ForestLargeLitter key={0} />,
  <ForestSmallLitter key={1} />,
  <Shrub key={2} />,
  <Grass key={3} />,
];

const droughtIcons = [
  <NoDrought key={0} />,
  <MildDrought key={1} />,
  <MedDrought key={2} />,
  <SevereDrought key={3} />,
];

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
