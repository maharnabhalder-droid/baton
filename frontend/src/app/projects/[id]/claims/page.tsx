"use client";

import { use, useEffect, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/api";
import { Navbar } from "@/components/navbar";
import { ClaimCard, ClaimItem } from "@/components/claim-card";
import { EvidencePanel } from "@/components/evidence-panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sparkles,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Filter,
  Star,
  Inbox,
  Check,
  X,
  ShieldCheck,
  Lock
} from "lucide-react";

interface AccessRequestItem {
  id: string;
  project_id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  claim_id?: string;
  category: string;
  reason?: string;
  status: "pending" | "granted" | "declined";
  created_at: string;
}

export default function ClaimsReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const projectId = resolvedParams.id;
  const { user } = useAuth();

  const [claims, setClaims] = useState<ClaimItem[]>([]);
  const [accessRequests, setAccessRequests] = useState<AccessRequestItem[]>([]);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Access Request Modal State
  const [requestModalClaim, setRequestModalClaim] = useState<{ claimId: string; category: string } | null>(null);
  const [requestReason, setRequestReason] = useState("");
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const showToast = useCallback((type: "success" | "error", text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  const fetchClaimsAndRequests = useCallback(() => {
    Promise.all([
      apiRequest<ClaimItem[]>(`/api/projects/${projectId}/claims?include_stubs=true`),
      apiRequest<AccessRequestItem[]>(`/api/projects/${projectId}/access-requests`).catch(() => [])
    ])
      .then(([claimsData, requestsData]) => {
        setClaims(claimsData);
        setAccessRequests(requestsData);
        if (claimsData.length > 0 && !selectedClaimId) {
          const firstNonRedacted = claimsData.find((c) => !c.is_redacted);
          if (firstNonRedacted) setSelectedClaimId(firstNonRedacted.id);
        }
      })
      .catch((err) => showToast("error", `Failed to load claims: ${err.message}`))
      .finally(() => setLoading(false));
  }, [projectId, selectedClaimId, showToast]);

  useEffect(() => {
    fetchClaimsAndRequests();
  }, [fetchClaimsAndRequests]);

  // Modal Escape key listener and Focus Trap
  useEffect(() => {
    if (!requestModalClaim) return;

    // Focus textarea on open
    setTimeout(() => textareaRef.current?.focus(), 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setRequestModalClaim(null);
        setRequestReason("");
        return;
      }

      if (e.key === "Tab" && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            last.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === last) {
            first.focus();
            e.preventDefault();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [requestModalClaim]);

  const handleRunPipeline = async () => {
    setPipelineRunning(true);
    try {
      const extracted = await apiRequest<ClaimItem[]>(`/api/projects/${projectId}/claims/pipeline/run`, {
        method: "POST",
      });
      showToast("success", `Pipeline extracted and verified ${extracted.length} claims!`);
      fetchClaimsAndRequests();
    } catch (err: any) {
      showToast("error", `Pipeline failed: ${err.message}`);
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
      showToast("success", `Claim ${action}d successfully`);
      fetchClaimsAndRequests();
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
      showToast("success", "Claim updated successfully");
      fetchClaimsAndRequests();
    } catch (err: any) {
      showToast("error", `Edit failed: ${err.message}`);
    }
  };

  const handleOpenRequestModal = (claimId: string, category: string) => {
    setRequestModalClaim({ claimId, category });
    setRequestReason("");
  };

  const handleSubmitAccessRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestModalClaim) return;
    setSubmittingRequest(true);

    try {
      await apiRequest(`/api/projects/${projectId}/access-requests`, {
        method: "POST",
        data: {
          claim_id: requestModalClaim.claimId,
          category: requestModalClaim.category,
          reason: requestReason.trim() || undefined,
        }
      });
      showToast("success", "Access request submitted to project approver.");
      setRequestModalClaim(null);
      setRequestReason("");
      fetchClaimsAndRequests();
    } catch (err: any) {
      showToast("error", `Request failed: ${err.message}`);
    } finally {
      setSubmittingRequest(false);
    }
  };

  const handleGrantRequest = async (requestId: string) => {
    try {
      await apiRequest(`/api/projects/${projectId}/access-requests/${requestId}/grant`, {
        method: "POST"
      });
      showToast("success", "Access granted.");
      fetchClaimsAndRequests();
    } catch (err: any) {
      showToast("error", `Grant failed: ${err.message}`);
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    try {
      await apiRequest(`/api/projects/${projectId}/access-requests/${requestId}/decline`, {
        method: "POST"
      });
      showToast("success", "Access declined.");
      fetchClaimsAndRequests();
    } catch (err: any) {
      showToast("error", `Decline failed: ${err.message}`);
    }
  };

  const filteredClaims = claims.filter((c) => {
    if (filterStatus === "all") return true;
    return c.status === filterStatus;
  });

  const selectedClaim = claims.find((c) => c.id === selectedClaimId);

  // Status mapping for access requests
  const requestStatusMap = new Map<string, string>();
  accessRequests.forEach((r) => {
    if (r.claim_id) {
      requestStatusMap.set(r.claim_id, r.status);
    }
  });

  const pendingRequests = accessRequests.filter((r) => r.status === "pending");

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar projectId={projectId} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Toast Notification */}
        {toastMessage && (
          <div
            role="alert"
            className={`p-3 rounded-lg text-xs font-medium flex items-center justify-between transition-all ${
              toastMessage.type === "success"
                ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300"
                : "bg-rose-500/10 border border-rose-500/30 text-rose-300"
            }`}
          >
            <span>{toastMessage.text}</span>
            <button onClick={() => setToastMessage(null)} className="text-muted-foreground hover:text-foreground text-xs ml-4" aria-label="Dismiss message">
              ✕
            </button>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/40">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-widest text-amber-400 font-mono">Stage 2: Reconstruct</span>
              <Badge variant="outline" className="text-[10px] uppercase font-mono border-amber-500/30 text-amber-400">
                {user?.role} clearance
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-serif font-bold tracking-tight text-foreground mt-1">
              Verbatim Claims & Verification Cockpit
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Every atomic assertion is backed by verbatim quote spans from ingested documents.
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
              onClick={fetchClaimsAndRequests}
              className="text-xs flex items-center gap-1.5 border-border/60"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Approver Inbox for Access Requests */}
        {user?.role === "approver" && pendingRequests.length > 0 && (
          <Card className="border border-amber-500/40 bg-amber-500/5 backdrop-blur-sm p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-serif font-bold text-foreground flex items-center gap-2">
                <Inbox className="h-4 w-4 text-amber-400" />
                Access Requests Inbox ({pendingRequests.length} pending)
              </span>
              <Badge variant="outline" className="text-[10px] font-mono border-amber-500/40 text-amber-400">
                Action Required
              </Badge>
            </div>
            <div className="space-y-2">
              {pendingRequests.map((req) => (
                <div
                  key={req.id}
                  className="p-3 rounded-md border border-border/60 bg-background/80 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 font-semibold text-foreground">
                      <span>{req.user_name || "Engineer"}</span>
                      <span className="text-muted-foreground font-mono text-[10px]">({req.user_email})</span>
                      <Badge variant="outline" className="text-[10px] uppercase font-mono border-slate-500/30 text-slate-300">
                        Category: {req.category}
                      </Badge>
                    </div>
                    {req.reason ? (
                      <p className="text-[11px] text-foreground bg-muted/40 px-2 py-1 rounded border border-border/40 mt-1">
                        Reason: <span className="text-amber-400 font-medium">{req.reason}</span>
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground italic">No reason provided</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      onClick={() => handleDeclineRequest(req.id)}
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs text-rose-400 border-rose-500/30 hover:bg-rose-500/10"
                    >
                      <X className="h-3.5 w-3.5 mr-1" /> Decline
                    </Button>
                    <Button
                      onClick={() => handleGrantRequest(req.id)}
                      size="sm"
                      className="h-7 text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold"
                    >
                      <Check className="h-3.5 w-3.5 mr-1" /> Grant Access
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

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
                    onSelect={() => {
                      if (!claim.is_redacted) setSelectedClaimId(claim.id);
                    }}
                    onReview={handleReviewClaim}
                    onEdit={handleEditClaim}
                    onRequestAccess={handleOpenRequestModal}
                    accessStatus={requestStatusMap.get(claim.id)}
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

      {/* Accessible Access Request Modal Dialog */}
      {requestModalClaim && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="access-request-modal-title"
          onClick={() => {
            setRequestModalClaim(null);
            setRequestReason("");
          }}
        >
          <div
            ref={modalRef}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-border/80 bg-card p-6 shadow-2xl space-y-4 animate-in zoom-in-95 text-foreground"
          >
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <h2 id="access-request-modal-title" className="text-base font-serif font-bold flex items-center gap-2">
                <Lock className="h-4 w-4 text-amber-400" />
                Request Access to Restricted Evidence
              </h2>
              <button
                type="button"
                onClick={() => {
                  setRequestModalClaim(null);
                  setRequestReason("");
                }}
                className="text-muted-foreground hover:text-foreground p-1 rounded-md"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              This evidence is restricted under project security policy. Submitting a request notifies the project approver in their review inbox.
            </p>

            <form onSubmit={handleSubmitAccessRequest} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="access-request-reason"
                  className="text-xs font-semibold text-foreground flex items-center justify-between"
                >
                  <span>Business Justification (Optional)</span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {requestReason.length} / 500 characters
                  </span>
                </label>
                <textarea
                  id="access-request-reason"
                  ref={textareaRef}
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value.slice(0, 500))}
                  placeholder="Explain why you need access to this restricted snippet during handover (e.g. system architecture audit, deployment verification)..."
                  rows={3}
                  maxLength={500}
                  className="w-full text-xs p-2.5 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-amber-400 font-sans resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setRequestModalClaim(null);
                    setRequestReason("");
                  }}
                  className="text-xs h-8"
                  disabled={submittingRequest}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={submittingRequest}
                  className="text-xs h-8 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold"
                >
                  {submittingRequest ? "Submitting..." : "Submit Access Request"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
