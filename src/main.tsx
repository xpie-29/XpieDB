import React from "react";
import ReactDOM from "react-dom/client";
import { FluentProvider } from "@fluentui/react-components";
import { DEFAULT_ACCENT } from "./accent";
import { themeFor } from "./theme";
import { App } from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <FluentProvider theme={themeFor(DEFAULT_ACCENT)}>
      <App />
    </FluentProvider>
  </React.StrictMode>,
);
