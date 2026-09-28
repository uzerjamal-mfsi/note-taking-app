import { lazy } from "react";
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
import { NotesListPage } from "../features/notes/components/NotesListPage.js";

// Code-split: TipTap/ProseMirror (~860kb) is only needed once a note is opened.
const NoteEditorPage = lazy(() =>
  import("../features/notes/components/NoteEditorPage.js").then((m) => ({
    default: m.NoteEditorPage,
  })),
);

export const routes: RouteObject[] = [
  {
    path: "/",
    Component: RootLayout,
    ErrorBoundary: RouteErrorFallback,
    children: [
      {
        Component: RequireAuth,
        children: [
          { index: true, Component: NotesListPage },
          { path: "notes/:noteId", Component: NoteEditorPage },
        ],
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
