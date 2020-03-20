import { observer } from "mobx-react";
import React, { useEffect, useState } from "react";
import { RightPanelTab } from "./right-panel-tab";
import { Chart } from "../charts/components/chart";
import { useStores } from "../use-stores";
import * as css from "./right-panel.scss";
import { Interaction } from "../models/ui";

export type TabType = "graph";

const chartColor0 = "#ffb7f5";
const chartColor1 = "#6badff";
const chartColor2 = "#ffc085";
const borderDash0 = [];
const borderDash1 = [5, 5];
const borderDash2 = [10, 5];

export const RightPanel = observer(function WrappedComponent() {
  const { simulation, chartData, ui } = useStores();
  const [open, setOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState("graph");

  useEffect(() => {
    if (ui.interaction === Interaction.DrawFireLine) {
      const timeInHours = Math.round(simulation.time / 60);
      chartData.addAnnotation(timeInHours, "🪓");
    }
  }, [ui.interaction]);

  useEffect(() => {
    // Convert time from minutes to hours.
    const timeInHours = Math.round(simulation.time / 60);
    for (let i = 0; i < simulation.zones.length; i++) {
      const burnedCells = simulation.burnedCellsInZone[i] ? simulation.burnedCellsInZone[i] : 0;
      const burnPercentage = burnedCells / simulation.totalCellCountByZone[i];
      chartData.addData(
        timeInHours,
        Math.ceil(simulation.simulationAreaAcres * burnPercentage),
        i,
        undefined,
        `Zone ${i + 1}`);
    }
  }, [simulation.time]);

  useEffect(() => {
    if (!chartData.chart.name || chartData.chart.name.length === 0) {
      chartData.setChartProperties("Fire Area vs Time", "Time (hours)", "Area (Acres)");
    }
    if (chartData.chart.dataSets.length !== simulation.zones.length) {
      const timeInHours = Math.round(simulation.time / 60);
      for (let i = 0; i < simulation.zones.length; i++) {
        if (!chartData.chart.dataSets[i]) {
          const burnedCells = simulation.burnedCellsInZone[i] ? simulation.burnedCellsInZone[i] : 0;
          const burnPercentage = burnedCells / simulation.totalCellCountByZone[i];
          chartData.addData(
            timeInHours,
            Math.ceil(simulation.simulationAreaAcres * burnPercentage),
            i,
            undefined,
            `Zone ${i + 1}`);
        }
      }
    }
    // update chart colors
    updateChartColors();
  }, [open, simulation.simulationStarted]);

  const updateChartColors = () => {
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
      chartData.setChartStyle(i, zoneColor, dashStyle);
    }
  };

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
        <div className={css.chartContainer}>
          {chartData.chart && chartData.chart.dataSets &&
            <Chart
              title="Acres Burned vs. Time"
              chartType="line"
              chartData={chartData.chart}
              isPlaying={simulation.simulationRunning}
              axisLabelA1Function={axisLabelA1}
              axisLabelA2Function={axisLabelA2} />
          }
        </div>
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
