import { inject, observer } from "mobx-react";
import React from "react";
import { BaseComponent, IBaseProps } from "./base";
import CCLogo from "../assets/cc-logo.svg";
import CCLogoSmall from "../assets/cc-logo-small.svg";
import screenfull from "screenfull";
import Button from "@material-ui/core/Button";

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

import { IconButton } from "./icon-button";

import css from "./bottom-bar.scss";
import { Interaction } from "../models/ui";

interface IProps extends IBaseProps {}
interface IState {
  fullscreen: boolean;
}

const toggleFullscreen = () => {
  if (!screenfull || !screenfull.isEnabled) {
    return;
  }
  if (!screenfull.isFullscreen) {
    screenfull.request();
  } else {
    screenfull.exit();
  }
};

@inject("stores")
@observer
export class BottomBar extends BaseComponent<IProps, IState> {
  constructor(props: IProps) {
    super(props);
    this.state = {
      fullscreen: false
    };
  }

  get fullscreenIconStyle() {
    return css.fullscreenIcon + (this.state.fullscreen ? ` ${css.fullscreen}` : "");
  }

  get sparkBtnDisabled() {
    const { simulation, ui } = this.stores;
    return ui.interaction === Interaction.PlaceSpark || !simulation.canAddSpark() || simulation.simulationStarted;
  }

  get fireLineBtnDisabled() {
    const { simulation, ui } = this.stores;
    return ui.interaction === Interaction.DrawFireLine || !simulation.canAddFireLineMarker() ||
      !simulation.simulationStarted;
  }

  public componentDidMount() {
    if (screenfull && screenfull.isEnabled) {
      document.addEventListener(screenfull.raw.fullscreenchange, this.fullscreenChange);
    }
  }

  public componentWillUnmount() {
    if (screenfull && screenfull.isEnabled) {
      document.removeEventListener(screenfull.raw.fullscreenchange, this.fullscreenChange);
    }
  }

  public render() {
    const { simulation } = this.stores;
    const uiDisabled = simulation.simulationStarted;
    return (
      <div className={css.bottomBar}>
        <div className={css.leftContainer}>
          <CCLogo className={css.logo} />
          <CCLogoSmall className={css.logoSmall} />
        </div>
        <div className={css.mainContainer}>
          <div className={`${css.widgetGroup} ${css.terrainButton}`}>
            <IconButton
              icon={ simulation.config.zonesCount < 3 ? <TerrainIcon /> : <TerrainThreeIcon /> }
              highlightIcon={
                simulation.config.zonesCount < 3 ? <TerrainHighlightIcon /> : <TerrainThreeHighlightIcon />}
              disabled={uiDisabled} buttonText="Terrain Setup" dataTest="terrain-button" onClick={this.handleTerrain}
            />
          </div>
          <div className={`${css.widgetGroup} ${css.placeSpark}`}>
            <IconButton icon={<SparkIcon />} highlightIcon={<SparkHighlight />}
              disabled={this.sparkBtnDisabled} buttonText="Spark" dataTest="spark-button" onClick={this.placeSpark}
            />
          </div>
          <div className={`${css.widgetGroup} ${css.reloadRestart}`}>
            <Button
              className={css.playbackButton}
              data-test="reload-button"
              onClick={this.handleReload}
              disableRipple={true}
            >
              <span><ReloadIcon/> Reload</span>
            </Button>
            <Button
              className={css.playbackButton}
              data-test="restart-button"
              onClick={this.handleRestart}
              disableRipple={true}
            >
              <span><RestartIcon/> Restart</span>
            </Button>
          </div>
          <div className={`${css.widgetGroup} ${css.startStop}`}>
            <Button
              onClick={this.handleStart}
              disabled={!simulation.ready}
              className={css.playbackButton}
              data-test="start-button"
              disableRipple={true}
            >
              { simulation.simulationRunning ? <span><PauseIcon/> Stop</span> : <span><StartIcon /> Start</span> }
            </Button>
          </div>

          <div className={`${css.widgetGroup}`}>
            <IconButton icon={<FireLineIcon />} highlightIcon={<FireLineHighlightIcon />}
              disabled={this.fireLineBtnDisabled} buttonText="Fire Line" dataTest="fireline-button"
              onClick={this.handleFireLine}
            />
          </div>
          <div className={`${css.widgetGroup} ${css.helitack}`}>
            <IconButton icon={<HelitackIcon />} highlightIcon={<HelitackHighlightIcon />}
              disabled={true} buttonText="Helitack" dataTest="helitack-button" onClick={this.handleHelitack}
            />
          </div>
        </div>
        {/* This empty container is necessary so the spacing works correctly */}
        <div className={css.rightContainer}>
          {
            screenfull && screenfull.isEnabled &&
            <div className={this.fullscreenIconStyle} onClick={toggleFullscreen} title="Toggle Fullscreen" />
          }
        </div>
      </div>
    );
  }

  public fullscreenChange = () => {
    this.setState({ fullscreen: screenfull.isEnabled && screenfull.isFullscreen });
  }

  public handleStart = () => {
    const { ui, simulation } = this.stores;
    if (simulation.simulationRunning) {
      simulation.stop();
    } else {
      ui.showTerrainUI = false;
      simulation.start();
    }
  }

  public handleRestart = () => {
    this.stores.chartStore.reset();
    this.stores.simulation.restart();
  }

  public handleReload = () => {
    this.stores.chartStore.reset();
    this.stores.simulation.reload();
  }

  public handleFireLine = () => {
    const { ui, simulation } = this.stores;
    ui.showTerrainUI = false;
    simulation.stop();
    ui.interaction = Interaction.DrawFireLine;
  }

  public handleHelitack = () => {
    // TODO: handle Helitack
  }

  public handleTerrain = () => {
    const { ui } = this.stores;
    ui.showTerrainUI = !ui.showTerrainUI;
  }

  public placeSpark = () => {
    const { ui } = this.stores;
    ui.showTerrainUI = false;
    ui.interaction = Interaction.PlaceSpark;
  }
}
