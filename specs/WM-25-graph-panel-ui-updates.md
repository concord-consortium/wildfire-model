# WM-25 — Wildfire Graph panel UI/UX updates

Lightweight checklist sourced from the Jira ticket. Bullets get ticked off as we work through them interactively against Zeplin.

## Scope (from Jira), ordered easiest → hardest

Prerequisite:

- [x] **Load Roboto Condensed 400/500/700 in index.html** — graph title, axis labels, and tick labels are Roboto **Condensed** (Zeplin reports `font-stretch: condensed` / stretch `0.75` on *every* Roboto text style on the artboard, not plain Roboto). `Roboto Condensed` was already imported at 400/700; added weight 500 (for the 500-weight title + axis labels) and removed the erroneous plain-`Roboto:400,500` import. Chart text family set via `chartFont` in chart.tsx

Pure CSS one-liners (color/size on isolated elements):

- [x] **Axis line color** — `gridLines.zeroLineColor: "#797979"` + grid lines `#dfdfdf` on both axes in line-chart.tsx
- [x] **Slider track color** — `#949494` left of the thumb (rc-slider `trackStyle`) / `#434343` right of the thumb (rc-slider `railStyle`), 1.5 px in line-chart-controls.tsx. (Per Zeplin: lighter left, darker right — the rc-slider "track" is the left fill and the "rail" shows on the right.)
- [x] **Colors** — zone plot lines `#e85bd4/#2b95f0/#df7800` (graph.tsx), key auto-matches via legend stroke, tooltip `rgba(0,0,0,0.8)` (line-chart.tsx)
- [x] **Label font sizes/styles** — title 16 px Roboto Condensed 500, axis labels 14 px Roboto Condensed 500, tick labels 14 px Roboto Condensed 400, legend 14 px Roboto Condensed 400 (the graph "Zone N" key labels are Roboto Condensed in Zeplin, *not* Lato — the Lato-bold "Zone N" styles belong to the sim header, not the graph), all `#434343` (line-chart.tsx; condensed family set via `chartFont` in chart.tsx)
- [x] **Fire Line / Helitack labels at top of graph** — Zeplin replaces these with graph-marker icons, which we are *not* implementing; per the Jira note the only change is bumping the text labels to **13 px** (`fontSize: 10 → 13` in graph.tsx). Font family (`'Roboto Condensed', Lato, …`) and color (`#606060`) are left as they already were — no other styling was spec'd for these labels. (An earlier attempt that switched them to Lato bold `#434343` was reverted as unspec'd.)

Small structural / state changes:

- [x] **Button** — "Show All/Recent Data" toggle resized to Zeplin 136×28, radius 5, Lato 14 bold, in `line-chart-controls.sass` (`.toggleDataSubset`). States: default `#fff` fill / `#797979` 1px border / `#434343` text; `:hover` `#dfdfdf` fill; `:active` `#757575` fill + `#fff` text. Verified default + hover rendered; pressed is the `:active` rule. Button is centered in the panel (matching the title + legend at center): the plot-aligned offset (`width: 202` / `margin-left: 65`) moved onto `.sliderContainer`, so the slider still tracks the plot x-axis while `.lineChartControls` spans the full panel and the button centers via `margin: auto`
- [x] **"Graph" tab** — hover/select states + radii (right-panel-tab.scss). Inner `.tabImage` widened 60→**69×44** and `$tabWidth` 68→**77** (tuned to the Zeplin overlay; app container reserves `$tabWidth` so it adjusts); radius 6→5 (Zeplin inner r5); "Graph" label (Lato 700 14px `#434343`, 39px wide) nudged to `top: 13px` / `left: $tabPadding + 2px` to sit in the overlay. States: default white, `:hover` `#aaffc2` (light green, was an opacity fade), `:active` `#66e98b` (medium green) — matching the Zeplin "Graph Tab Button States" fills. "Select" intentionally stays `:active`/press (confirmed, not the persistent panel-open state). Tab keeps its existing green 2px border (radius 9) — the Zeplin gray outer border was attempted but reverted (it didn't sit cleanly against the panel's green edge); revisit separately if needed.
- [x] **Key style** — show a line instead of a box. Each key is a 25 px colored line that mirrors its plot line's dash (Zone 1 solid, Zone 2/3 dashed). Implemented via `legendPlugin` in line-chart.tsx: the legend items suppress the built-in symbol (`fillStyle: transparent`, `lineWidth: 0`) and reserve space with `boxWidth: 24`; the plugin's `afterDraw` strokes the actual 25 px line (`LEGEND_LINE_LENGTH`) per item using the dataset's `borderColor`/`borderDash`. (Chart.js `usePointStyle` "line" caps length at `fontSize` via the `getBoxWidth` clamp, so it can't reach 25 px — hence the custom draw.) `beforeDraw` spans the legend box to the full canvas so it centers over the panel, not the asymmetric plot box. `padding: 14`. The legend span (~234 px) is near the single-row ceiling (~236 px at this panel width); wider than that wraps to two rows
- [x] **Slider** — updated thumb + track width. Thumb uses the Zeplin exportable asset `slider-thumb-small.svg` (28×28: `#797979` ring, white center, `#c9c9c9` left/right chevrons; the outer 28px `Highlight` circle's white fill was removed so the track line shows under the thumb instead of being hidden by a white halo) rendered via rc-slider `handleRender` (svgr component); the 28px asset is rendered at 33.6px so its 20px circle scales to the Zeplin **24px** thumb; `handleStyle` matches (`33.6×33.6`, `marginTop: -16` centers it on the track); sass clears the default border/fill/glow and adds the Zeplin highlight ring *behind* the thumb via the handle's background circle — `:hover` `rgba(201,201,201,0.5)` (translucent), `-dragging` `#c9c9c9` (solid), none by default. Grab/grabbing cursor comes from rc-slider's defaults. Track width matches the graph x-axis: `.sliderContainer` `width: 202px` / `margin-left: 65px` = the chart's `chartArea` extent (left 65 → right 267). *(Open: whether the track also needs circular end-caps at both ends — the Zeplin "Data Slider Control" shows the thumb at both track ends, which may just be min/max state illustration.)*

Broader layout work (touches multiple elements + spacing relationships):

- [x] **Layout tweaks** — graph width, spacing of title, x- and y-axis labels. Final chart `layout.padding`: `{ left: 3, right: 19 }` → `chartArea` left 65 / right 267 / **width 202**. Title pulled out of Chart.js and rendered as a centered HTML element (`line-chart-title`, `padding: 2px 0 8px`) so it centers over the panel, not the plot. y-axis number gap: `ticks.padding: 1`. y-axis label edge margin: `scaleLabel.padding: { top: 4, bottom: 3 }` (trims the label↔ticks side so the extra `layout.padding.left` doesn't move the plot). All confirmed against Zeplin — graph lays out as designed
- [ ] **Layout** — compress graph; check spacing between graph, key, slider, and button

## Colors & strokes reference (from Zeplin)

| Element | Color | Stroke / opacity |
|---|---|---|
| **X / Y axis line** | `#797979` (rgb 121,121,121) | 1 px |
| **Grid lines** (between ticks) | `#dfdfdf` (rgb 223,223,223) | 1 px |
| **Slider track — left of thumb** | `#949494` (rgb 148,148,148) | 1.5 px |
| **Slider track — right of thumb** | `#434343` (rgb 67,67,67) | 1.5 px |
| **Zone 1 plot line + key** | `#e85bd4` (rgb 232,91,212) | 4 px |
| **Zone 2 plot line + key** | `#2b95f0` (rgb 43,149,240) | 4 px |
| **Zone 3 plot line + key** | `#df7800` (rgb 223,120,0) | 4 px |
| **Fireline / Helitack marker line on graph** | `#797979` | 1.5 px |
| **Tooltip background** | `#000000` | `opacity: 0.8` |
| **Tooltip text** | `#ffffff`, 14 px Roboto 400 | — |
| **Tooltip line-color swatch** | matches plot line color | 1 px white border, square 13×13 |
| **"Show All Data" button border** | `#797979` | 1 px |
| **"Show All Data" button fill** | `#ffffff` | — |

Key (legend) markers: 25 px long × 4 px tall, same color as the corresponding plot line — i.e. just a short line, not a box, which addresses the Jira "key: possible to just show a line instead of a box?" item.

## Typography reference (from Zeplin)

All real (non-annotation) text styles on the Graph panel artboard, color `#434343` throughout. **Every Roboto style is condensed** (Zeplin `font-stretch` / stretch `0.75`); every Lato style is normal width (stretch `1`):

| Use | Font | Size | Weight |
|---|---|---|---|
| Graph title ("Acres Burned vs. Time") | Roboto Condensed | 16 | 500 (Medium) |
| Axis labels ("Time (hours)", "Acres Burned (thousands)") | Roboto Condensed | 14 | 500 (Medium) |
| Tick labels (0–100, 0–10, "Zone 1/2/3", "Plains") | Roboto Condensed | 14 | 400 (Regular) |
| Button labels ("Show Recent Data", "Show All Data") | Lato | 14 | 700 (Bold) |
| Tab label ("Graph") | Lato | 14 | 700 (Bold) |
| Bottom-bar labels including "Fireline" / "Helitack" | Lato | 14 | 700 (Bold) |

Note on the FL/Helitack graph annotations: Zeplin replaces these labels with graph-marker *icons*, which are not being implemented. So the existing text labels are kept with their original font family (`'Roboto Condensed', Lato, …`) and color (`#606060`); per the Jira note the only change is the size, `fontSize: 10 → 13` in [graph.tsx:37,55](../../src/components/graph.tsx#L37).

## Reference

- Jira: WM-25
- Zeplin: https://app.zeplin.io/project/5fe47ae231d1f6a428c53450/screen/6a1042a9053056f90b7b2b43

## Files likely in scope

- [src/components/graph.tsx](../../src/components/graph.tsx), [src/components/graph.scss](../../src/components/graph.scss)
- [src/components/right-panel.tsx](../../src/components/right-panel.tsx), [src/components/right-panel-tab.tsx](../../src/components/right-panel-tab.tsx)
- [src/charts/](../../src/charts/) — chart.tsx, bar-chart.tsx, line-chart-controls.tsx, chart-colors.scss
