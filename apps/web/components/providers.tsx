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
          offset={96}
          toastOptions={{
            style: {
              background: "rgb(20 20 28 / 0.88)",
              border: "1px solid rgb(255 255 255 / 0.12)",
              backdropFilter: "blur(20px) saturate(150%)",
              color: "#f4f3f7",
              borderRadius: "1rem",
            },
          }}
        />
      </MotionConfig>
    </QueryClientProvider>
  );
}
