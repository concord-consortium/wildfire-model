import React from "react";
import { observer } from "mobx-react";
import { useStores } from "../use-stores";
import { droughtIcons, vegetationIcons } from "./vertical-selectors";
import { Zone } from "../models/zone";
import { WindDial, degToCompass } from "./wind-dial";
import { terrainDisplayLabels } from "../types";
import css from "./simulation-info.scss";

const zoneCssClasses = [css.zone1, css.zone2, css.zone3];

export const ZoneInfo = ({zone, idx}: {zone: Zone; idx: number}) => (
  <div data-testid="zone-info" className={`${css.zone} ${zoneCssClasses[idx]}`}>
    <div className={`${css.icon} ${css.vegetationIcon}`}>{vegetationIcons[zone.vegetation]}</div>
    <div className={`${css.icon} ${css.droughtIcon}`}>{droughtIcons[zone.droughtLevel]}</div>
    <div className={`${css.zoneText}`}>
      <div className={css.zoneName}>Zone {idx + 1}</div>
      <div className={css.terrain}>{terrainDisplayLabels[zone.terrainType]}</div>
    </div>
  </div>
);

export const SimulationInfo = observer(function WrappedComponent() {
  const { simulation } = useStores();
  const scaledWind = simulation.wind.speed / simulation.config.windScaleFactor;

  return (
    <div className={css.simulationInfo}>
      {
        simulation.zones.map((zone, idx) =>
          <ZoneInfo key={idx} idx={idx} zone={zone} />
        )
      }
      <div
        className={`${css.windContainer} ${simulation.windDidChange ? css.windDidChange : ""}`}
        data-testid="wind-meter"
      >
        <div className={css.windHeader}>Wind Meter</div>
        <div className={css.windText} data-testid="wind-meter-label">
            {`${Math.round(scaledWind)} MPH from the ${degToCompass(simulation.wind.direction)}`}
        </div>
        <div className={css.windDial} data-testid="wind-meter-dial">
          <WindDial windDirection={simulation.wind.direction} />
        </div>
      </div>
    </div>
  );
});
