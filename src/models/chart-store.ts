import { observable, action } from "mobx";
import { ChartDataModel } from "../charts/models/chart-data";
import { DataPoint } from "../charts/models/chart-data-set";

export class ChartStore {

  public defaultMaxPoints = 20;
  public defaultMaxA1 = 20;
  @observable public chart: ChartDataModel;
  @observable public chartVersion = 1;

  constructor() {
    this.createNewChart();
  }

  @action.bound public reset = () => {
    this.chartVersion++;
    this.clearDataAndAnnotations();
  }
  @action.bound public clearData = () => {
    this.clearDataAndAnnotations();
  }

  private clearDataAndAnnotations = () => {
    for (const d of this.chart.dataSets) {
      d.clearDataPoints();
    }
    this.chart.annotations = [];
  }
  private createNewChart = () => {
    this.chart = new ChartDataModel({
      name: "",
      dataSets: [],
      defaultAxisLabelA1: "Time",
      defaultAxisLabelA2: "Value",
      defaultMaxPoints: this.defaultMaxPoints,
      defaultMaxA1: this.defaultMaxA1
    });
  }
}
