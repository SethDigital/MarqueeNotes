import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { getTheme, getUiOverrides, applyUiOverrides } from "./store.js";
import "./styles.css";

// Apply the saved board theme before first paint, then layer any saved
// interface-color overrides on top of it.
document.documentElement.dataset.theme = getTheme();
applyUiOverrides(getUiOverrides());

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
