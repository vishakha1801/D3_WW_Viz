import React from "react";
import { createRoot } from "react-dom/client";
import WeaveChart from "../weaveChart.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <WeaveChart />
  </React.StrictMode>
);
