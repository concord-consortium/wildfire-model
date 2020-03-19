import { observable, action } from "mobx";
import { ChartDataModel } from "../charts/models/chart-data";
import { DataPoint, ChartDataSet } from "../charts/models/chart-data-set";
import { Annotation } from "../charts/models/chart-annotation";

export class ChartModel {

  public defaultMaxPoints = 20;
  public defaultMaxA1 = 20;
  public defaultInitialMaxA1 = 20;
  public defaultDownsampleMaxLength = 200;
  public defaultDownsampleGrowWindow = 40;
  @observable public chart: ChartDataModel;

  constructor() {
    this.chart = new ChartDataModel({
      name: "",
      dataSets: [],
      defaultAxisLabelA1: "Time",
      defaultAxisLabelA2: "Value",
      defaultMaxPoints: this.defaultMaxPoints,
      defaultMaxA1: this.defaultMaxA1
    });
  }

  @action.bound public addData = (
    px: number,
    py: number,
    seriesIndex: number,
    pointLabel: string = "",
    seriesName?: string,
    seriesColor?: string,
    maxPoints?: number) => {
    if (this.chart) {
      if (this.chart.dataSets.length - 1 >= seriesIndex) {
        // we have a chart with existing datasets
        const ds = this.chart.dataSets[seriesIndex];
        if (ds.dataPoints) {
          ds.addOrUpdateDataPoint(px, py, pointLabel);
        }
      } else {
        const points = [];
        points.push(new DataPoint({ a1: px, a2: py, label: pointLabel }));
        this.addNewDataSetToChart(
          points,
          seriesName,
          seriesColor,
          maxPoints,
          this.chart.defaultAxisLabelA1,
          this.chart.defaultAxisLabelA2);
      }
    }
  }

  @action.bound public addNewDataSetToChart = (
    points: DataPoint[],
    seriesName?: string,
    seriesColor?: string,
    maxPoints?: number,
    axisLabelA1?: string,
    axisLabelA2?: string) => {
    const chartDataSets = this.chart.dataSets;
    chartDataSets.push(new ChartDataSet({
      name: seriesName ? seriesName : "",
      dataPoints: points,
      color: seriesColor,
      maxPoints: maxPoints ? maxPoints : this.defaultMaxPoints,
      downsample: true,
      downsampleMaxLength: this.defaultDownsampleMaxLength,
      downsampleGrowWindow: this.defaultDownsampleGrowWindow,
      display: true,
      initialMaxA1: maxPoints ? maxPoints : this.defaultInitialMaxA1,
      fixedMinA2: 0,
      fixedMaxA2: 100,
      expandOnly: true,
      axisLabelA1,
      axisLabelA2,
      axisRoundValueA2: 10
    }));
  }

  @action.bound public addAnnotation = (value: number, label: string) => {
    this.chart.addAnnotation(new Annotation({
      type: "verticalLine",
      value,
      label,
      labelXOffset: 0,
      labelYOffset: 30
    }));
  }

  @action.bound public setChartProperties = (name: string, labelA1: string, labelA2: string) => {
    this.chart.name = name;
    this.chart.defaultAxisLabelA1 = labelA1;
    this.chart.defaultAxisLabelA2 = labelA2;
  }

  @action.bound public clearData = () => {
    if (this.chart) {
      this.chart.dataSets = [];
      this.chart.annotations = [];
    }
  }

  @action.bound public setChartStyle = (idx: number, color: string, dashStyle?: number[]) => {
    if (this.chart && this.chart.dataSets && this.chart.dataSets[idx]) {
      this.chart.dataSets[idx].changeColor(color);
      if (dashStyle) this.chart.dataSets[idx].dashStyle = dashStyle;
    }
  }

  public getMockChartData = () => {
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

    this.chart = new ChartDataModel({
      name: "Samples",
      dataSets: chartDataSets
    });
    return this.chart;
  }
}
