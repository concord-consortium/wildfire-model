import React from "react";
import Grass from "../assets/terrain/vegetation-grass.svg";
import Shrub from "../assets/terrain/vegetation-shrub.svg";
import ForestSmallLitter from "../assets/terrain/vegetation-fsl.svg";
import ForestLargeLitter from "../assets/terrain/vegetation-fll.svg";

import NoDrought from "../assets/terrain/drought-no.svg";
import MildDrought from "../assets/terrain/drought-mild.svg";
import MedDrought from "../assets/terrain/drought-med.svg";
import SevereDrought from "../assets/terrain/drought-severe.svg";

export const vegetationLabels = [
  "Grass",
  "Shrub",
  "Forest Small Litter",
  "Forest Large Litter"
];

export const droughtLabels = [
  "Severe Drought",
  "Medium Drought",
  "Mild Drought",
  "No Drought",
];

export const generateMarks = (labelsToShow: string[]) => {
  const sliderMarks: any[] = [];
  labelsToShow.forEach((l, i) => {
    sliderMarks.push({ value: i, label: l });
  });
  return sliderMarks;
};

export const vegetationIcons = [
  <Grass key={0} />,
  <Shrub key={1} />,
  <ForestSmallLitter key={2} />,
  <ForestLargeLitter key={3} />
];

export const droughtIcons = [
  <NoDrought key={0} />,
  <MildDrought key={1} />,
  <MedDrought key={2} />,
  <SevereDrought key={3} />
];
