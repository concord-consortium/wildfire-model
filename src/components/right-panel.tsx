import { inject, observer } from "mobx-react";
import React, { useEffect, useState } from "react";
import { BaseComponent, IBaseProps } from "./base";
import { RightPanelTab } from "./right-panel-tab";
import { Chart } from "../charts/components/chart";
import { useStores } from "../use-stores";
import * as css from "./right-panel.scss";
import { ChartDataModel } from "../charts/models/chart-data";
import { currentChart, setChartColor, setChartName } from "../charts/data-store";

export type TabType = "graph";

const chartColor0 = "#ffb7f5";
const chartColor1 = "#6badff";
const chartColor2 = "#ffc085";

export const RightPanel = observer(() => {
  const { simulation, ui } = useStores();
  const [open, setOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState("graph");
  const [hasSetColor, setHasSetColor] = useState(false);

  useEffect(() => {
    setHasSetColor(false);
  }, [simulation.simulationRunning]);

  const currentData: ChartDataModel = currentChart();
  if (!currentData.name || currentData.name.length === 0) {
    setChartName("Fire Area vs Time");
  }
  const showChart = currentData != null;
  if (showChart && !hasSetColor && currentData.dataSets.length === simulation.zones.length) {
    for (let i = 0; i < simulation.zones.length; i++) {
      const zoneColor = i === 0 ? chartColor0 : i === 2 ? chartColor1 : chartColor2;
      setChartColor(i, zoneColor);
    }
    setHasSetColor(true);
  }
  const handleToggleDrawer = (e: React.SyntheticEvent) => {
    if (e.currentTarget.id !== selectedTab) {
      setOpen(true);
      setSelectedTab(e.currentTarget.id as TabType);
      ui.showChart = true;
    } else {
      const isOpen = !open;
      setOpen(isOpen);
      ui.showChart = isOpen;
    }
  };

  return (
    <div className={`${css.rightPanel} ${open ? css.open : ""}`} data-test="right-panel">
      <div className={css.rightPanelContent}>
        <div className={css.title}>Graph</div>
        {showChart &&
          <div className={css.chartContainer}>
            <Chart title="chart" chartType="line" chartData={currentData}
              isPlaying={simulation.simulationRunning} />
          </div>
        }
      </div>
      <ul className={css.rightPanelTabs}>
        <li>
          <div id="base" className={css.rightPanelTab} onClick={handleToggleDrawer}>
            <RightPanelTab tabType="graph" active={selectedTab === "graph" || !open} />
          </div>
        </li>
      </ul>
    </div>
  );
});
