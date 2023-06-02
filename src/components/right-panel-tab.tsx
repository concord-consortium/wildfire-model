import * as React from "react";
import { BaseComponent, IBaseProps } from "./base";
import css from "./right-panel-tab.scss";

export type TabType = "graph";

interface IProps extends IBaseProps {
  tabType: TabType;
  active: boolean;
}
interface IState { }

export class RightPanelTab extends BaseComponent<IProps, IState> {

  public render() {
    const tabText = "Graph";
    return (
      <div className={css.tab} data-testid="right-panel-tab">
        <div className={css.tabBack}>
          <div className={css.tabImage}/>
          <div className={css.tabContent}>{tabText}</div>
        </div>
      </div>
    );
  }
}
