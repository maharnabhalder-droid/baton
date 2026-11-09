"use client";

import React, { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error boundary caught:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center">
      <div className="p-4 rounded-full bg-destructive/10 text-destructive mb-4">
        <AlertTriangle className="h-10 w-10" />
      </div>
      <span className="font-mono text-xs text-destructive font-bold">UNEXPECTED EXCEPTION</span>
      <h1 className="font-serif text-2xl font-bold mt-2">A Constellation Fault Occurred</h1>
      <p className="text-xs text-muted-foreground max-w-sm mt-1 mb-6">
        {error.message || "An unexpected error interrupted the handover pipeline."}
      </p>
      <div className="flex items-center gap-3">
        <Button onClick={() => reset()} size="sm" variant="outline">
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Try Again
        </Button>
        <Button asChild size="sm">
          <a href="/dashboard">Back to Safety</a>
        </Button>
      </div>
    </div>
  );
}

