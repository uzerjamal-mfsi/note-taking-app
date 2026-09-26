import { useHealthQuery } from "./features/health/hooks/use-health-query.js";
import { Spinner } from "./components/Spinner.js";

export function App() {
  const { data, isLoading } = useHealthQuery();

  if (isLoading) {
    return <Spinner />;
  }

  return (
    <div>
      <h1>Note Taking App</h1>
      <p>API status: {data?.status ?? "unknown"}</p>
    </div>
  );
}
