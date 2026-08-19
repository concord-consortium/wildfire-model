import fireLineIconUrl from "../../assets/graph/fire-line.svg?url";
import helitackIconUrl from "../../assets/graph/helitack.svg?url";

export interface IAnnotationIcon {
  url: string;
  width: number;
  height: number;
  // space between the bottom of the icon and the top of the plot area
  gap: number;
}

// The two gaps differ by design: the icon bottoms land 1px apart rather than flush, so the taller
// shield starts higher and stays partly visible under an overlapping helicopter.
export const annotationIcons = {
  fireLine: { url: fireLineIconUrl, width: 21, height: 27, gap: 2 },
  helitack: { url: helitackIconUrl, width: 27, height: 22, gap: 3 }
} satisfies Record<string, IAnnotationIcon>;

// Producers bind to the constants below rather than to bare strings, so a typo or a rename on
// either side is a compile error instead of a silently missing icon.
export type AnnotationEventKind = keyof typeof annotationIcons;
export const FIRE_LINE_EVENT: AnnotationEventKind = "fireLine";
export const HELITACK_EVENT: AnnotationEventKind = "helitack";

export const isAnnotationEventKind = (kind: string | undefined): kind is AnnotationEventKind =>
  !!kind && Object.prototype.hasOwnProperty.call(annotationIcons, kind);

// chartArea.top is max(layout.padding.top, 8.4), so this becomes the height of the band above the
// plot. The tallest icon plus its gap needs 29px against a canvas top edge of y = 0 (measured: at
// 29 the shield keeps all 27 rows with zero clearance, at 28 it loses one); the extra pixel keeps
// it off that edge. Derived rather than hardcoded so that new or resized artwork moves the band
// with it instead of being cropped by it. The 0 fallback is for an empty registry, where
// Math.max() would otherwise return -Infinity.
export const iconBandHeight =
  Math.max(0, ...Object.values(annotationIcons).map(icon => icon.height + icon.gap)) + 1;

// Decode once at module load, not per chart instance: <Scatter redraw> destroys and recreates the
// chart 5 to 6 times a second while a model runs, and a per-instance Image would be racing its own
// decode on every cycle.
const images = {} as Record<AnnotationEventKind, HTMLImageElement>;
(Object.keys(annotationIcons) as AnnotationEventKind[]).forEach(kind => {
  const image = new Image();
  image.src = annotationIcons[kind].url;
  images[kind] = image;
});

export interface IIconPlacement {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface IXScale {
  min: number;
  max: number;
  getPixelForValue: (value: number) => number;
}

/**
 * Where the icon for one annotation goes, or null when it should not be drawn: an unknown event
 * kind, or an event outside the visible x range. afterDraw does no clipping, so an out-of-range
 * icon would otherwise float over the axis labels with no line beneath it.
 *
 * `eventKind` is taken as a loose string rather than an AnnotationEventKind because the caller
 * reads it off an untyped Chart.js annotation; the guard is what makes it safe.
 *
 * The bounds are inclusive because that matches what the annotation plugin does with the line: at
 * value === scale.min the line is still stroked, on the y-axis itself. An in-range icon near either
 * end is allowed to overhang the plot rather than being clamped inward, since clamping would slide
 * it off its own line.
 *
 * Rounded to whole pixels. The artwork touches its own bounding box on every side and its outline
 * is 1px, so at a fractional offset drawImage resamples that outline across two columns at roughly
 * 45% alpha each and the side edges read as thin or clipped (measured: outline alpha 103-139 at a
 * fractional x versus 255 at an integer one). Rounding costs at most half a pixel of offset from
 * the line the plugin strokes on the raw value, which is imperceptible, and buys a solid border.
 */
export const iconPlacement = (
  eventKind: string | undefined,
  value: number,
  scale: IXScale,
  chartAreaTop: number
): IIconPlacement | null => {
  if (!isAnnotationEventKind(eventKind) || value < scale.min || value > scale.max) {
    return null;
  }
  const icon = annotationIcons[eventKind];
  return {
    left: Math.round(scale.getPixelForValue(value) - icon.width / 2),
    top: Math.round(chartAreaTop - icon.gap - icon.height),
    width: icon.width,
    height: icon.height
  };
};

// Draws a marker icon above the plot for every annotation carrying an eventKind. Must stay after
// ChartAnnotation in line-chart.tsx's `plugins` array; the comment there explains why. Iterates the
// annotation array in order, which is the order events were added, so the most recent icon lands on
// top.
export const annotationIconPlugin = {
  afterDraw(chart: any) {
    const area = chart.chartArea;
    const scale = chart.scales["x-axis-0"];
    const annotations = chart.options.annotation?.annotations;
    if (!area || !scale || !annotations) {
      return;
    }
    annotations.forEach((annotation: any) => {
      const eventKind: string | undefined = annotation.eventKind;
      const placement = iconPlacement(eventKind, annotation.value, scale, area.top);
      const image = isAnnotationEventKind(eventKind) ? images[eventKind] : undefined;
      // naturalWidth guards jsdom and a cold cache, where complete is true but there is nothing
      // decoded to draw
      if (!placement || !image || !image.complete || !image.naturalWidth) {
        return;
      }
      chart.ctx.drawImage(image, placement.left, placement.top, placement.width, placement.height);
    });
  }
};
