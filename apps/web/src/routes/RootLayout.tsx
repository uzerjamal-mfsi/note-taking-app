import { useRef, type MouseEvent } from "react";
import { Outlet } from "react-router";
import { LogoutButton } from "@/features/auth/components/LogoutButton";
import { useSessionStore } from "@/store/session-store";

export function RootLayout() {
  const mainRef = useRef<HTMLElement>(null);
  const isAuthenticated = useSessionStore((state) => state.status === "authenticated");

  function handleSkipLinkClick(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    mainRef.current?.focus();
  }

  return (
    <div>
      <a href="#main-content" className="skip-link" onClick={handleSkipLinkClick}>
        Skip to main content
      </a>
      <nav aria-label="Primary">
        <span>Note Taking App</span>
        {isAuthenticated ? <LogoutButton /> : null}
      </nav>
      <main id="main-content" tabIndex={-1} ref={mainRef}>
        <Outlet />
      </main>
    </div>
  );
}
