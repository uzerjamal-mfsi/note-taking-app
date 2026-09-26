import { Button } from "@/components/ui/button";

export function TopLevelErrorFallback() {
  return (
    <div role="alert">
      <h1>Something went wrong</h1>
      <p>The app failed to start. Please reload the page.</p>
      <Button onClick={() => window.location.reload()}>Reload</Button>
    </div>
  );
}
