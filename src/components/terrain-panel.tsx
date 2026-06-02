import { observer } from "mobx-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { IBaseProps } from "./base";
import { Button } from "@mui/material";
import { renderZones } from "./zone-selector";
import { TerrainTypeSelector } from "./terrain-type-selector";
import { VegetationSelector } from "./vegetation-selector";
import { DroughtSelector } from "./drought-selector";
import { droughtLabels, DroughtLevel, terrainLabels, TerrainType, Vegetation, vegetationLabels } from "../types";
import { WindCircularControl } from "./wind-circular-control";
import { TerrainSummary } from "./terrain-summary";
import { log } from "../log";
import { useStores } from "../use-stores";
import { ZonesCountSelector } from "./zones-count-selector";
import { ISetupSnapshot, captureSimulationSnapshot, setupSnapshotDiffers } from "./setup-snapshot";
import CloseIcon from "../assets/setup-close.svg";

import css from "./terrain-panel.scss";
import { Zone } from "../models/zone";

const cssClasses = [css.zone1, css.zone2, css.zone3];

const panelClasses = [css.panel0, css.panel1, css.panel2];
const panelInstructions = [
  <>Select the <b>number of zones</b> in your model</>,
  <>Adjust conditions in <b>each zone</b></>,
  <>Set initial <b>wind direction</b> and <b>wind speed</b></>
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
  const [selectedZone, setSelectedZone] = useState<number>(ui.terrainUISelectedZone || 0);
  const openSnapshotRef = useRef<ISetupSnapshot | null>(null);

  const zone = zones[selectedZone];
  const displayVegetationType =
    zone.terrainType === TerrainType.Mountains ? zone.vegetation - 1 : zone.vegetation;

  useEffect(() => {
    // ui.terrainUISelectedZone is set by external Zone Info buttons. We need to update internal state accordingly
    // when it's possible.
    if (ui.terrainUISelectedZone !== undefined) {
      if (ui.terrainUISelectedZone < zones.length) {
        setSelectedZone(ui.terrainUISelectedZone);
        setCurrentPanel(1); // Show zone panel
      }
      ui.terrainUISelectedZone = undefined;
    }
  }, [ui, ui.terrainUISelectedZone, zones.length]);

  useEffect(() => {
    // Reset internal state when terrain UI is closed
    if (!ui.showTerrainUI) {
      setCurrentPanel(firstPanel);
      setZonesCount(simulation.zonesCount);
      setZones(simulation.zones.map(z => z.clone()));
      setWindSpeed(simulation.wind.speed);
      setWindDirection(simulation.wind.direction);
      setSelectedZone(0);
    }
  }, [firstPanel, setSelectedZone, simulation.wind, simulation.zones, simulation.zones.length, simulation.zonesCount, ui.showTerrainUI]);

  useEffect(() => {
    // Capture snapshot when the wizard opens. Polarity opposite the close-time
    // reset effect above — that one fires when ui.showTerrainUI flips to false;
    // this one fires when it flips to true (and also on initial mount when
    // showTerrainUI is already true).
    //
    // Observable reads inside captureSimulationSnapshot are intentionally
    // untracked — useEffect callbacks run outside MobX-React's observer
    // tracking scope (which only tracks reads during render), so this snapshot
    // is a genuine point-in-time capture that won't re-trigger on later
    // simulation.zones / simulation.wind mutations. Combined with useRef (no
    // render on write), there is no render → effect → snapshot → render loop.
    //
    // Reactivity dependency: this effect's re-run on `ui.showTerrainUI` change
    // relies on `TerrainPanel` being wrapped in `observer`. The dep-array read
    // of an observable only triggers a re-render — and thus a dep-array
    // re-evaluation by React — because of `observer`. A refactor that unwraps
    // `observer` must replace this useEffect with a MobX `reaction`/`autorun`,
    // or the snapshot-refresh-on-reopen path silently breaks.
    if (ui.showTerrainUI) {
      openSnapshotRef.current = captureSimulationSnapshot(simulation);
    }
  }, [simulation, ui.showTerrainUI]);

  const handleClose = () => {
    ui.showTerrainUI = !ui.showTerrainUI;
    log("TerrainPanelClosed");
  };

  const applyAndClose = () => {
    ui.showTerrainUI = !ui.showTerrainUI;
    // Diff the open-time snapshot against the local wizard state BEFORE
    // calling the simulation.* mutators. Computing the diff after the mutators
    // run would always see an empty diff because the simulation would now
    // match the local wizard state.
    const snapshot = openSnapshotRef.current;
    if (snapshot) {
      const changed = setupSnapshotDiffers(snapshot, {
        zonesCount,
        zones,
        windSpeed,
        windDirection,
      });
      if (changed) {
        simulation.setSetupChanged(true);
      }
    }
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
      log("TerrainPanelZoneChanged", { zone: newZone });
    }
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
    if (zone.terrainType !== newTerrainType) {
      const newZones = zones.map(z => z.clone());
      const logData: any = { zone: selectedZone };
      // Switching to Mountain terrain changes land type / vegetation options
      // but keeping the min / max options the same for each range helps with slider rendering.
      // Accommodate this by manual adjustment of land types when switching to-from mountain
      if (newTerrainType !== TerrainType.Mountains && zone.vegetation === Vegetation.ForestWithSuppression) {
        // switching from Mountains with large forests to lower land type, reduce forest size
        newZones[selectedZone].vegetation = Vegetation.Forest;
        logData.vegetation = vegetationLabels[Vegetation.Forest];
      } else if (newTerrainType === TerrainType.Mountains && zone.vegetation === Vegetation.Grass) {
        // no grass allowed on mountains, switch to shrubs
        newZones[selectedZone].vegetation = Vegetation.Shrub;
        logData.vegetation = vegetationLabels[Vegetation.Shrub];
      }
      newZones[selectedZone].terrainType = newTerrainType;
      setZones(newZones);
      logData.terrain = terrainLabels[newTerrainType];
      log("ZoneUpdated", logData);
    }
  };

  const handleVegetationChange = (event: Event, value: number) => {
    if (zone.vegetation !== value) {
      const newZones = zones.map(z => z.clone());
      newZones[selectedZone].vegetation = value;
      setZones(newZones);
    }
  };

  const handleVegetationChangeCommitted = (event: Event, value: number) => {
    log("ZoneUpdated", { zone: selectedZone, vegetation: vegetationLabels[value as Vegetation] });
  };

  const handleDroughtChange = (event: Event, value: number) => {
    if (zone.droughtLevel !== value) {
      const newZones = zones.map(z => z.clone());
      newZones[selectedZone].droughtLevel = value;
      setZones(newZones);
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
      setSelectedZone(0);
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
          <button
            type="button"
            className={css.closeButton}
            data-testid="terrain-panel-close"
            aria-label="Close setup"
            onClick={handleClose}
          >
            <CloseIcon className={css.closeIcon} />
          </button>
          <div className={css.header} data-testid="terrain-header"><span>Setup</span></div>
          <div className={css.instructions}>
            <span className={css.setupStepIcon}>{firstPanel === 0 ? currentPanel + 1 : currentPanel}</span>
            <span className={css.instructionsText}>{ panelInstructions[currentPanel] }</span>
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
              <div className={css.terrainSelector}>
                <div className={css.terrainTypeLabels}>{renderZoneTerrainTypeLabels()}</div>
              </div>
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
                <Button className={`${css.continueButton} ${css.createButton}`} onClick={applyAndClose}>
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
