import * as React from "react";
import { BaseComponent, IBaseProps } from "./base";
import { TabType } from "./right-panel";
import * as css from "./right-panel-tab.scss";

interface IProps extends IBaseProps {
  tabType: TabType;
  active: boolean;
}
interface IState { }

export class RightPanelTab extends BaseComponent<IProps, IState> {

  public render() {
    const tabText = "Graph";
    return (
      <div className={css.tab} data-test="right-panel-tab">
        <div className={css.tabBack}>
          <div className={css.tabImage}/>
          <div className={css.tabContent}>{tabText}</div>
        </div>
      </div>
    );
  }
}
