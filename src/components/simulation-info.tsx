import React, { useEffect } from "react";
import { observer } from "mobx-react";
import { useStores } from "../use-stores";
import { droughtIcons, droughtLabels, vegetationIcons, vegetationLabels } from "./vertical-selectors";
import { Zone } from "../models/zone";
import { windDial, degToCompass } from "./wind-dial";

import * as css from "./simulation-info.scss";

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
      <div className={`${css.zone} ${zoneLayout[i]} ${cssClasses[i]}`} key={i}>
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
  const scaledWind = simulation.wind.speed / simulation.config.windScaleFactor;
  return (
    <div className={css.simulationInfo}>
      {zoneDetails(simulation.zones)}
      <div className={css.windContainer}>
        <div className={css.windHeader}>Wind Meter</div>
        <div className={css.windText}>
            {`${Math.round(scaledWind)} MPH from the ${degToCompass(simulation.wind.direction)}`}
        </div>
        <div className={css.windDial}>{windDial(simulation.wind.direction)}</div>
      </div>
    </div>
  );
});
