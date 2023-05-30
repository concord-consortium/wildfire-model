import { Provider } from "mobx-react";
import { configure } from "mobx";
import React from "react";
import ReactDOM from "react-dom";
import { AppComponent } from "./components/app";
import { MuiThemeProvider } from "@material-ui/core/styles";
import { createStores } from "./models/stores";
import hurricanesTheme from "./material-ui-theme";

// Disable mobx strict mode. Make v6 compatible with v4/v5 that was not enforcing strict mode by default.
configure({ enforceActions: "never" });

const stores = createStores();

ReactDOM.render(
  <Provider stores={stores}>
    <MuiThemeProvider theme={hurricanesTheme}>
      <AppComponent />
    </MuiThemeProvider>
  </Provider>,
  document.getElementById("app")
);
