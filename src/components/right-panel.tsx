import { observer } from "mobx-react";
import React from "react";
import { RightPanelTab } from "./right-panel-tab";
import { useStores } from "../use-stores";
import { Graph } from "./graph";
import css from "./right-panel.scss";

export const RightPanel = observer(function WrappedComponent() {
  const { ui } = useStores();

  return (
    <div className={`${css.rightPanel} ${ui.showChart ? css.open : ""}`} data-testid="right-panel">
      <div className={css.rightPanelContent}>
        <Graph />
      </div>
      <ul className={css.rightPanelTabs}>
        <li>
          <div id="base" className={css.rightPanelTab} onClick={() => ui.setShowChart(!ui.showChart)}>
            <RightPanelTab tabType="graph" active={!ui.showChart} />
          </div>
        </li>
      </ul>
    </div>
  );
});
