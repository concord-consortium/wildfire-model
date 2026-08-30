import { observable, makeObservable } from "mobx";
import { CHART_TAB_INITIAL_OPEN } from "../hazbot/wildfire/constants";

export enum Interaction {
  PlaceSpark = "PlaceSpark",
  DrawFireLine = "DrawFireLine",
  HoverOverDraggable = "HoverOverDraggable",
  Helitack = "Helitack"
}

export class UIModel {
  @observable public showChart = CHART_TAB_INITIAL_OPEN;
  // Vegetation Key. Pure view state, like showChart: it survives both Restart and
  // Clear All, neither of which touches it. Seeded from config.showVegetationKey
  // in stores.ts, so ?showVegetationKey=true opens a task with the key already on.
  @observable public showVegetationKey = false;
  @observable public showTerrainUI = false;
  @observable public terrainUISelectedZone?: number = undefined;
  @observable public maxSparks: number;

  @observable public interaction: Interaction | null = null;
  @observable public dragging = false;

  // True between the first and second click of a fire line placement. Both markers
  // exist from the first click on, so fireLineMarkers.length cannot tell a half-placed
  // line from a completed one.
  @observable public fireLinePlacementInProgress = false;

  // WM-6 Hazbot button. `showHazbotFeedback` is the contract the sibling WM-11
  // panel story reads (set true on button click); WM-6 does not render the panel.
  @observable public showHazbotFeedback = false;
  // True once a run has "completed" (manual Stop or natural burnout) and the
  // student has not yet clicked the Hazbot button. Drives the ready/pulse state
  // together with simulationStarted && !simulationRunning. Reset on the next
  // Start and on the click that opens feedback. A Fire Line pause does NOT set
  // it (mid-intervention), so the pulse stays off during a fire-line pause.
  @observable public hazbotPulseArmed = false;
  // Category id -> the highest feedback level shown for that category in this page
  // session. Nothing inside a run resets it: a category the student returns to resumes
  // where it left off rather than replaying level 1. Cleared wholesale by
  // resetHazbotFeedback().
  @observable public hazbotFeedbackLevels = new Map<number, number>();
  // The level and source last displayed, for the dev sidebar's readout only.
  @observable public hazbotLastFeedbackShown?: { level: number; source: string } = undefined;
  // True while a coach-mark tour is driving, as opposed to the intro popover. Lives here
  // rather than in the button because resetHazbotFeedback() has to read it.
  @observable public hazbotTourActive = false;

  constructor() {
    makeObservable(this);
  }

  // Clear All and window.test.resetHazbotFeedbackLevels() both come through here.
  // Lowering showHazbotFeedback is load-bearing, not tidiness: it is the sole dependency
  // of the Hazbot button's effect, so lowering it runs that effect's cleanup, which
  // cancels an open deferred by the avatar's scale-up. Without it a press made just
  // before the reset lands its level back into the map afterwards.
  //
  // A driving tour has to survive, though: the Clear All tours instruct this very click
  // as their first step, so tearing the tour down here leaves their second step
  // unreachable. A deferred open has no tour yet, so the two states cannot overlap.
  public resetHazbotFeedback() {
    if (!this.hazbotTourActive) this.showHazbotFeedback = false;
    this.hazbotFeedbackLevels.clear();
    this.hazbotLastFeedbackShown = undefined;
  }
}
