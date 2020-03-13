import { inject, observer } from "mobx-react";
import React, { useEffect, useState } from "react";
import { BaseComponent, IBaseProps } from "./base";
import { RightPanelTab } from "./right-panel-tab";
import { Chart } from "../charts/components/chart";
import { useStores } from "../use-stores";
import * as css from "./right-panel.scss";
import { ChartDataModel } from "../charts/models/chart-data";
import { currentChart, setChartColor } from "../charts/data-store";

export type MapType = "graph";

const chartColor0 = "#ffb7f5";
const chartColor1 = "#6badff";
const chartColor2 = "#ffc085";

interface IProps extends IBaseProps {}

interface IState {
  open: boolean;
  selectedTab: MapType;
}

export const RightPanel = observer(() => {
  const { simulation, ui } = useStores();
  const [open, setOpen ] = useState(false);
  const [selectedTab, setSelectedTab] = useState("graph");

  const currentData: ChartDataModel = currentChart();
  const showChart = currentData != null;
  if (showChart && currentData.dataSets.length === simulation.zones.length) {
    for (let i = 0; i < simulation.zones.length; i++) {
      const zoneColor = i === 0 ? chartColor0 : i === 2 ? chartColor1 : chartColor2;
      setChartColor(i, zoneColor);
    }
  }
  const handleToggleDrawer = (e: React.SyntheticEvent) => {
    if (e.currentTarget.id !== selectedTab) {
      setOpen(true);
      setSelectedTab(e.currentTarget.id as MapType);
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
        {showChart && <Chart title="chart" chartType="line" chartData={currentData}
          isPlaying={simulation.simulationRunning} />}
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
