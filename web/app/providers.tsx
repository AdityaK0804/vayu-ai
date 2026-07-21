"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  // client held in component state so it is created once per browser session
  // and never shared across requests
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { refetchOnWindowFocus: false } },
      })
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
