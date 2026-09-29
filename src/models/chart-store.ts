import { observable, action, makeObservable } from "mobx";
import { ChartDataModel } from "../charts/models/chart-data";
import type { ISavedAnnotation, ISavedRunState } from "./saved-state";

export interface IRawBurnDataPoint {
  time: number;       // simulated hours
  acres: number;      // thousands of acres, unrounded
}

export class ChartStore {

  public defaultMaxPoints = 20;
  public defaultMaxA1 = 20;
  @observable public chart: ChartDataModel;
  @observable public chartVersion = 1;
  // Raw (unrounded) burn data per zone, for precise burn rate computation.
  // The chart's dataPoints use Math.ceil which destroys precision.
  public rawBurnData: IRawBurnDataPoint[][] = [];
  // Bumped by restoreBurnData so the graph rebuilds its datasets and markers from a saved run.
  @observable public restoreVersion = 0;
  public restoredAnnotations: ISavedAnnotation[] = [];

  constructor() {
    makeObservable(this);
    this.createNewChart();
  }

  @action.bound public reset = () => {
    this.chartVersion++;
    this.rawBurnData = [];
    this.clearDataAndAnnotations();
  };
  @action.bound public clearData = () => {
    this.clearDataAndAnnotations();
  };

  @action.bound public restoreBurnData(samples: ISavedRunState["burnSamples"], annotations: ISavedAnnotation[]) {
    this.rawBurnData = samples.map(zone => zone.map(([time, acres]) => ({ time, acres })));
    this.restoredAnnotations = annotations.map(a => ({ ...a }));
    this.restoreVersion++;
  }

  private clearDataAndAnnotations = () => {
    for (const d of this.chart.dataSets) {
      d.clearDataPoints();
    }
    this.chart.annotations = [];
  };
  private createNewChart = () => {
    this.chart = new ChartDataModel({
      name: "",
      dataSets: [],
      defaultAxisLabelA1: "Time",
      defaultAxisLabelA2: "Value",
      defaultMaxPoints: this.defaultMaxPoints,
      defaultMaxA1: this.defaultMaxA1
    });
  };
}
