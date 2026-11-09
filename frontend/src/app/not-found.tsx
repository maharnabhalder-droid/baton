"use client";

import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center">
      <div className="p-4 rounded-full bg-primary/10 text-primary mb-4">
        <Compass className="h-10 w-10 animate-spin" style={{ animationDuration: "12s" }} />
      </div>
      <span className="font-mono text-xs text-primary font-bold">404 &bull; LOST CONSTELLATION</span>
      <h1 className="font-serif text-3xl font-bold mt-2">Page Not Found</h1>
      <p className="text-xs text-muted-foreground max-w-sm mt-1 mb-6">
        The requested star coordinate does not exist or your role lacks clearance to view it.
      </p>
      <Button asChild size="sm">
        <Link href="/dashboard" className="flex items-center gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Return to Dashboard
        </Link>
      </Button>
    </div>
  );
}

