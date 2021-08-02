import React from "react";
import Grass from "../assets/terrain/vegetation-grass.svg";
import Shrub from "../assets/terrain/vegetation-shrub.svg";
import Forest from "../assets/terrain/vegetation-fsl.svg";
import ForestWithSuppression from "../assets/terrain/vegetation-fll.svg";

import NoDrought from "../assets/terrain/drought-no.svg";
import MildDrought from "../assets/terrain/drought-mild.svg";
import MedDrought from "../assets/terrain/drought-med.svg";
import SevereDrought from "../assets/terrain/drought-severe.svg";

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
  <Forest key={2} />,
  <ForestWithSuppression key={3} />
];

export const droughtIcons = [
  <NoDrought key={0} />,
  <MildDrought key={1} />,
  <MedDrought key={2} />,
  <SevereDrought key={3} />
];
