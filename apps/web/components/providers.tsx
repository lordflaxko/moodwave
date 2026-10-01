"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { useState } from "react";
import { Toaster } from "sonner";

import { AuthDialog } from "@/components/layout/auth-dialog";
import { ApiError } from "@/lib/api/client";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (count, error) => !(error instanceof ApiError && error.status < 500 && error.status > 0) && count < 2,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <MotionConfig reducedMotion="user">
        {children}
        <AuthDialog />
        <Toaster
          theme="dark"
          position="bottom-center"
          offset={176}
          toastOptions={{
            style: {
              background: "rgb(22 20 26 / 0.92)",
              border: "1px solid rgb(242 239 233 / 0.13)",
              backdropFilter: "blur(22px) saturate(140%)",
              color: "#f2efe9",
              borderRadius: "1.1rem",
              fontFamily: "var(--font-inter-tight)",
            },
          }}
        />
      </MotionConfig>
    </QueryClientProvider>
  );
}
