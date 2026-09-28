import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { useSessionStore } from "../store/session-store.js";
import { RequireAuth } from "./RequireAuth.js";
import { RequireGuest } from "./RequireGuest.js";

const user = { id: "user-1", name: "Ada Lovelace", email: "ada@example.com" };

beforeEach(() => {
  useSessionStore.setState({ status: "idle", user: null, accessToken: null });
});

function ProtectedPage() {
  return <p>protected content</p>;
}

function LoginStub() {
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from;
  return (
    <div>
      <p>login page</p>
      {from ? <p>attempted: {from.pathname}</p> : null}
    </div>
  );
}

function HomeStub() {
  return <p>home page</p>;
}

function TestApp({ initialPath }: { initialPath: string }) {
  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<RequireAuth />}>
          <Route index element={<HomeStub />} />
          <Route path="protected" element={<ProtectedPage />} />
        </Route>
        <Route element={<RequireGuest />}>
          <Route path="login" element={<LoginStub />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe("RequireAuth", () => {
  it("redirects an unauthenticated visitor away from a protected route, preserving the attempted route", () => {
    useSessionStore.setState({ status: "unauthenticated", user: null, accessToken: null });
    render(<TestApp initialPath="/protected" />);

    expect(screen.getByText("login page")).toBeInTheDocument();
    expect(screen.queryByText("protected content")).not.toBeInTheDocument();
    expect(screen.getByText("attempted: /protected")).toBeInTheDocument();
  });

  it("renders the protected route's content for an authenticated visitor", () => {
    useSessionStore.setState({ status: "authenticated", user, accessToken: "token" });
    render(<TestApp initialPath="/protected" />);

    expect(screen.getByText("protected content")).toBeInTheDocument();
  });
});

describe("RequireGuest", () => {
  it("redirects an authenticated visitor away from an auth page", () => {
    useSessionStore.setState({ status: "authenticated", user, accessToken: "token" });
    render(<TestApp initialPath="/login" />);

    expect(screen.getByText("home page")).toBeInTheDocument();
    expect(screen.queryByText("login page")).not.toBeInTheDocument();
  });

  it("renders the auth page for a visitor with no active session", () => {
    useSessionStore.setState({ status: "unauthenticated", user: null, accessToken: null });
    render(<TestApp initialPath="/login" />);

    expect(screen.getByText("login page")).toBeInTheDocument();
  });
});
