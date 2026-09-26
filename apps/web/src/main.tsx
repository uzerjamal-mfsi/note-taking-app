import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import "./index.css";
import { router } from "./routes/router.js";
import { AppProviders } from "./providers/AppProviders.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { TopLevelErrorFallback } from "./components/TopLevelErrorFallback.js";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary fallback={<TopLevelErrorFallback />}>
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>
    </ErrorBoundary>
  </StrictMode>,
);
