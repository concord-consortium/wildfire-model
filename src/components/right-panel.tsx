import { observer } from "mobx-react";
import React, { useState } from "react";
import { RightPanelTab } from "./right-panel-tab";
import { useStores } from "../use-stores";
import * as css from "./right-panel.scss";
import { Graph } from "./graph";

export type TabType = "graph";

export const RightPanel = observer(function WrappedComponent() {
  const { ui } = useStores();
  const [open, setOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState("graph");

  const handleToggleDrawer = (e: React.SyntheticEvent) => {
    if (e.currentTarget.id !== selectedTab) {
      setOpen(true);
      setSelectedTab(e.currentTarget.id as TabType);
      ui.showChart = true;
    } else {
      const isOpen = !open;
      setOpen(isOpen);
      ui.showChart = isOpen;
    }
  };

  return (
    <div className={`${css.rightPanel} ${open ? css.open : ""}`} data-test="right-panel">
      <div className={css.rightPanelContent}>
        <Graph />
      </div>
      <ul className={css.rightPanelTabs}>
        <li>
          <div id="base" className={css.rightPanelTab} onClick={handleToggleDrawer}>
            <RightPanelTab tabType="graph" active={selectedTab === "graph" || !open} />
          </div>
        </li>
      </ul>
    </div>
  );
});
