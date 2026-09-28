import { type ReactNode, useEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "../lib/query-client.js";
import { refreshSession } from "../lib/api-client.js";
import { Spinner } from "../components/Spinner.js";

export interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  const [queryClient] = useState(() => createQueryClient());
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  useEffect(() => {
    let cancelled = false;

    refreshSession().finally(() => {
      if (!cancelled) {
        setIsBootstrapping(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (isBootstrapping) {
    return <Spinner />;
  }

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
