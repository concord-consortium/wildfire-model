import { createMuiTheme } from "@material-ui/core/styles";

export default createMuiTheme({
  palette: {
    primary: {
      main: "#aaa"
    },
    secondary: {
      main: "#ff9900"
    }
  },
  shape: {
    borderRadius: 9
  },
  typography: {
    fontFamily: "Lato, Arial, sans-serif",
    button: {
      textTransform: "none",
      fontSize: "14px",
      fontWeight: "bold"
    }
  },
  overrides: {
    MuiButton: {
      root: {
        "&:hover": {
          backgroundColor: "#dfdfdf",
        },
        "&$disabled": {
          color: "inherit",
          opacity: 0.25
        }
      },
      text: {
        color: "#434343",
        padding: 0,
      }
    },
    MuiSwitch: {
      root: {
        padding: 14
      },
      thumb: {
        "width": 18,
        "height": 18,
        "boxShadow": "0 1px 5px 0 rgba(0, 0, 0, 0.35)",
        "border": "1px solid #797979",
        "$switchBase:hover &": {
          boxShadow: "0 0 0 3px rgba(255, 255, 255, 0.5)",
        },
        "$switchBase:active &": {
          boxShadow: "0 0 0 3px rgba(255, 255, 255, 1)",
        }
      },
      switchBase: {
        backgroundColor: "transparent !important" // disable default hover state
      },
      track: {
        "backgroundColor": "#797979",
        "opacity": 1,
        "$switchBase$checked + &": {
          opacity: 1
        }
      }
    },
    MuiSlider: {
      thumb: {
        "width": 20,
        "height": 20,
        "margin-left": -8.5,
        "margin-top": -8.5,
        "$disabled &": {
          opacity: 0.5,
          width: 20,
          height: 20,
          marginLeft: -8.5,
          marginTop: -8.5
        },
        "$vertical &": {
          width: 18,
          height: 18,
          marginLeft: -8,
        }
      },
      mark: {
        "$vertical &": {
          width: 4,
          height: 4,
          borderRadius: 3,
          marginLeft: -3,
          marginTop: 4,
          backgroundColor: "#d8d8d8",
          border: "1px solid #797979"
        }
      },
      markLabel: {
        "font-size": 10,
        "$vertical &": {
          width: 32,
          minHeight: 20,
          whiteSpace: "normal",
          lineHeight: "normal"
        }
      }
    }
  }
});
