import { observer } from "mobx-react";
import React, { useEffect, useState } from "react";
import { IBaseProps } from "./base";
import { Button } from "@mui/material";
import { renderZones } from "./zone-selector";
import { TerrainTypeSelector } from "./terrain-type-selector";
import { VegetationSelector } from "./vegetation-selector";
import { DroughtSelector } from "./drought-selector";
import { droughtLabels, DroughtLevel, terrainLabels, TerrainType, Vegetation, vegetationLabels } from "../types";
import { WindCircularControl } from "./wind-circular-control";
import { TerrainSummary } from "./terrain-summary";
import { log } from "@concord-consortium/lara-interactive-api";
import { useStores } from "../use-stores";
import { ZonesCountSelector } from "./zones-count-selector";

import css from "./terrain-panel.scss";
import { Zone } from "../models/zone";

const cssClasses = [css.zone1, css.zone2, css.zone3];

const panelClasses = [css.panel0, css.panel1, css.panel2];
const panelInstructions = [
  "Select the number of zones in your model",
  "Adjust variables in each zone",
  "Set initial wind direction and speed"
];

interface IProps extends IBaseProps { }

export const TerrainPanel: React.FC<IProps> = observer(function WrappedComponent() {
  const { ui, simulation, simulation: { config } } = useStores();
  // If zones.length is undefined, user might pick it in the first panel.
  const firstPanel = config.zonesCount === undefined ? 0 : 1;
  const [currentPanel, setCurrentPanel] = useState(firstPanel);
  const [zonesCount, setZonesCount] = useState<2 | 3>(simulation.zonesCount);
  const [zones, setZones] = useState<Zone[]>(simulation.zones.map(z => z.clone()));
  const [windSpeed, setWindSpeed] = useState<number>(simulation.wind.speed);
  const [windDirection, setWindDirection] = useState<number>(simulation.wind.direction);

  const selectedZone = ui.terrainUISelectedZone;
  const zone = zones[selectedZone];
  const displayVegetationType =
    zone.terrainType === TerrainType.Mountains ? zone.vegetation - 1 : zone.vegetation;

  useEffect(() => {
    // Reset internal state when terrain UI is closed
    if (!ui.showTerrainUI) {
      setCurrentPanel(firstPanel);
      setZonesCount(simulation.zonesCount);
      setZones(simulation.zones.map(z => z.clone()));
      setWindSpeed(simulation.wind.speed);
      setWindDirection(simulation.wind.direction);
    }
  }, [firstPanel, simulation.wind, simulation.zones, simulation.zones.length, simulation.zonesCount, ui.showTerrainUI]);

  const setSelectedZone = (value: number) => {
    ui.terrainUISelectedZone = value;
  };

  const handleClose = () => {
    ui.showTerrainUI = !ui.showTerrainUI;
    log("TerrainPanelClosed");
  };

  const applyAndClose = () => {
    ui.showTerrainUI = !ui.showTerrainUI;
    simulation.setWindSpeed(windSpeed);
    simulation.setWindDirection(windDirection);
    simulation.updateZones(zones);
    log("TerrainPanelSettingsSaved");
  };

  const handleZoneChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    // Radio buttons always return string values. We're using hidden radio buttons to change selected zone
    const newZone = parseInt(event.target.value, 10);
    if (newZone !== selectedZone) {
      setSelectedZone(newZone);
    }
    log("TerrainPanelZoneChanged", { zone: newZone });
  };

  const showNextPanel = () => {
    if (currentPanel === 0) {
      // Delay zones count change until user clicks "Next" button, as it might lead to some unavoidable user setup loss.
      applyZonesCountChange();
    }
    setCurrentPanel(val => val + 1);
    log("TerrainPanelNextButtonClicked");
  };

  const showPreviousPanel = () => {
    setCurrentPanel(val => val - 1);
    log("TerrainPanelPreviousButtonClicked");
  };

  const handleTerrainTypeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newTerrainType = parseInt(event.target.value, 10) as TerrainType;
    const currentZone = zones[selectedZone];
    const logData: any = { zone: selectedZone };
    if (currentZone.terrainType !== newTerrainType) {
      // Switching to Mountain terrain changes land type / vegetation options
      // but keeping the min / max options the same for each range helps with slider rendering.
      // Accommodate this by manual adjustment of land types when switching to-from mountain
      if (newTerrainType !== TerrainType.Mountains && currentZone.vegetation === Vegetation.ForestWithSuppression) {
        // switching from Mountains with large forests to lower land type, reduce forest size
        currentZone.vegetation = Vegetation.Forest;
        logData.vegetation = vegetationLabels[Vegetation.Forest];
      } else if (newTerrainType === TerrainType.Mountains && currentZone.vegetation === Vegetation.Grass) {
        // no grass allowed on mountains, switch to shrubs
        currentZone.vegetation = Vegetation.Shrub;
        logData.vegetation = vegetationLabels[Vegetation.Shrub];
      }
      currentZone.terrainType = newTerrainType;
      logData.terrain = terrainLabels[newTerrainType];
      log("ZoneUpdated", logData);
    }
  };

  const handleVegetationChange = (event: Event, value: number) => {
    if (zone.vegetation !== value) {
      zone.vegetation = value;
    }
  };

  const handleVegetationChangeCommitted = (event: Event, value: number) => {
    log("ZoneUpdated", { zone: selectedZone, vegetation: vegetationLabels[value as Vegetation] });
  };

  const handleDroughtChange = (event: Event, value: number) => {
    if (zone.droughtLevel !== value) {
      zone.droughtLevel = value;
    }
  };

  const handleDroughtChangeCommitted = (event: Event, value: number) => {
    log("ZoneUpdated", { zone: selectedZone, moisture: droughtLabels[value as DroughtLevel] });
  };

  const handleZonesCountChange = (event: React.ChangeEvent<HTMLInputElement>, value: string) => {
    const newZonesCount = parseInt(value, 10) as 2 | 3;
    setZonesCount(newZonesCount);
  };

  const applyZonesCountChange = () => {
    if (zonesCount !== zones.length) {
      // In this case reset zones to their default properties. We cannot reuse previous settings,
      // as 3 zones dialog doesn't have terrain type selection and we could end up with unsupported configuration.
      const newZones = config.zones.map(options => new Zone(options));
      newZones.length = zonesCount;
      setZones(newZones);
      log("ZonesCountChanged", { count: zonesCount });
    }
  };

  const renderZoneTerrainTypeLabels = () => {
    const labels: any[] = [];
    zones.forEach((z, i) => {
      labels.push(<div className={css.terrainTypeLabel} key={i}>{terrainLabels[z.terrainType]}</div>);
    });
    return labels;
  };

  const renderTerrainProperties = () => {
    const labels: any[] = [];

    zones.forEach((z, i) => {
      labels.push(
        <TerrainSummary vegetationType={z.vegetation} droughtLevel={z.droughtLevel} key={i} />
      );
    });
    return labels;
  };

  return (
    <div className={`${css.terrain} ${ui.showTerrainUI ? "" : css.disabled}`}>
      {
        ui.showTerrainUI &&
        <div className={`${css.background} ${cssClasses[selectedZone]} ${panelClasses[currentPanel]}`}>
          <div className={css.closeButton} onClick={handleClose}>X</div>
          <div className={css.header} data-testid="terrain-header">Terrain Setup</div>
          <div className={css.instructions}>
            <span className={css.setupStepIcon}>{firstPanel === 0 ? currentPanel + 1 : currentPanel}</span>
            { panelInstructions[currentPanel] }
          </div>
          {
            currentPanel === 0 &&
            <div className={css.panel}>
              <div className={css.zones.lengthSelector}>
                <ZonesCountSelector zonesCount={zonesCount} onChange={handleZonesCountChange} />
              </div>
              <div className={css.buttonContainer}>
                <Button className={css.continueButton} onClick={showNextPanel}>
                  Next
                </Button>
              </div>
            </div>
          }
          {
            currentPanel !== 0 &&
            <div className={css.zones}>
            {
              renderZones(
                zones,
                selectedZone,
                currentPanel === 2,
                zones.length,
                handleZoneChange
              )
            }
            </div>
          }
          {
            currentPanel === 1 &&
            <div className={css.panel}>
              <div className={css.terrainSelector}>
                {zones.length > 2 &&
                  <div className={css.terrainTypeLabels}>{renderZoneTerrainTypeLabels()}</div>
                }
                {!config.elevation && zones.length === 2 &&
                  <TerrainTypeSelector
                    terrainType={zone.terrainType}
                    onChange={handleTerrainTypeChange} />
                }
              </div>
              <div className={css.selectors}>
                <div className={css.selector}>
                  <VegetationSelector
                    vegetation={displayVegetationType}
                    terrainType={zone.terrainType}
                    onChange={handleVegetationChange}
                    onChangeCommitted={handleVegetationChangeCommitted}
                    forestWithSuppressionAvailable={config.forestWithSuppressionAvailable}
                  />
                </div>
                <div className={css.selector}>
                  <DroughtSelector
                    droughtLevel={zone.droughtLevel}
                    onChange={handleDroughtChange}
                    onChangeCommitted={handleDroughtChangeCommitted}
                    severeDroughtAvailable={simulation.config.severeDroughtAvailable}
                    disabled={simulation.config.droughtIndexLocked}
                  />
                </div>
              </div>
              <div className={css.buttonContainer}>
                {
                  firstPanel === 0 &&
                  <Button className={css.continueButton} onClick={showPreviousPanel}>
                    Previous
                  </Button>
                }
                <Button className={css.continueButton} onClick={showNextPanel}>
                  Next
                </Button>
              </div>
            </div>
          }
          {
            currentPanel === 2 &&
            <div className={css.panel}>
              <div className={css.terrainTypeLabels}>{renderZoneTerrainTypeLabels()}</div>
              <div className={css.terrainProperties}>{renderTerrainProperties()}</div>
              <div className={css.wind}>
                <WindCircularControl
                  speed={windSpeed}
                  direction={windDirection}
                  onSpeedChange={setWindSpeed}
                  onDirectionChange={setWindDirection}
                  windScaleFactor={config.windScaleFactor}
                />
              </div>
              <div className={css.buttonContainer}>
                <Button className={css.continueButton} onClick={showPreviousPanel}>
                  Previous
                </Button>
                <Button className={css.continueButton} onClick={applyAndClose}>
                  Create
                </Button>
              </div>
            </div>
          }
        </div>
      }
    </div>
  );
});
