import React, { useEffect } from "react";
import { observer } from "mobx-react";
import { reaction } from "mobx";
import { View3d } from "./view-3d/view-3d";
import { SimulationInfo } from "./simulation-info";
import { TerrainPanel } from "./terrain-panel";
import { RightPanel } from "./right-panel";
import { BottomBar } from "./bottom-bar";
import { useStores } from "../use-stores";
import { TopBar } from "./top-bar/top-bar";
import { AboutDialogContent } from "./top-bar/about-dialog-content";
import { ShareDialogContent } from "./top-bar/share-dialog-content";
import { LogMonitor } from "@concord-consortium/log-monitor";
import { getUrlConfig } from "../config";
import { log } from "../log";
import Shutterbug from "shutterbug";

import css from "./app.scss";
import { useCustomCursor } from "./use-custom-cursors";

const { logMonitor } = getUrlConfig();

const getMousePosition = (e: React.MouseEvent) => {
  const rect = e.currentTarget.getBoundingClientRect();
  return {
    clientX: e.clientX,
    clientY: e.clientY,
    percentX: Math.round(((e.clientX - rect.left) / rect.width) * 100),
    percentY: Math.round(((e.clientY - rect.top) / rect.height) * 100)
  };
};

const handleMouseEnter = (e: React.MouseEvent) => {
  log("SimulationMouseEnter", getMousePosition(e));
};

const handleMouseLeave = (e: React.MouseEvent) => {
  log("SimulationMouseLeave", getMousePosition(e));
};

export const AppComponent = observer(function WrappedComponent() {
  const { simulation, ui, chartStore } = useStores();

  useEffect(() => {
    Shutterbug.enable("." + css.app);
    return () => {
      Shutterbug.disable();
    };
  }, []);

  // MobX reaction for natural simulation end (fire burned out)
  useEffect(() => {
    const dispose = reaction(
      () => ({
        running: simulation.simulationRunning,
        fireDidStop: simulation.engine?.fireDidStop
      }),
      ({ running, fireDidStop }, prev) => {
        if (prev.running && !running && fireDidStop && !simulation.simulationEndedLogged) {
          simulation.simulationEndedLogged = true;
          log("SimulationEnded", {
            reason: "ByItself",
            outcome: simulation.getOutcomeData(chartStore)
          });
        }
      }
    );
    return dispose;
  }, [simulation, chartStore]);

  // This will setup document cursor based on various states of UI store (interactions).
  useCustomCursor();

  const config = simulation.config;
  // Convert time from minutes to days.
  const timeInDays = Math.floor(simulation.time / 1440);
  const timeHours = Math.floor((simulation.time % 1440) / 60);
  const showModelScale = config.showModelDimensions;

  const content = (
    <div
      className={css.app}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <TopBar projectName="Wildfire Explorer" aboutContent={<AboutDialogContent />} shareContent={<ShareDialogContent />} />
      { showModelScale &&
        <div className={css.modelInfo}>
          <div>Model Dimensions: { config.modelWidth } ft x { config.modelHeight } ft</div>
          <div>Highest Point Possible: {config.heightmapMaxElevation} ft</div>
        </div>
      }
      <div className={css.timeDisplay}>
        {timeInDays} {timeInDays === 1 ? "day" : "days"} and <br /> {timeHours} {timeHours === 1 ? "hour" : "hours"}
      </div>
      <div className={`${css.mainContent} ${ui.showChart && css.shrink}`}>
        <SimulationInfo />
        <View3d />
        <TerrainPanel />
      </div>
      <div className={`${css.rightContent} ${ui.showChart && css.grow}`}>
        <RightPanel />
      </div>
      <BottomBar />
    </div>
  );

  return (
    <div style={logMonitor ? { display: "flex", width: "100%", height: "100%" } : { width: "100%", height: "100%" }}>
      {logMonitor
        ? <div style={{ flex: 1, overflow: "hidden", position: "relative", transform: "scale(1)" }}>{content}</div>
        : content
      }
      {logMonitor && <LogMonitor logFilePrefix="wildfire-log-events" />}
    </div>
  );
});
