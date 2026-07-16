import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { getTheme } from "./store.js";
import "./styles.css";

// Apply the saved board theme before first paint.
document.documentElement.dataset.theme = getTheme();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
