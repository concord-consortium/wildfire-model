import { observable } from "mobx";
import { ChartData } from "chart.js";

/**
 * This model tries to reduce the number of options that need to be specified when defining an
 * annotation, by making lots of decisions in `formatted`. See tests.
 *
 * If we end up needing to add every little option, then we should make the model just look identical
 * to the annotation def.
 *
 * See https://github.com/chartjs/chartjs-plugin-annotation
 */
export interface IChartAnnotation{
  type: string;
  // x value for vertical line, y value for horizontal
  value?: number;
  // line styling
  color?: string;
  thickness?: number;
  dashArray: number[];
  // text label. Note: only available for line annotations.
  label: string;
  labelColor: string;
  labelBackgroundColor: string;
  labelXOffset?: number;
  labelYOffset?: number;
  // if present, will add mouse rollover and click handlers
  expandLabel?: string;
  // additional offset for rollovers of different lenghts
  expandOffset?: number;
  // bounds for box labels. Infinity is permitted
  xMin?: number;
  xMax?: number;
  yMax?: number;
  yMin?: number;
  chartInstance: ChartData;
}
export class ChartAnnotation implements IChartAnnotation {
  @observable public type: string;
  @observable public value?: number;
  @observable public color?: string = "red";
  @observable public thickness?: number = 2;
  @observable public dashArray: number[];
  @observable public label: string;
  @observable public labelColor: string = "white";
  @observable public labelBackgroundColor: string = "rgba(0,0,0,0.8)";
  @observable public labelXOffset: number = 0;
  @observable public labelYOffset: number = 0;
  @observable public expandLabel?: string;
  @observable public expandOffset?: number = 0;
  @observable public xMin?: number;
  @observable public xMax?: number;
  @observable public yMax?: number;
  @observable public yMin?: number;
  @observable public showingExpandLabel: boolean;
  @observable public chartInstance: ChartData;

  constructor(props: IChartAnnotation) {
    Object.assign(this, props);
  }

  public setShowingExpandLabel(val: boolean) {
    this.showingExpandLabel = val;
  }

  public get formatted() {
    let formatted: any = {
      borderColor: this.color,
      borderWidth: this.thickness
    };

    if (this.type === "horizontalLine") {
      formatted = {
        type: "line",
        mode: "horizontal",
        scaleID: "y-axis-0",
        value: this.value,
        label: {
          position: "right"
        },
        ...formatted
      };
    } else if (this.type === "verticalLine") {
      formatted = {
        type: "line",
        mode: "vertical",
        scaleID: "x-axis-0",
        value: this.value,
        label: {
          position: "bottom"
        },
        ...formatted
      };
    } else if (this.type === "box") {
      const { xMin, xMax, yMin, yMax } = this;
      formatted = {
        type: "box",
        drawTime: "beforeDatasetsDraw",
        xScaleID: "x-axis-0",
        yScaleID: "y-axis-0",
        backgroundColor: this.color,
        xMin, xMax, yMin, yMax,
        ...formatted
      };
    }

    if (this.label) {
      const content = this.showingExpandLabel ? this.expandLabel : this.label;
      const xAdjust = this.showingExpandLabel ? this.expandOffset : this.labelXOffset;

      formatted.label = {
        ...formatted.label,
        enabled: true,
        content,
        xAdjust,
        yAdjust: 305 - this.labelYOffset,
        fontColor: this.labelColor,
        backgroundColor: this.labelBackgroundColor
      };
    }

    if (this.dashArray.length) {
      formatted.borderDash = this.dashArray;
    }

    if (this.expandLabel) {
      const expand = (val: boolean) => () => {
        this.setShowingExpandLabel(val);
        // this.chartInstance.update();
      };
      formatted.onMouseenter = () => this.setShowingExpandLabel(true);
      formatted.onMouseleave = () => this.setShowingExpandLabel(false);
      formatted.onClick = () => this.setShowingExpandLabel(!this.showingExpandLabel);
    }
    return formatted;
  }

  public setValue(value: number) {
    this.value = value;
  }

  public setBounds(bounds: { xMin?: number, xMax?: number, yMin?: number, yMax?: number }) {
    if (bounds.xMin) this.xMin = bounds.xMin;
    if (bounds.xMax) this.xMax = bounds.xMax;
    if (bounds.yMin) this.yMin = bounds.yMin;
    if (bounds.yMax) this.yMax = bounds.yMax;
  }
}
