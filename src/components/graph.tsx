import { observer } from "mobx-react";
import React, { useEffect } from "react";
import { useStores } from "../use-stores";
import { Chart } from "../charts/components/chart";
import css from "./graph.scss";
import { Annotation } from "../charts/models/chart-annotation";
import { DataPoint, ChartDataSet } from "../charts/models/chart-data-set";
import { AnnotationEventKind, FIRE_LINE_EVENT, HELITACK_EVENT } from "../charts/components/annotation-icons";
import { ChartDataModel } from "../charts/models/chart-data";

const chartColor0 = "#e85bd4";
const chartColor1 = "#2b95f0";
const chartColor2 = "#df7800";
const borderDash0 = [];
const borderDash1 = [5, 5];
const borderDash2 = [10, 5];

const defaultMaxPoints = 20;
const defaultMaxA1 = 20;
const defaultInitialMaxA1 = 20;
const defaultDownsampleMaxLength = 200;
const defaultDownsampleGrowWindow = 40;

const zoneStyles = [
  { color: chartColor0, dashStyle: undefined },
  { color: chartColor1, dashStyle: borderDash1 },
  { color: chartColor2, dashStyle: borderDash2 }
];

const createZoneDataSet = (chart: ChartDataModel, zoneIdx: number, points: DataPoint[]) => {
  const { color, dashStyle } = zoneStyles[Math.min(zoneIdx, zoneStyles.length - 1)];
  return new ChartDataSet({
    name: "Zone " + (zoneIdx + 1),
    dataPoints: points,
    color,
    dashStyle,
    maxPoints: defaultMaxPoints,
    downsample: true,
    downsampleMaxLength: defaultDownsampleMaxLength,
    downsampleGrowWindow: defaultDownsampleGrowWindow,
    display: true,
    initialMaxA1: defaultInitialMaxA1,
    fixedMinA2: 0,
    fixedMaxA2: 100,
    allowExpandA2: true,
    axisLabelA1: chart.defaultAxisLabelA1,
    axisLabelA2: chart.defaultAxisLabelA2,
    axisRoundValueA2: 10
  });
};

const buildEventAnnotation = (kind: AnnotationEventKind, hour: number, actionOrder: number) => new Annotation({
  type: "verticalLine",
  value: hour,
  eventKind: kind,
  actionOrder,
  thickness: 1,
  dashArray: kind === FIRE_LINE_EVENT ? borderDash1 : borderDash2
});

export const Graph = observer(function WrappedComponent() {
  const { simulation, chartStore, ui } = useStores();

  // A restored run draws its saved graph, so the effects that build the graph live skip it.
  useEffect(() => {
    // only add chart annotation after the simulation has been started
    if (simulation.timeInHours > 0 && !simulation.restoredRunEnded) {
      chartStore.chart.addAnnotation(
        buildEventAnnotation(FIRE_LINE_EVENT, simulation.timeInHours, simulation.fireLineActionOrder)
      );
    }
  }, [simulation.lastFireLineTimestamp]);

  useEffect(() => {
    if (simulation.timeInHours > 0 && !simulation.restoredRunEnded) {
      chartStore.chart.addAnnotation(
        buildEventAnnotation(HELITACK_EVENT, simulation.timeInHours, simulation.helitackActionOrder)
      );
    }
  }, [simulation.lastHelitackTimestamp]);

  useEffect(() => {
    if (!chartStore.chart.name || chartStore.chart.name.length === 0) {
      chartStore.chart.name = "Acres Burned vs. Time";
      chartStore.chart.defaultAxisLabelA1 = "Time (hours)";
      chartStore.chart.defaultAxisLabelA2 =  "Acres Burned (thousands)";
    }
    if (simulation.restoredRunEnded) return;
    chartStore.clearData();
    if (chartStore.chart?.dataSets) {
      if (chartStore.chart.dataSets.length < simulation.zones.length) {
        for (let i = 0; i < simulation.zones.length; i++) {
          updateChartData(i);
        }
      }
    }
  }, [simulation.dataReady]);

  useEffect(() => {
    if (simulation.dataReady && !simulation.restoredRunEnded) {
      // only add data once per hour, rather than each time tick
      for (let i = 0; i < simulation.zones.length; i++) {
        updateChartData(i);
      }
    }
  }, [simulation.timeInHours]);

  useEffect(() => {
    // Reset datasets when the number of zones changes.
    chartStore.chart.dataSets = [];
  }, [chartStore.chart, simulation.zonesCount]);

  // Declared after the zones-count effect, which empties the datasets when a restore changes the count.
  useEffect(() => {
    if (!simulation.restoredRunEnded) return;
    const { chart } = chartStore;
    chart.dataSets = chartStore.rawBurnData.map((samples, zoneIdx) => createZoneDataSet(
      chart, zoneIdx, samples.map(({ time, acres }) => new DataPoint({ a1: time, a2: Math.ceil(acres), label: "" }))
    ));
    chart.annotations = chartStore.restoredAnnotations.map(a => buildEventAnnotation(a.kind, a.hour, a.actionOrder));
  }, [chartStore, chartStore.restoreVersion, simulation.restoredRunEnded]);

  const updateChartData = (zoneIdx: number) => {
    // Burn acres is in thousands to simplify the y-axis
    const rawBurnAcres = simulation.simulationAreaAcres * simulation.getZoneBurnPercentage(zoneIdx) / 1000;
    const burnAcres = Math.ceil(rawBurnAcres);

    // Store unrounded values for precise burn rate computation in getOutcomeData()
    if (!chartStore.rawBurnData[zoneIdx]) {
      chartStore.rawBurnData[zoneIdx] = [];
    }
    const rawData = chartStore.rawBurnData[zoneIdx];
    const time = simulation.timeInHours;
    if (rawData.length === 0 || rawData[rawData.length - 1].time !== time) {
      rawData.push({ time, acres: rawBurnAcres });
    } else {
      rawData[rawData.length - 1].acres = rawBurnAcres;
    }

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
      const point = new DataPoint({ a1: simulation.timeInHours, a2: burnAcres, label: "" });
      chartStore.chart.dataSets.push(createZoneDataSet(chartStore.chart, zoneIdx, [point]));
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
      {chartStore.chart?.dataSets && chartStore.chart.dataSets.length > 0 &&
        <Chart
        title="Acres Burned vs. Time"
        chartType="line"
        // 381 (vs the 400 default) trims the chart so the green chart panel sits
        // with an even 10px gap on all four sides of the right panel at the
        // 1366x609 Chromebook viewport.
        height={381}
        isPlaying={simulation.simulationRunning}
        axisLabelA1Function={axisLabelA1}
        axisLabelA2Function={axisLabelA2} />
      }
    </div>
  );
});
