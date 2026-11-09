import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ready } from "./i18n";
import { App } from "./App";
import "./index.css";

// A saved non-English language waits for its catalog, so the UI never paints in English first.
void ready.then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
});
