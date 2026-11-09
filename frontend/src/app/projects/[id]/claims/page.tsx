"use client";

import { use, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/api";
import { Navbar } from "@/components/navbar";
import { ClaimCard, ClaimItem } from "@/components/claim-card";
import { EvidencePanel } from "@/components/evidence-panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, RefreshCw, AlertCircle, CheckCircle2, Filter, Star } from "lucide-react";

export default function ClaimsReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const projectId = resolvedParams.id;
  const { user } = useAuth();

  const [claims, setClaims] = useState<ClaimItem[]>([]);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchClaims = () => {
    apiRequest<ClaimItem[]>(`/api/projects/${projectId}/claims`)
      .then((data) => {
        setClaims(data);
        if (data.length > 0 && !selectedClaimId) {
          setSelectedClaimId(data[0].id);
        }
      })
      .catch((err) => showToast("error", `Failed to load claims: ${err.message}`))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchClaims();
  }, [projectId]);

  const showToast = (type: "success" | "error", text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleRunPipeline = async () => {
    setPipelineRunning(true);
    try {
      const extracted = await apiRequest<ClaimItem[]>(`/api/projects/${projectId}/claims/pipeline/run`, {
        method: "POST",
      });
      showToast("success", `Pipeline extracted and verified ${extracted.length} claims!`);
      fetchClaims();
    } catch (err: any) {
      showToast("error", `Pipeline run failed: ${err.message}`);
    } finally {
      setPipelineRunning(false);
    }
  };

  const handleReviewClaim = async (claimId: string, action: "approve" | "reject") => {
    try {
      await apiRequest(`/api/projects/${projectId}/claims/${claimId}/review`, {
        method: "POST",
        data: { action },
      });
      showToast("success", `Claim marked as ${action}d`);
      fetchClaims();
    } catch (err: any) {
      showToast("error", `Review failed: ${err.message}`);
    }
  };

  const handleEditClaim = async (claimId: string, newText: string, newStatus: string) => {
    try {
      await apiRequest(`/api/projects/${projectId}/claims/${claimId}`, {
        method: "PUT",
        data: { claim_text: newText, status: newStatus },
      });
      showToast("success", "Claim updated with recorded revision history");
      fetchClaims();
    } catch (err: any) {
      showToast("error", `Revision failed: ${err.message}`);
    }
  };

  const selectedClaim = claims.find((c) => c.id === selectedClaimId);

  const filteredClaims = claims.filter((c) => {
    if (filterStatus === "all") return true;
    return c.status.toLowerCase() === filterStatus.toLowerCase();
  });

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

      <main className="container mx-auto px-4 sm:px-8 py-8 flex-1 flex flex-col space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/40 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                Claims Verification & Review
              </h1>
              <Badge variant="outline" className="text-xs uppercase font-mono border-amber-500/30 text-amber-400">
                {claims.length} Claims
              </Badge>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Every claim cites verified snippets and exact verbatim quotes. Contradictions and inferences are isolated.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {user?.role === "approver" && (
              <Button
                size="sm"
                onClick={handleRunPipeline}
                disabled={pipelineRunning}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20"
              >
                <Sparkles className={`h-3.5 w-3.5 ${pipelineRunning ? "animate-spin" : ""}`} />
                {pipelineRunning ? "Extracting & Verifying..." : "Run Claim Pipeline"}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={fetchClaims}
              className="text-xs flex items-center gap-1.5 border-border/60"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-muted-foreground flex items-center gap-1 mr-1">
            <Filter className="h-3.5 w-3.5 text-amber-400" /> Filter Stars:
          </span>
          {[
            { id: "all", label: "All Constellations" },
            { id: "Verified", label: "Verified (Mint)" },
            { id: "Inferred", label: "Inferred (Amber)" },
            { id: "Conflicting", label: "Conflicting (Coral)" },
            { id: "Missing", label: "Missing (Dashed)" },
          ].map((st) => (
            <button
              key={st.id}
              onClick={() => setFilterStatus(st.id)}
              className={`px-3 py-1 rounded-full border text-xs font-medium transition-colors ${
                filterStatus === st.id
                  ? "bg-amber-500/15 text-amber-400 border-amber-500/50"
                  : "bg-muted/40 hover:bg-muted text-muted-foreground border-border/60"
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>

        {/* Main Review Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 items-start">
          {/* Claims List (7 cols) */}
          <div className="lg:col-span-7 space-y-3">
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
              </div>
            ) : filteredClaims.length === 0 ? (
              <div className="p-10 text-center border border-dashed border-border/60 rounded-xl bg-card/30 space-y-3">
                <Star className="h-10 w-10 mx-auto text-muted-foreground/30 stroke-dashed" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">No claims match the selected filter</p>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    Try switching filters back to "All Constellations", or click "Run Claim Pipeline" to extract new claims from ingested sources.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredClaims.map((claim) => (
                  <ClaimCard
                    key={claim.id}
                    claim={claim}
                    isSelected={claim.id === selectedClaimId}
                    onSelect={() => setSelectedClaimId(claim.id)}
                    onReview={handleReviewClaim}
                    onEdit={handleEditClaim}
                    userRole={user?.role}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Evidence Side Panel (5 cols) */}
          <div className="lg:col-span-5 sticky top-20">
            <EvidencePanel
              selectedClaimId={selectedClaimId}
              claimText={selectedClaim?.claim_text || null}
              citations={selectedClaim?.citations || []}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
