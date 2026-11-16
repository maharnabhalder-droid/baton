"use client";

import React, { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { AuthProvider } from "@/lib/auth-context";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem("baton-theme");
      const isDark =
        savedTheme === "dark" ||
        (!savedTheme && window.matchMedia && !window.matchMedia("(prefers-color-scheme: light)").matches) ||
        (savedTheme !== "light" && savedTheme !== "dark" && true);

      const colorSchemeMeta = document.querySelector('meta[name="color-scheme"]');

      if (savedTheme === "light") {
        document.documentElement.classList.remove("dark");
        if (colorSchemeMeta) colorSchemeMeta.setAttribute("content", "light");
      } else if (savedTheme === "dark") {
        document.documentElement.classList.add("dark");
        if (colorSchemeMeta) colorSchemeMeta.setAttribute("content", "dark");
      } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
        document.documentElement.classList.remove("dark");
        if (colorSchemeMeta) colorSchemeMeta.setAttribute("content", "light dark");
      } else {
        document.documentElement.classList.add("dark");
        if (colorSchemeMeta) colorSchemeMeta.setAttribute("content", "light dark");
      }
    } catch (_) {}
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <AuthProvider>{children}</AuthProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
