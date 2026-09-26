import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary.js";

function Boom(): never {
  throw new Error("boom");
}

describe("ErrorBoundary", () => {
  it("catches a render error outside the routed tree and shows its fallback", () => {
    render(
      <ErrorBoundary fallback={<p>Top-level fallback</p>}>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Top-level fallback")).toBeInTheDocument();
  });
});
