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
  @observable public showTerrainUI = false;
  @observable public terrainUISelectedZone?: number = undefined;
  @observable public maxSparks: number;

  @observable public interaction: Interaction | null = null;
  @observable public dragging = false;

  // WM-6 Hazbot button. `showHazbotFeedback` is the contract the sibling WM-11
  // panel story reads (set true on button click); WM-6 does not render the panel.
  @observable public showHazbotFeedback = false;
  // True once a run has "completed" (manual Stop or natural burnout) and the
  // student has not yet clicked the Hazbot button. Drives the ready/pulse state
  // together with simulationStarted && !simulationRunning. Reset on the next
  // Start and on the click that opens feedback. A Fire Line pause does NOT set
  // it (mid-intervention), so the pulse stays off during a fire-line pause.
  @observable public hazbotPulseArmed = false;

  constructor() {
    makeObservable(this);
  }
}
