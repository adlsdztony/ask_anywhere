import React from "react";
import ReactDOM from "react-dom/client";
import PopupWindow from "./components/PopupWindow";
import "./index.css";

ReactDOM.createRoot(document.getElementById("popup-root")!).render(
  <React.StrictMode>
    <PopupWindow />
  </React.StrictMode>,
);
