import { inject, observer } from "mobx-react";
import * as React from "react";
import { BaseComponent, IBaseProps } from "./base";
import Button from "@material-ui/core/Button";
import TerrainIcon from "../assets/terrainsetup.svg";

import * as css from "./terrain-setup-button.scss";

interface IProps extends IBaseProps {}
interface IState {}

@inject("stores")
@observer
export class TerrainSetupButton extends BaseComponent<IProps, IState> {
  public render() {
    const { ui, simulation } = this.stores;
    const uiDisabled = simulation.simulationStarted || ui.sparkPositionInteraction;
    return (
      <Button
        onClick={this.showTerrainUI}
        className={`${css.terrainButton} ${uiDisabled ? css.disabled : ""}`}
        data-test="terrain-button"
        disableTouchRipple={true}
        disabled={uiDisabled}
      >
        <span><TerrainIcon/> Terrain Setup</span>

      </Button>
    );
  }

  public showTerrainUI = () => {
    const { ui } = this.stores;
    ui.showTerrainUI = !ui.showTerrainUI;
  }
}
