import { inject, observer } from "mobx-react";
import * as React from "react";
import { BaseComponent, IBaseProps } from "./base";
import { RightPanelTab } from "./right-panel-tab";
import { Chart } from "./charts/chart";

import * as css from "./right-panel.scss";
import { DataPoint, ChartDataSetModel } from "../models/charts/chart-data-set";
import { ChartDataModelType, ChartDataModel } from "../models/charts/chart-data";

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
    return (
      <div className={`${css.rightPanel} ${open ? css.open : ""}`} data-test="right-panel">
        <div className={css.rightPanelContent}>
          <Chart title="chart" chartType="line" chartData={getMockChartData()} isPlaying={false} />
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

const getMockChartData = () => {
  const chartDataSets = [];
  const points = [];
  points.push(DataPoint.create({ a1: 0, a2: 10, label: "alpha" }));
  points.push(DataPoint.create({ a1: 20, a2: 20, label: "bravo" }));
  points.push(DataPoint.create({ a1: 50, a2: 70, label: "charlie" }));

  chartDataSets.push(ChartDataSetModel.create({
    name: "Sample Dataset1",
    dataPoints: points,
    color: "#ff0000",
    maxPoints: 100,
    downsample: true,
    downsampleMaxLength: 120,
    downsampleGrowWindow: 40
  }));
  let chart: ChartDataModelType;
  chart = ChartDataModel.create({
    name: "Samples",
    dataSets: chartDataSets
  });
  return chart;
};
