import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import QuickAdd from "./QuickAdd";

// Dasselbe Bundle für beide Fenster: Hauptfenster mit Tier bzw. kleines Schnelleingabe-Fenster
const quick = getCurrentWindow().label === "quick";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {quick ? <QuickAdd /> : <App />}
  </React.StrictMode>,
);
