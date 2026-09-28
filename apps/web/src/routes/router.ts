import type { RouteObject } from "react-router";
import { createBrowserRouter } from "react-router";
import { RootLayout } from "./RootLayout.js";
import { NotFoundPage } from "./NotFoundPage.js";
import { RouteErrorFallback } from "./RouteErrorFallback.js";
import { RequireAuth } from "./RequireAuth.js";
import { RequireGuest } from "./RequireGuest.js";
import { RegisterPage } from "./RegisterPage.js";
import { LoginPage } from "./LoginPage.js";
import { ForgotPasswordPage } from "./ForgotPasswordPage.js";
import { ResetPasswordPage } from "./ResetPasswordPage.js";
import { App } from "../App.js";

export const routes: RouteObject[] = [
  {
    path: "/",
    Component: RootLayout,
    ErrorBoundary: RouteErrorFallback,
    children: [
      {
        Component: RequireAuth,
        children: [{ index: true, Component: App }],
      },
      {
        Component: RequireGuest,
        children: [
          { path: "register", Component: RegisterPage },
          { path: "login", Component: LoginPage },
          { path: "forgot-password", Component: ForgotPasswordPage },
          { path: "reset-password", Component: ResetPasswordPage },
        ],
      },
      { path: "*", Component: NotFoundPage },
    ],
  },
];

export const router = createBrowserRouter(routes);
