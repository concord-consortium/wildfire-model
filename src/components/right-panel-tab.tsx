import { inject, observer } from "mobx-react";
import * as React from "react";
import { BaseComponent, IBaseProps } from "./base";
import { MapType } from "./right-panel";
import * as css from "./right-panel-tab.scss";

interface IProps extends IBaseProps {
  tabType: MapType;
  active: boolean;
}
interface IState { }

@inject("stores")
@observer
export class RightPanelTab extends BaseComponent<IProps, IState> {

  public render() {
    const { tabType, active } = this.props;
    const activeStyle = active ? css.active : "";
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
