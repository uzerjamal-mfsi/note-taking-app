import type { RouteObject } from "react-router";
import { createBrowserRouter } from "react-router";
import { RootLayout } from "./RootLayout.js";
import { NotFoundPage } from "./NotFoundPage.js";
import { RouteErrorFallback } from "./RouteErrorFallback.js";
import { App } from "../App.js";

export const routes: RouteObject[] = [
  {
    path: "/",
    Component: RootLayout,
    ErrorBoundary: RouteErrorFallback,
    children: [
      { index: true, Component: App },
      { path: "*", Component: NotFoundPage },
    ],
  },
];

export const router = createBrowserRouter(routes);
