# Implementation Plan: Wildfire Graph panel: Fireline and Helitack icons at the top of the graph

**Jira**: https://concord-consortium.atlassian.net/browse/WM-30
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **In Development**

## Approach

The canvas route: a Chart.js plugin drawing both icons in `afterDraw`, alongside the two custom plugins `line-chart.tsx` already ships (`legendPlugin`, `yAxisLinePlugin`). The requirements spec left the route open; the pre-implementation spike built this one end to end and every assumption held, including the two that priced it (loading an SVG as a URL, and the production build).

Three commits, in order:

1. **Build and test plumbing** so an SVG can be imported as a URL.
2. **Event kind on the annotation model**, a generic field the renderer can discriminate on.
3. **The icon renderer**, which defines the kinds, swaps the labels for them in `graph.tsx`, and takes the plot-area padding it needs.

Each step leaves the app working, and none of them regresses the app in passing. Step 2 adds a field that nothing sets yet, in the same way step 1 adds a resolver branch that nothing imports yet; the labels come out and the icons go in together, in step 3, so there is no commit where a suppression event is marked by nothing at all.

## Implementation Plan

### Import SVGs as URLs from TSX

**Summary**: `webpack.config.js` has exactly one `.svg` rule and neither of its branches yields a URL for an SVG imported from a `.tsx` file: the CSS branch gives `type: 'asset'`, the TSX branch gives an svgr React component. The canvas renderer needs a URL to feed an `Image`. This step adds a third branch keyed on the `?url` resource query, types the new specifier, teaches Jest to resolve it, and normalizes the two exported assets. It is self-contained: nothing imports the new specifier until the next steps.

**Files affected**:
- `webpack.config.js`: new `resourceQuery` branch in the `.svg` `oneOf`
- `src/global.d.ts`: type the `*.svg?url` specifier
- `package.json`: widen the Jest `moduleNameMapper` pattern for SVGs
- `src/assets/graph/fire-line.svg`: replace the Zeplin GUID `<title>` with a readable name (`helitack.svg` is already done, see below)

**Estimated diff size**: ~15 lines

`webpack.config.js`, as the **first** entry of the existing `oneOf` (order matters: `oneOf` takes the first match, and the `issuer` branches would otherwise claim it). The query pattern is anchored rather than the loose `/url/` webpack's own examples use, since this branch is first and an unanchored match would also claim `?nourl`, `?urls` or `?myurl=1` and hand back a URL where an svgr component was meant:

```js
        {
          test: /\.svg$/i,
          exclude: /\.nosvgo\.svg$/i,
          oneOf: [
            {
              // `import url from "./icon.svg?url"` yields a URL rather than a React component,
              // for artwork drawn onto a canvas via an Image. The svgr branch below cannot do
              // this, and .nosvgo.svg is not an escape hatch (it matches no rule at all).
              resourceQuery: /^\?url$/,
              type: 'asset',
            },
            {
              // Do not apply SVGR import in CSS files.
              issuer: /\.(css|scss|less)$/,
              type: 'asset',
            },
            // ... existing svgr branch unchanged
```

`src/global.d.ts`, beside the existing `*.svg` block:

```ts
declare module "*.svg?url" {
  const url: string;
  export default url;
}
```

`package.json`, in the Jest `moduleNameMapper`:

```json
      "\\.svg(\\?.*)?$": "<rootDir>/__mocks__/svgMock.js",
```

The existing pattern is anchored `\\.svg$`, so a `?url` specifier matches neither it nor the `fileMock` pattern below it, and any test that transitively imports the renderer fails to resolve the module. Verified with a throwaway test: `Cannot find module '../assets/graph/fire-line.svg?url'` before the change, passing after.

Asset normalization: `fire-line.svg` still carries Zeplin's layer GUID in `<title>` (`80CBCDAF-2557-44C9-B7DC-41FE51B6E290`). Replace it with `Fire Line`, matching `src/assets/bottom-bar/`. This is not cosmetic on this path: svgo does not run on the `?url` branch, so these bytes ship as written, inlined as base64 into the JS bundle. `helitack.svg` carried `27D5FFBA-780C-4274-89FD-A861FF6B1478` and is already normalized; that GUID is recorded here because it is the only remaining link from the shipped asset back to its Zeplin layer.

**Half of this is already done.** `helitack.svg` was replaced in the tree on 2026-08-19 with an svgo-optimized copy (14,211 bytes to 5,488) that already carries `<title>Helitack</title>`, so only `fire-line.svg` still needs its GUID title replaced. See the resolved question below for why, and for the consequence: both assets now sit under webpack's 8 KB threshold, so both inline and neither is emitted as a separate file.

---

### Carry the event kind on the annotation

**Summary**: Removing the text labels, which step 3 does, removes the only thing that distinguishes a fire-line annotation from a helitack one. Measured in round 3: with `label` omitted the two `formatted` objects differ in `borderDash` and nothing else. This step adds an explicit `eventKind` field so the renderer never has to infer artwork from a dash pattern that Out of Scope forbids anyone from changing.

The field is a plain `string` here, deliberately. `chart-annotation.ts` is the generic chart layer, and the resolved location question below accepts wildfire vocabulary in the icon *plugin* but not in the chart *model*; the two kinds are named and typed in step 3, where the artwork that defines them lives. Nothing sets the field until then.

**Files affected**:
- `src/charts/models/chart-annotation.ts`: `eventKind` on the interface, the class, and `formatted`
- `src/charts/models/chart-annotation.test.ts`: a case for the passthrough

**Estimated diff size**: ~15 lines

`chart-annotation.ts`, on `IChartAnnotation` and the class:

```ts
  // Which kind of event this annotation marks, for renderers that draw their own artwork.
  // Not consumed by chartjs-plugin-annotation, which ignores keys it does not know.
  eventKind?: string;
```

and in `formatted`, beside the existing `dashArray` passthrough:

```ts
    if (this.eventKind) {
      formatted.eventKind = this.eventKind;
    }
```

Two things to know before step 3 rather than rediscover them there. The text stops rendering because the plugin's `labelDefaults.enabled` is `false` and its draw path is gated on `view.labelEnabled && view.labelContent`, not because the label block disappears: for `type: "verticalLine"` a `label` block is always emitted (`chart-annotation.ts:93-105`) and keeps `content: <hour number>`. And the Hazbot log event named `"Helitack"` (`use-helitack-interaction.ts:18`, `stores.ts:85`, matched by rule-sets 45/47/54 via `translate.ts:50`) reads like the label but is unrelated: do not rename it.

Test, added to `chart-annotation.test.ts` (existing cases use exact `toEqual` on `formatted` and are unaffected, since the key is only emitted when set):

```ts
  it("carries eventKind through to the formatted annotation", () => {
    const withKind = new Annotation({ type: "verticalLine", value: 10, eventKind: "fireLine" });
    expect(withKind.formatted.eventKind).toBe("fireLine");
    const withoutKind = new Annotation({ type: "verticalLine", value: 10 });
    expect("eventKind" in withoutKind.formatted).toBe(false);
  });
```

---

### Draw the icons above the plot

**Summary**: A new module owning the icon registry, the event kinds that registry defines, the decoded images, the placement math and the Chart.js plugin, registered after `ChartAnnotation` so icons paint over the dashed lines. `graph.tsx` swaps its two text labels for those kinds in the same step, so the labels and the icons change hands together. The plot area gives up the space via `layout.padding.top`, so neither the 381px chart nor the panel grows.

**Three requirements this step satisfies without any code of its own**, worth stating so a reader can tell they were considered rather than forgotten. The plugin is stateless: it holds nothing but the two module-level decoded `Image`s, and re-reads `chart.options.annotation.annotations`, `chart.scales["x-axis-0"]` and `chart.chartArea` from the live instance on every `afterDraw`. So **clearing** comes free (`chartStore.reset()` empties `chart.annotations`, `formattedAnnotations` returns `[]`, and the band is blank on the next draw), **both data modes and any axis rescale** come free (placement is recomputed from the current scale each draw, never cached), and **chart destruction and re-creation** comes free (there is no reference to a chart instance to go stale, which is the trap the requirements spec measured at 41.4px of drift on the DOM-overlay route). None of these is free on that other route, where clearing would need explicit teardown, so the absence of code here is the design working rather than an omission. Acceptance for all three is the manual Restart/Reload and data-mode walk in the requirements spec's Verification section.

No automated test is added for the plugin itself, and the reason is sharper than "jsdom cannot rasterize". The plugin holds no logic of its own: it forwards each annotation to `iconPlacement`, which the unit tests below cover directly, and then draws. What is left to assert is draw order, and asserting that is asserting that `Array.prototype.forEach` iterates forwards and that `drawImage` paints later over earlier, neither of which is this code's behavior. Worse, any such test has to run against a hand-built stub of the Chart.js instance, so the failures actually worth catching here (an `eventKind` that does not survive the config merge, a missing `x-axis-0`, the plugin running before `ChartAnnotation`) are precisely the ones a stub stays green through. Those are verified live instead, per the requirements spec's Verification section. The unit tests below cover the placement math, which is the part with logic worth pinning.

**Files affected**:
- `src/charts/components/annotation-icons.ts`: new
- `src/charts/components/annotation-icons.test.ts`: new
- `src/charts/components/line-chart.tsx`: padding and plugin registration
- `src/components/graph.tsx`: the two annotation constructions, labels out and kinds in

**Estimated diff size**: ~185 lines

New file `src/charts/components/annotation-icons.ts`. The registry is the single source of truth for which kinds exist: `AnnotationEventKind` is derived from its keys, so adding artwork adds a kind, and a kind with no artwork does not type-check.

```ts
import fireLineIconUrl from "../../assets/graph/fire-line.svg?url";
import helitackIconUrl from "../../assets/graph/helitack.svg?url";

export interface IAnnotationIcon {
  url: string;
  width: number;
  height: number;
  // space between the bottom of the icon and the top of the plot area
  gap: number;
}

// Sizes and gaps come from the WM-25 artboard, which is 1:1 with app CSS pixels. The two gaps
// differ by design: the icon bottoms land 1px apart rather than flush, so the taller shield
// starts higher and stays partly visible under an overlapping helicopter.
export const annotationIcons = {
  fireLine: { url: fireLineIconUrl, width: 21, height: 27, gap: 2 },
  helitack: { url: helitackIconUrl, width: 27, height: 22, gap: 3 }
} satisfies Record<string, IAnnotationIcon>;

// The kinds this renderer knows how to draw. graph.tsx binds its two annotations to the
// constants below rather than to bare strings, so a typo or a rename on either side is a
// compile error instead of a silently missing icon.
export type AnnotationEventKind = keyof typeof annotationIcons;
export const FIRE_LINE_EVENT: AnnotationEventKind = "fireLine";
export const HELITACK_EVENT: AnnotationEventKind = "helitack";

export const isAnnotationEventKind = (kind: string | undefined): kind is AnnotationEventKind =>
  !!kind && Object.prototype.hasOwnProperty.call(annotationIcons, kind);

// chartArea.top is max(layout.padding.top, 8.4), so this value becomes the height of the band
// above the plot. Currently 30. The tallest icon plus its gap needs 29px against a canvas top
// edge of y = 0 (measured: at 29 the shield keeps all 27 rows with zero clearance, at 28 it
// loses one); the extra pixel keeps it off that edge. Derived rather than hardcoded so that new
// or resized artwork moves the band with it instead of being cropped by it. The 0 fallback is
// for an empty registry, where Math.max() would otherwise return -Infinity.
export const iconBandHeight =
  Math.max(0, ...Object.values(annotationIcons).map(icon => icon.height + icon.gap)) + 1;

// Decode once at module load, not per chart instance: <Scatter redraw> destroys and recreates
// the chart 5 to 6 times a second while a model runs, and a per-instance Image would be racing
// its own decode on every cycle.
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
 * Where the icon for one annotation goes, or null when it should not be drawn: an unknown
 * event kind, or an event outside the visible x range. afterDraw does no clipping, so an
 * out-of-range icon would otherwise float over the axis labels with no line beneath it.
 *
 * `eventKind` is taken as a loose string rather than an AnnotationEventKind because the caller
 * reads it off an untyped Chart.js annotation; the guard is what makes it safe.
 *
 * The bounds are inclusive because that matches what the annotation plugin does with the line:
 * at value === scale.min the line is still stroked, on the y-axis itself. An in-range icon near
 * either end is allowed to overhang the plot rather than being clamped inward, since clamping
 * would slide it off its own line.
 *
 * No rounding anywhere: the plugin strokes its line on the raw pixel value, so centering on the
 * same raw value puts the icon on its line, and SVG artwork stays crisp at fractional offsets.
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
    left: scale.getPixelForValue(value) - icon.width / 2,
    top: chartAreaTop - icon.gap - icon.height,
    width: icon.width,
    height: icon.height
  };
};

// Draws a marker icon above the plot for every annotation carrying an eventKind. Must be
// registered after ChartAnnotation in line-chart.tsx's `plugins` array, which is load-bearing
// rather than tidy; the comment there explains why. Iterates the annotation array in order,
// which is the order events were added, so the most recent icon lands on top.
export const annotationIconPlugin = {
  afterDraw(chart: any) {
    const area = chart.chartArea;
    const scale = chart.scales["x-axis-0"];
    const annotations = chart.options.annotation && chart.options.annotation.annotations;
    if (!area || !scale || !annotations) {
      return;
    }
    annotations.forEach((annotation: any) => {
      const eventKind: string | undefined = annotation.eventKind;
      const placement = iconPlacement(eventKind, annotation.value, scale, area.top);
      const image = isAnnotationEventKind(eventKind) ? images[eventKind] : undefined;
      // naturalWidth guards jsdom and a cold cache, where complete is true but there is
      // nothing decoded to draw
      if (!placement || !image || !image.complete || !image.naturalWidth) {
        return;
      }
      chart.ctx.drawImage(image, placement.left, placement.top, placement.width, placement.height);
    });
  }
};
```

`graph.tsx`: in both effects, replace `label: "Fire Line"` / `label: "Helitack"` with the imported constants, and drop the now-inert label styling (`labelXOffset`, `labelYOffset`, `labelPosition`, `labelBackgroundColor`, `labelColor`, `fontFamily`, `fontSize`). The fire-line effect becomes:

```tsx
      chartStore.chart.addAnnotation(new Annotation({
        type: "verticalLine",
        value: simulation.timeInHours,
        eventKind: FIRE_LINE_EVENT,
        thickness: 1,
        dashArray: borderDash1
      }));
```

and the helitack effect the same with `HELITACK_EVENT` and `dashArray: borderDash2`. Nothing else changes: `value`, `thickness` and `dashArray` are what draw the line, and the dash patterns are frozen by Out of Scope. Importing the constants rather than writing the strings twice is what keeps producer and registry from drifting; see the resolved discriminator question below for what that does and does not buy.

`line-chart.tsx`, three lines. Import the module, then in the module-level `defaultOptions`:

```ts
  layout: {
    padding: {
      // room above the plot for the suppression-event icons; comes out of the plot area so
      // the 381px chart and the panel around it keep their size. Currently 30, derived from
      // the tallest icon and its gap in annotation-icons.ts rather than fixed here.
      top: iconBandHeight,
      left: 3,
      right: 19
    }
  },
```

and in the `<Scatter>` element:

```tsx
        // annotationIconPlugin must stay after ChartAnnotation: the annotation plugin also
        // self-registers globally, so it strokes its lines twice per frame, and only a later
        // array position beats the second pass. Moving it first puts the lines over the icons.
        plugins={[ChartAnnotation, legendPlugin, yAxisLinePlugin, annotationIconPlugin]}
```

**Why that comment is there**, in more detail than belongs in the source file. The reason is not the
obvious one, so it is worth stating rather than leaving to be re-derived. `chartjs-plugin-annotation`
both exports its plugin and **registers it globally** on import (`module.exports = annotationPlugin;
Chart.pluginService.register(annotationPlugin);`, `chartjs-plugin-annotation.js:507-509`), and
Chart.js 2.9 runs hooks in the order `this._plugins.concat(config.plugins || [])`
(`dist/Chart.js:8057`), globals first. On top of that, `import * as ChartAnnotation` under
`esModuleInterop` yields an `__importStar` copy, which is a different object from the registered
plugin, so the identity dedupe at `dist/Chart.js:8058-8061` does not fire. Confirmed on the live
chart: `config.plugins[0] !== <the global plugin>`, `config.plugins[0].default === <the global
plugin>`, and the two share an `afterDraw` reference.

The upshot is that the annotation plugin strokes its lines **twice** per frame, once from the
global registration and once from the array entry, and the icons have to sit after the array
entry to land on top of the second pass. Reading the ordering as "globals run first, so array
position is cosmetic" and moving the icon plugin to the front would put the dashed lines back
over the icons. The double registration is pre-existing and unrelated to this story; only the
ordering consequence matters here.

Setting the padding in source rather than on the instance is required, not stylistic: `redraw={true}` rebuilds `options` from `defaultOptions` several times a second, wiping anything poked onto a live instance. `defaultOptions` is where it goes because of the module-location decision below; the binding constraint is only that the value be part of the options object rebuilt each render, not that it live on that particular object. `defaultOptions` is shared, but `LineChart` is used only by `Chart`, which is used only by `Graph`, so no other chart is affected.

New file `src/charts/components/annotation-icons.test.ts`, covering the placement math against a stub scale (jsdom cannot assert the drawing itself). It uses the exported constants rather than string literals, for the same reason `graph.tsx` does:

```ts
import {
  annotationIcons, FIRE_LINE_EVENT, HELITACK_EVENT, iconBandHeight, iconPlacement
} from "./annotation-icons";

// 0 to 100 hours across a 100px plot starting at x = 50, so one hour is one pixel
const scale = { min: 0, max: 100, getPixelForValue: (value: number) => 50 + value };
const CHART_AREA_TOP = 30;

describe("annotation icon placement", () => {
  it("reserves a band tall enough for the tallest icon plus its gap", () => {
    expect(iconBandHeight).toBe(30);
    Object.values(annotationIcons).forEach(icon => {
      expect(iconBandHeight - icon.gap - icon.height).toBeGreaterThanOrEqual(1);
    });
  });

  it("centers the icon on its event time, above the plot", () => {
    expect(iconPlacement(FIRE_LINE_EVENT, 20, scale, CHART_AREA_TOP)).toEqual({
      left: 70 - 21 / 2, top: 30 - 2 - 27, width: 21, height: 27
    });
    expect(iconPlacement(HELITACK_EVENT, 20, scale, CHART_AREA_TOP)).toEqual({
      left: 70 - 27 / 2, top: 30 - 3 - 22, width: 27, height: 22
    });
  });

  it("keeps sub-pixel positions rather than rounding onto the pixel grid", () => {
    const fractional = { ...scale, getPixelForValue: (value: number) => 50.4 + value };
    expect(iconPlacement(FIRE_LINE_EVENT, 20, fractional, CHART_AREA_TOP)?.left).toBeCloseTo(59.9, 5);
  });

  it("draws an event sitting exactly on either end of the visible range", () => {
    expect(iconPlacement(FIRE_LINE_EVENT, 0, scale, CHART_AREA_TOP)).not.toBeNull();
    expect(iconPlacement(FIRE_LINE_EVENT, 100, scale, CHART_AREA_TOP)).not.toBeNull();
  });

  it("suppresses an event that has scrolled out of the visible range", () => {
    const window = { ...scale, min: 30, max: 72 };
    expect(iconPlacement(FIRE_LINE_EVENT, 20, window, CHART_AREA_TOP)).toBeNull();
    expect(iconPlacement(FIRE_LINE_EVENT, 73, window, CHART_AREA_TOP)).toBeNull();
  });

  it("ignores annotations with no event kind, or an unknown one", () => {
    expect(iconPlacement(undefined, 20, scale, CHART_AREA_TOP)).toBeNull();
    expect(iconPlacement("smokeJumper", 20, scale, CHART_AREA_TOP)).toBeNull();
  });
});
```

Manual verification follows the Verification section of the requirements spec. The two traps there are worth repeating, since both fail silently: use `window.sim.buildFireLine(start, end)` rather than `window.test.placeFireLineInZone`, which never sets `lastFireLineTimestamp`; and let the model tick between staged events, since two calls at the same `sim.time` write an identical timestamp and the effect never re-fires.

## Open Questions

### RESOLVED: Where should the icon module live, given that `src/charts/` is the generic chart layer?

**Context**: The plan above puts the icon registry, the images and the plugin in `src/charts/components/annotation-icons.ts`, which means wildfire artwork (`src/assets/graph/*.svg`) is imported from the charting layer. That layer is only semi-generic already: `LineChart` injects `stores` and reads `chartStore` directly, and `legendPlugin` and `yAxisLinePlugin` encode this app's visual decisions. But the two existing plugins draw chart furniture, whereas this one draws domain artwork, so it is the first thing to cross that line.

**Options considered**:
- A) As planned. The module lives in `src/charts/components/` and imports the two assets directly. No prop plumbing; matches the existing plugin precedent.
- B) The plugin and its icon registry live on the wildfire side (near `graph.tsx`) and reach the chart through new `plugins` and `paddingTop` props threaded through `Chart` and `LineChart`. Cleaner layering, at the cost of new props on two components and a conditional `defaultOptions`.
- C) Split: a generic "draw an image per annotation" plugin factory in `src/charts/`, parameterized by an icon registry, with the wildfire registry passed down from `graph.tsx` via a prop. Keeps the artwork out of the chart layer but still needs the prop plumbing of B.

**Decision**: **A**, as planned. The module lives in `src/charts/components/annotation-icons.ts` and imports the two assets directly.

The boundary this question is about is already breached, and has been for years, so B and C would be paying real cost to protect a line that does not hold:

- `src/charts/package.json` declares a package named `cc-charts`, added in March 2020 by `a211490` ("Moe charts into its own folder with its own package.json for easier reuse elsewhere"). The extraction never happened: no npm workspaces, the folder's `package-lock.json` is gone, nothing in the repo or CI reads the manifest, and it was never published. There is no second consumer (`datagoat/src/charts` is an unrelated hand-written SVG chart set, not this code).
- The manifest is already inaccurate. It declares the chart libraries but not `react`, `mobx` or `mobx-react`, all of which the layer imports, so the folder cannot be lifted out as it stands.
- Four files already import app code across the boundary: `BaseComponent` from `../../components/base` in three components, and `log` from `../../log`.
- Three components bind to this app's store shape via `@inject("stores")` and direct `chartStore` reads, `LineChart` among them.
- The artwork precedent exists too: `line-chart-controls.tsx:7` imports `../../assets/slider-thumb-small.svg` and renders it, added by `d2b9b32` ("style: match graph panel to Zeplin design [WM-25]"), the same design effort this story continues.

Option B was built as throwaway code rather than estimated, so the two routes are priced against measurement:

| | A (as planned) | B (props threaded) |
|---|---|---|
| chart-layer diff | **+3 / -1**, one file | **+22 / -3**, two files |
| new public props on chart components | 0 | 4 (2 each on `Chart` and `LineChart`), loosely typed |
| live geometry | `chartArea.top` 30, plot 254.68, canvas 286 x 381 | identical |
| icon ink vs predicted rects | matched to the pixel | matched to the pixel |
| unit tests, lint | pass | pass |

So B costs about 25 lines of churn in the layer it is trying to keep clean, plus two loosely-typed props on its public API, and buys a purity nothing enforces and no second consumer needs. C needs all of B's plumbing plus a factory indirection, so it is strictly more expensive and was not built.

The real cost of A is that wildfire vocabulary (`"fireLine"`, `"helitack"`) and wildfire artwork land in `cc-charts`, which is one more thing to untangle if the layer is ever genuinely extracted. That is accepted: the plugin is stateless and self-contained, so untangling it later *is* the B diff, and it would be a small share of the untangling that extraction would already require.

**Two findings from building B, which apply whichever route is taken.** First, the claim above that `padding.top` must be set in `defaultOptions` is too strong. The real constraint is that the value be part of the options object rebuilt on every render; a prop satisfies that, and B measured `chartArea.top` at exactly 30. What is actually forbidden is poking the value onto a live instance, which the next redraw wipes. Second, B has a wart worth recording in case it is ever revisited: its render has to *replace* `layout` rather than inherit it, leaving `defaultOptions.layout` dead.

---

### RESOLVED: Should the plot-area padding be derived from the artwork, or a plain constant?

**Context**: The requirements fix the value at 30 and record that 29 is the floor below which the shield clips. The plan derives it (`max(height + gap) + 1`) so that resized or added artwork moves the band automatically, at the cost that the single most safety-critical number in this story is computed rather than written down, and a `padding.top` reader has to open another module to see what it is. The alternative is `top: 30` with the sweep table in a comment.

**Options considered**:
- A) Derive it, as planned, with the unit test asserting it equals 30, which is what stops a future asset change from silently clipping, plus a per-icon clearance assertion. Note that the clearance assertion documents the invariant rather than guarding it: `max_j(h_j + g_j) + 1 - (h_i + g_i) >= 1` holds for every icon by the definition of `max`, so under this option it cannot fail. `toBe(30)` is the whole tripwire.
- B) A named constant `ICON_BAND_HEIGHT = 30` in the icon module, with the reasoning in a comment and the same test asserting each icon fits inside it.
- C) A literal `top: 30` in `defaultOptions` with an explanatory comment, and no coupling to the artwork at all.

**Decision**: **A**, derive it, with two amendments folded into the plan above: a fallback so an empty registry cannot produce `-Infinity`, and a comment at the `padding.top` site naming the current value so a reader of `line-chart.tsx` does not have to navigate away to learn it. Both test assertions stay: `toBe(30)` as the tripwire saying the band moved, and the per-icon clearance invariant saying why it had to.

The floor was measured rather than trusted. Both real SVGs were drawn onto a scratch canvas at the exact placement formula while sweeping the band height, counting surviving ink rows:

| Band height | Shield top | Shield ink rows (of 27) | Helicopter |
|---|---|---|---|
| 27 | -2 | 25, two rows clipped | intact |
| 28 | -1 | 26, one row clipped | intact |
| 29 | 0 | 27, intact at zero clearance | intact |
| 30 | 1 | 27, intact with 1px clearance | intact |

So 29 is exactly the floor, 30 leaves exactly one pixel, and the `+1` in the formula is a deliberate safety margin rather than anything the artwork implies. That is the part of the "derived" value that is not itself derived, and it is worth knowing before anyone tunes it.

What decides between the options is the failure mode when the artwork changes. Taking a taller shield (21 x 34) as the case: derived, the band auto-grows to 37, no icon clips, and the plot quietly loses another 7px, while `expect(iconBandHeight).toBe(30)` fails and forces a conscious update. Constant, the band stays 30, the shield loses six rows off its top, and the per-icon clearance assertion fails. Both fail loudly in CI, so the test is the real protection either way. The tiebreaker is what ships if the test is bypassed: the derived form fails toward a slightly shorter plot, the constant fails toward silently cropped artwork, and this spec's own Verification section warns that a 1px crop is invisible in review. Deriving also covers a case a shield-shaped constant would miss, since a helicopter grown to 27 tall would drive the band to 31 on its 3px gap.

The known cost, and why the fallback amendment exists: `Math.max()` over an empty array is `-Infinity`, so emptying the icon registry would set `padding.top: -Infinity`. Remote, since that means deleting the feature, but it is a sharp edge a constant does not have.

### RESOLVED provisionally (Michael may still revise): Can the graph helitack asset be size-optimized, or does it ship as exported?

**Status**: asked 2026-08-19, sent to Michael, and **taken as approved in the meantime**. The
optimized asset is in the tree now. If Michael prefers option C he can re-export from Sketch
and the file is swapped, which is a one-file change with no code impact.

**Context** (state of the file when this was asked): `src/assets/graph/helitack.svg` was 14,211 bytes for a 27 x 22 icon. The cause is
coordinate precision from a scaled Sketch export, not artwork complexity: it carries 1,096
coordinates with four or more decimal places (`M10.54665,9.38221916 ...`), and 13,392 of its
14,211 bytes are attribute values, mostly six long `d` strings. The bottom-bar copy of the same
helicopter has the identical element census (14 paths, 6 polygons) at a *larger* 53 x 45
viewBox and is 5,290 bytes, with zero long decimals, which is what identifies the cause.

This matters only because svgo does not run on the `?url` path (step 1), so those bytes ship
verbatim, and 14,211 is over webpack's 8,192-byte inline threshold. That single fact is the
sole reason this plan has an inline-versus-emitted asymmetry to document: `fire-line.svg` at
5,446 bytes inlined as a data URI, `helitack.svg` did not and became a separate network
request. Running the helitack asset through svgo with this repo's existing svgo settings
brings it to 5,488 bytes, under the threshold, so both icons inline:

| | today | with the asset optimized |
|---|---|---|
| fire-line | 5,446 raw, inlined | unchanged |
| helitack | 14,211 raw, **emitted and fetched** | 5,488 raw, **inlined** |
| total shipped | 21,501 B + one request | 14,604 B, no request |

`fire-line.svg` needs no change either way; it is already under the threshold. So this question
is about one asset.

**Why it needs a designer rather than a decision here**: optimization is not pixel-identical.
Measured against the original, at actual size 36 of the icon's 594 pixels change (6.1%), all on
the antialiased edges of curves, with a maximum single-pixel change of 28/255. At 10x
magnification about 4% of pixels differ, with a maximum of 127/255. Nothing moves by a whole
pixel at actual size, and the two are indistinguishable to this reviewer's eye at both sizes,
but the requirements spec reserves artwork judgment for Michael and this is exactly that call.

**Options**:
- A) Optimized asset. Fold "run both assets through svgo with the repo's existing config" into
  step 1 beside the `<title>` normalization, which svgo can carry in the same pass. Removes the
  inline/emitted asymmetry and the emitted-asset failure mode entirely.
- B) Ship as exported. No change to this plan at all. The emitted asset works today and was
  verified in the production build; the asymmetry stays documented as it already is.
- C) Michael re-exports from Sketch at whole-pixel coordinates, which is how the bottom-bar
  version reached 5 KB naturally. Best outcome for the source tree, most of his time.

**What was sent**: a comparison page with both assets embedded at actual size, 4x and a 10x
flip test, the measurements above, and the three options:
https://claude.ai/code/artifact/82ffea5f-8bab-47f2-ae16-09f39ce2643f

Both files are at `~/tmp/wm30-helitack/` (`helitack-current.svg`, `helitack-optimized.svg`) if
he wants to open them in Sketch or Illustrator.

**Decision**: **A**, applied ahead of the answer. `src/assets/graph/helitack.svg` is now the
svgo-optimized file: **5,488 bytes**, down from 14,211, with `<title>Helitack</title>` already
in place, so step 1's asset normalization is done for this file and remains to be done only for
`fire-line.svg`.

Verified after the swap, with the full plan applied to a scratch tree:

- **Both assets now inline.** `npm run build` emits **no** SVG for either graph icon, and both
  appear in the JS bundle as base64 data URIs decoding byte-identical to source (fire-line
  7,290 B, helitack 7,346 B). The one SVG still emitted to `dist/` is a pre-existing
  CSS-imported asset unrelated to this story. The inline-versus-emitted asymmetry this plan
  used to document no longer exists.
- **Rendering is unchanged in place.** On the live chart the icon ink still occupies canvas
  rows 1 to 27 with rows 28 and 29 clear and the gridline at row 30, `chartArea.top` 30, canvas
  286 x 381: identical to the measurements taken with the original asset.
- Unit tests green, no console errors.

If Michael comes back with a re-export, replacing the file is the whole change; nothing in
this plan is coupled to which of the two files is on disk, other than the byte figures quoted
in the requirements spec.

---

## Verified before writing this plan

Everything in the plan that could be measured was, rather than reasoned from the code. The six checks behind the approach are recorded in the requirements spec's spike section. Two more were run while writing this plan:

- **Jest cannot resolve a `?url` specifier** with the current `moduleNameMapper` (`Cannot find module '../assets/graph/fire-line.svg?url'`), and `"\\.svg(\\?.*)?$"` fixes it. Confirmed both ways with a throwaway test and mapper patch, since reverted.
- **The production build resolves both assets**, which was the one item the requirements spec left unverified. As first measured, `webpack --mode production` inlined `fire-line.svg` as a base64 data URI and emitted `helitack.svg` as a hashed file at the dist root. **This has since changed**: `helitack.svg` was optimized to 5,488 bytes on 2026-08-19, so both assets now inline and nothing is emitted. The rest of this bullet records the original pair, because that is what established how the threshold behaves and what to expect if a larger export ever lands. The 8KB threshold acts on the raw source bytes, then 5,446 (5.32KB) against 14,211 (13.88KB), which is what split the pair; the inlined asset costs 7.16KB in the bundle as a data URI, but that is its cost rather than the figure that decided it. The decoded data URI is byte-identical to the source file, which is the direct confirmation that svgo does not run on this path. Serving `dist/` and running a model drew both icons with no console errors, and the then-emitted asset fetched 200. Serving the same build under a branch-style subpath (`/branch/wm-30-test/`) also fetched 200: `output.publicPath` is unset, so webpack's auto publicPath resolves from the script location and follows the deploy path. No need to force both assets inline.

## Self-Review

Round 1 (multi-role, 2026-08-19). Every issue below was checked against the code before
being written down: the plan was applied to a scratch working tree exactly as written,
then type-checked, linted, unit-tested, production-built, and run live in the browser at
the 1366 x 609 Chromebook viewport. The tree was restored afterwards. Findings that did
not survive that check are recorded in "Checked and not defects" at the end, since knowing
what was ruled out is worth as much as the list of what was not.

### Implementing Engineer

#### RESOLVED: `eventKind` is an untyped string, so a typo or rename fails exactly the way the dash-array inference this step replaces would

The step's own Summary gives the reason for `eventKind`: inferring artwork from
`borderDash` "works today but fails silently, with no type error, if the patterns are ever
unified." The replacement has that same property. `IChartAnnotation.eventKind` is
`string`, `annotationIcons` is `Record<string, IAnnotationIcon>`, and nothing connects the
two string literals in `graph.tsx` to the two keys in `annotation-icons.ts`.

Verified by compiling a probe inside `src/` against the project `tsconfig.json`, with the
plan's exact code in the tree. All three of these type-check with zero errors:

```ts
new Annotation({ type: "verticalLine", value: 10, eventKind: "fireline" }); // wrong case
const w: number = annotationIcons["totallyMadeUp"].width;                   // not `| undefined`
iconPlacement("helitak", 10, scale, 30);                                    // misspelled kind
```

The second one is worth noting on its own: `strictNullChecks` is on, but `tsconfig.json`
does not set `noUncheckedIndexedAccess`, so indexing a `Record<string, T>` with any string
yields `T` rather than `T | undefined`. The `if (!icon ...)` guard in `iconPlacement` is
therefore load-bearing at runtime while getting no help from the type system.

The runtime result of any of the three is: no icon, no console warning, no failing test.
That is the silent-failure mode the step exists to remove, moved one layer over.

Suggested resolution, in increasing order of cost. Note that the first option would put
wildfire vocabulary into the chart-layer *model*, which the resolved location question
deliberately kept out of `chart-annotation.ts`, so the second is probably the better fit:

- Type `eventKind` as a union and use it in `IChartAnnotation`.
- Keep `eventKind?: string` on the generic model, but export the two kinds as constants
  from `annotation-icons.ts` and have `graph.tsx` import them, so the producer cannot
  drift from the registry without a compile error.
- At minimum, add a unit test asserting that the kinds `graph.tsx` emits are keys of
  `annotationIcons`.

**Resolution**: the second option, folded into the plan above. `annotationIcons` drops its
`Record<string, IAnnotationIcon>` annotation in favor of `satisfies`, so its keys stay
literal; `AnnotationEventKind` is `keyof typeof annotationIcons`; `FIRE_LINE_EVENT` and
`HELITACK_EVENT` are declared at that type; and `graph.tsx` imports them. `IChartAnnotation.eventKind`
stays a plain `string`, so no wildfire vocabulary reaches the chart model.

Two knock-on changes came out of building it. `images` is now keyed by `AnnotationEventKind`
rather than `string`, and `iconPlacement` takes a loose `string | undefined` narrowed by an
exported `isAnnotationEventKind` guard, because its caller reads the kind off an untyped
Chart.js annotation. The plugin has to bind that value to a local before the guard will
narrow it: with `annotation` typed `any`, `isAnnotationEventKind(annotation.eventKind) ?
images[annotation.eventKind] : undefined` fails to compile with TS7053, since the predicate
does not narrow a property access on `any`.

Verified end to end with the amendment applied to a scratch tree: `tsc --noEmit` clean of new
`src/` errors, `npm test` green at 68 suites / 722 tests, ESLint 0 errors, and
`npm run build` compiling (`satisfies` is fine under TS 5.1.3 and ts-loader) and still
emitting `helitack.svg` at 14,211 bytes.

What it buys, checked by compiling each case rather than assumed:

- `const FIRE_LINE_EVENT: AnnotationEventKind = "fireline"` now fails with
  `TS2820: Type '"fireline"' is not assignable to type '"helitack" | "fireLine"'. Did you
  mean '"fireLine"'?`, so a misspelling or a one-sided rename is caught at the constant.
- `annotationIcons["totallyMadeUp"]` now fails with TS7053, where it previously type-checked
  and returned `IAnnotationIcon` (`noUncheckedIndexedAccess` is off).
- `iconPlacement("helitak", ...)` still compiles, and that is deliberate: the function's job
  is to reject kinds it does not recognize, and its caller has nothing better than `any` to
  offer it. That path is covered by the existing "ignores annotations with no event kind, or
  an unknown one" test.

The step order changed as a side effect. `graph.tsx` now imports from the module created in
step 3, so its two annotation constructions moved from step 2 into step 3 rather than
introducing a forward dependency. That is a net improvement: step 2 shrinks to the model
field alone, and the story no longer has a commit in which the labels are gone and nothing
has replaced them.

---

### QA Engineer

#### RESOLVED: the plugin body cannot be exercised at all as written, and "most recent on top" ends up with no automated coverage

The step declines a plugin test on the grounds that "jsdom cannot assert the drawing" and
that an empty-annotations test "would be asserting that `forEach` does not run its
callback." The first is true of *pixels* but not of the plugin's decision logic, and the
second describes only the empty case.

Verified with a throwaway test: feeding `annotationIconPlugin.afterDraw` a stub chart
(fake `chartArea`, fake `x-axis-0` scale, a `ctx.drawImage` spy, two in-range annotations
carrying `eventKind`) produces **zero** `drawImage` calls. The `images` map is
module-private and jsdom's `HTMLImageElement` reports `naturalWidth === 0`, so the
`image.complete && image.naturalWidth` guard rejects everything and there is no seam to
inject past it. The plugin is not partially testable, it is untestable.

Also verified that the fix is one word. Changing `const images` to `export const images`,
and having the test `Object.defineProperty` `complete` and `naturalWidth` onto the two
entries, made the whole hook assertable. That test then passes and pins:

- draw order (`calls[0][0] === images.fireLine`, `calls[1][0] === images.helitack`), which
  is the **"most recently added icon is drawn on top" requirement**, currently supported
  only by a spike measurement and by no test at all;
- the drawn x coordinate, confirming the icon lands on its line;
- in-range suppression and unknown-kind skipping at the plugin level rather than only at
  the `iconPlacement` level.

Suggested resolution: export `images` (or add a small test-only setter) and add those
assertions to `annotation-icons.test.ts`. Draw order is the one requirement in this story
whose implementation is pure incidental ordering, with nothing in the code naming it, so
it is the one most worth a test.

**Resolution**: no test. The suggestion above does not survive its own standard, and the
step's original judgment was right.

The plugin forwards every annotation to `iconPlacement` and draws; the skip cases the test
would cover (no kind, unknown kind, out of range) are already covered directly against
`iconPlacement`. That leaves draw order as the only new assertion, and it asserts that
`Array.prototype.forEach` iterates forwards and that `drawImage` paints later over earlier.
Those are platform guarantees, not this code's behavior, which is the same objection this
review raises against the clearance assertion further down.

The costs are real and one-sided. It needs `images` exported purely for tests, widening the
module's public surface for no production reason, plus an `Object.defineProperty` hack to
fake `complete` and `naturalWidth` past a guard that exists because jsdom never decodes an
image. And it runs against a hand-built stub of the Chart.js instance, so the failures worth
catching here (an `eventKind` that does not survive Chart.js's config merge, a missing
`x-axis-0` scale, the plugin running before `ChartAnnotation`) are exactly the ones the stub
would stay green through. Those were confirmed on the live chart instead, which is the right
instrument for them.

What did change: the step's justification sentence, which blamed jsdom rather than naming
the tautology and the stub. `images` stays module-private.

---

### Maintainer / Code Reviewer

#### RESOLVED: the z-order comment names a mechanism that is not the operative one, and the real guarantee is stranger than it looks

The plugin carries: "Registered after `ChartAnnotation` so the icons paint over the dashed
lines." The conclusion is correct and was confirmed on screen, but the stated reason is
only half of what is going on, and the other half is surprising enough to be worth a line
in the plan.

Verified in `node_modules` and live in the browser:

- `chartjs-plugin-annotation` **self-registers globally**: its bundle ends with
  `module.exports = annotationPlugin; Chart.pluginService.register(annotationPlugin);`
  (`chartjs-plugin-annotation.js:507-509`).
- Chart.js 2.9 builds its hook order as `this._plugins.concat(config.plugins || [])`
  (`dist/Chart.js:8057`), so globally registered plugins always run before anything in the
  `plugins` prop, whatever the array order.
- `import * as ChartAnnotation` under `esModuleInterop` produces an `__importStar` copy,
  which is a **different object** from the registered plugin, so the identity dedupe at
  `dist/Chart.js:8058-8061` does not fire. Measured on the live chart:
  `config.plugins[0] !== <the global plugin>`, `config.plugins[0].default === <the global
  plugin>`, and `config.plugins[0].afterDraw === <the global plugin>.afterDraw`.

So the annotation plugin's hooks run **twice per chart**, once from the global
registration and once from the namespace copy at config index 0. This is pre-existing and
unrelated to this story, but it is what makes the array position load-bearing: the icons
must sit after index 0 to beat the *second* line-drawing pass, not the first. A maintainer
who read the comment as "global registration order decides it" and moved
`annotationIconPlugin` to the front of the array would put the lines back on top of the
icons.

Suggested resolution: keep the code as planned, and either extend the comment or add a
sentence to the step saying that array position after `ChartAnnotation` is required, and
why it is not merely conventional.

**Resolution**: both, documentation only, no behavior change. The plugin's own comment now
points at the `plugins` array rather than claiming registration order does the work, and a
note under that array in the step records the double registration, the `__importStar` copy,
the two source references, and the practical instruction: do not move `annotationIconPlugin`
to the front of the array.

---

### Senior Engineer

#### RESOLVED (withdrawn): the new plugin does not save and restore canvas state, unlike both sibling plugins in the same file

`legendPlugin.afterDraw` and `yAxisLinePlugin.afterDraw` each wrap their drawing in
`ctx.save()` / `ctx.restore()` (`line-chart.tsx:44-56` and `:70-77`). The new
`annotationIconPlugin.afterDraw` calls `chart.ctx.drawImage` on whatever context state it
inherits.

Verified that this is safe today rather than assumed: the annotation plugin's line element
does `ctx.save()` at `:791`, `ctx.clip()` at `:796` and `ctx.restore()` at `:845`, so its
clip is released before any later `afterDraw` hook runs, and the icons measured unclipped
and correctly placed on the live canvas. So this is not a live defect.

It is still worth two lines. `drawImage` is sensitive to `globalAlpha`,
`globalCompositeOperation`, the current transform, and the active clip, all of which are
shared canvas state written by hooks that run earlier in the same frame, including one
plugin whose whole job is to stroke over the plot. Matching the file's own convention
makes the icon drawing independent of what the two plugins above it happen to leave
behind.

Suggested resolution: wrap the `forEach` in `ctx.save()` / `ctx.restore()`.

**Resolution**: withdrawn, no change. The framing above is wrong on both halves.

The siblings save and restore because they **mutate** context state and have to put it back:
`legendPlugin` sets `strokeStyle`, `lineWidth`, `lineCap` and `setLineDash`
(`line-chart.tsx:48-51`), and `yAxisLinePlugin` sets `strokeStyle` and `lineWidth`
(`:72-73`). The icon plugin calls `drawImage` and nothing else, and `drawImage` does not
alter context state, so a `save()` / `restore()` pair around it would save a state, modify
nothing, and restore the same state. It is a no-op, not a convention being skipped.

The suggested fix also would not do what the paragraph above claims. `save()` / `restore()`
does not protect a draw call from *inherited* state: an earlier hook leaving `globalAlpha`
at 0.5 would need an explicit `ctx.globalAlpha = 1` inside the save, and an inherited clip
cannot be released at all except by whoever saved it. And the hazard is not live in any
case, which this review had already measured: the annotation plugin releases its clip at
`chartjs-plugin-annotation.js:845` before any later `afterDraw` runs, and the icons drew
unclipped and correctly placed on the live canvas.

---

### Build / Tooling Engineer

#### RESOLVED: `resourceQuery: /url/` is an unanchored substring match

The new branch is the first entry of the `oneOf`, so it wins over both `issuer` branches
for anything it matches, and `/url/` matches any resource query *containing* "url":
`?nourl`, `?urls`, `?myurl=1`. Any of those would silently yield a URL where a React
component was intended.

Low impact today, since nothing else in the repo uses an SVG resource query, and the
webpack docs use the same loose form in their examples. But this branch is the entry point
for a new import convention that other assets will plausibly follow, and `/^\?url$/` costs
nothing.

Suggested resolution: anchor the pattern.

**Resolution**: anchored to `/^\?url$/` in the step 1 snippet, with a clause saying why the
loose form was not taken. Verified to behave identically: `npm run build` compiles,
`helitack.svg` still emitted at 14,211 bytes, its size at the time of the check, and
`fire-line.svg` still inlined as a byte-identical base64 data URI.

---

### Spec Editor

#### RESOLVED: the per-icon clearance assertion cannot fail under the derived band height, and one sentence reads as if it can

The resolved padding question describes option A as "the unit test asserting it equals 30
and that every icon keeps at least 1px of clearance. The test is what stops a future asset
change from silently clipping." Only the first half of that test can ever stop anything.

`iconBandHeight = max(0, ...icons.map(h + g)) + 1`, so for every icon i,
`iconBandHeight - g_i - h_i = max_j(h_j + g_j) + 1 - (h_i + g_i) >= 1` by the definition of
`max`. The clearance assertion is entailed by the formula and cannot fail for any registry
(it is vacuous for an empty one). Under option B, the constant, it *would* be a real guard,
which is exactly what the decision table further down says. The tripwire under option A is
`expect(iconBandHeight).toBe(30)`, alone.

This is a wording issue rather than a code one, and the later "Both test assertions stay"
sentence already gets the distinction right by calling the second one an invariant. Worth
tightening the earlier sentence so nobody counts two guards where there is one.

Suggested resolution: one clause in the option A bullet noting that the clearance
assertion documents the invariant rather than guarding it.

**Resolution**: the option A bullet reworded to name `toBe(30)` as the whole tripwire and
the clearance assertion as documentation, with the one-line proof inline. The decision
sentence and the table below it already drew the distinction correctly and are unchanged.
The assertion stays in the test as executable documentation of the design intent; no code
changes.

---

### Re-review (round 1 close-out)

#### RESOLVED: the plugin's comment pointed at a note that existed only in this spec

Introduced by the fix for the z-order issue above. The comment added to
`annotationIconPlugin` read "see the note below the array for why", but that note lives in
this document, under the `plugins={[...]}` snippet. In `line-chart.tsx` there is nothing
below the array, so a reader following the pointer from `annotation-icons.ts` would land on
nothing, in shipped code, defeating the point of the change.

**Resolution**: a three-line comment now sits directly above the `plugins` prop in
`line-chart.tsx`, carrying the instruction and the one-line reason, and the comment in
`annotation-icons.ts` points at it rather than at "the note below the array". The full
derivation, with the two `Chart.js` source references and the `__importStar` measurement,
stays here.

---

### Checked and not defects

Recorded so a reader can tell these were tested rather than skipped. All measured with the
plan applied verbatim to a scratch tree, since restored.

- **The whole build story in step 1 holds.** `npm run build` (which runs `lint:build`
  first) compiles. `helitack.svg` was emitted at the dist root at exactly 14,211 bytes with
  its Zeplin GUID `<title>` intact, which is the direct confirmation that svgo does not run
  on this path and that the `<title>` normalization is a real change to shipped bytes.
  `fire-line.svg` was inlined as the single base64 data URI in the bundle, and decoding it
  gave back the source file byte for byte. **Superseded the same day**: with `helitack.svg`
  optimized to 5,488 bytes, both assets inline and nothing is emitted. The svgo and
  `<title>` conclusions still hold; only which side of the threshold the helitack asset
  falls on has changed.
- **The Jest mapper claim holds.** With `"\\.svg(\\?.*)?$"` the `?url` specifier resolves
  to `svgMock.js` (which exports the string `'svg-mock'`, so the module-level `new Image()`
  is harmless in jsdom). The full suite is green: 68 suites, 722 tests, including the new
  `annotation-icons.test.ts` exactly as written in the plan.
- **Types and lint are clean.** `tsc --noEmit` introduces no new `src/` errors; the two
  `TickOptions` errors in `line-chart.tsx` are present at baseline. ESLint reports 0 errors
  on all three new or changed files. `import/no-unresolved` does **not** fire on the `?url`
  specifier, which was the plausible failure given `plugin:import/recommended` and the
  TypeScript resolver. One new `prefer-optional-chain` warning appears on the plugin's
  `chart.options.annotation && ...` line, matching an identical existing warning on
  `legendPlugin`, and warnings do not fail `lint:build`.
- **`padding.top` in `defaultOptions` really is inherited.** `render()` spreads
  `defaultOptions` and overrides `title`, `scales`, `legend`, `tooltips` and `annotation`,
  but not `layout`, so the value reaches the instance. Measured live:
  `options.layout.padding.top` 30, `chartArea.top` exactly 30, `chartArea.bottom` 284.68
  (plot 254.68), `chartArea.left` 70.253, canvas 286 x 381. Every figure the requirements
  predicted.
- **No other chart is affected.** `defaultOptions` is module-private and not exported;
  `LineChart` is imported only by `chart.tsx`, and `Chart` only by `graph.tsx:167`.
  `bar-chart.tsx` carries its own options.
- **The discriminator survives end to end.** On the live chart,
  `options.annotation.annotations` reads
  `[{eventKind: "fireLine", value: 15, borderDash: [5,5]}, {eventKind: "helitack", value:
  20, borderDash: [10,5]}]`, in push order, with each residual `label` block carrying
  `content: 15` / `content: 20` and no `enabled` key. That is precisely what the step
  predicts, including the inert label.
- **The geometry is exact.** Scanning the canvas above the plot: icon ink occupies rows 1
  to 27, rows 0, 28 and 29 are empty, and row 30 is the plot's top gridline. The shield
  keeps all 27 of its rows with 1px of clearance from the canvas edge and a 2px gap to the
  gridline; the helicopter occupies rows 5 to 26 for a 3px gap; the bottoms land at 28 and
  27, 1px apart. This matches the requirements' geometry bullet to the pixel.
- **In-range suppression works on the real axis.** In Show Recent Data with the window at
  46 to 65, the events at hours 15 and 20 drew no icons at all, while their `getPixelForValue`
  came back at -250.8 and -199.0. Switching to Show All Data (0 to 65) drew both, with the
  helicopter painted over the shield in the 9px where the two rects overlap. Latest on top,
  confirmed on screen as well as in the stub test above.
- **No Cypress risk from the 21.6px plot shrink.** The only e2e test that touches the graph
  (`cypress/e2e/smoke.cy.ts:98`) asserts button text and model time, never chart geometry
  or the plot area.
- **The `oneOf` ordering rationale is right.** The outer rule's `test: /\.svg$/i` matches
  the resource path with the query stripped, and the svgr branch's `issuer: /\.tsx?$/`
  matches `annotation-icons.ts`, so a `?url` branch placed after it would indeed be
  claimed by svgr.
- **Requirements coverage, step ordering and sizing all check out.** Every requirements
  bullet maps to a step, no step is an orphan, no step depends on a later one, and the
  three diff estimates are close to what the code actually came to.
- **The split inline/emitted asset was not a hazard, and no longer exists.** When
  `helitack.svg` was still emitted, its network fetch could in principle have been slow
  enough for the image guard to skip a draw, but the images are requested at app boot, long
  before a user can clear Terrain Setup, place sparks and run past hour 1, and `redraw`
  repaints 5 to 6 times a second so a late arrival self-heals within a frame or two. The
  question became moot when the asset was optimized under the 8 KB threshold: both icons now
  inline and neither is fetched.

