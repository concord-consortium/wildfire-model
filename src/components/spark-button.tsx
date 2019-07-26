import { inject, observer } from "mobx-react";
import * as React from "react";
import { BaseComponent, IBaseProps } from "./base";
import Button from "@material-ui/core/Button";

import * as css from "./spark-button.scss";

interface IProps extends IBaseProps {}
interface IState {}

@inject("stores")
@observer
export class SparkButton extends BaseComponent<IProps, IState> {
  public render() {
    const { ui, simulation } = this.stores;
    const uiDisabled = simulation.simulationStarted || ui.sparkPositionInteraction;
    return (
      <Button
        onClick={this.placeSpark}
        className={`${css.seasonButton} ${uiDisabled ? css.disabled : ""}`}
        data-test="season-button"
        disableTouchRipple={true}
        disabled={uiDisabled}
      >
        <div className={css.label}>Place Spark</div>
      </Button>
    );
  }

  public placeSpark = () => {
    const { ui } = this.stores;
    ui.sparkPositionInteraction = !ui.sparkPositionInteraction;
  }
}
