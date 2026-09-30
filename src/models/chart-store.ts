import { observable, action, makeObservable } from "mobx";
import { ChartDataModel } from "../charts/models/chart-data";
import type { ISavedAnnotation, ISavedRunState } from "./saved-state";
import type { SimulationModel } from "./simulation";

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
  public restoredShowsAllData = false;

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

  // Adds the hour's sample, or updates it in place when the hour already has one.
  public recordBurnSample(zoneIdx: number, hour: number, acres: number) {
    if (!this.rawBurnData[zoneIdx]) {
      this.rawBurnData[zoneIdx] = [];
    }
    const samples = this.rawBurnData[zoneIdx];
    if (samples.length === 0 || samples[samples.length - 1].time !== hour) {
      samples.push({ time: hour, acres });
    } else {
      samples[samples.length - 1].acres = acres;
    }
  }

  // The graph samples on render, after the tick that ends a run, so a run that ends on a new hour
  // has no sample for it yet.
  public recordCurrentHourIfMissing(simulation: SimulationModel) {
    const hour = simulation.timeInHours;
    simulation.zones.forEach((_, zoneIdx) => {
      const samples = this.rawBurnData[zoneIdx];
      if (!samples || samples.length === 0 || samples[samples.length - 1].time !== hour) {
        this.recordBurnSample(zoneIdx, hour, simulation.getZoneBurnedThousandAcres(zoneIdx));
      }
    });
  }

  @action.bound public restoreBurnData(
    samples: ISavedRunState["burnSamples"], annotations: ISavedAnnotation[], showsAllData: boolean
  ) {
    this.rawBurnData = samples.map(zone => zone.map(([time, acres]) => ({ time, acres })));
    this.restoredAnnotations = annotations.map(a => ({ ...a }));
    this.restoredShowsAllData = showsAllData;
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
