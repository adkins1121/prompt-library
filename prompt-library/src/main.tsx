import React from "react";
import ReactDOM from "react-dom/client";
import PromptLibrary from "./PromptLibrary";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <PromptLibrary />
    </div>
  </React.StrictMode>
);