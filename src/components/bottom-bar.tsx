import { inject, observer } from "mobx-react";
import { reaction, IReactionDisposer } from "mobx";
import React from "react";
import { BaseComponent, IBaseProps } from "./base";
import { droughtLabels, terrainLabels, vegetationLabels } from "../types";
import CCLogo from "../assets/cc-logo.svg";
import CCLogoSmall from "../assets/cc-logo-small.svg";
import screenfull from "screenfull";
import Button from "@mui/material/Button";
import SparkIcon from "../assets/bottom-bar/spark.svg";
import SparkHighlight from "../assets/bottom-bar/spark_highlight.svg";
import PauseIcon from "../assets/bottom-bar/pause.svg";
import StartIcon from "../assets/bottom-bar/start.svg";
import ReloadIcon from "../assets/bottom-bar/reload.svg";
import RestartIcon from "../assets/bottom-bar/restart.svg";
import FireLineIcon from "../assets/bottom-bar/fire-line.svg";
import FireLineHighlightIcon from "../assets/bottom-bar/fire-line_highlight.svg";
import HelitackIcon from "../assets/bottom-bar/helitack.svg";
import HelitackHighlightIcon from "../assets/bottom-bar/helitack_highlight.svg";
import TerrainIcon from "../assets/bottom-bar/terrain-setup.svg";
import TerrainHighlightIcon from "../assets/bottom-bar/terrain-setup_highlight.svg";
import TerrainThreeIcon from "../assets/bottom-bar/terrain-three.svg";
import TerrainThreeHighlightIcon from "../assets/bottom-bar/terrain-three_highlight.svg";
import { Interaction } from "../models/ui";
import { FireIntensityScale } from "./fire-intensity-scale";
import { IconButton } from "./icon-button";
import { log } from "../log";
import { AnalysisEngineProvider } from "../hazbot/engine";
import { APP_RULES_VERSION, getAnalysisEngine } from "../hazbot/wildfire";
import { HazbotButton } from "./hazbot-button";
import { cancelFireLinePlacement } from "../models/fire-line-placement";

import css from "./bottom-bar.scss";

interface IProps extends IBaseProps {}
interface IState {
  fullscreen: boolean;
}

const toggleFullscreen = () => {
  if (!screenfull?.isEnabled) {
    return;
  }
  if (!screenfull.isFullscreen) {
    screenfull.request();
    log("FullscreenEnabled");
  } else {
    screenfull.exit();
    log("FullscreenDisabled");
  }
};

@inject("stores")
@observer
export class BottomBar extends BaseComponent<IProps, IState> {
  // WM-6: arms the Hazbot "ready" pulse on natural burnout (simulationEnded).
  private hazbotPulseReactionDisposer?: IReactionDisposer;

  // WM-6: the Hazbot gate (a loaded rule-set) is fixed for the component's
  // lifetime — getAnalysisEngine() reads the URL once and memoizes the engine —
  // so resolve it once here rather than calling it on every render.
  private readonly hazbotEngine = getAnalysisEngine();

  constructor(props: IProps) {
    super(props);
    this.state = {
      fullscreen: false
    };
  }

  get fullscreenIconStyle() {
    return css.fullscreenIcon + (this.state.fullscreen ? ` ${css.fullscreen}` : "");
  }

  get sparkEnabled() {
    const { simulation, ui } = this.stores;
    return !simulation.simulationStarted
      && simulation.canAddSpark
      && ui.interaction !== Interaction.PlaceSpark;
  }

  get fireLineEnabled() {
    const { simulation, ui } = this.stores;
    // canAddFireLineMarker already gates on config.fireLineAvailable + cooldown
    // + 2-marker capacity (see simulation.ts:109-117). Unlike Spark and Helitack,
    // the button stays live while its own interaction is armed so it can cancel it.
    return simulation.simulationStarted
      && !simulation.simulationEnded
      && (simulation.canAddFireLineMarker || ui.interaction === Interaction.DrawFireLine);
  }

  get helitackEnabled() {
    const { simulation, ui } = this.stores;
    // canUseHelitack already gates on config.helitackAvailable + cooldown
    // (see simulation.ts:119-127).
    return simulation.simulationStarted
      && !simulation.simulationEnded
      && simulation.canUseHelitack
      && ui.interaction !== Interaction.Helitack;
  }

  public componentDidMount() {
    if (screenfull?.isEnabled) {
      document.addEventListener(screenfull.raw.fullscreenchange, this.fullscreenChange);
    }
    // Register the instance ref outside the screenfull guard so headless
    // browsers (where screenfull is gated off) still get the test hook
    // wired for the Playwright fullscreen-variant walkthrough.
    (window as any).test.__bottomBarRef = this;

    // WM-6: arm the Hazbot pulse on natural burnout. simulationEnded is a
    // computed (started && !running && fireDidStop); arming from this distinct
    // observable (not bare !simulationRunning) is what excludes the Fire Line
    // pause and the manual-Stop-vs-burnout ambiguity. Manual Stop is armed in
    // handleStart instead.
    const { simulation, ui } = this.stores;
    this.hazbotPulseReactionDisposer = reaction(
      () => simulation.simulationEnded,
      (ended) => { if (ended) ui.hazbotPulseArmed = true; }
    );
  }

  public componentWillUnmount() {
    if (screenfull?.isEnabled) {
      document.removeEventListener(screenfull.raw.fullscreenchange, this.fullscreenChange);
    }
    (window as any).test.__bottomBarRef = null;
    this.hazbotPulseReactionDisposer?.();
  }

  public render() {
    const { simulation, ui } = this.stores;
    const { hazbotEngine } = this;
    return (
      <div className={`${css.bottomBar} ${!simulation.config.showBurnIndex ? css.fisHidden : ""}`}>
        {simulation.config.bottomBarBaseline && <div className={css.bottomBarBaseline} />}
        <div className={css.leftContainer}>
          <CCLogo className={css.logo} />
          <CCLogoSmall className={css.logoSmall} />
        </div>
        <div className={css.mainContainer}>
          <div className={`${css.widgetGroup} ${css.terrainButton}`}>
            <IconButton
              icon={simulation.zonesCount < 3 ? <TerrainIcon /> : <TerrainThreeIcon />}
              highlightIcon={simulation.zonesCount < 3 ? <TerrainHighlightIcon /> : <TerrainThreeHighlightIcon />}
              disabled={!simulation.setupEnabled}
              buttonText="Setup"
              dataTest="terrain-button"
              onClick={this.handleTerrain}
            />
          </div>
          <div className={`${css.widgetGroup} ${css.placeSpark}`}>
            <div className={css.sparksCount}>{ simulation.remainingSparks }</div>
            <IconButton
              icon={<SparkIcon />}
              highlightIcon={<SparkHighlight />}
              disabled={!this.sparkEnabled}
              buttonText="Spark"
              dataTest="spark-button"
              onClick={this.placeSpark}
            />
          </div>
          <div className={`${css.widgetGroup} ${css.reloadRestart}`}>
            <Button
              className={css.playbackButton}
              data-testid="reload-button"
              onClick={this.handleReload}
              disabled={!simulation.reloadEnabled}
              disableRipple={true}
            >
              <span><ReloadIcon/><span className={css.playbackButtonLabel}>Reload</span></span>
            </Button>
            <Button
              className={css.playbackButton}
              data-testid="restart-button"
              onClick={this.handleRestart}
              disabled={!simulation.restartEnabled}
              disableRipple={true}
            >
              <span><RestartIcon/><span className={css.playbackButtonLabel}>Restart</span></span>
            </Button>
          </div>
          <div className={css.widgetGroup}>
            <Button
              onClick={this.handleStart}
              disabled={!simulation.startEnabled}
              className={css.playbackButton}
              data-testid="start-button"
              disableRipple={true}
            >
              { simulation.simulationRunning
                ? <span><PauseIcon/><span className={css.playbackButtonLabel}>Pause</span></span>
                : <span><StartIcon /><span className={css.playbackButtonLabel}>Start</span></span> }
            </Button>
          </div>

          <div className={`${css.widgetGroup} ${css.fireLineButton}`}>
            <IconButton
              icon={<FireLineIcon />}
              highlightIcon={<FireLineHighlightIcon />}
              disabled={!this.fireLineEnabled}
              selected={ui.interaction === Interaction.DrawFireLine}
              buttonText="Fireline"
              dataTest="fireline-button"
              onClick={this.handleFireLine}
            />
          </div>
          <div className={`${css.widgetGroup} ${css.helitackButton}`}>
            <IconButton
              icon={<HelitackIcon />}
              highlightIcon={<HelitackHighlightIcon />}
              disabled={!this.helitackEnabled}
              buttonText="Helitack"
              dataTest="helitack-button"
              onClick={this.handleHelitack}
            />
          </div>
          {
            simulation.config.showBurnIndex &&
            <div className={`${css.widgetGroup} ${css.fireIntensityScale}`}>
              <div className={css.label}>Fire Intensity Scale</div>
              <FireIntensityScale />
            </div>
          }
        </div>
        {/* Right region. `.leftContainer` and `.rightContainer` are balanced flex
            items (flex: 1) so `.mainContainer` stays centered between them. The
            Hazbot button centers in this region (margin: 0 auto) with the
            fullscreen toggle pinned to the far right, 10px to its left — per AP-79
            the button sits centered in the gap between the last control and the
            fullscreen button. */}
        <div className={css.rightContainer}>
          {/* WM-6 Hazbot Analysis button. Gated on a LOADED rule-set
              (engine?.ruleSet), not engine existence and not the bare ?hazbotRules
              param: an invalid id (?hazbotRules=99) leaves engine.ruleSet undefined
              → no feedback path → no button. The AnalysisEngineProvider is a
              forward-looking deliverable so the sibling WM-11 panel can consume
              useAnalysisEngine() here without re-plumbing the mount. NOT a
              `.widgetGroup`: the button is a self-contained #c1daff pill, no white
              bubble. */}
          {hazbotEngine?.ruleSet && (
            <div className={css.hazbotButton}>
              <AnalysisEngineProvider engine={hazbotEngine} appRulesVersion={APP_RULES_VERSION}>
                <HazbotButton />
              </AnalysisEngineProvider>
            </div>
          )}
          {
            screenfull?.isEnabled &&
            <div className={this.fullscreenIconStyle} onClick={toggleFullscreen} title="Toggle Fullscreen" />
          }
        </div>
      </div>
    );
  }

  public fullscreenChange = () => {
    this.setState({ fullscreen: screenfull.isEnabled && screenfull.isFullscreen });
  };

  public handleStart = () => {
    const { ui, simulation } = this.stores;
    if (simulation.simulationRunning) {
      simulation.stop();
      // WM-6: a manual Stop counts as "a run completed" and arms the ready pulse.
      // (A Fire Line pause also calls simulation.stop() but does NOT arm — see
      // handleFireLine — so the pulse stays off mid-intervention.)
      ui.hazbotPulseArmed = true;
      log("SimulationStopped", {
        outcome: simulation.getOutcomeData(this.stores.chartStore)
      });
    } else {
      // Must precede buildStartReadingData() below: that snapshot is what
      // SimulationStarted reports and what the rulesets read for fire line use, so
      // cancelling after it would log a fire line this run never builds.
      cancelFireLinePlacement(simulation, ui, "start");
      ui.interaction = null;
      ui.showTerrainUI = false;
      // WM-6: clear any stale arm before the next run so the pulse re-arms only
      // when this run completes.
      ui.hazbotPulseArmed = false;

      // Build config snapshot, replacing large arrays with metadata
      const config = simulation.config;
      const configSnapshot: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(config)) {
        if (Array.isArray(value) && value.length > 0 && Array.isArray(value[0])) {
          configSnapshot[key] = `2D array [${value.length}x${(value[0] as unknown[]).length}]`;
        } else {
          configSnapshot[key] = value;
        }
      }
      if (typeof config.elevation === "string") configSnapshot.elevation = config.elevation;
      if (typeof config.unburntIslands === "string") configSnapshot.unburntIslands = config.unburntIslands;
      if (typeof config.zoneIndex === "string") configSnapshot.zoneIndex = config.zoneIndex;

      // Runtime state not in config (sparks carry their localized TPI; markers keep
      // cell.elevation). zones / wind / towns stay inline. heightmapMaxElevation and
      // tpiBands are already in configSnapshot via the generic config loop above;
      // translate() forwards both heightmapMaxElevation and tpiMarginFraction (which
      // together set the predicate's decision margin) to SparksAtTopAndBottom.
      const startData = simulation.buildStartReadingData();
      configSnapshot.sparks = startData.sparks;
      configSnapshot.fireLineMarkers = startData.fireLineMarkers;
      configSnapshot.zones = simulation.zones.map(z => ({
        vegetation: vegetationLabels[z.vegetation],
        terrainType: terrainLabels[z.terrainType],
        droughtLevel: droughtLabels[z.droughtLevel]
      }));
      configSnapshot.wind = {
        speed: simulation.wind.speed,
        direction: simulation.wind.direction,
        scaleFactor: config.windScaleFactor
      };
      configSnapshot.towns = config.towns;

      log("SimulationStarted", configSnapshot);
      simulation.start();
    }
  };

  public handleRestart = () => {
    const { simulation, ui } = this.stores;
    if (simulation.simulationStarted) {
      simulation.simulationEndedLogged = true;
      log("SimulationEnded", {
        reason: "SimulationRestarted",
        outcome: simulation.getOutcomeData(this.stores.chartStore)
      });
    }
    this.stores.chartStore.reset();
    cancelFireLinePlacement(simulation, ui, "restart");
    ui.interaction = null;
    simulation.restart();
    log("SimulationRestarted");
  };

  public handleReload = () => {
    const { simulation, ui } = this.stores;
    if (simulation.simulationStarted) {
      simulation.simulationEndedLogged = true;
      log("SimulationEnded", {
        reason: "SimulationReloaded",
        outcome: simulation.getOutcomeData(this.stores.chartStore)
      });
    }
    this.stores.chartStore.reset();
    // Reload (Clear All) clears Hazbot's per-category feedback levels too, so a full
    // restart cannot open on "I'm all out of ideas". The top bar's refresh icon already
    // does this for free by reloading the page; this is what makes the two agree.
    ui.hazbotFeedbackLevels.clear();
    ui.hazbotLastFeedbackShown = undefined;
    cancelFireLinePlacement(simulation, ui, "reload");
    ui.interaction = null;
    simulation.reload();
    log("SimulationReloaded");
  };

  public handleFireLine = () => {
    const { ui, simulation } = this.stores;
    if (ui.interaction === Interaction.DrawFireLine) {
      // Second click on an armed button cancels. Returning early also keeps it from
      // re-arming the tool and logging a second FireLineButtonClicked.
      cancelFireLinePlacement(simulation, ui, "toggle");
      return;
    }
    ui.showTerrainUI = false;
    const wasRunning = simulation.simulationRunning;
    simulation.stop();
    if (wasRunning) {
      log("SimulationStopped", {
        outcome: simulation.getOutcomeData(this.stores.chartStore)
      });
    }
    ui.interaction = Interaction.DrawFireLine;
    log("FireLineButtonClicked");
  };

  public handleHelitack = () => {
    const { ui, simulation } = this.stores;
    ui.showTerrainUI = false;
    cancelFireLinePlacement(simulation, ui, "toolSwitch");
    ui.interaction = Interaction.Helitack;
    log("HelitackButtonClicked");
  };

  public handleTerrain = () => {
    const { ui } = this.stores;
    ui.showTerrainUI = !ui.showTerrainUI;
    log("TerrainPanelButtonClicked");
  };

  public placeSpark = () => {
    const { ui } = this.stores;
    ui.showTerrainUI = false;
    ui.interaction = Interaction.PlaceSpark;
    log("SparkButtonClicked");
  };
}
