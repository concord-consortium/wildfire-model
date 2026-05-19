// Single source of truth for the chart-tab visibility at session start.
// Imported by:
// - the chart-tab UI (right-panel useState, ui.showChart MobX observable),
// - the Hazbot temporal variable chartTabOpen (R14).
// If the UI default ever flips, the temporal projection's initial value updates
// in lockstep — TypeScript tracks the dependency.
//
// Considered-and-rejected: a neutral shared location (e.g. `src/shared/`) that
// both UI and bridge import, neutralizing the new UI→bridge dependency edge.
// Rejected because creating a new top-level shared module for one constant is
// more architectural ceremony than the dependency warrants. Revisit if the
// bridge accumulates 3+ UI-imported constants.
export const CHART_TAB_INITIAL_OPEN = false;
