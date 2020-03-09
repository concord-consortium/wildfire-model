import { types, Instance } from "mobx-state-tree";

/**
 * This model tries to reduce the number of options that need to be specified when defining an
 * annotation, by making lots of decisions in `formatted`. See tests.
 *
 * If we end up needing to add every little option, then we should make the model just look identical
 * to the annotation def.
 *
 * See https://github.com/chartjs/chartjs-plugin-annotation
 */

export const ChartAnnotationModel = types
  .model("ChartAnnotation", {
    // "horizontalLine", "verticalLine", "box"
    type: types.string,
    // x value for vertical line, y value for horizontal
    value: types.maybe(types.number),
    // line styling
    color: types.optional(types.string, "red"),
    thickness: types.optional(types.number, 2),
    dashArray: types.array(types.number),
    // text label. Note: only available for line annotations.
    label: types.maybe(types.string),
    labelColor: types.optional(types.string, "white"),
    labelBackgroundColor: types.optional(types.string, "rgba(0,0,0,0.8)"),
    labelXOffset: types.optional(types.number, 0),
    labelYOffset: types.optional(types.number, 0),
    // if present, will add mouse rollover and click handlers
    expandLabel: types.maybe(types.string),
    // additional offset for rollovers of different lenghts
    expandOffset: types.optional(types.number, 0),
    // bounds for box labels. Infinity is permitted
    xMin: types.maybe(types.number),
    xMax: types.maybe(types.number),
    yMax: types.maybe(types.number),
    yMin: types.maybe(types.number)
  })
  .volatile(self => ({
    showingExpandLabel: false
  }))
  .actions(self => ({
    setShowingExpandLabel: (val: boolean) => {
      self.showingExpandLabel = val;
    }
  }))
  .views(self => ({
    get formatted() {
      let formatted: any = {
        borderColor: self.color,
        borderWidth: self.thickness
      };

      if (self.type === "horizontalLine") {
        formatted = {
          type: "line",
          mode: "horizontal",
          scaleID: "y-axis-0",
          value: self.value,
          label: {
            position: "right"
          },
          ...formatted
        };
      } else if (self.type === "verticalLine") {
        formatted = {
          type: "line",
          mode: "vertical",
          scaleID: "x-axis-0",
          value: self.value,
          label: {
            position: "bottom"
          },
          ...formatted
        };
      } else if (self.type === "box") {
        const { xMin, xMax, yMin, yMax } = self;
        formatted = {
          type: "box",
          drawTime: "beforeDatasetsDraw",
          xScaleID: "x-axis-0",
          yScaleID: "y-axis-0",
          backgroundColor: self.color,
          xMin, xMax, yMin, yMax,
          ...formatted
        };
      }

      if (self.label) {
        const content = self.showingExpandLabel ? self.expandLabel : self.label;
        const xAdjust = self.showingExpandLabel ? self.expandOffset : self.labelXOffset;

        formatted.label = {
          ...formatted.label,
          enabled: true,
          content,
          xAdjust,
          yAdjust: 305 - self.labelYOffset,
          fontColor: self.labelColor,
          backgroundColor: self.labelBackgroundColor
        };
      }

      if (self.dashArray.length) {
        formatted.borderDash = self.dashArray;
      }

      if (self.expandLabel) {
        const expand = (val: boolean) => () => {
          self.setShowingExpandLabel(val);
          this.chartInstance.update();
        };
        formatted.onMouseenter = () => self.setShowingExpandLabel(true);
        formatted.onMouseleave = () => self.setShowingExpandLabel(false);
        formatted.onClick = () => self.setShowingExpandLabel(!self.showingExpandLabel);
      }

      return formatted;
    }
  }))
  .actions(self => ({
    setValue: (value: number) => {
      self.value = value;
    },

    setBounds: (bounds: {xMin?: number, xMax?: number, yMin?: number, yMax?: number}) => {
      if (bounds.xMin) self.xMin = bounds.xMin;
      if (bounds.xMax) self.xMax = bounds.xMax;
      if (bounds.yMin) self.yMin = bounds.yMin;
      if (bounds.yMax) self.yMax = bounds.yMax;
    }
  }));

export type ChartAnnotationType = Instance<typeof ChartAnnotationModel>;
