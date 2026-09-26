import { Link, useRouteError } from "react-router";
import { Button } from "@/components/ui/button";

export function RouteErrorFallback() {
  const error = useRouteError();
  console.error("Route render error", error);

  return (
    <div>
      <h1>Something went wrong</h1>
      <p>This page couldn&apos;t be displayed. Please try again.</p>
      <Button asChild>
        <Link to="/">Go home</Link>
      </Button>
    </div>
  );
}
