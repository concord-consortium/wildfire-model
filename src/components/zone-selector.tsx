import React from "react";
import { urlConfigWithDefaultValues } from "../config";
import { Zone } from "../models/zone";
import * as css from "./zone-selector.scss";
import { TerrainType } from "../models/fire-model";

interface IProps {
  zones: Zone[];
  selectedZone: number;
  readonly: boolean;
  onChange?: any;
}

const cssClasses = [css.zone1, css.zone2, css.zone3];

const getBackgroundImage = (zoneCount: number, terrainType: number, currentZone: number) => {
  const prefix = `./terrain/${zoneCount}-zone-`;
  const terrainStyle = TerrainType[terrainType].toLowerCase();
  const twoZonePosition = ["-left", "-right"];
  const threeZonePosition = ["-left", "-mid", "-right"];
  const panelPosition = zoneCount === 2 ? twoZonePosition[currentZone] : threeZonePosition[currentZone];
  return prefix + terrainStyle + panelPosition + ".png";
};

const getColorFilter = (moistureContent: number) => {
  const scaledMoistureContent = Math.round(moistureContent / urlConfigWithDefaultValues.moistureContentScale);
  switch (scaledMoistureContent) {
    case 1:
      return css.mildDrought;
    case 2:
      return css.mediumDrought;
    case 3:
      return css.severeDrought;
    default:
      return "";
  }
};

export const renderZones = (zones: Zone[], selectedZone: number, readonly: boolean, onChange: any) => {
  const zoneUI: any[] = [];
  // handle two, three (or more) zones
  zones.forEach((z, i) => {
    // can limit the number of zones via a url parameter
    if (i < urlConfigWithDefaultValues.zonesCount) {
      // Individual zones can only be edited on the first page of the wizard
      const zoneTerrainImagePath = getBackgroundImage(urlConfigWithDefaultValues.zonesCount, z.terrainType, i);
      const zoneStyle = readonly ? css.fixed : selectedZone === i ? css.selected : "";
      zoneUI.push(
        <div className={`${css.zone} ${cssClasses[i]} ${zoneStyle}`} key={i} >
          <label className={css.terrainPreview}>
            <input type="radio"
              className={css.zoneOption}
              value={i}
              checked={selectedZone === i}
              onChange={onChange}
              data-test="zone-option"
            />
            <div className={`${css.terrainImage} ${getColorFilter(z.moistureContent)}`}
              style={{ backgroundImage: `url(${zoneTerrainImagePath})` }}>
              <span className={`${css.zoneLabel} ${cssClasses[i]}`}>{`Zone ${i + 1}`}</span>
            </div>
          </label>
        </div>
      );
    }
  });
  return zoneUI;
};
