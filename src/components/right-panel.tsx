import { inject, observer } from "mobx-react";
import React, { useEffect, useState } from "react";
import { BaseComponent, IBaseProps } from "./base";
import { RightPanelTab } from "./right-panel-tab";
import { Chart } from "../charts/components/chart";
import { useStores } from "../use-stores";
import * as css from "./right-panel.scss";
import { ChartDataModel } from "../charts/models/chart-data";
import { currentChart, setChartStyle, setChartProperties } from "../charts/chart-utils";

export type TabType = "graph";

const chartColor0 = "#ffb7f5";
const chartColor1 = "#6badff";
const chartColor2 = "#ffc085";
const borderDash0 = [];
const borderDash1 = [5, 5];
const borderDash2 = [10, 5];

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
    setChartProperties("Fire Area vs Time", "Time (hours)", "Area (Acres)");
  }
  const showChart = currentData != null;
  if (showChart && !hasSetColor && currentData.dataSets.length === simulation.zones.length) {
    for (let i = 0; i < simulation.zones.length; i++) {
      let zoneColor;
      let dashStyle;
      switch (i) {
        case 0:
          zoneColor = chartColor0;
          break;
        case 1:
          zoneColor = chartColor1;
          dashStyle = borderDash1;
          break;
        case 2:
          zoneColor = chartColor2;
          dashStyle = borderDash2;
          break;
        default:
          zoneColor = chartColor2;
          break;
      }
      setChartStyle(i, zoneColor, dashStyle);
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

  const axisLabelA1 = (label: any) => {
    return label;
  };

  const axisLabelA2 = (label: any) => {
    return label;
  };

  return (
    <div className={`${css.rightPanel} ${open ? css.open : ""}`} data-test="right-panel">
      <div className={css.rightPanelContent}>
        {showChart &&
          <div className={css.chartContainer}>
          <Chart
            title="Acres Burned vs. Time"
            chartType="line"
            chartData={currentData}
            isPlaying={simulation.simulationRunning}
            axisLabelA1Function={axisLabelA1}
            axisLabelA2Function={axisLabelA2} />
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
