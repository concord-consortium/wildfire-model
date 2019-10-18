import { inject, observer } from "mobx-react";
import React from "react";
import { BaseComponent, IBaseProps } from "./base";
import Button from "@material-ui/core/Button";
import SparkIcon from "../assets/spark.svg";
import SparkHighlight from "../assets/spark_highlight.svg";

import css from "./spark-button.scss";

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
        className={`${css.sparkButton} ${uiDisabled ? css.disabled : ""}`}
        data-test="spark-button"
        disableTouchRipple={true}
        disabled={uiDisabled}
      >
        <span className={css.sparkIcon}>
          <span><SparkHighlight className={css.sparkHighlightSvg}/></span>
          <span><SparkIcon className={css.sparkSvg}/></span>

        </span>
        <span className={css.sparkText}>Spark</span>

      </Button>
    );
  }

  public placeSpark = () => {
    const { ui } = this.stores;
    ui.sparkPositionInteraction = !ui.sparkPositionInteraction;
  }
}
