import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.js";
import { ThemeProvider } from "./context/ThemeContext.js";
import { registrarServiceWorker } from "./lib/pwa.js";

registrarServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
