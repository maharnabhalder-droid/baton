"use client";

import { use, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/api";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2,
  ShieldCheck,
  UserCheck,
  AlertCircle,
  FileCheck2,
  Clock,
  Download,
  Printer,
  Sparkles,
  FileText,
  Quote,
} from "lucide-react";

interface HandoverSummary {
  project_id: string;
  total_sources: number;
  total_snippets: number;
  total_claims: number;
  claims_by_status: Record<string, number>;
  pending_gaps: number;
  resolved_gaps: number;
  acknowledgements: {
    id: string;
    project_id: string;
    user_id: string;
    acknowledged_at: string;
    notes?: string;
  }[];
}

export default function HandoverSummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const projectId = resolvedParams.id;
  const { user } = useAuth();

  const [summary, setSummary] = useState<HandoverSummary | null>(null);
  const [project, setProject] = useState<any>(null);
  const [claims, setClaims] = useState<any[]>([]);
  const [gaps, setGaps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [acknowledging, setAcknowledging] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchData = () => {
    Promise.all([
      apiRequest<HandoverSummary>(`/api/projects/${projectId}/handover/summary`),
      apiRequest<any>(`/api/projects/${projectId}`),
      apiRequest<any[]>(`/api/projects/${projectId}/claims`).catch(() => []),
      apiRequest<any[]>(`/api/projects/${projectId}/gaps`).catch(() => []),
    ])
      .then(([summaryData, projectData, claimsData, gapsData]) => {
        setSummary(summaryData);
        setProject(projectData);
        setClaims(claimsData);
        setGaps(gapsData);
        const hasAcked = summaryData.acknowledgements.some((a) => a.user_id === user?.id);
        setAcknowledged(hasAcked);
      })
      .catch((err) => showToast("error", `Failed to load handover details: ${err.message}`))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, [projectId, user]);

  const showToast = (type: "success" | "error", text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleAcknowledge = async () => {
    setAcknowledging(true);
    try {
      await apiRequest(`/api/projects/${projectId}/handover/acknowledge`, {
        method: "POST",
        data: { notes: notes.trim() },
      });
      setAcknowledged(true);
      showToast("success", "Handover receipt formally acknowledged and recorded in audit log.");
      fetchData();
    } catch (err: any) {
      showToast("error", `Acknowledgement failed: ${err.message}`);
    } finally {
      setAcknowledging(false);
    }
  };

  const handleDownloadMarkdown = () => {
    if (!project || !summary) return;

    const timestamp = new Date().toISOString().split("T")[0];
    const role = user?.role || "incoming";

    let md = `# Technical Knowledge Handover Report\n`;
    md += `**Project:** ${project.name}\n`;
    md += `**Description:** ${project.description || "N/A"}\n`;
    md += `**Generated for Role:** ${role.toUpperCase()}\n`;
    md += `**Date:** ${timestamp}\n\n`;

    md += `---\n\n`;
    md += `## 1. Readiness & Verification Summary\n\n`;
    md += `| Metric | Count |\n`;
    md += `| :--- | :--- |\n`;
    md += `| Total Sources Ingested | ${summary.total_sources} |\n`;
    md += `| Verbatim Evidence Snippets | ${summary.total_snippets} |\n`;
    md += `| Total Visible Claims | ${summary.total_claims} |\n`;
    md += `| Verified Claims | ${summary.claims_by_status["Verified"] || 0} |\n`;
    md += `| Inferred Claims | ${summary.claims_by_status["Inferred"] || 0} |\n`;
    md += `| Conflicting Decisions | ${summary.claims_by_status["Conflicting"] || 0} |\n`;
    md += `| Missing Claims | ${summary.claims_by_status["Missing"] || 0} |\n`;
    md += `| Resolved Knowledge Gaps | ${summary.resolved_gaps} / ${summary.resolved_gaps + summary.pending_gaps} |\n\n`;

    md += `## 2. Evidence-Backed Claims\n\n`;
    if (claims.length === 0) {
      md += `*No claims visible under ${role} clearance level.*\n\n`;
    } else {
      claims.forEach((c, idx) => {
        md += `### Claim ${idx + 1}: [${c.status.toUpperCase()}] ${c.category}\n`;
        md += `> ${c.claim_text}\n\n`;
        md += `- **Confidence:** ${(c.confidence * 100).toFixed(0)}%\n`;
        md += `- **Review Status:** ${c.review_status}\n`;
        if (c.citations && c.citations.length > 0) {
          md += `- **Citations:**\n`;
          c.citations.forEach((cit: any) => {
            md += `  - *"${cit.verbatim_quote}"* (Snippet \`${cit.snippet_id.slice(0, 8)}\`)\n`;
          });
        }
        md += `\n`;
      });
    }

    md += `## 3. Knowledge Gap Resolutions\n\n`;
    if (gaps.length === 0) {
      md += `*No knowledge gaps recorded.*\n\n`;
    } else {
      gaps.forEach((g, idx) => {
        md += `### Gap ${idx + 1}: ${g.title}\n`;
        md += `**Category:** \`${g.gap_type}\`\n\n`;
        md += `${g.description}\n\n`;
        if (g.answer) {
          md += `**Departing Member Answer (Evidence Tag: *stated by departing member*):**\n`;
          md += `> ${g.answer}\n\n`;
        } else {
          md += `*Status: Unresolved*\n\n`;
        }
      });
    }

    md += `## 4. Formal Receipt Acknowledgements\n\n`;
    if (summary.acknowledgements.length === 0) {
      md += `*No formal acknowledgements signed yet.*\n\n`;
    } else {
      summary.acknowledgements.forEach((ack) => {
        md += `- **Acknowledged by User:** \`${ack.user_id}\`\n`;
        md += `  - **Timestamp:** ${new Date(ack.acknowledged_at).toUTCString()}\n`;
        if (ack.notes) md += `  - **Notes:** ${ack.notes}\n`;
      });
    }

    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${project.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-handover.md`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("success", "Handover Markdown bundle downloaded successfully.");
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar projectId={projectId} />
        <div className="container mx-auto p-8 space-y-4 max-w-4xl">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  const verifiedClaims = summary?.claims_by_status["Verified"] || 0;
  const conflictingClaims = summary?.claims_by_status["Conflicting"] || 0;
  const inferredClaims = summary?.claims_by_status["Inferred"] || 0;
  const missingClaims = summary?.claims_by_status["Missing"] || 0;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="no-print">
        <Navbar projectId={projectId} />
      </div>

      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 rounded-lg px-4 py-3 shadow-xl text-xs font-medium flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 border no-print ${
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

      <main className="container mx-auto px-4 sm:px-8 py-8 flex-1 space-y-8 max-w-4xl">
        {/* Header */}
        <div className="border-b border-border/40 pb-5 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                  Handover Receipt & Verification
                </h1>
                <Badge variant="outline" className="text-xs uppercase font-mono border-amber-500/30 text-amber-400">
                  Role: {user?.role}
                </Badge>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Role-scoped summary of evidence, claim verifications, resolved gaps, and formal receipt acknowledgement.
              </p>
            </div>

            <div className="flex items-center gap-2 no-print">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadMarkdown}
                className="text-xs flex items-center gap-1.5 border-border/60"
              >
                <Download className="h-3.5 w-3.5 text-amber-400" />
                Download Markdown
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="text-xs flex items-center gap-1.5 border-border/60"
              >
                <Printer className="h-3.5 w-3.5" />
                Print / PDF
              </Button>
            </div>
          </div>
        </div>

        {/* Readiness Matrix */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="p-4 border-border/60 bg-card/60 backdrop-blur-sm">
            <span className="text-[11px] text-muted-foreground uppercase font-semibold">Verified Claims</span>
            <p className="text-2xl font-bold text-emerald-400 mt-1 font-mono">
              {verifiedClaims}
            </p>
          </Card>
          <Card className="p-4 border-border/60 bg-card/60 backdrop-blur-sm">
            <span className="text-[11px] text-muted-foreground uppercase font-semibold">Conflicting Decisions</span>
            <p className="text-2xl font-bold text-rose-400 mt-1 font-mono">
              {conflictingClaims}
            </p>
          </Card>
          <Card className="p-4 border-border/60 bg-card/60 backdrop-blur-sm">
            <span className="text-[11px] text-muted-foreground uppercase font-semibold">Inferred / Missing</span>
            <p className="text-2xl font-bold text-amber-400 mt-1 font-mono">
              {inferredClaims + missingClaims}
            </p>
          </Card>
          <Card className="p-4 border-border/60 bg-card/60 backdrop-blur-sm">
            <span className="text-[11px] text-muted-foreground uppercase font-semibold">Resolved Gaps</span>
            <p className="text-2xl font-bold text-primary mt-1 font-mono">
              {summary?.resolved_gaps} / {(summary?.resolved_gaps || 0) + (summary?.pending_gaps || 0)}
            </p>
          </Card>
        </div>

        {/* Visibility Audit Note */}
        <div className="rounded-lg border border-border/60 p-4 bg-muted/20 text-xs leading-relaxed space-y-1">
          <p className="font-semibold text-foreground flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-amber-400" />
            Row-Level & Evidence Visibility Guarantee:
          </p>
          <p className="text-muted-foreground">
            As a <strong className="text-foreground">{user?.role}</strong>, you see only the claims where ALL cited evidence snippets fall within your clearance level.
            Restricted financial data and contractor logs are filtered out unless viewed by an authorized approver.
          </p>
        </div>

        {/* Formal Acknowledgement Card */}
        <Card className="border border-border/60 bg-card/60 backdrop-blur-sm">
          <CardHeader className="p-6 pb-3">
            <CardTitle className="text-base font-serif font-bold flex items-center gap-2 text-foreground">
              <FileCheck2 className="h-5 w-5 text-amber-400" />
              Receipt of Handover Acknowledgement
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-2 space-y-4">
            {acknowledged ? (
              <div className="p-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-emerald-400 shrink-0" />
                <div className="text-xs space-y-0.5">
                  <p className="font-semibold text-emerald-300">
                    Handover Receipt Formally Acknowledged
                  </p>
                  <p className="text-emerald-400/90">
                    You have verified and recorded receipt of this technical handover. An immutable audit record has been stored.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  As the incoming engineer or designated recipient, acknowledge that you have reviewed the evidence-backed claims, examined identified contradictions, and verified the departing member's stated answers.
                </p>
                <div className="space-y-1">
                  <label htmlFor="handover-notes" className="text-xs font-medium text-muted-foreground">
                    Receipt Notes / Transition Comments (Optional)
                  </label>
                  <textarea
                    id="handover-notes"
                    aria-label="Receipt Notes or Transition Comments"
                    rows={2}
                    placeholder="e.g. Reviewed core architecture claims and noted ZeroMQ transition."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                </div>
                <Button
                  onClick={handleAcknowledge}
                  disabled={acknowledging}
                  size="sm"
                  className="w-full sm:w-auto bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold"
                >
                  <UserCheck className="h-4 w-4 mr-1.5" />
                  {acknowledging ? "Recording Acknowledgement..." : "Acknowledge Receipt of Handover"}
                </Button>
              </div>
            )}

            {summary && summary.acknowledgements.length > 0 && (
              <div className="pt-4 border-t border-border/40 space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Audit Log of Acknowledgements ({summary.acknowledgements.length})
                </span>
                <div className="space-y-2">
                  {summary.acknowledgements.map((a) => (
                    <div
                      key={a.id}
                      className="p-2.5 rounded-md border border-border/40 bg-muted/30 text-xs flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <UserCheck className="h-3.5 w-3.5 text-amber-400" />
                        <span className="font-mono text-muted-foreground">User {a.user_id.slice(0, 8)}...</span>
                        {a.notes && <span className="text-foreground italic">"{a.notes}"</span>}
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(a.acknowledged_at).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
