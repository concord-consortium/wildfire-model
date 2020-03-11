import { inject, observer } from "mobx-react";
import * as React from "react";
import { BaseComponent, IBaseProps } from "./base";
import { RightPanelTab } from "./right-panel-tab";
import { Chart } from "./charts/chart";

import * as css from "./right-panel.scss";
import { DataPoint, ChartDataSet } from "../models/charts/chart-data-set";
import { ChartDataModel } from "../models/charts/chart-data";
import { SimulationModel } from "../models/simulation";

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
          <Chart title="chart" chartType="line" chartData={getMockChartData()}
            isPlaying={false} />
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

const getChartDataFromSimulation = (simulation: SimulationModel) => {
  const chartDataSets: ChartDataSet[] = [];

  simulation.zones.forEach(zone => {
    const points: DataPoint[] = [];
    chartDataSets.push(new ChartDataSet ({
      name: zone.terrainType.toString(),
      dataPoints: points,
      maxPoints: 100,
      downsample: true,
      downsampleMaxLength: 120,
      downsampleGrowWindow: 40,
      display: true
    }));
  });
  let chart: ChartDataModel;
  chart = new ChartDataModel({
    name: "Fire Spread",
    dataSets: chartDataSets
  });
  return chart;
};

const getMockChartData = () => {
  const chartDataSets = [];
  const points = [];
  points.push(new DataPoint({ a1: 0, a2: 10, label: "alpha" }));
  points.push(new DataPoint({ a1: 20, a2: 20, label: "bravo" }));
  points.push(new DataPoint({ a1: 50, a2: 70, label: "charlie" }));

  chartDataSets.push(new ChartDataSet({
    name: "Sample Dataset1",
    dataPoints: points,
    color: "#ff0000",
    maxPoints: 100,
    downsample: true,
    downsampleMaxLength: 120,
    downsampleGrowWindow: 40,
    display: true
  }));

  const points2 = [];
  points2.push(new DataPoint({ a1: 0, a2: 30, label: "alpha" }));
  points2.push(new DataPoint({ a1: 30, a2: 40, label: "bravo" }));
  points2.push(new DataPoint({ a1: 60, a2: 90, label: "charlie" }));

  chartDataSets.push(new ChartDataSet({
    name: "Sample Dataset2",
    dataPoints: points2,
    color: "#00ff00",
    maxPoints: 100,
    downsample: true,
    downsampleMaxLength: 120,
    downsampleGrowWindow: 40,
    display: true
  }));

  const chart = new ChartDataModel ({
    name: "Samples",
    dataSets: chartDataSets
  });
  return chart;
};
