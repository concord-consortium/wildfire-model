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

import css from "./terrain-panel.scss";

const cssClasses = [css.zone1, css.zone2, css.zone3];

interface IProps extends IBaseProps { }

export const TerrainPanel: React.FC<IProps> = observer(function WrappedComponent() {
  const [currentPanel, setCurrentPanel] = useState(1);
  const { ui, simulation, simulation: { config } } = useStores();

  const selectedZone = ui.terrainUISelectedZone;
  const zone = simulation.zones[selectedZone];
  const displayVegetationType =
    zone.terrainType === TerrainType.Mountains ? zone.vegetation - 1 : zone.vegetation;
  const panelClass = currentPanel === 1 ? css.panel1 : css.panel2;
  const panelInstructions = currentPanel === 1 ? "Adjust variables in each zone" : "Set initial wind direction and speed";

  useEffect(() => {
    // Reset panel to 1 when terrain UI is closed
    if (!ui.showTerrainUI && currentPanel === 2) {
      setCurrentPanel(1);
    }
  }, [currentPanel, ui.showTerrainUI]);

  const setSelectedZone = (value: number) => {
    ui.terrainUISelectedZone = value;
  };

  const handleClose = () => {
    ui.showTerrainUI = !ui.showTerrainUI;
    log("TerrainPanelClosed");
  };

  const applyAndClose = () => {
    ui.showTerrainUI = !ui.showTerrainUI;
    simulation.populateCellsData();
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
    setCurrentPanel(2);
    log("TerrainPanelNextButtonClicked");
  };

  const showPreviousPanel = () => {
    setCurrentPanel(1);
    log("TerrainPanelPreviousButtonClicked");
  };

  const handleTerrainTypeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newTerrainType = parseInt(event.target.value, 10) as TerrainType;
    const currentZone = simulation.zones[selectedZone];
    const logData: any = { zone: selectedZone };
    if (currentZone.terrainType !== newTerrainType) {
      // Switching to Mountain terrain changes land type / vegetation options
      // but keeping the min / max options the same for each range helps with slider rendering.
      // Accommodate this by manual adjustment of land types when switching to-from mountain
      if (newTerrainType !== TerrainType.Mountains && currentZone.vegetation === Vegetation.ForestWithSuppression) {
        // switching from Mountains with large forests to lower land type, reduce forest size
        simulation.updateZoneVegetation(selectedZone, Vegetation.Forest);
        logData.vegetation = vegetationLabels[Vegetation.Forest];
      } else if (newTerrainType === TerrainType.Mountains && currentZone.vegetation === Vegetation.Grass) {
        // no grass allowed on mountains, switch to shrubs
        simulation.updateZoneVegetation(selectedZone, Vegetation.Shrub);
        logData.vegetation = vegetationLabels[Vegetation.Shrub];
      }
      simulation.updateZoneTerrain(selectedZone, newTerrainType);
      logData.terrain = terrainLabels[newTerrainType];
      log("ZoneUpdated", logData);
    }
  };

  const handleVegetationChange = (event: Event, value: number) => {
    if (zone.vegetation !== value) {
      simulation.updateZoneVegetation(selectedZone, value);
    }
  };

  const handleVegetationChangeCommitted = (event: Event, value: number) => {
    log("ZoneUpdated", { zone: selectedZone, vegetation: vegetationLabels[value as Vegetation] });
  };

  const handleDroughtChange = (event: Event, value: number) => {
    if (zone.droughtLevel !== value) {
      simulation.updateZoneMoisture(selectedZone, value);
    }
  };

  const handleDroughtChangeCommitted = (event: Event, value: number) => {
    log("ZoneUpdated", { zone: selectedZone, moisture: droughtLabels[value as DroughtLevel] });
  };

  const renderZoneTerrainTypeLabels = () => {
    const labels: any[] = [];
    simulation.zones.forEach((z, i) => {
      if (i < config.zonesCount) {
        labels.push(<div className={css.terrainTypeLabel} key={i}>{terrainLabels[z.terrainType]}</div>);
      }
    });
    return labels;
  };

  const renderTerrainProperties = () => {
    const labels: any[] = [];

    simulation.zones.forEach((z, i) => {
      if (i < config.zonesCount) {
        labels.push(
          <TerrainSummary vegetationType={z.vegetation} droughtLevel={z.droughtLevel} key={i} />
        );
      }
    });
    return labels;
  };

  return (
    <div className={`${css.terrain} ${ui.showTerrainUI ? "" : css.disabled}`}>
      {ui.showTerrainUI &&
        <div className={`${css.background} ${cssClasses[selectedZone]} ${panelClass}`}>
          <div className={css.closeButton} onClick={handleClose}>X</div>
          <div className={css.header} data-testid="terrain-header">Terrain Setup</div>
          <div className={css.instructions}>
            <span className={css.setupStepIcon}>{currentPanel}</span>{panelInstructions}
          </div>
          <div className={css.zones}>
            {
              renderZones(
                simulation.zones,
                selectedZone,
                currentPanel === 2,
                config,
                handleZoneChange
              )
            }
          </div>
          {
            currentPanel === 1 &&
            <div className={css.panel}>
              <div className={css.terrainSelector}>
                {config.zonesCount > 2 && simulation.zones.length > 2 &&
                  <div className={css.terrainTypeLabels}>{renderZoneTerrainTypeLabels()}</div>
                }
                {!config.elevation && config.zonesCount === 2 &&
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
                <WindCircularControl />
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
