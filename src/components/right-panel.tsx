import { inject, observer } from "mobx-react";
import * as React from "react";
import { BaseComponent, IBaseProps } from "./base";
import { RightPanelTab } from "./right-panel-tab";
import { Chart } from "../charts/components/chart";

import * as css from "./right-panel.scss";
import { DataPoint, ChartDataSet } from "../charts/models/chart-data-set";
import { ChartDataModel } from "../charts/models/chart-data";
import { SimulationModel } from "../models/simulation";
import { getMockChartData, currentChart } from "../charts/data-store";

export type MapType = "graph";

interface IProps extends IBaseProps {}

interface IState {
  open: boolean;
  selectedTab: MapType;
}

@inject("stores")
@observer
export class RightPanel extends BaseComponent<IProps, IState> {
  constructor(props: IProps) {
    super(props);
    this.state = {
      open: false,
      selectedTab: "graph"
    };
  }

  public render() {
    const { open, selectedTab } = this.state;
    const currentData: ChartDataModel = currentChart();
    const showChart = currentData != null && currentData.dataSets.length > 0;
    return (
      <div className={`${css.rightPanel} ${open ? css.open : ""}`} data-test="right-panel">
        <div className={css.rightPanelContent}>
          {showChart && <Chart title="chart" chartType="line" chartData={currentData}
            isPlaying={false} />}
        </div>
        <ul className={css.rightPanelTabs}>
          <li>
            <div id="base" className={css.rightPanelTab} onClick={this.handleToggleDrawer}>
              <RightPanelTab tabType="graph" active={selectedTab === "graph" || !open} />
            </div>
          </li>
        </ul>
      </div>
    );
  }

  public handleToggleDrawer = (e: React.SyntheticEvent) => {
    const { selectedTab } = this.state;
    if (e.currentTarget.id !== selectedTab) {
      this.setState({ open: true, selectedTab: e.currentTarget.id as MapType });
      this.stores.ui.showChart = true;
    } else {
      const isOpen = !this.state.open;
      this.setState({ open: isOpen });
      this.stores.ui.showChart = isOpen;
    }
  }
}
