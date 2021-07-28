import React from "react";
import { observer } from "mobx-react";
import { useStores } from "../use-stores";
import { droughtIcons, vegetationIcons } from "./vertical-selectors";
import { Zone } from "../models/zone";
import { windDial, degToCompass } from "./wind-dial";
import LockIcon from "../assets/lock.svg";
import { log } from "@concord-consortium/lara-interactive-api";
import * as css from "./simulation-info.scss";

const zoneTypeText = {
  0: "Plains",
  1: "Foothills",
  2: "Mountains"
};

const zoneCssClasses = [css.zone1, css.zone2, css.zone3];

export const ZoneInfo = ({zone, idx, locked, onClick}: {zone: Zone; idx: number; locked: boolean; onClick: () => void}) => (
  <div className={`${css.zone} ${zoneCssClasses[idx]} ${locked ? "" : css.active}`} onClick={locked ? undefined : onClick}>
    <div className={`${css.icon} ${css.vegetationIcon}`}>{vegetationIcons[zone.vegetation]}</div>
    <div className={`${css.icon} ${css.droughtIcon}`}>{droughtIcons[zone.droughtLevel]}</div>
    <div className={`${css.zoneText}`}>
      <div className={css.zoneName}>Zone {idx + 1}</div>
      <div className={css.terrain}>{zoneTypeText[zone.terrainType]}</div>
    </div>
    { locked && <div className={css.lockIcon}><LockIcon /></div> }
  </div>
);

export const SimulationInfo = observer(function WrappedComponent() {
  const { simulation, ui } = useStores();
  const scaledWind = simulation.wind.speed / simulation.config.windScaleFactor;
  const uiDisabled = simulation.simulationStarted;

  const showTerrainPanel = (zoneIdx: number) => {
    if (ui.showTerrainUI === false || ui.terrainUISelectedZone !== zoneIdx) {
      ui.showTerrainUI = true;
      ui.terrainUISelectedZone = zoneIdx;
    } else {
      ui.showTerrainUI = false;
    }
    log("ZoneButtonClicked", { zone: zoneIdx + 1 });
  };

  return (
    <div className={css.simulationInfo}>
      {
        simulation.zones.map((zone, idx) =>
          <ZoneInfo key={idx} idx={idx} zone={zone} locked={uiDisabled} onClick={showTerrainPanel.bind(null, idx)} />
        )
      }
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
