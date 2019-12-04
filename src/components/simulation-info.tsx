import React, { useEffect } from "react";
import { droughtIcons, droughtLabels, vegetationIcons, vegetationLabels } from "./vertical-selectors";
import * as css from "./simulation-info.scss";
import { Zone } from "../models/zone";
import { observer } from "mobx-react";
import { useStores } from "../use-stores";

const zoneTypeText = {
  0: "Plains",
  1: "Foothills",
  2: "Mountains"
};
const cssClasses = [css.zone1, css.zone2, css.zone3];

const zoneDetails = (zones: Zone[]) => {
  const detailView: any[] = [];
  const zoneLayout = zones.length === 2 ?
    [css.twoZoneLeft, css.twoZoneRight] :
    [css.threeZoneLeft, css.threeZoneMid, css.threeZoneRight];

  zones.forEach((z, i) => {
    detailView.push(
      <div className={`${css.zone} ${zoneLayout[i]} ${cssClasses[i]}`}>
        <div className={`${css.icon} ${css.vegetationIcon}`}>{vegetationIcons[z.vegetation]}</div>
        <div className={`${css.icon} ${css.droughtIcon}`}>{droughtIcons[z.droughtLevel]}</div>
        <div className={`${css.zoneText}`}>
          <div className={css.zoneName}>Zone {i + 1}</div>
          <div className={css.terrain}>{zoneTypeText[z.terrainType]}</div>
        </div>
      </div>
    );
  });
  return detailView;
};

export const SimulationInfo = observer(() => {
  const { simulation } = useStores();

  return (
    <div className={css.simulationInfo}>
      {zoneDetails(simulation.zones)}
    </div>
  );
});
