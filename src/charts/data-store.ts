import { ChartDataModel } from "./models/chart-data";
import { DataPoint, ChartDataSet } from "./models/chart-data-set";

const defaultMaxPoints = 200;
const defaultMaxA1 = 100;
const defaultDownsampleMaxLength = 10;
const defaultDownsampleGrowWindow = 40;

let chart: ChartDataModel = new ChartDataModel({
  name: "",
  dataSets: []
});

export const currentChart = (): ChartDataModel => {
  return chart;
};

export const addData = (
  px: number,
  py: number,
  seriesIndex: number,
  pointLabel: string = "",
  seriesName?: string,
  seriesColor?: string,
  maxPoints?: number,
  chartName?: string,
  axisLabelA1?: string,
  axisLabelA2?: string) => {
  if (chart) {
    if (chart.dataSets.length - 1 >= seriesIndex) {
      // we have a chart with existing datasets
      const ds = chart.dataSets[seriesIndex];
      if (ds.dataPoints) {
        ds.addOrUpdateDataPoint(px, py, pointLabel);
      }
    } else {
      const points = [];
      points.push(new DataPoint({ a1: px, a2: py, label: pointLabel }));
      addNewDataSetToChart(points, seriesName, seriesColor, maxPoints, axisLabelA1, axisLabelA2);
    }
  } else {
    const chartDataSets: ChartDataSet[] = [];
    const points = [];
    points.push(new DataPoint({ a1: px, a2: py, label: pointLabel }));
    chart = new ChartDataModel ({
      name: chartName ? chartName : "Chart1",
      dataSets: chartDataSets
    });
    addNewDataSetToChart(points, seriesName, seriesColor, maxPoints, axisLabelA1, axisLabelA2);
  }
};

const addNewDataSetToChart = (
  points: DataPoint[],
  seriesName?: string,
  seriesColor?: string,
  maxPoints?: number,
  axisLabelA1?: string,
  axisLabelA2?: string) => {
  const chartDataSets = chart.dataSets;
  chartDataSets.push(new ChartDataSet({
    name: seriesName ? seriesName : "",
    dataPoints: points,
    color: seriesColor,
    maxPoints: maxPoints ? maxPoints : defaultMaxPoints,
    downsample: false,
    downsampleMaxLength: defaultDownsampleMaxLength,
    downsampleGrowWindow: defaultDownsampleGrowWindow,
    display: true,
    fixedMaxA1: defaultMaxA1,
    fixedMinA2: 0,
    fixedMaxA2: 100,
    fixedMinA1: 0,
    axisLabelA1,
    axisLabelA2
  }));
};

export const setChartName = (name: string) => {
  chart.name = name;
};

export const clearData = () => {
  if (chart) {
    chart.dataSets = [];
  }
};

export const setChartColor = (idx: number, color: string) => {
  if (chart && chart.dataSets && chart.dataSets[idx]){
    chart.dataSets[idx].changeColor(color);
  }
};

export const getMockChartData = () => {
  const chartDataSets = [];
  const points = [];
  points.push(new DataPoint({ a1: 0, a2: 10, label: "alpha" }));
  points.push(new DataPoint({ a1: 20, a2: 20, label: "bravo" }));
  points.push(new DataPoint({ a1: 50, a2: 70, label: "charlie" }));

  chartDataSets.push(new ChartDataSet({
    name: "Sample Dataset1",
    dataPoints: points,
    color: "#ff0000",
    maxPoints: 80,
    downsample: true,
    downsampleMaxLength: 120,
    downsampleGrowWindow: 40,
    display: true
  }));

  const points2 = [];
  points2.push(new DataPoint({ a1: 0, a2: 30, label: "alpha" }));
  points2.push(new DataPoint({ a1: 30, a2: 40, label: "bravo" }));
  points2.push(new DataPoint({ a1: 60, a2: 90, label: "charlie" }));

  chartDataSets.push(new ChartDataSet({
    name: "Sample Dataset2",
    dataPoints: points2,
    color: "#00ff00",
    maxPoints: 80,
    downsample: true,
    downsampleMaxLength: 120,
    downsampleGrowWindow: 40,
    display: true
  }));

  chart = new ChartDataModel ({
    name: "Samples",
    dataSets: chartDataSets
  });
  return chart;
};
/*
const getChartDataFromSimulation = (simulation: SimulationModel) => {
  const chartDataSets: ChartDataSet[] = [];

  simulation.zones.forEach(zone => {
    const points: DataPoint[] = [];
    chartDataSets.push(new ChartDataSet ({
      name: zone.terrainType.toString(),
      dataPoints: points,
      maxPoints: 100,
      downsample: true,
      downsampleMaxLength: 120,
      downsampleGrowWindow: 40,
      display: true
    }));
  });
  let chart: ChartDataModel;
  chart = new ChartDataModel({
    name: "Fire Spread",
    dataSets: chartDataSets
  });
  return chart;
};
**/
