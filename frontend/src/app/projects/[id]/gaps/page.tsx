"use client";

import { use, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/api";
import { Navbar } from "@/components/navbar";
import { GapCard, GapItem } from "@/components/gap-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, RefreshCw, Sparkles, CheckCircle2, AlertCircle, Star } from "lucide-react";

export default function GapsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const projectId = resolvedParams.id;
  const { user } = useAuth();

  const [gaps, setGaps] = useState<GapItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchGaps = () => {
    apiRequest<GapItem[]>(`/api/projects/${projectId}/gaps`)
      .then(setGaps)
      .catch((err) => showToast("error", `Failed to load gaps: ${err.message}`))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchGaps();
  }, [projectId]);

  const showToast = (type: "success" | "error", text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleRunDetection = async () => {
    setDetecting(true);
    try {
      const detected = await apiRequest<GapItem[]>(`/api/projects/${projectId}/gaps/detect`, {
        method: "POST",
      });
      showToast("success", `Rule-based scanner detected ${detected.length} knowledge gaps`);
      fetchGaps();
    } catch (err: any) {
      showToast("error", `Detection failed: ${err.message}`);
    } finally {
      setDetecting(false);
    }
  };

  const handleAnswerGap = async (gapId: string, answer: string) => {
    try {
      await apiRequest(`/api/projects/${projectId}/gaps/${gapId}/answer`, {
        method: "POST",
        data: { answer },
      });
      showToast("success", "Answer recorded as evidence tagged: 'stated by departing member'");
      fetchGaps();
    } catch (err: any) {
      showToast("error", `Failed to record answer: ${err.message}`);
      throw err;
    }
  };

  const resolvedCount = gaps.filter((g) => !!g.answer).length;
  const pendingCount = gaps.length - resolvedCount;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar projectId={projectId} />

      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 rounded-lg px-4 py-3 shadow-xl text-xs font-medium flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 border ${
            toastMessage.type === "success"
              ? "bg-slate-900 text-emerald-400 border-emerald-500/30"
              : "bg-slate-900 text-rose-400 border-rose-500/30"
          }`}
        >
          {toastMessage.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      <main className="container mx-auto px-4 sm:px-8 py-8 flex-1 space-y-6 max-w-5xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/40 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                Rule-Based Knowledge Gaps
              </h1>
              <Badge variant="outline" className="text-xs uppercase font-mono border-amber-500/30 text-amber-400">
                {pendingCount} Pending • {resolvedCount} Resolved
              </Badge>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Scans for unreasoned decisions, orphan tasks, single-owner areas (SPOFs), and uncontacted dependencies.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {user?.role === "approver" && (
              <Button
                size="sm"
                onClick={handleRunDetection}
                disabled={detecting}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20"
              >
                <Sparkles className={`h-3.5 w-3.5 ${detecting ? "animate-spin" : ""}`} />
                {detecting ? "Scanning Codebase & Docs..." : "Scan for Gaps"}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={fetchGaps}
              className="text-xs flex items-center gap-1.5 border-border/60"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Gaps List */}
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : gaps.length === 0 ? (
          <div className="p-12 text-center border border-dashed border-border/60 rounded-xl bg-card/30 space-y-3">
            <Star className="h-10 w-10 mx-auto text-muted-foreground/30 stroke-dashed" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">No knowledge gaps identified</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                All decisions have documented rationales and all tasks have registered owners. Click "Scan for Gaps" to re-evaluate after adding new documents.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {gaps.map((gap) => (
              <GapCard key={gap.id} gap={gap} onAnswer={handleAnswerGap} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
