import { useRef, type MouseEvent } from "react";
import { Outlet } from "react-router";

export function RootLayout() {
  const mainRef = useRef<HTMLElement>(null);

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
      </nav>
      <main id="main-content" tabIndex={-1} ref={mainRef}>
        <Outlet />
      </main>
    </div>
  );
}
