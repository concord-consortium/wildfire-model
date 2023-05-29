import { ChartDataSet, ChartColors } from "./chart-data-set";
import { Annotation } from "./chart-annotation";
import { observable, computed, makeObservable } from "mobx";

export interface IChartDataModel{
  name: string;
  dataSets: ChartDataSet[];
  labels?: string[];
  annotations?: Annotation[];
  defaultAxisLabelA1?: string;
  defaultAxisLabelA2?: string;
  defaultMaxPoints?: number;
  defaultMaxA1?: number;
  defaultMaxA2?: number;
}

export class ChartDataModel implements IChartDataModel {
  @observable public name: string;
  @observable public dataSets: ChartDataSet[];
  public labels?: string[];
  public annotations?: Annotation[] = [];
  public defaultAxisLabelA1?: string;
  public defaultAxisLabelA2?: string;
  public defaultMaxPoints?: number = 100;
  public defaultMaxA1: number = 100;
  public defaultMaxA2: number = 100;

  constructor(props: IChartDataModel) {
    makeObservable(this);
    Object.assign(this, props);
  }

  public get visibleDataSets() {
    if (this.dataSets && this.dataSets.length > 0) {
      return this.dataSets.filter(d => d.display);
    }
  }

  public get chartLabels() {
    if (this.labels && this.labels.length > 0) {
      return this.labels;
    } else return [];
  }

  // labels for a data point - essential for a bar graph, optional for a line
  public get dataLabels() {
    if (this.visibleDataSets && this.visibleDataSets.length > 0) {
      return this.visibleDataSets[0].dataLabels;
    } else return [];
  }
  public get dataLabelRotation() {
    if (this.visibleDataSets && this.visibleDataSets.length > 0) {
      return this.visibleDataSets[0].fixedLabelRotation;
    } else return;
  }
  @computed public get minMaxAll() {
    const maxA1Values: number[] = [];
    const maxA2Values: number[] = [];
    const minA1Values: number[] = [];
    const minA2Values: number[] = [];
    if (this.visibleDataSets && this.visibleDataSets.length > 0) {
      this.visibleDataSets.forEach((d) => {
        maxA1Values.push(d.maxA1 || this.defaultMaxA1);
        maxA2Values.push(d.maxA2 || this.defaultMaxA2);
        minA1Values.push(d.minA1 || 0);
        minA2Values.push(d.minA2 || 0);
      });
      return {
        maxA1: Math.max(...maxA1Values),
        maxA2: Math.max(...maxA2Values),
        minA1: Math.min(...minA1Values),
        minA2: Math.min(...minA2Values),
      };
    }
    else {
      return {
        maxA1: this.defaultMaxA1,
        maxA2: this.defaultMaxA2,
        minA1: 0,
        minA2: 0,
      };
    }
  }
  public get nextDataSeriesColor() {
    return ChartColors[this.dataSets.length];
  }

  public get maxPoints() {
    if (this.visibleDataSets && this.visibleDataSets.length > 0) {
      return this.visibleDataSets[0].maxPoints;
    } else {
      return this.defaultMaxPoints;
    }
  }

  public get pointCount() {
    if (this.visibleDataSets && this.visibleDataSets.length > 0) {
      return this.visibleDataSets[0].dataPoints.length;
    }  else {
      return 0;
    }
  }

  public get subsetIdx() {
    if (this.visibleDataSets && this.visibleDataSets.length > 0) {
      return this.visibleDataSets[0].dataStartIdx;
    } else {
      return 0;
    }
  }

  public get axisLabelA1() {
    if (this.defaultAxisLabelA1) return this.defaultAxisLabelA1;
    else if (this.visibleDataSets && this.visibleDataSets.length > 0) {
      return this.visibleDataSets[0].axisLabelA1;
    } else {
      return "";
    }
  }

  public get axisLabelA2() {
    if (this.defaultAxisLabelA2) return this.defaultAxisLabelA2;
    else if (this.visibleDataSets && this.visibleDataSets.length > 0) {
      return this.visibleDataSets[0].axisLabelA2;
    } else {
      return "";
    }
  }

  public get formattedAnnotations() {
    if (this.annotations && this.annotations.length > 0) {
      return this.annotations!.map(a => a.formatted);
    } else {
      this.annotations = [];
      return this.annotations;
    }
  }

  public addDataSet = (dataSet: ChartDataSet) => {
    if (this.defaultAxisLabelA1) dataSet.axisLabelA1 = this.defaultAxisLabelA1;
    if (this.defaultAxisLabelA2) dataSet.axisLabelA2 = this.defaultAxisLabelA2;
    this.dataSets.push(dataSet);
  }
  // If we want to scrub back and forth along a timeline of data points, but still need
  // to limit our data point quantity for performance, pass a start index and
  // the number of required points to filter the data
  public setDataSetSubset = (idx: number, maxPoints: number) => {
    this.dataSets.forEach(d => {
      d.subsetPoints(idx);
      if (this.maxPoints !== maxPoints) {
        d.setMaxDataPoints(maxPoints);
      }
    });
  }
  // To fetch all data from all datasets, remove any subset index points and set the max number of points to -1
  // to ensure all data is returned unfiltered
  public allData = () => {
    this.dataSets.forEach(d => {
      d.subsetPoints(-1);
      d.setMaxDataPoints(-1);
    });
  }

  public addAnnotation = (annotation: Annotation) => {
    if (!this.annotations) {
      this.annotations = [];
    }
    this.annotations.push(annotation);
  }

  public removeAnnotation = (annotation: Annotation) => {
    if (this.annotations) {
      this.annotations.splice(this.annotations.indexOf(annotation));
    }
  }

  public clearAnnotations = () => {
    this.annotations = [];
  }
}
