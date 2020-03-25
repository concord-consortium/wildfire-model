import { observer } from "mobx-react";
import React, { useEffect } from "react";
import { useStores } from "../use-stores";
import { Interaction } from "../models/ui";
import { Chart } from "../charts/components/chart";
import * as css from "./graph.scss";
import { ChartDataModel } from "../charts/models/chart-data";
import { Annotation } from "../charts/models/chart-annotation";
import { DataPoint, ChartDataSet } from "../charts/models/chart-data-set";

const chartColor0 = "#ffb7f5";
const chartColor1 = "#6badff";
const chartColor2 = "#ffc085";
const borderDash0 = [];
const borderDash1 = [5, 5];
const borderDash2 = [10, 5];

const defaultMaxPoints = 20;
const defaultMaxA1 = 20;
const defaultInitialMaxA1 = 20;
const defaultDownsampleMaxLength = 200;
const defaultDownsampleGrowWindow = 40;

export const Graph = observer(function WrappedComponent() {
  const { simulation, chartStore, ui } = useStores();

  useEffect(() => {
    if (ui.interaction === Interaction.DrawFireLine) {
      chartStore.chart.addAnnotation(new Annotation({
        type: "verticalLine",
        value: simulation.timeInHours,
        label: "🪓",
        labelXOffset: 0,
        labelYOffset: 4,
        labelPosition: "top",
        labelBackgroundColor: "rgba(255,255,255,0.3)",
        // tslint:disable-next-line:max-line-length
        fontFamily: "Noto Color Emoji, Apple Color Emoji, Segoe UI Emoji, Times, Symbola, Aegyptus, Code2000, Code2001, Code2002, Musica, serif, LastResort"
      }));
    }
  }, [ui.interaction]);

  useEffect(() => {
    chartStore.clearData();
    if (!chartStore.chart.name || chartStore.chart.name.length === 0) {
      chartStore.chart.name = "Acres Burned vs. Time";
      chartStore.chart.defaultAxisLabelA1 = "Time (hours)";
      chartStore.chart.defaultAxisLabelA2 =  "Acres Burned";
    }
    if (chartStore.chart && chartStore.chart.dataSets) {
      if (chartStore.chart.dataSets.length < simulation.zones.length) {
        for (let i = 0; i < simulation.zones.length; i++) {
          updateChartData(i);
        }
      }
      updateChartColors();
    }
  }, [simulation.dataReady, chartStore.chartVersion]);

  useEffect(() => {
    if (simulation.dataReady) {
      // only add data once per hour, rather than each time tick
      for (let i = 0; i < simulation.zones.length; i++) {
        updateChartData(i);
      }
    }
  }, [simulation.timeInHours]);

  const updateChartData = (zoneIdx: number) => {
    const burnedCells = simulation.burnedCellsInZone && simulation.burnedCellsInZone[zoneIdx] ?
      simulation.burnedCellsInZone[zoneIdx] : 0;
    const burnPercentage = burnedCells / simulation.totalCellCountByZone[zoneIdx];
    const burnAcres = Math.ceil(simulation.simulationAreaAcres * burnPercentage);

    if (zoneIdx <= chartStore.chart.dataSets.length - 1) {
      // we have a chart with existing datasets that contains this zone
      const ds = chartStore.chart.dataSets[zoneIdx];
      if (ds.dataPoints) {
        ds.addOrUpdateDataPoint(simulation.timeInHours, burnAcres);
        if (ds.currentMaxA2 && burnAcres > ds.currentMaxA2) {
          ds.currentMaxA2 = burnAcres;
        }
      }
    } else {
      const points = [];
      points.push(new DataPoint({ a1: simulation.timeInHours, a2: burnAcres, label: "" }));
      const newDataset = new ChartDataSet({
        name: "Zone " + (zoneIdx + 1),
        dataPoints: points,
        color: chartColor0,
        maxPoints: defaultMaxPoints,
        downsample: true,
        downsampleMaxLength: defaultDownsampleMaxLength,
        downsampleGrowWindow: defaultDownsampleGrowWindow,
        display: true,
        initialMaxA1: defaultInitialMaxA1,
        fixedMinA2: 0,
        fixedMaxA2: 100,
        allowExpandA2: true,
        axisLabelA1: chartStore.chart.defaultAxisLabelA1,
        axisLabelA2: chartStore.chart.defaultAxisLabelA2,
        axisRoundValueA2: 10
      });
      chartStore.chart.dataSets.push(newDataset);
    }
  };

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
      chartStore.chart.dataSets[i].changeColor(zoneColor);
      chartStore.chart.dataSets[i].dashStyle = dashStyle;
    }
  };

  const axisLabelA1 = (label: any) => {
    return label;
  };

  const axisLabelA2 = (label: any) => {
    return label;
  };

  return (
    <div className={css.chartContainer}>
      {chartStore.chart && chartStore.chart.dataSets && chartStore.chart.dataSets.length > 0 &&
        <Chart
        title="Acres Burned vs. Time"
        chartType="line"
        isPlaying={simulation.simulationRunning}
        axisLabelA1Function={axisLabelA1}
        axisLabelA2Function={axisLabelA2} />
      }
    </div>
  );
});
