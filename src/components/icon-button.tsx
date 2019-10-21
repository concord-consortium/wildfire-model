import { inject, observer } from "mobx-react";
import * as React from "react";
import { BaseComponent, IBaseProps } from "./base";
import Button from "@material-ui/core/Button";

import * as css from "./icon-button.scss";

interface IProps extends IBaseProps {
  icon: any;
  highlightIcon: any;
  buttonText: string;
  onClick: any;
  disabled: boolean;
}

interface IState {}

@inject("stores")
@observer
export class IconButton extends BaseComponent<IProps, IState> {
  public render() {
    const { icon, highlightIcon, onClick, disabled, buttonText } = this.props;
    const { ui, simulation } = this.stores;
    const uiDisabled = simulation.simulationStarted || ui.sparkPositionInteraction;
    return (
      <Button
        onClick={onClick}
        className={`${css.iconButton} ${disabled ? css.disabled : ""}`}
        data-test="icon-button"
        disableTouchRipple={true}
        disabled={disabled}
      >
        <span>
          <span className={css.iconButtonHighlightSvg}>{highlightIcon}</span>
          {icon}
          <span className={css.iconButtonText}>{buttonText}</span>
        </span>
      </Button>
    );
  }

  public showTerrainUI = () => {
    const { ui } = this.stores;
    ui.showTerrainUI = !ui.showTerrainUI;
  }
}
