import { Provider } from "mobx-react";
import React from "react";
import ReactDOM from "react-dom";
import { AppComponent } from "./components/app";
import { MuiThemeProvider } from "@material-ui/core/styles";
import { createStores } from "./models/stores";
import hurricanesTheme from "./material-ui-theme";

const stores = createStores();

ReactDOM.render(
  <Provider stores={stores}>
    <MuiThemeProvider theme={hurricanesTheme}>
      <AppComponent />
    </MuiThemeProvider>
  </Provider>,
  document.getElementById("app")
);
