"use client";

import React from "react";
import { Sparkles, ShieldCheck, AlertCircle } from "lucide-react";

export function ProgressConstellation({
  verified = 0,
  total = 0,
  conflicts = 0,
}: {
  verified: number;
  total: number;
  conflicts: number;
}) {
  const percentage = total > 0 ? Math.round((verified / total) * 100) : 0;

  return (
    <div className="rounded-xl border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="font-serif text-base font-semibold">Handover Constellation</h3>
        </div>
        <span className="font-mono text-xs text-primary font-bold">{percentage}% Reconstructed</span>
      </div>

      <div className="relative w-full h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-700 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>

      <div className="grid grid-cols-3 gap-2 pt-2 border-t text-center">
        <div>
          <span className="text-[10px] uppercase font-mono text-muted-foreground block">Verified Stars</span>
          <span className="text-base font-bold text-emerald-400 font-mono">{verified}</span>
        </div>
        <div>
          <span className="text-[10px] uppercase font-mono text-muted-foreground block">Total Claims</span>
          <span className="text-base font-bold text-foreground font-mono">{total}</span>
        </div>
        <div>
          <span className="text-[10px] uppercase font-mono text-muted-foreground block">Conflicts</span>
          <span className="text-base font-bold text-rose-400 font-mono">{conflicts}</span>
        </div>
      </div>
    </div>
  );
}

